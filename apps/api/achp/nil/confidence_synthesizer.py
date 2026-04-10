"""ACHP — Confidence Synthesizer (NIL Sub-agent 5/5)
Weighted aggregation of all NIL sub-agent results into final NIL score.
"""
from __future__ import annotations
import logging
from typing import Any, Dict
logger = logging.getLogger(__name__)

WEIGHTS = {"sentiment": 0.15, "bias": 0.30, "perspective": 0.25, "framing": 0.30}

class ConfidenceSynthesizer:
    async def synthesize(self, results: Dict[str, Any]) -> Dict[str, Any]:
        sentiment = results.get("sentiment", {})
        bias      = results.get("bias", {})
        perspective = results.get("perspective", {})
        framing   = results.get("framing", {})

        # Extract component scores (0=neutral/good, 1=problematic)
        sentiment_score = abs(sentiment.get("polarity", 0.0))           # emotional loading
        bias_score      = bias.get("confidence", 0.1)                   # dominant bias confidence
        perspective_lack = 1.0 - min(1.0, len(perspective.get("perspectives", [])) / 5)
        framing_score   = framing.get("framing_score", 0.1)

        component_scores = {
            "sentiment": sentiment_score,
            "bias":      bias_score,
            "perspective_gap": perspective_lack,
            "framing":   framing_score,
        }

        # Weighted NIL confidence (higher = more problematic narrative integrity)
        nil_confidence = (
            WEIGHTS["sentiment"]    * sentiment_score +
            WEIGHTS["bias"]         * bias_score +
            WEIGHTS["perspective"]  * perspective_lack +
            WEIGHTS["framing"]      * framing_score
        )
        nil_confidence = round(min(1.0, nil_confidence), 4)

        # Verdict thresholds
        if nil_confidence < 0.20:   verdict = "neutral"
        elif nil_confidence < 0.40: verdict = "mildly_biased"
        elif nil_confidence < 0.60: verdict = "biased"
        elif nil_confidence < 0.80: verdict = "misleading"
        else:                       verdict = "propaganda"

        dominant_issue = max(component_scores, key=component_scores.get)

        return {
            "nil_confidence": nil_confidence,
            "nil_verdict":    verdict,
            "nil_summary": (
                f"NIL analysis: {verdict} content (score={nil_confidence:.2f}). "
                f"Dominant issue: {dominant_issue.replace('_', ' ')}. "
                f"Bias axis: {bias.get('dominant_axis','unknown')}. "
                f"Framing: {framing.get('dominant_frame','neutral')}."
            ),
            "component_scores": component_scores,
            "weights_used": WEIGHTS,
        }
