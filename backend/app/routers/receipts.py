"""
Receipts router: upload, list, and confirm grocery receipt scans.

Upload flow:
  1. Save image to uploads/
  2. Mark receipt as 'processing', flush to DB
  3. Call vision_receipt.parse_receipt() → llama3.2-vision extracts store/date/total/items
  4. Update receipt row with extracted header data
  5. Upsert products + insert purchases for each line item
  6. Return fully populated receipt + items to frontend
"""
import asyncio
import os
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.services.vision_receipt import parse_receipt

router = APIRouter(prefix="/api/receipts", tags=["receipts"])

_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


def _ensure_upload_dir() -> str:
    os.makedirs(_UPLOAD_DIR, exist_ok=True)
    return _UPLOAD_DIR


def _receipt_row_to_dict(r) -> dict:
    return {
        "id": r["id"],
        "store_name": r["store_name"],
        "receipt_date": r["receipt_date"].isoformat() if r["receipt_date"] else None,
        "total_amount": float(r["total_amount"]) if r["total_amount"] is not None else None,
        "image_path": r["image_path"],
        "processing_status": r["processing_status"],
        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
    }


def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Try common date formats from the vision model response."""
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    return None


def _upsert_product_unused(db: Session, raw_name: str) -> int:
    """Kept for reference — product upsert is now inlined in upload_receipt."""
    row = db.execute(
        text(
            """
            INSERT INTO products (raw_name, canonical_name, category, inventory_status)
            VALUES (:name, :name, 'Unknown', 'IN_STOCK')
            ON CONFLICT (raw_name) DO UPDATE
                SET raw_name = EXCLUDED.raw_name
            RETURNING id
            """
        ),
        {"name": raw_name},
    ).fetchone()
    return row[0]


# ---------------------------------------------------------------------------
# GET /api/receipts — list all receipts
# ---------------------------------------------------------------------------

@router.get("")
def list_receipts(db: Session = Depends(get_db)):
    rows = db.execute(
        text(
            """
            SELECT id, store_name, receipt_date, total_amount,
                   image_path, processing_status, created_at
            FROM receipts
            ORDER BY created_at DESC
            LIMIT 50
            """
        )
    ).mappings().all()
    return [_receipt_row_to_dict(r) for r in rows]


# ---------------------------------------------------------------------------
# POST /api/receipts/upload — upload + vision-process a receipt image
# NOTE: defined BEFORE /{receipt_id} so FastAPI doesn't match "upload" as an id
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_receipt(file: UploadFile = File(...)):
    """
    Upload and vision-process a receipt image.

    Uses engine.begin() directly (not Depends(get_db)) so each DB operation
    gets its own clean connection. This avoids session state issues that arise
    when a long-running asyncio.to_thread() call sits between two DB operations
    on the same Depends session.
    """
    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Only image files are accepted.")

    # ── 1. Save image ──────────────────────────────────────────────────────
    upload_dir = _ensure_upload_dir()
    raw_ext = os.path.splitext(file.filename or "receipt.jpg")[1]
    ext = raw_ext if raw_ext else ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # ── 2. INSERT receipt row (own connection, auto-commits on exit) ────────
    with engine.begin() as conn:
        row = conn.execute(
            text(
                """
                INSERT INTO receipts (image_path, processing_status)
                VALUES (:image_path, 'processing')
                RETURNING id, store_name, receipt_date, total_amount,
                          image_path, processing_status, created_at
                """
            ),
            {"image_path": file_path},
        ).mappings().fetchone()
    receipt_id = row["id"]

    # ── 3. Run vision model (sync, in thread pool) ─────────────────────────
    try:
        parsed = await asyncio.to_thread(parse_receipt, file_path)
    except Exception:
        # Vision failed — mark ready with no items so frontend isn't stuck
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE receipts SET processing_status = 'ready' WHERE id = :id"),
                {"id": receipt_id},
            )
        return {**dict(row), "processing_status": "ready", "items": []}

    # ── 4. UPDATE receipt header (own connection) ──────────────────────────
    parsed_date = _parse_date(parsed.get("date"))
    with engine.begin() as conn:
        updated = conn.execute(
            text(
                """
                UPDATE receipts
                SET store_name        = :store_name,
                    receipt_date      = :receipt_date,
                    total_amount      = :total_amount,
                    processing_status = 'ready',
                    ai_provider       = 'ollama'
                WHERE id = :id
                RETURNING id, store_name, receipt_date, total_amount,
                          image_path, processing_status, created_at
                """
            ),
            {
                "id": receipt_id,
                "store_name": parsed.get("store_name"),
                "receipt_date": parsed_date,
                "total_amount": parsed.get("total"),
            },
        ).mappings().fetchone()

        # ── 5. INSERT purchases (same connection/transaction as UPDATE) ──────
        purchase_date = parsed_date or datetime.utcnow()
        inserted_items = []

        for item in parsed.get("items") or []:
            name = item.get("name", "").strip()
            if not name:
                continue
            try:
                # Upsert product
                product_row = conn.execute(
                    text(
                        """
                        INSERT INTO products (raw_name, canonical_name, category, inventory_status)
                        VALUES (:name, :name, 'Unknown', 'IN_STOCK')
                        ON CONFLICT (raw_name) DO UPDATE SET raw_name = EXCLUDED.raw_name
                        RETURNING id
                        """
                    ),
                    {"name": name},
                ).fetchone()
                product_id = product_row[0]

                purchase_row = conn.execute(
                    text(
                        """
                        INSERT INTO purchases
                            (product_id, receipt_id, quantity, unit_price,
                             purchase_date, raw_ocr_line, ocr_confidence)
                        VALUES
                            (:product_id, :receipt_id, :quantity, :unit_price,
                             :purchase_date, :raw_ocr_line, :confidence)
                        RETURNING id, quantity, unit_price,
                                  (unit_price * quantity) AS total_price
                        """
                    ),
                    {
                        "product_id": product_id,
                        "receipt_id": receipt_id,
                        "quantity": item.get("quantity", 1),
                        "unit_price": item.get("unit_price", 0),
                        "purchase_date": purchase_date,
                        "raw_ocr_line": name,
                        "confidence": 0.9,
                    },
                ).mappings().fetchone()

                inserted_items.append({
                    "id": purchase_row["id"],
                    "product_name": name,
                    "quantity": float(purchase_row["quantity"]) if purchase_row["quantity"] is not None else None,
                    "unit_price": float(purchase_row["unit_price"]) if purchase_row["unit_price"] is not None else None,
                    "total_price": float(purchase_row["total_price"]) if purchase_row["total_price"] is not None else None,
                    "confidence": 0.9,
                })
            except Exception:
                continue  # skip malformed items, don't abort the whole upload

    # ── 6. Return populated receipt + items ───────────────────────────────
    return {
        **_receipt_row_to_dict(updated),
        "items": inserted_items,
    }


# ---------------------------------------------------------------------------
# GET /api/receipts/{receipt_id} — single receipt with line items
# ---------------------------------------------------------------------------

@router.get("/{receipt_id}")
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            SELECT id, store_name, receipt_date, total_amount,
                   image_path, processing_status, created_at
            FROM receipts
            WHERE id = :id
            """
        ),
        {"id": receipt_id},
    ).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")

    items_rows = db.execute(
        text(
            """
            SELECT
                pu.id,
                COALESCE(p.canonical_name, p.raw_name, pu.raw_ocr_line) AS product_name,
                pu.quantity,
                pu.unit_price,
                (pu.unit_price * pu.quantity) AS total_price,
                pu.ocr_confidence AS confidence
            FROM purchases pu
            JOIN products p ON p.id = pu.product_id
            WHERE pu.receipt_id = :id
            ORDER BY pu.id
            """
        ),
        {"id": receipt_id},
    ).mappings().all()

    items = [
        {
            "id": r["id"],
            "product_name": r["product_name"],
            "quantity": float(r["quantity"]) if r["quantity"] is not None else None,
            "unit_price": float(r["unit_price"]) if r["unit_price"] is not None else None,
            "total_price": float(r["total_price"]) if r["total_price"] is not None else None,
            "confidence": float(r["confidence"]) if r["confidence"] is not None else None,
        }
        for r in items_rows
    ]

    return {"receipt": _receipt_row_to_dict(row), "items": items}


