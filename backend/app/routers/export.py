"""
Data export router: JSON and CSV exports of pantry data.
"""
import csv
import io
from datetime import datetime, date
from decimal import Decimal

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["export"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize(value):
    """Convert non-JSON-serializable types to serializable equivalents."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _serialize_row(row: dict) -> dict:
    return {k: _serialize(v) for k, v in row.items()}


# ---------------------------------------------------------------------------
# JSON export
# ---------------------------------------------------------------------------

@router.get("/json")
def export_json(db: Session = Depends(get_db)):
    """Export all pantry data as JSON."""
    products = [
        _serialize_row(dict(r))
        for r in db.execute(text("SELECT * FROM products ORDER BY id")).mappings().all()
    ]

    purchases = [
        _serialize_row(dict(r))
        for r in db.execute(
            text(
                """
                SELECT
                    pu.*,
                    p.canonical_name,
                    r.store_name
                FROM purchases pu
                JOIN products p ON p.id = pu.product_id
                LEFT JOIN receipts r ON r.id = pu.receipt_id
                ORDER BY pu.id
                """
            )
        ).mappings().all()
    ]

    receipts = [
        _serialize_row(dict(r))
        for r in db.execute(text("SELECT * FROM receipts ORDER BY id")).mappings().all()
    ]

    return JSONResponse(
        content={
            "products": products,
            "purchases": purchases,
            "receipts": receipts,
            "exported_at": datetime.utcnow().isoformat(),
            "row_counts": {
                "products": len(products),
                "purchases": len(purchases),
                "receipts": len(receipts),
            },
        }
    )


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------

@router.get("/csv")
def export_csv(db: Session = Depends(get_db)):
    """Export purchase history as CSV."""
    rows = db.execute(
        text(
            """
            SELECT
                pu.purchase_date AS date,
                r.store_name    AS store,
                p.canonical_name AS product,
                p.category,
                pu.quantity,
                pu.unit_price,
                pu.quantity * pu.unit_price AS total_price
            FROM purchases pu
            JOIN products p ON p.id = pu.product_id
            LEFT JOIN receipts r ON r.id = pu.receipt_id
            ORDER BY pu.purchase_date DESC
            """
        )
    ).mappings().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "store", "product", "category", "quantity", "unit_price", "total_price"])

    for row in rows:
        writer.writerow([
            _serialize(row["date"]) or "",
            row["store"] or "",
            row["product"] or "",
            row["category"] or "",
            row["quantity"] if row["quantity"] is not None else "",
            float(row["unit_price"]) if row["unit_price"] is not None else "",
            float(row["total_price"]) if row["total_price"] is not None else "",
        ])

    csv_text = output.getvalue()

    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pantry_export.csv"},
    )
