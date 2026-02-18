"""
Inventory router: exposes velocity-based product status endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.velocity import get_all_products_velocity, get_low_products_velocity

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("")
def list_inventory(db: Session = Depends(get_db)):
    """List all products with current velocity status."""
    return get_all_products_velocity(db)


@router.get("/low")
def list_low_inventory(db: Session = Depends(get_db)):
    """Products predicted to need reorder soon (status: low or out)."""
    return get_low_products_velocity(db)
