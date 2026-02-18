"""
Classifier router: wrap logic/classifier.py as API endpoints.
"""
import sys
import os
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

router = APIRouter(prefix="/api/classify", tags=["classifier"])

_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from logic.classifier import classify_item as _llm_classify


def _classify_item(raw_name: str) -> dict:
    """Call logic.classifier.classify_item."""
    return _llm_classify(raw_name)


# ---------- Pydantic models ----------

class ClassifyRequest(BaseModel):
    name: str


class ClassifyResponse(BaseModel):
    canonical_name: str
    category: str
    consumption_profile: str


class BatchClassifyResult(BaseModel):
    id: int
    raw_name: str
    canonical_name: str
    category: str
    consumption_profile: str
    error: Optional[str] = None


class BatchClassifyResponse(BaseModel):
    classified: int
    failed: int
    results: list[BatchClassifyResult]


# ---------- Consumption profile helper ----------

_PROFILE_MAP = {
    "Produce": "perishable",
    "Dairy": "perishable",
    "Meat": "perishable",
    "Frozen": "frozen",
    "Household": "household",
    "Pantry": "pantry",
}


def _profile_for_category(category: str) -> str:
    return _PROFILE_MAP.get(category, "pantry")


# ---------- Endpoints ----------

@router.post("", response_model=ClassifyResponse)
def classify_single(body: ClassifyRequest):
    """Classify a single product name using the local LLM."""
    result = _classify_item(body.name)
    canonical = result.get("clean_name") or body.name
    category = result.get("category", "Unknown")
    return ClassifyResponse(
        canonical_name=canonical,
        category=category,
        consumption_profile=_profile_for_category(category),
    )


@router.post("/batch", response_model=BatchClassifyResponse)
def classify_batch(db: Session = Depends(get_db)):
    """Classify all unclassified products in the database."""
    rows = db.execute(
        text("SELECT id, raw_name FROM products WHERE canonical_name IS NULL OR canonical_name = raw_name")
    ).fetchall()

    results = []
    classified = 0
    failed = 0

    for product_id, raw_name in rows:
        try:
            result = _classify_item(raw_name)
            canonical = result.get("clean_name") or raw_name
            category = result.get("category", "Unknown")
            profile = _profile_for_category(category)

            db.execute(
                text("UPDATE products SET canonical_name = :cn, category = :cat, consumption_profile = :cp WHERE id = :id"),
                {"cn": canonical, "cat": category, "cp": profile, "id": product_id},
            )

            results.append(BatchClassifyResult(
                id=product_id, raw_name=raw_name,
                canonical_name=canonical, category=category,
                consumption_profile=profile,
            ))
            classified += 1
        except Exception as e:
            results.append(BatchClassifyResult(
                id=product_id, raw_name=raw_name,
                canonical_name=raw_name, category="Unknown",
                consumption_profile="pantry", error=str(e),
            ))
            failed += 1

    db.commit()
    return BatchClassifyResponse(classified=classified, failed=failed, results=results)
