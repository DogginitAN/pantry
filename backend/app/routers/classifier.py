"""
Classifier router: wrap logic/classifier.py as API endpoints.
"""
import sys
import os

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/classify", tags=["classifier"])

_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../"))


def _classify_item(raw_name: str) -> dict:
    """Import and call logic.classifier.classify_item with project root on sys.path."""
    if _project_root not in sys.path:
        sys.path.insert(0, _project_root)
    from logic.classifier import classify_item
    return classify_item(raw_name)


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


class BatchClassifyResponse(BaseModel):
    classified: int
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
def classify_batch():
    """Classify all unclassified products in the database (canonical_name IS NULL or equals raw_name)."""
    import psycopg2

    db_params = {
        "host": os.getenv("DB_HOST", "localhost"),
        "user": os.getenv("DB_USER"),
        "password": os.getenv("DB_PASSWORD"),
        "database": "pantry_db",
    }

    conn = psycopg2.connect(**db_params)
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, raw_name
            FROM products
            WHERE canonical_name IS NULL OR canonical_name = raw_name
        """)
        rows = cursor.fetchall()

        results = []
        for product_id, raw_name in rows:
            result = _classify_item(raw_name)
            canonical = result.get("clean_name") or raw_name
            category = result.get("category", "Unknown")
            profile = _profile_for_category(category)

            cursor.execute("""
                UPDATE products
                SET canonical_name = %s, category = %s, consumption_profile = %s
                WHERE id = %s
            """, (canonical, category, profile, product_id))

            results.append(BatchClassifyResult(
                id=product_id,
                raw_name=raw_name,
                canonical_name=canonical,
                category=category,
                consumption_profile=profile,
            ))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    return BatchClassifyResponse(classified=len(results), results=results)
