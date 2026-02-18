"""
Meals router: generate meal suggestions from current inventory via LLM.
"""
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db

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
def suggest_meals_endpoint(body: MealSuggestRequest = MealSuggestRequest(), db: Session = Depends(get_db)):
    """Generate meal suggestions based on current inventory. May be slow due to LLM call."""
    import sys
    import os
    # Add project root to path so logic/ modules can be imported
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../"))
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    from logic.meal_planner import get_current_inventory, get_purchase_history_patterns, suggest_meals

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
