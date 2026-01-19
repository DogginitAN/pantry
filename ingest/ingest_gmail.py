#!/usr/bin/env python3
"""
Pantry Observer - Gmail Instacart Receipt Ingestion
Fetches and parses Instacart receipts from Gmail via IMAP.
"""

import imaplib
import email
from email.header import decode_header
from bs4 import BeautifulSoup
import psycopg2
import os
import re
import hashlib
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
IMAP_SERVER = "imap.gmail.com"

DB_PARAMS = {
    "host": "localhost",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": "pantry_db"
}


def generate_source_id(subject: str, date_str: str) -> str:
    """Generate unique ID from subject + date to prevent duplicates."""
    content = f"{subject}|{date_str}"
    return hashlib.sha256(content.encode()).hexdigest()[:16]


def decode_email_header(header):
    """Decode email header handling various encodings."""
    if header is None:
        return ""
    decoded_parts = decode_header(header)
    result = []
    for part, encoding in decoded_parts:
        if isinstance(part, bytes):
            result.append(part.decode(encoding or 'utf-8', errors='replace'))
        else:
            result.append(part)
    return ''.join(result)


def get_email_body(msg):
    """Extract HTML body from email message."""
    html_body = None

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or 'utf-8'
                    html_body = payload.decode(charset, errors='replace')
                    break
    else:
        content_type = msg.get_content_type()
        if content_type == "text/html":
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or 'utf-8'
                html_body = payload.decode(charset, errors='replace')

    return html_body


def parse_instacart_receipt(html_content: str) -> list:
    """
    Parse Instacart receipt HTML to extract items.

    Uses div-based structure with class="item-name" for products.
    """
    SKIP_KEYWORDS = [
        'subtotal', 'total', 'tax', 'tip', 'fee', 'delivery', 'service',
        'savings', 'you saved', 'original charge', 'adjusted', 'refund',
        'checkout', 'promotions', 'credit', 'substituted for'
    ]

    items = []
    soup = BeautifulSoup(html_content, 'html.parser')

    # Find all item-name divs
    name_divs = soup.find_all('div', class_='item-name')

    for name_div in name_divs:
        # Extract product name (first text node, before any <small> tags)
        # Get direct text content, not nested elements
        raw_name = ''
        for content in name_div.children:
            if isinstance(content, str):
                raw_name = content.strip()
                if raw_name:
                    break
            elif content.name and content.name != 'small' and content.name != 'br':
                # Sometimes name is in a nested element
                text = content.get_text(strip=True)
                if text and not text.startswith('$'):
                    raw_name = text
                    break

        # If no direct text, try getting text before first <small>
        if not raw_name:
            full_text = name_div.get_text(separator='|', strip=True)
            parts = full_text.split('|')
            if parts:
                raw_name = parts[0].strip()

        # Clean the name - remove size info like "(12 oz)"
        raw_name = re.sub(r'\([^)]*\)$', '', raw_name).strip()

        # Skip if name is empty or too short
        if not raw_name or len(raw_name) < 3:
            continue

        # Skip blocked keywords
        if any(keyword in raw_name.lower() for keyword in SKIP_KEYWORDS):
            continue

        # Extract quantity from <small class="muted">
        quantity = 1
        muted_small = name_div.find('small', class_='muted')
        if muted_small:
            muted_text = muted_small.get_text()
            # Look for pattern like "2 x $3.00"
            qty_match = re.search(r'(\d+)\s*x\s*\$', muted_text)
            if qty_match:
                quantity = int(qty_match.group(1))
            # If it contains "lb", treat as 1 unit of produce
            elif 'lb' in muted_text.lower():
                quantity = 1

        # Extract price from next item-price div
        price = 0.0
        price_div = name_div.find_next('div', class_='item-price')
        if price_div:
            # Look for the total div inside
            total_div = price_div.find('div', class_='total')
            if total_div:
                # Get the last total (in case of strikethrough prices)
                all_totals = price_div.find_all('div', class_='total')
                for t in reversed(all_totals):
                    # Skip strikethrough prices
                    if 'strike' not in t.get('class', []):
                        price_text = t.get_text(strip=True)
                        price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                        if price_match:
                            price = float(price_match.group(1))
                            break

        # Skip if no valid price found
        if price <= 0:
            continue

        # Skip very large prices (likely totals)
        if price > 200:
            continue

        items.append({
            'raw_name': raw_name,
            'quantity': quantity,
            'unit_price': price
        })

    # Deduplicate items by name (take first occurrence)
    seen = set()
    unique_items = []
    for item in items:
        if item['raw_name'] not in seen:
            seen.add(item['raw_name'])
            unique_items.append(item)

    return unique_items


