"""
Spending analytics and settings routers.
"""
from typing import Optional, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

spending_router = APIRouter(prefix="/api/spending", tags=["spending"])
settings_router = APIRouter(prefix="/api/settings", tags=["settings"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_setting(db: Session, key: str) -> Optional[str]:
    row = db.execute(text("SELECT value FROM settings WHERE key = :key"), {"key": key}).fetchone()
    return row[0] if row else None


def _upsert_setting(db: Session, key: str, value: str) -> None:
    db.execute(
        text(
            "INSERT INTO settings (key, value, updated_at) VALUES (:key, :value, NOW()) "
            "ON CONFLICT (key) DO UPDATE SET value = :value, updated_at = NOW()"
        ),
        {"key": key, "value": value},
    )
    db.commit()


# ---------------------------------------------------------------------------
# Spending endpoints
# ---------------------------------------------------------------------------

@spending_router.get("/monthly")
def get_monthly_spending(db: Session = Depends(get_db)):
    """Monthly spending totals from purchases."""
    rows = db.execute(
        text(
            """
            SELECT
                to_char(purchase_date, 'YYYY-MM') AS month,
                SUM(unit_price * quantity) AS total,
                COUNT(DISTINCT receipt_id) AS receipt_count
            FROM purchases
            WHERE purchase_date IS NOT NULL
            GROUP BY 1
            ORDER BY 1 DESC
            LIMIT 12
            """
        )
    ).mappings().all()
    return [dict(r) for r in rows]


@spending_router.get("/by-category")
def get_spending_by_category(db: Session = Depends(get_db)):
    """Spending totals broken down by product category."""
    rows = db.execute(
        text(
            """
            SELECT
                p.category,
                SUM(pu.unit_price * pu.quantity) AS total
            FROM purchases pu
            JOIN products p ON p.id = pu.product_id
            GROUP BY p.category
            ORDER BY total DESC
            """
        )
    ).mappings().all()
    results = [dict(r) for r in rows]
    grand_total = sum(r["total"] for r in results) if results else 0
    for r in results:
        r["pct_of_total"] = round(float(r["total"]) / float(grand_total) * 100, 1) if grand_total else 0.0
        r["total"] = float(r["total"])
    return results


@spending_router.get("/top-items")
def get_top_items(limit: int = 10, db: Session = Depends(get_db)):
    """Top products by total spend."""
    rows = db.execute(
        text(
            """
            SELECT
                p.canonical_name AS name,
                p.category,
                SUM(pu.unit_price * pu.quantity) AS total,
                SUM(pu.quantity) AS quantity
            FROM purchases pu
            JOIN products p ON p.id = pu.product_id
            GROUP BY p.id, p.canonical_name, p.category
            ORDER BY total DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).mappings().all()
    return [
        {**dict(r), "total": float(r["total"]), "quantity": float(r["quantity"])}
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Budget settings
# ---------------------------------------------------------------------------

class BudgetBody(BaseModel):
    monthly_budget: Optional[float] = Field(None, ge=0)


@settings_router.get("/budget")
def get_budget(db: Session = Depends(get_db)):
    raw = _get_setting(db, "monthly_budget")
    return {"monthly_budget": float(raw) if raw else None}


@settings_router.patch("/budget")
def set_budget(body: BudgetBody, db: Session = Depends(get_db)):
    if body.monthly_budget is not None:
        _upsert_setting(db, "monthly_budget", str(body.monthly_budget))
    raw = _get_setting(db, "monthly_budget")
    return {"monthly_budget": float(raw) if raw else None}


# ---------------------------------------------------------------------------
# AI provider settings
# ---------------------------------------------------------------------------

_AI_PROVIDER_DEFAULTS = {
    "ai_provider": "local",
    "ollama_base_url": "http://localhost:11434",
    "ollama_model": "qwen2.5:3b",
    "cloud_model": "claude-sonnet-4-5",
}


def _get_ai_provider_settings(db: Session) -> dict:
    result = {}
    for key, default in _AI_PROVIDER_DEFAULTS.items():
        val = _get_setting(db, key)
        result[key] = val if val is not None else default
    # Rename ai_provider → provider in the response
    result["provider"] = result.pop("ai_provider")
    return result


class AIProviderSettings(BaseModel):
    provider: Optional[Literal["local", "cloud"]] = None
    ollama_base_url: Optional[str] = None
    ollama_model: Optional[str] = None
    cloud_model: Optional[str] = None


@settings_router.get("/ai-provider")
def get_ai_provider(db: Session = Depends(get_db)):
    return _get_ai_provider_settings(db)


@settings_router.patch("/ai-provider")
def patch_ai_provider(body: AIProviderSettings, db: Session = Depends(get_db)):
    # Map response key "provider" back to DB key "ai_provider"
    field_to_db_key = {
        "provider": "ai_provider",
        "ollama_base_url": "ollama_base_url",
        "ollama_model": "ollama_model",
        "cloud_model": "cloud_model",
    }
    for field, db_key in field_to_db_key.items():
        value = getattr(body, field)
        if value is not None:
            _upsert_setting(db, db_key, value)
    return _get_ai_provider_settings(db)
