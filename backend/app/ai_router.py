"""
AI Router — abstraction layer for LLM calls.

Reads AI_PROVIDER env var ("ollama" or "cloud", default "ollama").
Both providers expose identical method signatures.
"""
import json
import os
import re

import openai
from dotenv import load_dotenv

_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(_env_path)

_CLASSIFY_SYSTEM_PROMPT = "You are a data cleaning assistant. Output only valid JSON."
_CLASSIFY_USER_TEMPLATE = (
    "Classify this grocery item. Return JSON with 'clean_name' (generic name) and "
    "'category' (Produce, Dairy, Meat, Pantry, Frozen, Household).\n\nItem: {raw_name}"
)

_MEAL_SYSTEM_PROMPT = (
    "You are a meal planning assistant. Suggest practical, delicious meals "
    "based on what the user already has in their pantry. Focus on using as many "
    "current ingredients as possible, minimizing additional purchases, and being "
    "realistic (not gourmet, just good home cooking)."
)
_MEAL_USER_TEMPLATE = """Based on this inventory, suggest {num} meal ideas.

CURRENT INVENTORY:{inventory_text}

{prefs_line}
Return as JSON array:
[
  {{
    "name": "Meal Name",
    "category": "Dinner|Lunch|Breakfast",
    "available_ingredients": ["ingredient1", "ingredient2"],
    "missing_ingredients": ["ingredient3"],
    "prep_description": "Quick description...",
    "difficulty": "Easy|Medium|Hard",
    "cook_time_minutes": 30
  }}
]"""


def _strip_markdown_json(text: str) -> str:
    """Remove markdown code fences if present."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    return match.group(1).strip() if match else text.strip()


class _OllamaProvider:
    """Calls local Ollama via its OpenAI-compatible /v1 endpoint."""

    def __init__(self):
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self._client = openai.OpenAI(
            base_url=f"{base_url.rstrip('/')}/v1",
            api_key="ollama",
        )
        self._classify_model = os.getenv("OLLAMA_CLASSIFY_MODEL", "qwen2.5:3b")
        self._meal_model = os.getenv("OLLAMA_MEAL_MODEL", "qwen2.5:3b")

    def classify_item(self, name: str) -> dict:
        response = self._client.chat.completions.create(
            model=self._classify_model,
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM_PROMPT},
                {"role": "user", "content": _CLASSIFY_USER_TEMPLATE.format(raw_name=name)},
            ],
            temperature=0.1,
        )
        content = response.choices[0].message.content
        cleaned = _strip_markdown_json(content)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"clean_name": name, "category": "Unknown"}

    def suggest_meals(self, inventory: dict, preferences: str | None = None, num: int = 5) -> list:
        inventory_text = ""
        for category, items in inventory.items():
            if items:
                inventory_text += f"\n{category}: {', '.join(items)}"

        prefs_line = f"DIETARY PREFERENCES: {preferences}\n" if preferences else ""

        prompt = _MEAL_USER_TEMPLATE.format(
            num=num,
            inventory_text=inventory_text,
            prefs_line=prefs_line,
        )

        response = self._client.chat.completions.create(
            model=self._meal_model,
            messages=[
                {"role": "system", "content": _MEAL_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
        )
        content = response.choices[0].message.content
        cleaned = _strip_markdown_json(content)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return []


class _CloudProvider:
    """Placeholder for Pantry Cloud LLM provider."""

    def classify_item(self, name: str) -> dict:
        raise NotImplementedError("Cloud provider not yet implemented")

    def suggest_meals(self, inventory: dict, preferences: str | None = None, num: int = 5) -> list:
        raise NotImplementedError("Cloud provider not yet implemented")


class AIRouter:
    """
    Unified interface for LLM calls.

    Reads AI_PROVIDER env var ("ollama" or "cloud", default "ollama").
    Exposes: classify_item(name) -> dict, suggest_meals(inventory, preferences) -> list
    """

    def __init__(self):
        raw = os.getenv("AI_PROVIDER", "ollama").lower()
        # Accept "local" as an alias for "ollama" (matches existing config.py default)
        if raw in ("ollama", "local"):
            self.provider = "ollama"
            self._impl = _OllamaProvider()
        elif raw == "cloud":
            self.provider = "cloud"
            self._impl = _CloudProvider()
        else:
            raise ValueError(f"Unknown AI_PROVIDER: {raw!r}. Use 'ollama' or 'cloud'.")

    def classify_item(self, name: str) -> dict:
        """Classify a grocery item name. Returns dict with clean_name and category."""
        return self._impl.classify_item(name)

    def suggest_meals(self, inventory: dict, preferences: str | None = None, num: int = 5) -> list:
        """Suggest meals from current inventory dict. Returns list of meal dicts."""
        return self._impl.suggest_meals(inventory, preferences, num)