def parse_costco_receipt(html_content: str) -> list:
    """
    Parse Costco receipt HTML to extract items.

    Uses table-based structure with class="full-width" for products.
    """
    SKIP_KEYWORDS = [
        'subtotal', 'total', 'tax', 'tip', 'fee', 'delivery', 'service',
        'savings', 'you saved', 'original charge', 'adjusted', 'refund',
        'checkout', 'promotions', 'credit'
    ]

    items = []
    soup = BeautifulSoup(html_content, 'html.parser')

    # Find all tables with full-width class (each contains a product)
    product_tables = soup.find_all('table', class_='full-width')

    for table in product_tables:
        # Find the td with full-width class that contains product info
        product_td = table.find('td', class_='full-width')
        if not product_td:
            continue

        # Extract quantity from <strong>N x</strong>
        quantity = 1
        strong_tag = product_td.find('strong')
        if strong_tag:
            qty_text = strong_tag.get_text(strip=True)
            qty_match = re.search(r'(\d+)\s*x', qty_text)
            if qty_match:
                quantity = int(qty_match.group(1))

        # Extract product name from <span>
        span_tag = product_td.find('span')
        if not span_tag:
            continue

        raw_name = span_tag.get_text(strip=True)

        # Skip if name is empty or too short
        if not raw_name or len(raw_name) < 3:
            continue

        # Skip blocked keywords
        if any(keyword in raw_name.lower() for keyword in SKIP_KEYWORDS):
            continue

        # Find price in the next sibling td (price cell)
        price = 0.0
        all_tds = table.find_all('td')
        for td in all_tds:
            # Skip the product info td
            if td == product_td or 'full-width' in td.get('class', []):
                continue

            # Check for discounted price first
            discounted = td.find('strong', class_='discounted-price')
            if discounted:
                price_text = discounted.get_text(strip=True)
                price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                if price_match:
                    price = float(price_match.group(1))
                    break

            # Otherwise check for regular price in <strong>
            regular_price = td.find('strong')
            if regular_price and not regular_price.get('class'):
                price_text = regular_price.get_text(strip=True)
                price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                if price_match:
                    price = float(price_match.group(1))
                    break

        # Skip if price is $0.00 or not found (refund/replacement original)
        if price <= 0:
            continue

        # Skip very large prices (likely totals)
        if price > 500:
            continue

        items.append({
            'raw_name': raw_name,
            'quantity': quantity,
            'unit_price': price
        })

    # Deduplicate items by name (take first occurrence)
    seen = set()
    unique_items = []
    for item in items:
        if item['raw_name'] not in seen:
            seen.add(item['raw_name'])
            unique_items.append(item)

    return unique_items


def source_id_exists(cursor, source_id: str) -> bool:
    """Check if we've already processed this email."""
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


