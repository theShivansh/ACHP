"""
Pydantic model → Groq strict `json_schema` response format, plus server-side limit enforcement.

Groq strict mode (gpt-oss-120b / gpt-oss-20b) requires every property to be listed in `required`
and every object to set `additionalProperties: false`; optional values are expressed as a union
with `null`. Its documented keyword set covers types, enum, anyOf, $ref/$defs and descriptions.
Length and range keywords (maxLength, maxItems, minimum, maximum, …) aren't documented for strict
mode, so they're moved out of the wire schema into the description text, and `enforce_limits`
applies them on the server before pydantic validation (truncate text and lists, clamp numbers).
Defaults and titles are dropped. The walk follows real subschema positions only, so a field
*named* like a JSON-Schema keyword is never mistaken for one.
"""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, Optional, Type

from pydantic import BaseModel

_MAP_KEYS = ("properties", "$defs", "definitions")
_LIST_KEYS = ("anyOf", "allOf", "oneOf", "prefixItems")
_ONE_KEYS = ("items", "not", "additionalProperties")
_LIMIT_KEYS = ("maxLength", "minLength", "maxItems", "minItems", "minimum", "maximum",
               "exclusiveMinimum", "exclusiveMaximum", "pattern", "format")


def _hint(schema: Dict[str, Any]) -> Optional[str]:
    parts = []
    if "minimum" in schema and "maximum" in schema:
        parts.append(f"between {schema['minimum']} and {schema['maximum']}")
    elif "minimum" in schema:
        parts.append(f"at least {schema['minimum']}")
    elif "maximum" in schema:
        parts.append(f"at most {schema['maximum']}")
    if "maxLength" in schema:
        parts.append(f"at most {schema['maxLength']} characters")
    if "maxItems" in schema:
        parts.append(f"at most {schema['maxItems']} items")
    return "; ".join(parts) or None


def _close(schema: Any) -> Any:
    if not isinstance(schema, dict):
        return schema
    schema.pop("default", None)
    schema.pop("title", None)
    hint = _hint(schema)
    for key in _LIMIT_KEYS:
        schema.pop(key, None)
    if hint:
        desc = schema.get("description", "")
        schema["description"] = f"{desc} ({hint})".strip() if desc else hint.capitalize()
    if schema.get("type") == "object" or "properties" in schema:
        props = schema.get("properties", {})
        schema["type"] = "object"
        schema["required"] = list(props.keys())
        schema["additionalProperties"] = False
    for key in _MAP_KEYS:
        for sub in (schema.get(key) or {}).values():
            _close(sub)
    for key in _LIST_KEYS:
        for sub in schema.get(key) or []:
            _close(sub)
    for key in _ONE_KEYS:
        if isinstance(schema.get(key), dict):
            _close(schema[key])
    return schema


def strict_schema(model: Type[BaseModel]) -> Dict[str, Any]:
    return _close(copy.deepcopy(model.model_json_schema()))


def response_format(model: Type[BaseModel]) -> Dict[str, Any]:
    name = re.sub(r"[^a-zA-Z0-9_-]", "_", model.__name__)[:64]
    return {
        "type": "json_schema",
        "json_schema": {"name": name, "strict": True, "schema": strict_schema(model)},
    }


# ── Server-side limits ───────────────────────────────────────────────────────

def _resolve(schema: Dict[str, Any], defs: Dict[str, Any]) -> Dict[str, Any]:
    ref = schema.get("$ref")
    if ref and ref.startswith("#/$defs/"):
        return defs.get(ref.split("/")[-1], schema)
    return schema


def _enforce(value: Any, schema: Dict[str, Any], defs: Dict[str, Any]) -> Any:
    schema = _resolve(schema, defs)
    if "anyOf" in schema:
        if value is None:
            return None
        for option in schema["anyOf"]:
            option = _resolve(option, defs)
            if option.get("type") != "null":
                return _enforce(value, option, defs)
        return value
    kind = schema.get("type")
    if kind == "object" and isinstance(value, dict):
        props = schema.get("properties", {})
        return {k: _enforce(v, props[k], defs) if k in props else v for k, v in value.items()}
    if kind == "array" and isinstance(value, list):
        if "maxItems" in schema:
            value = value[: schema["maxItems"]]
        item = schema.get("items")
        return [_enforce(v, item, defs) for v in value] if isinstance(item, dict) else value
    if kind == "string" and isinstance(value, str) and "maxLength" in schema:
        limit = schema["maxLength"]
        return value if len(value) <= limit else value[: max(0, limit - 1)].rstrip() + "…"
    if kind in ("number", "integer") and isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema:
            value = max(schema["minimum"], value)
        if "maximum" in schema:
            value = min(schema["maximum"], value)
        return value
    return value


def enforce_limits(data: Any, model: Type[BaseModel]) -> Any:
    """Truncate over-long text and lists and clamp out-of-range numbers per the model's schema.
    This only trims what the model wrote; it never adds content."""
    full = model.model_json_schema()
    return _enforce(data, full, full.get("$defs", {}))
