"""ACHP — Bias Classifier (NIL Sub-agent 2/5)
Zero-shot NLI via facebook/bart-large-mnli.
Falls back to keyword heuristic if transformers unavailable.
"""
from __future__ import annotations
import asyncio, logging
from typing import Any, Dict, List
logger = logging.getLogger(__name__)

BIAS_AXES = [
    "political left bias",
    "political right bias",
    "cultural western bias",
    "gender stereotyping",
    "confirmation bias",
    "corporate bias",
    "nationalist bias",
]

class BiasClassifier:
    def __init__(self):
        self._pipeline = None
        self._available = False

    def _load(self):
        if self._pipeline is not None:
            return
        try:
            from transformers import pipeline
            self._pipeline = pipeline(
                "zero-shot-classification",
                model="facebook/bart-large-mnli",
                device=-1,  # CPU
            )
            self._available = True
            logger.info("BiasClassifier: BART-MNLI loaded")
        except Exception as e:
            logger.warning(f"BiasClassifier: cannot load BART-MNLI ({e}), using heuristic fallback")
            self._available = False

    async def classify(self, text: str) -> Dict[str, Any]:
        self._load()
        if self._available and self._pipeline:
            return await asyncio.get_event_loop().run_in_executor(
                None, self._classify_sync, text
            )
        return self._heuristic_classify(text)

    def _classify_sync(self, text: str) -> Dict[str, Any]:
        result = self._pipeline(text[:512], candidate_labels=BIAS_AXES, multi_label=True)
        scores = dict(zip(result["labels"], result["scores"]))
        dominant = max(scores, key=scores.get)
        return {
            "bias_scores": {k: round(v, 4) for k, v in scores.items()},
            "dominant_axis": dominant,
            "confidence": round(scores[dominant], 4),
            "method": "zero-shot-nli",
        }

    def _heuristic_classify(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        scores = {axis: 0.1 for axis in BIAS_AXES}
        if any(w in text_lower for w in ["left","progressive","liberal","democrat","socialist"]):
            scores["political left bias"] += 0.4
        if any(w in text_lower for w in ["right","conservative","republican","nationalist","patriot"]):
            scores["political right bias"] += 0.4
        if any(w in text_lower for w in ["he","she","gender","woman","man","female","male"]):
            scores["gender stereotyping"] += 0.2
        dominant = max(scores, key=scores.get)
        return {
            "bias_scores": {k: round(v, 4) for k, v in scores.items()},
            "dominant_axis": dominant,
            "confidence": round(scores[dominant], 4),
            "method": "keyword-heuristic",
        }
