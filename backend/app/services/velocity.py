"""
Velocity engine: calculates consumption rates and reorder status for products.
Extracted from dashboard/app.py (lines 131-164) with category-specific thresholds.
"""
from datetime import datetime, date
from typing import Optional
from sqlalchemy import text
from sqlalchemy.orm import Session

# Velocity thresholds by category (multiplier on avg_interval_days)
# Values < 1.0 trigger reorder earlier; values > 1.0 give more buffer.
CATEGORY_THRESHOLDS = {
    'Produce': 0.8,      # Fresh items — reorder early (20% before normal)
    'Dairy': 0.9,        # Moderate buffer (10% early)
    'Meat': 0.85,        # Perishable — slightly early
    'Frozen': 1.1,       # Can last longer — slight buffer
    'Pantry': 1.2,       # Shelf-stable — relaxed (20% buffer)
    'Household': 1.5,    # Non-perishables — very relaxed (50% buffer)
}
DEFAULT_THRESHOLD = 1.0  # Fallback for uncategorized items


def _compute_status(
    days_since_last: Optional[float],
    avg_interval_days: Optional[float],
    buy_count: int,
    category: Optional[str],
) -> str:
    """
    Determine velocity status for a product.

    Returns one of: 'stocked', 'low', 'out'.
    'low' means overdue per category-adjusted threshold.
    'out' is reserved for products with inventory_status == 'OUT' in the DB;
    here we return 'low' for overdue items (caller can override with DB status).
    """
    if buy_count < 3 or avg_interval_days is None:
        # Not enough purchase history to predict
        return 'stocked'

    threshold = CATEGORY_THRESHOLDS.get(category or '', DEFAULT_THRESHOLD)
    if days_since_last is not None and float(days_since_last) > (float(avg_interval_days) * threshold):
        return 'low'
    return 'stocked'


def _compute_predicted_out_date(
    last_purchased: Optional[date],
    avg_interval_days: Optional[float],
    category: Optional[str],
) -> Optional[str]:
    """Return ISO date string for predicted out date, or None if not computable."""
    if last_purchased is None or avg_interval_days is None:
        return None
    threshold = CATEGORY_THRESHOLDS.get(category or '', DEFAULT_THRESHOLD)
    delta_days = int(avg_interval_days * threshold)
    if isinstance(last_purchased, datetime):
        last_purchased = last_purchased.date()
    from datetime import timedelta
    predicted = last_purchased + timedelta(days=delta_days)
    return predicted.isoformat()


# SQL: join products + purchases, compute avg_interval_days using same formula
# as dashboard/app.py get_velocity_data()
_VELOCITY_QUERY = text("""
WITH metrics AS (
    SELECT
        p.id,
        p.canonical_name,
        p.raw_name,
        p.category,
        p.inventory_status,
        p.consumption_profile,
        MAX(pur.purchase_date)  AS last_purchased,
        COUNT(pur.id)           AS buy_count,
        MIN(pur.purchase_date)  AS first_purchased,
        CURRENT_DATE - MAX(pur.purchase_date)::date AS days_since_last
    FROM products p
    LEFT JOIN purchases pur ON pur.product_id = p.id
    GROUP BY p.id, p.canonical_name, p.raw_name, p.category, p.inventory_status, p.consumption_profile
)
SELECT
    id,
    canonical_name,
    raw_name,
    category,
    inventory_status,
    consumption_profile,
    last_purchased,
    buy_count,
    days_since_last,
    CASE
        WHEN buy_count >= 3 THEN
            ROUND(
                (last_purchased::date - first_purchased::date)::numeric / (buy_count - 1),
                1
            )
        ELSE NULL
    END AS avg_interval_days
FROM metrics
ORDER BY category, canonical_name
""")


def get_all_products_velocity(db: Session) -> list[dict]:
    """
    Return velocity data for all products.

    Each dict contains:
        id, name, category, status, days_since_last_purchase,
        avg_interval_days, predicted_out_date
    """
    rows = db.execute(_VELOCITY_QUERY).mappings().all()
    results = []
    for row in rows:
        # If DB already marks item OUT, honour that; otherwise compute from velocity.
        db_status = (row['inventory_status'] or '').upper()
        if db_status == 'OUT':
            status = 'out'
        else:
            status = _compute_status(
                days_since_last=row['days_since_last'],
                avg_interval_days=row['avg_interval_days'],
                buy_count=row['buy_count'],
                category=row['category'],
            )

        last_purchased = row['last_purchased']
        avg_interval = float(row['avg_interval_days']) if row['avg_interval_days'] is not None else None

        lp = last_purchased
        if isinstance(lp, datetime):
            lp = lp.date()

        results.append({
            'id': row['id'],
            'name': row['canonical_name'] or row['raw_name'],
            'category': row['category'],
            'consumption_profile': row['consumption_profile'],
            'status': status,
            'last_purchased': lp.isoformat() if lp else None,
            'days_since_last_purchase': int(row['days_since_last']) if row['days_since_last'] is not None else None,
            'avg_interval_days': avg_interval,
            'predicted_out_date': _compute_predicted_out_date(
                last_purchased=last_purchased,
                avg_interval_days=avg_interval,
                category=row['category'],
            ),
        })
    return results


def get_low_products_velocity(db: Session) -> list[dict]:
    """Return only products predicted to need reorder soon (status == 'low' or 'out')."""
    all_products = get_all_products_velocity(db)
    return [p for p in all_products if p['status'] in ('low', 'out')]
