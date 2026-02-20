"""
Shopping lists router: CRUD for lists and items, plus auto-generation from inventory.

Endpoints:
  GET    /api/shopping-lists              — all lists
  POST   /api/shopping-lists              — create empty list
  POST   /api/shopping-lists/generate     — auto-generate from low/out inventory
  GET    /api/shopping-lists/search       — typeahead product search
  GET    /api/shopping-lists/{list_id}    — single list with items
  DELETE /api/shopping-lists/{list_id}    — delete list and its items
  POST   /api/shopping-lists/{list_id}/items              — add item
  PATCH  /api/shopping-lists/{list_id}/items/{item_id}    — update item
  DELETE /api/shopping-lists/{list_id}/items/{item_id}    — delete item
"""
import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.services.velocity import get_all_products_velocity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/shopping-lists", tags=["shopping-lists"])


# ── Pydantic models ──────────────────────────────────────────────────────────

class CreateListBody(BaseModel):
    name: str = "Shopping List"

class AddItemBody(BaseModel):
    product_name: str
    quantity: Optional[float] = 1
    product_id: Optional[int] = None
    source: Optional[str] = "manual"

class UpdateItemBody(BaseModel):
    checked: Optional[bool] = None
    quantity: Optional[float] = None
    product_name: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _list_to_dict(r) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
        "completed_at": r["completed_at"].isoformat() if r["completed_at"] else None,
    }

def _item_to_dict(r) -> dict:
    return {
        "id": r["id"],
        "list_id": r["list_id"],
        "product_id": r["product_id"],
        "product_name": r["product_name"],
        "quantity": float(r["quantity"]) if r["quantity"] is not None else 1,
        "checked": bool(r["checked"]),
        "source": r["source"] or "manual",
    }


# ── GET /api/shopping-lists ──────────────────────────────────────────────────

@router.get("")
def list_shopping_lists(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT sl.*,
                   COUNT(sli.id) AS item_count
            FROM shopping_lists sl
            LEFT JOIN shopping_list_items sli ON sli.list_id = sl.id
            GROUP BY sl.id
            ORDER BY sl.created_at DESC
            """
        )
    ).mappings().all()
    return [
        {**_list_to_dict(r), "item_count": r["item_count"]}
        for r in rows
    ]


# ── POST /api/shopping-lists ─────────────────────────────────────────────────

@router.post("")
def create_shopping_list(body: CreateListBody, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            INSERT INTO shopping_lists (name)
            VALUES (:name)
            RETURNING id, name, created_at, completed_at
            """
        ),
        {"name": body.name},
    ).mappings().fetchone()
    db.commit()
    return _list_to_dict(row)


# ── POST /api/shopping-lists/generate  (BEFORE /{list_id}) ───────────────────

@router.post("/generate")
def generate_shopping_list(db: Session = Depends(get_db)):
    """Auto-generate a list from products that are low, out, or predicted to run out within 7 days.

    Uses the velocity engine (computed from purchase history) rather than the
    static inventory_status column, which is never updated by the app.
    """
    all_products = get_all_products_velocity(db)
    cutoff = (date.today() + timedelta(days=7)).isoformat()

    qualifying = [
        p for p in all_products
        if p["status"] in ("low", "out")
        or (p["predicted_out_date"] is not None and p["predicted_out_date"] <= cutoff)
    ]
    logger.info(
        "Generate: %d/%d products qualify (low/out or predicted out within 7d)",
        len(qualifying), len(all_products),
    )

    list_name = f"Shopping List - {datetime.now().strftime('%b %d')}"
    list_row = db.execute(
        text(
            """
            INSERT INTO shopping_lists (name)
            VALUES (:name)
            RETURNING id, name, created_at, completed_at
            """
        ),
        {"name": list_name},
    ).mappings().fetchone()
    list_id = list_row["id"]

    for p in qualifying:
        db.execute(
            text(
                """
                INSERT INTO shopping_list_items (list_id, product_id, product_name, quantity, source)
                VALUES (:list_id, :product_id, :product_name, 1, 'auto')
                """
            ),
            {
                "list_id": list_id,
                "product_id": p["id"],
                "product_name": p["name"] or "Unknown",
            },
        )

    db.commit()
    return {
        "id": list_id,
        "name": list_row["name"],
        "item_count": len(qualifying),
    }


# ── GET /api/shopping-lists/search  (BEFORE /{list_id}) ──────────────────────

