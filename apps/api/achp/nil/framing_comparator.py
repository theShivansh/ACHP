"""ACHP — Framing Comparator (NIL Sub-agent 4/5)
Lexical + heuristic framing analysis. No LLM needed.
"""
from __future__ import annotations
import re, logging
from typing import Any, Dict, List
logger = logging.getLogger(__name__)

PRESUPPOSITION_MARKERS = ["when","since","because","obviously","clearly","of course","as everyone knows","despite","although","even though","still","yet"]
AGENDA_MARKERS = ["must","should","need to","have to","urgent","immediately","demand","require","force","compel","inevitably"]
LOADED_PHRASES = {
    "crisis":"negative_framing","disaster":"negative_framing","threat":"negative_framing",
    "miracle":"positive_framing","breakthrough":"positive_framing","revolution":"positive_framing",
    "regime":"delegitimizing","propaganda":"delegitimizing","extremist":"delegitimizing",
    "freedom fighter":"legitimizing","hero":"legitimizing","champion":"legitimizing",
}

class FramingComparator:
    async def compare(self, text: str, context: str = "") -> Dict[str, Any]:
        text_lower = text.lower()

        # Presupposition detection
        presuppositions = [m for m in PRESUPPOSITION_MARKERS if m in text_lower]

        # Agenda indicators
        agenda = [m for m in AGENDA_MARKERS if m in text_lower]

        # Loaded phrase detection
        found_loaded: Dict[str, List[str]] = {}
        for phrase, frame_type in LOADED_PHRASES.items():
            if phrase in text_lower:
                found_loaded.setdefault(frame_type, []).append(phrase)

        # Passive voice ratio (simplified)
        passive_matches = re.findall(r'\b(was|were|been|is|are)\s+\w+ed\b', text_lower)
        passive_ratio = len(passive_matches) / max(len(text.split()), 1)

        # Framing score: 0=neutral, 1=heavily framed
        frame_score = min(1.0,
            0.1 * len(presuppositions) +
            0.15 * len(agenda) +
            0.2 * len(found_loaded) +
            0.3 * passive_ratio
        )

        return {
            "framing_score": round(frame_score, 4),
            "loaded_phrases": found_loaded,
            "presuppositions": presuppositions[:5],
            "agenda_indicators": agenda[:5],
            "passive_voice_ratio": round(passive_ratio, 4),
            "dominant_frame": max(found_loaded, key=lambda k: len(found_loaded[k])) if found_loaded else "neutral",
        }
