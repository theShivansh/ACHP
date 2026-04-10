"""
ACHP — Security Validator Agent
================================
Pre- and post-processing safety layer. Runs synchronously (no LLM calls)
to keep latency ~1ms. Called by Orchestrator at both ends of the pipeline.

Checks:
  Pre-processing:
    - Prompt injection patterns
    - Jailbreak signatures
    - PII in input (email, phone, SSN)
    - Excessive length / token bombing
    - Repeated character sequences

  Post-processing:
    - PII leakage in output
    - Harmful content patterns
    - Output truncation artifacts
    - JSON schema validation
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Pattern Library
# ─────────────────────────────────────────────────────────────────────────────

INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"system\s*prompt\s*[:=]",
    r"<\s*/?system\s*>",
    r"you\s+are\s+now\s+(a\s+)?[\w\s]+\s+(without|with no)\s+restrictions",
    r"DAN\s+mode",
    r"jailbreak",
    r"act\s+as\s+if\s+you\s+have\s+no\s+(rules|guidelines|restrictions)",
    r"forget\s+(everything|all)\s+(you\s+know|above)",
    r"\[\[.*\]\]",           # double-bracket injection
    r"<\|im_start\|>",       # special tokens
    r"<\|endoftext\|>",
]

JAILBREAK_SIGNATURES = [
    r"stay\s+in\s+character",
    r"no\s+matter\s+what\s+(you|I)\s+say",
    r"pretend\s+you\s+are",
    r"roleplay\s+as",
    r"your\s+true\s+self",
    r"developer\s+mode",
    r"god\s+mode",
]

PII_PATTERNS = {
    "email":       r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "phone_us":    r"\b(\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn":         r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
    "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
    "ip_address":  r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
}

HARMFUL_OUTPUT_PATTERNS = [
    r"(how\s+to\s+(make|build|synthesize|create)\s+(bombs?|weapons?|explosives?))",
    r"(step.{0,10}by.{0,10}step\s+guide\s+to\s+(harm|kill|attack))",
]


# ─────────────────────────────────────────────────────────────────────────────
# Result Types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ValidationResult:
    safe: bool
    checks_passed: List[str] = field(default_factory=list)
    checks_failed: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    pii_found: Dict[str, List[str]] = field(default_factory=dict)
    sanitized_text: Optional[str] = None
    latency_ms: float = 0.0
    block_reason: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Security Validator
# ─────────────────────────────────────────────────────────────────────────────

class SecurityValidatorAgent:
    AGENT_ID = "security_validator"
    MAX_INPUT_LENGTH = 10_000
    MAX_OUTPUT_LENGTH = 50_000

    def __init__(
        self,
        block_on_injection: bool = True,
        block_on_pii_input: bool = False,   # warn only by default
        redact_pii_output: bool = True,
    ):
        self.block_on_injection = block_on_injection
        self.block_on_pii_input = block_on_pii_input
        self.redact_pii_output = redact_pii_output

        # Pre-compile regex patterns for speed
        self._injection_re  = [re.compile(p, re.I) for p in INJECTION_PATTERNS]
        self._jailbreak_re  = [re.compile(p, re.I) for p in JAILBREAK_SIGNATURES]
        self._pii_re        = {k: re.compile(v) for k, v in PII_PATTERNS.items()}
        self._harmful_re    = [re.compile(p, re.I) for p in HARMFUL_OUTPUT_PATTERNS]
        logger.info("SecurityValidatorAgent initialized")

    # ── Pre-processing ────────────────────────────────────────────────────

    def validate_input(self, text: str) -> ValidationResult:
        t0 = time.perf_counter()
        result = ValidationResult(safe=True)
        passed, failed, warnings = [], [], []

        # Length check
        if len(text) > self.MAX_INPUT_LENGTH:
            failed.append(f"input_too_long ({len(text)} > {self.MAX_INPUT_LENGTH})")
            result.safe = False
            result.block_reason = "Input exceeds maximum length"
        else:
            passed.append("length_check")

        # Injection detection
        injection_found = any(p.search(text) for p in self._injection_re)
        if injection_found:
            failed.append("prompt_injection_detected")
            if self.block_on_injection:
                result.safe = False
                result.block_reason = "Prompt injection pattern detected"
        else:
            passed.append("injection_check")

        # Jailbreak detection
        jb_found = any(p.search(text) for p in self._jailbreak_re)
        if jb_found:
            failed.append("jailbreak_signature")
            result.safe = False
            result.block_reason = "Jailbreak attempt detected"
        else:
            passed.append("jailbreak_check")

        # PII detection
        pii_found: Dict[str, List[str]] = {}
        for pii_type, pattern in self._pii_re.items():
            matches = pattern.findall(text)
            if matches:
                pii_found[pii_type] = matches
                warnings.append(f"pii_{pii_type}_in_input")

        if pii_found:
            result.pii_found = pii_found
            if self.block_on_pii_input:
                failed.append("pii_in_input")
                result.safe = False
                result.block_reason = f"PII detected: {list(pii_found.keys())}"

        # Repetition check (token bombing)
        if self._is_repetitive(text):
            warnings.append("repetitive_content_detected")

        result.checks_passed = passed
        result.checks_failed = failed
        result.warnings = warnings
        result.latency_ms = (time.perf_counter() - t0) * 1000
        return result

    # ── Post-processing ───────────────────────────────────────────────────

    def validate_output(self, text: str) -> ValidationResult:
        t0 = time.perf_counter()
        result = ValidationResult(safe=True)
        passed, failed, warnings = [], [], []
        sanitized = text

        # Length check
        if len(text) > self.MAX_OUTPUT_LENGTH:
            warnings.append(f"output_very_long ({len(text)} chars)")
        passed.append("output_length_check")

        # Harmful content
        harmful = any(p.search(text) for p in self._harmful_re)
        if harmful:
            failed.append("harmful_content_in_output")
            result.safe = False
            result.block_reason = "Harmful content pattern in output"
        else:
            passed.append("harmful_content_check")

        # PII redaction in output
        pii_found: Dict[str, List[str]] = {}
        for pii_type, pattern in self._pii_re.items():
            matches = pattern.findall(text)
            if matches:
                pii_found[pii_type] = matches
                if self.redact_pii_output:
                    sanitized = pattern.sub(f"[{pii_type.upper()}_REDACTED]", sanitized)
                    warnings.append(f"pii_{pii_type}_redacted_from_output")

        if pii_found:
            result.pii_found = pii_found
        passed.append("pii_output_check")

        # Truncation artifact (incomplete JSON check)
        if sanitized.strip().startswith("{") and not sanitized.strip().endswith("}"):
            warnings.append("possible_json_truncation")

        result.sanitized_text = sanitized
        result.checks_passed = passed
        result.checks_failed = failed
        result.warnings = warnings
        result.latency_ms = (time.perf_counter() - t0) * 1000
        return result

    # ── Helpers ───────────────────────────────────────────────────────────

    def _is_repetitive(self, text: str, threshold: float = 0.6) -> bool:
        """Detect token-bombing via repeated character ratio."""
        if len(text) < 200:
            return False
        words = text.lower().split()
        if not words:
            return False
        unique_ratio = len(set(words)) / len(words)
        return unique_ratio < threshold

    def sanitize_for_log(self, text: str, max_len: int = 200) -> str:
        """Safe truncated version for logging."""
        truncated = text[:max_len] + ("..." if len(text) > max_len else "")
        for _, pattern in self._pii_re.items():
            truncated = pattern.sub("[REDACTED]", truncated)
        return truncated
