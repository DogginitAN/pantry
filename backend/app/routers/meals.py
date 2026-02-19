"""
Meals router: generate meal suggestions from current inventory via LLM.
"""
import sys
import os
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

# Add project root to path so logic/ modules can be imported
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from logic.meal_planner import get_current_inventory, get_purchase_history_patterns, suggest_meals

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meals", tags=["meals"])


class MealSuggestRequest(BaseModel):
    preferences: Optional[str] = None
    count: int = 5


class MealSuggestion(BaseModel):
    id: Optional[int] = None
    title: str
    available_ingredients: list[str]
    missing_ingredients: list[str]
    ingredients: list[str]
    instructions: str


class MealSuggestResponse(BaseModel):
    suggestions: list[MealSuggestion]


class MealSuggestionRecord(BaseModel):
    id: int
    suggestion_text: str
    ingredients_used: list[str]
    saved: bool
    created_at: str


class AddToListRequest(BaseModel):
    list_id: int
    ingredients: list[dict]


@router.post("/suggest", response_model=MealSuggestResponse)
def suggest_meals_endpoint(body: MealSuggestRequest = MealSuggestRequest(), db: Session = Depends(get_db)):
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
        title = meal.get("name", "Untitled Meal")

        suggestion_text = f"{title}\n\n{instructions}"
        suggestion_id = None

        try:
            row = db.execute(
                text(
                    "INSERT INTO meal_suggestions (suggestion_text, ingredients_used) "
                    "VALUES (:suggestion_text, CAST(:ingredients_used AS jsonb)) "
                    "RETURNING id"
                ),
                {
                    "suggestion_text": suggestion_text,
                    "ingredients_used": json.dumps(all_ingredients),
                },
            ).mappings().one()
            db.commit()
            suggestion_id = row["id"]
        except Exception as exc:
            logger.error("Failed to persist meal suggestion: %s", exc)
            try:
                db.rollback()
            except Exception:
                pass

        suggestions.append(MealSuggestion(
            id=suggestion_id,
            title=title,
            available_ingredients=available,
            missing_ingredients=missing,
            ingredients=all_ingredients,
            instructions=instructions,
        ))

    return MealSuggestResponse(suggestions=suggestions)


@router.get("/suggestions", response_model=list[MealSuggestionRecord])
def list_suggestions(db: Session = Depends(get_db)):
    """Return the 50 most recent meal suggestions."""
    rows = db.execute(
        text(
            "SELECT id, suggestion_text, ingredients_used, saved, "
            "created_at AT TIME ZONE 'UTC' AS created_at "
            "FROM meal_suggestions ORDER BY created_at DESC LIMIT 50"
        )
    ).mappings().all()
    return [
        MealSuggestionRecord(
            id=row["id"],
            suggestion_text=row["suggestion_text"],
            ingredients_used=row["ingredients_used"] or [],
            saved=row["saved"],
            created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        )
        for row in rows
    ]


@router.patch("/suggestions/{suggestion_id}/save", response_model=MealSuggestionRecord)
def toggle_save(suggestion_id: int, db: Session = Depends(get_db)):
    """Toggle the saved flag on a meal suggestion."""
    row = db.execute(
        text(
            "UPDATE meal_suggestions SET saved = NOT saved WHERE id = :id "
            "RETURNING id, suggestion_text, ingredients_used, saved, "
            "created_at AT TIME ZONE 'UTC' AS created_at"
        ),
        {"id": suggestion_id},
    ).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    db.commit()
    return MealSuggestionRecord(
        id=row["id"],
        suggestion_text=row["suggestion_text"],
        ingredients_used=row["ingredients_used"] or [],
        saved=row["saved"],
        created_at=row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
    )


@router.post("/suggestions/{suggestion_id}/add-to-list")
def add_to_list(suggestion_id: int, body: AddToListRequest, db: Session = Depends(get_db)):
    """Add meal ingredients to a shopping list."""
    # Validate that the suggestion exists
    suggestion = db.execute(
        text("SELECT id FROM meal_suggestions WHERE id = :id"),
        {"id": suggestion_id},
    ).mappings().one_or_none()
    if suggestion is None:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Validate that the shopping list exists
    shopping_list = db.execute(
        text("SELECT id FROM shopping_lists WHERE id = :id"),
        {"id": body.list_id},
    ).mappings().one_or_none()
    if shopping_list is None:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    added = 0
    for item in body.ingredients:
        name = item.get("name", "").strip()
        if not name:
            continue
        raw_qty = item.get("quantity", "")
        try:
            qty = float(raw_qty) if raw_qty else None
        except (ValueError, TypeError):
            qty = None

        db.execute(
            text(
                "INSERT INTO shopping_list_items (list_id, product_name, quantity, source) "
                "VALUES (:list_id, :product_name, :quantity, 'meal_plan')"
            ),
            {"list_id": body.list_id, "product_name": name, "quantity": qty},
        )
        added += 1

    db.commit()
    return {"added": added}
