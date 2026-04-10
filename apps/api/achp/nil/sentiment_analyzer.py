"""ACHP — Sentiment Analyzer (NIL Sub-agent 1/5)"""
from __future__ import annotations
import logging
from typing import Any, Dict, List
logger = logging.getLogger(__name__)

class SentimentAnalyzer:
    def __init__(self):
        self._vader = None
        self._transformer = None

    def _get_vader(self):
        if self._vader is None:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
            self._vader = SentimentIntensityAnalyzer()
        return self._vader

    async def analyze(self, text: str) -> Dict[str, Any]:
        vader = self._get_vader()
        scores = vader.polarity_scores(text)

        # Loaded word detection (simple lexicon-based)
        loaded_words = self._find_loaded_words(text)

        polarity = scores["compound"]
        subjectivity = abs(polarity)  # simplified proxy

        return {
            "polarity": round(polarity, 4),
            "subjectivity": round(subjectivity, 4),
            "emotional_loading": self._classify_loading(polarity),
            "loaded_words": loaded_words[:10],
            "vader_scores": {
                "positive": scores["pos"],
                "negative": scores["neg"],
                "neutral":  scores["neu"],
            },
        }

    def _classify_loading(self, compound: float) -> str:
        if compound >= 0.5:  return "strongly_positive"
        if compound >= 0.1:  return "mildly_positive"
        if compound <= -0.5: return "strongly_negative"
        if compound <= -0.1: return "mildly_negative"
        return "neutral"

    def _find_loaded_words(self, text: str) -> List[str]:
        LOADED = {
            "crisis","catastrophe","disaster","threat","danger","extreme","radical",
            "unprecedented","shocking","outrageous","explosive","toxic","devastating",
            "brilliant","revolutionary","groundbreaking","game-changer","miracle",
        }
        words = text.lower().split()
        return [w.strip(".,!?") for w in words if w.strip(".,!?") in LOADED]