@router.get("/search")
def search_products(q: str = Query(..., min_length=2), db: Session = Depends(get_db)):
    """Typeahead search against products table for the add-item input."""
    rows = db.execute(
        text(
            """
            SELECT id,
                   COALESCE(canonical_name, raw_name) AS name,
                   COALESCE(category, 'Other') AS category
            FROM products
            WHERE canonical_name ILIKE :q OR raw_name ILIKE :q
            ORDER BY canonical_name
            LIMIT 10
            """
        ),
        {"q": f"%{q}%"},
    ).mappings().all()
    return [{"id": r["id"], "name": r["name"], "category": r["category"]} for r in rows]


# ── GET /api/shopping-lists/{list_id} ────────────────────────────────────────

@router.get("/{list_id}")
def get_shopping_list(list_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT id, name, created_at, completed_at
            FROM shopping_lists
            WHERE id = :id
            """
        ),
        {"id": list_id},
    ).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    items = db.execute(
        text(
            """
            SELECT sli.id, sli.list_id, sli.product_id, sli.product_name,
                   sli.quantity, sli.checked, sli.source
            FROM shopping_list_items sli
            LEFT JOIN products p ON p.id = sli.product_id
            WHERE sli.list_id = :id
            ORDER BY sli.checked, sli.id
            """
        ),
        {"id": list_id},
    ).mappings().all()

    return {
        "list": _list_to_dict(row),
        "items": [_item_to_dict(i) for i in items],
    }


# ── DELETE /api/shopping-lists/{list_id} ─────────────────────────────────────

@router.delete("/{list_id}")
def delete_shopping_list(list_id: int, db: Session = Depends(get_db)):
    exists = db.execute(
        text("SELECT id FROM shopping_lists WHERE id = :id"),
        {"id": list_id},
    ).fetchone()

    if not exists:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    db.execute(
        text("DELETE FROM shopping_list_items WHERE list_id = :id"),
        {"id": list_id},
    )
    db.execute(
        text("DELETE FROM shopping_lists WHERE id = :id"),
        {"id": list_id},
    )
    db.commit()
    return {"deleted": list_id}


# ── POST /api/shopping-lists/{list_id}/items ─────────────────────────────────

@router.post("/{list_id}/items")
def add_item(list_id: int, body: AddItemBody, db: Session = Depends(get_db)):
    exists = db.execute(
        text("SELECT id FROM shopping_lists WHERE id = :id"),
        {"id": list_id},
    ).fetchone()

    if not exists:
        raise HTTPException(status_code=404, detail="Shopping list not found")

    row = db.execute(
        text(
            """
            INSERT INTO shopping_list_items (list_id, product_id, product_name, quantity, source)
            VALUES (:list_id, :product_id, :product_name, :quantity, :source)
            RETURNING id, list_id, product_id, product_name, quantity, checked, source
            """
        ),
        {
            "list_id": list_id,
            "product_id": body.product_id,
            "product_name": body.product_name,
            "quantity": body.quantity,
            "source": body.source,
        },
    ).mappings().fetchone()
    db.commit()
    return _item_to_dict(row)


# ── PATCH /api/shopping-lists/{list_id}/items/{item_id} ──────────────────────

@router.patch("/{list_id}/items/{item_id}")
def update_item(list_id: int, item_id: int, body: UpdateItemBody, db: Session = Depends(get_db)):
    # Build SET clause from non-None fields
    updates = {}
    if body.checked is not None:
        updates["checked"] = body.checked
    if body.quantity is not None:
        updates["quantity"] = body.quantity
    if body.product_name is not None:
        updates["product_name"] = body.product_name

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = [f"{col} = :{col}" for col in updates]
    set_clause = ", ".join(set_parts)

    row = db.execute(
        text(
            f"""
            UPDATE shopping_list_items
            SET {set_clause}
            WHERE id = :item_id AND list_id = :list_id
            RETURNING id, list_id, product_id, product_name, quantity, checked, source
            """
        ),
        {**updates, "item_id": item_id, "list_id": list_id},
    ).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Item not found")

    db.commit()
    return _item_to_dict(row)


# ── DELETE /api/shopping-lists/{list_id}/items/{item_id} ─────────────────────

@router.delete("/{list_id}/items/{item_id}")
def delete_item(list_id: int, item_id: int, db: Session = Depends(get_db)):
    result = db.execute(
        text("DELETE FROM shopping_list_items WHERE id = :item_id AND list_id = :list_id"),
        {"item_id": item_id, "list_id": list_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    db.commit()
    return {"deleted": item_id}