# ---------------------------------------------------------------------------
# DELETE /api/receipts/{receipt_id} — delete receipt and its purchases
# ---------------------------------------------------------------------------

@router.delete("/{receipt_id}")
def delete_receipt(receipt_id: int, db: Session = Depends(get_db)):
    exists = db.execute(
        text("SELECT id FROM receipts WHERE id = :id"),
        {"id": receipt_id},
    ).fetchone()

    if not exists:
        raise HTTPException(status_code=404, detail="Receipt not found")

    # Delete purchases first (no cascade on the FK)
    db.execute(
        text("DELETE FROM purchases WHERE receipt_id = :id"),
        {"id": receipt_id},
    )
    db.execute(
        text("DELETE FROM receipts WHERE id = :id"),
        {"id": receipt_id},
    )
    db.commit()
    return {"deleted": receipt_id}


# ---------------------------------------------------------------------------
# POST /api/receipts/{receipt_id}/confirm — save receipt to inventory
# ---------------------------------------------------------------------------

@router.post("/{receipt_id}/confirm")
def confirm_receipt(receipt_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        text(
            """
            UPDATE receipts
            SET processing_status = 'saved'
            WHERE id = :id
            RETURNING id, processing_status
            """
        ),
        {"id": receipt_id},
    ).mappings().fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Receipt not found")

    db.commit()
    return {"id": row["id"], "processing_status": row["processing_status"]}
