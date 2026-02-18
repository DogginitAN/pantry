"""
Meals router: generate meal suggestions from current inventory via LLM.
"""
import sys
import os
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

# Add project root to path so logic/ modules can be imported
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from logic.meal_planner import get_current_inventory, get_purchase_history_patterns, suggest_meals

router = APIRouter(prefix="/api/meals", tags=["meals"])


class MealSuggestRequest(BaseModel):
    preferences: Optional[str] = None
    count: int = 5


class MealSuggestion(BaseModel):
    title: str
    ingredients: list[str]
    instructions: str


class MealSuggestResponse(BaseModel):
    suggestions: list[MealSuggestion]


@router.post("/suggest", response_model=MealSuggestResponse)
def suggest_meals_endpoint(body: MealSuggestRequest = MealSuggestRequest()):
    """Generate meal suggestions based on current inventory. May be slow due to LLM call."""
    inventory = get_current_inventory()
    favorites = get_purchase_history_patterns()
    raw_meals = suggest_meals(inventory, favorites, dietary_prefs=body.preferences, num_suggestions=body.count)

    suggestions = []
    for meal in raw_meals:
        available = meal.get("available_ingredients") or []
        missing = meal.get("missing_ingredients") or []
        all_ingredients = available + missing
        instructions = meal.get("prep_description") or ""
        suggestions.append(MealSuggestion(
            title=meal.get("name", "Untitled Meal"),
            ingredients=all_ingredients,
            instructions=instructions,
        ))

    return MealSuggestResponse(suggestions=suggestions)
