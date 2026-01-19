from dotenv import load_dotenv
import os
load_dotenv()

#!/usr/bin/env python3
"""
Pantry Observer - Mock Receipt Ingestion Script
Parses HTML receipts and stores product/purchase data in PostgreSQL.
"""

from bs4 import BeautifulSoup
import psycopg2
from datetime import datetime
import re

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": "pantry_db"
}


def parse_receipt(html_path: str) -> dict:
    """Parse the HTML receipt and extract order details."""
    with open(html_path, "r") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    # Extract Order ID
    order_id = None
    for p in soup.find_all("p"):
        if "Order ID:" in p.text:
            order_id = p.text.split("Order ID:")[-1].strip()
            break

    # Extract Date
    order_date = None
    for p in soup.find_all("p"):
        if "Date:" in p.text:
            date_str = p.text.split("Date:")[-1].strip()
            order_date = datetime.strptime(date_str, "%B %d, %Y")
            break

    # Extract items from table
    items = []
    table = soup.find("table", id="items")
    if table:
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) >= 3:
                name = cells[0].text.strip()
                quantity = int(cells[1].text.strip())
                # Parse price (remove $ and convert to float)
                price_str = cells[2].text.strip()
                price = float(re.sub(r"[^\d.]", "", price_str))
                items.append({
                    "name": name,
                    "quantity": quantity,
                    "unit_price": price
                })

    return {
        "order_id": order_id,
        "order_date": order_date,
        "items": items
    }


def upsert_product(cursor, raw_name: str) -> int:
    """Insert product or get existing ID using ON CONFLICT."""
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


def main():
    # Parse the mock receipt
    receipt = parse_receipt("mock_receipt.html")

    print(f"Processing Order: {receipt['order_id']}")
    print(f"Order Date: {receipt['order_date']}")
    print("-" * 40)

    # Connect to database
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    try:
        for item in receipt["items"]:
            # Upsert product
            product_id = upsert_product(cursor, item["name"])

            # Insert purchase
            insert_purchase(
                cursor,
                product_id=product_id,
                purchase_date=receipt["order_date"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                source_email_id=receipt["order_id"]
            )

            print(f"Successfully ingested {item['name']}")

        conn.commit()
        print("-" * 40)
        print(f"Ingestion complete: {len(receipt['items'])} items processed")

    except Exception as e:
        conn.rollback()
        print(f"Error during ingestion: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
