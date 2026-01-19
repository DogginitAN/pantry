from dotenv import load_dotenv
import os
load_dotenv()

#!/usr/bin/env python3
"""
Manual Receipt Ingestion - Process user-uploaded receipt photos
"""

import sys
import os
import psycopg2
import hashlib
from datetime import datetime
from pathlib import Path

# Add agents directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'agents'))
from receipt_ocr import extract_with_gpt4_vision

# Database configuration
DB_PARAMS = {
    "host": "localhost",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": "pantry_db"
}


def generate_source_id(image_path: str) -> str:
    """Generate unique ID from image file hash."""
    with open(image_path, 'rb') as f:
        file_hash = hashlib.sha256(f.read()).hexdigest()
    return f"manual_{file_hash[:16]}"


def source_id_exists(cursor, source_id: str) -> bool:
    """Check if we've already processed this receipt."""
    cursor.execute(
        "SELECT 1 FROM purchases WHERE source_email_id = %s LIMIT 1",
        (source_id,)
    )
    return cursor.fetchone() is not None


def upsert_product(cursor, raw_name: str) -> int:
    """Insert product or get existing ID."""
    cursor.execute("""
        INSERT INTO products (raw_name, canonical_name)
        VALUES (%s, %s)
        ON CONFLICT (raw_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
        RETURNING id
    """, (raw_name, raw_name))
    return cursor.fetchone()[0]


def insert_purchase(cursor, product_id: int, purchase_date: datetime,
                    quantity: int, unit_price: float, source_email_id: str):
    """Insert a purchase record."""
    cursor.execute("""
        INSERT INTO purchases (product_id, purchase_date, quantity, unit_price, source_email_id)
        VALUES (%s, %s, %s, %s, %s)
    """, (product_id, purchase_date, quantity, unit_price, source_email_id))


def process_manual_receipt(image_path: str, store_name: str = "Manual", 
                           purchase_date: datetime = None):
    """
    Process a manually uploaded receipt photo.
    
    Args:
        image_path: Path to receipt image
        store_name: Store name (for OCR context)
        purchase_date: Date of purchase (defaults to today)
    """
    if not os.path.exists(image_path):
        print(f"❌ Image not found: {image_path}")
        return False
    
    if purchase_date is None:
        purchase_date = datetime.now()
    
    print(f"📸 Processing manual receipt from {store_name}")
    print(f"   Image: {image_path}")
    print(f"   Date: {purchase_date.strftime('%Y-%m-%d')}")
    
    # Generate unique source ID
    source_id = generate_source_id(image_path)
    
    # Connect to database
    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()
    
    try:
        # Check for duplicates
        if source_id_exists(cursor, source_id):
            print(f"⚠️  Receipt already imported (source_id: {source_id})")
            return False
        
        # Extract items using OCR
        print("🔍 Extracting items with GPT-4 Vision...")
        items = extract_with_gpt4_vision(image_path, store_name)
        
        if not items:
            print("❌ No items extracted from receipt")
            return False
        
        print(f"✅ Found {len(items)} items")
        
        # Insert each item
        for item in items:
            raw_name = item.get('raw_name')
            quantity = item.get('quantity', 1)
            unit_price = item.get('unit_price', 0.0)
            
            if not raw_name or unit_price <= 0:
                print(f"  ⚠️  Skipping invalid item: {item}")
                continue
            
            # Upsert product
            product_id = upsert_product(cursor, raw_name)
            
            # Insert purchase
            insert_purchase(
                cursor,
                product_id=product_id,
                purchase_date=purchase_date,
                quantity=quantity,
                unit_price=unit_price,
                source_email_id=source_id
            )
            
            print(f"  ✅ {raw_name} (x{quantity} @ ${unit_price})")
        
        conn.commit()
        print(f"\n🎉 Successfully imported {len(items)} items")
        print(f"   Run 'python logic/classifier.py' to classify new products")
        return True
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Error processing receipt: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_manual.py <receipt_image> [store_name] [YYYY-MM-DD]")
        print("\nExample:")
        print("  python ingest_manual.py ~/Downloads/receipt.jpg")
        print("  python ingest_manual.py ~/Downloads/receipt.jpg Costco")
        print("  python ingest_manual.py ~/Downloads/receipt.jpg Instacart 2026-01-15")
        sys.exit(1)
    
    image_path = sys.argv[1]
    store_name = sys.argv[2] if len(sys.argv) > 2 else "Manual"
    
    # Parse date if provided
    purchase_date = None
    if len(sys.argv) > 3:
        try:
            purchase_date = datetime.strptime(sys.argv[3], "%Y-%m-%d")
        except ValueError:
            print(f"⚠️  Invalid date format: {sys.argv[3]}, using today")
    
    success = process_manual_receipt(image_path, store_name, purchase_date)
    sys.exit(0 if success else 1)