def fetch_receipt_emails(mail, days_back: int = 90):
    """Fetch receipt emails from Instacart and Costco within date range."""
    mail.select('"[Gmail]/All Mail"')

    # Calculate SINCE date (90 days back)
    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    print(f"  Searching for emails SINCE {since_date}")

    # Search for receipts from Instacart OR Costco within date range
    search_query = f'(OR (FROM "orders@instacart.com") (FROM "no-reply@costco.com")) SINCE {since_date}'
    status, messages = mail.search(None, search_query)

    if status != "OK":
        print("Failed to search emails")
        return []

    email_ids = messages[0].split()

    if not email_ids:
        print("No receipts found")
        return []

    print(f"  Found {len(email_ids)} total emails matching criteria")

    # Fetch ALL matching emails (no limit for backfill)
    emails = []
    for i, email_id in enumerate(email_ids):
        status, msg_data = mail.fetch(email_id, "(RFC822)")
        if status != "OK":
            continue

        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                emails.append(msg)

        # Progress indicator
        if (i + 1) % 10 == 0:
            print(f"  Fetched {i + 1}/{len(email_ids)} emails...")

    return emails


def main():
    print("=" * 60)
    print("Pantry Observer - Gmail Instacart Ingestion")
    print("=" * 60)

    # Validate credentials
    if not EMAIL_USER or not EMAIL_PASS:
        print("ERROR: EMAIL_USER and EMAIL_PASS must be set in .env")
        return

    print(f"Connecting as: {EMAIL_USER}")

    # Connect to Gmail
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_USER, EMAIL_PASS)
        print("Connected to Gmail")
    except Exception as e:
        print(f"Failed to connect to Gmail: {e}")
        print("\nTip: If using Gmail, you may need an App Password:")
        print("https://myaccount.google.com/apppasswords")
        return

    # Connect to database
    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()

    try:
        # Fetch emails
        print("\nSearching for receipts (Instacart + Costco)...")
        emails = fetch_receipt_emails(mail, days_back=90)
        print(f"Found {len(emails)} receipt(s) to process\n")

        total_imported = 0
        emails_processed = 0

        for msg in emails:
            # Extract metadata
            subject = decode_email_header(msg["Subject"])
            date_str = msg["Date"]
            email_from = msg.get("From", "")

            # Parse date
            try:
                # Handle various date formats
                date_tuple = email.utils.parsedate_tz(date_str)
                if date_tuple:
                    timestamp = email.utils.mktime_tz(date_tuple)
                    purchase_date = datetime.fromtimestamp(timestamp)
                else:
                    purchase_date = datetime.now()
            except Exception:
                purchase_date = datetime.now()

            # Generate unique source ID
            source_id = generate_source_id(subject, date_str)

            # Debug output with source identification
            print(f"  DEBUG: Found Email from {email_from} | Subject: '{subject}'")

            # Only process actual receipts (skip confirmations, pickup notifications, etc.)
            if "receipt" not in subject.lower():
                print(f"  SKIP: Not a receipt - {subject[:50]}...")
                continue

            # Check for duplicates
            if source_id_exists(cursor, source_id):
                print(f"  SKIP: Already imported - {subject[:50]}...")
                continue

            # Get HTML body
            html_body = get_email_body(msg)
            if not html_body:
                print(f"  SKIP: No HTML body - {subject[:50]}...")
                continue

            # Route to appropriate parser based on sender
            if "costco" in email_from.lower():
                items = parse_costco_receipt(html_body)
                source_label = "Costco"
            else:
                items = parse_instacart_receipt(html_body)
                source_label = "Instacart"

            if not items:
                print(f"  SKIP: No items found - {subject[:50]}...")
                continue

            # Insert items
            for item in items:
                product_id = upsert_product(cursor, item['raw_name'])
                insert_purchase(
                    cursor,
                    product_id=product_id,
                    purchase_date=purchase_date,
                    quantity=item['quantity'],
                    unit_price=item['unit_price'],
                    source_email_id=source_id
                )

            conn.commit()
            total_imported += len(items)
            emails_processed += 1

            print(f"  [{purchase_date.strftime('%Y-%m-%d')}] {source_label}: Imported {len(items)} items")

        print("\n" + "=" * 60)
        print(f"SUMMARY: Processed {emails_processed} email(s), imported {total_imported} item(s)")
        print("=" * 60)

    except Exception as e:
        conn.rollback()
        print(f"Error during ingestion: {e}")
        raise
    finally:
        cursor.close()
        conn.close()
        mail.logout()


if __name__ == "__main__":
    main()
