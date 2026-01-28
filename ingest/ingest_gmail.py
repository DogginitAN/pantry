#!/usr/bin/env python3
"""
Pantry Observer - Gmail Instacart Receipt Ingestion
Fetches and parses Instacart/Costco receipts from Gmail via IMAP.
Now supports fetching full receipts via Playwright for orders with 10+ items.
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

# Path to Instacart session state for Playwright
INSTACART_SESSION_PATH = os.path.join(os.path.dirname(__file__), "..", "instacart_state.json")


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


def find_full_receipt_link(html_content: str) -> str:
    """Find the full receipt link in Instacart email HTML."""
    soup = BeautifulSoup(html_content, 'html.parser')
    
    for link in soup.find_all('a', href=True):
        href = link.get('href', '')
        # Look for receipt links with token
        if '/receipt' in href and 'token=' in href:
            # Ensure it has full=true parameter
            if 'full=true' not in href:
                if '?' in href:
                    href = href.split('#')[0] + '&full=true'
                else:
                    href = href.split('#')[0] + '?full=true'
            return href
    
    return None


def fetch_full_receipt_playwright(url: str) -> str:
    """Fetch full receipt HTML using Playwright with saved Instacart session."""
    try:
        from playwright.sync_api import sync_playwright
        
        if not os.path.exists(INSTACART_SESSION_PATH):
            print(f"    WARNING: Instacart session not found at {INSTACART_SESSION_PATH}")
            return None
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=INSTACART_SESSION_PATH)
            page = context.new_page()
            
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(5000)  # Wait for JS to render
            
            html = page.content()
            
            context.close()
            browser.close()
            
            return html
            
    except Exception as e:
        print(f"    ERROR fetching full receipt via Playwright: {e}")
        return None


def parse_instacart_receipt_web(html_content: str) -> list:
    """Parse Instacart receipt from web page (full receipt view)."""
    items = []
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Find all order-item elements
    order_items = soup.find_all(class_='order-item')
    
    for item in order_items:
        text = item.get_text(' ', strip=True)
        
        # Parse pattern: "Name (size) Qty x $Price ..."
        match = re.match(r'^(.+?)\s+(\d+)\s*x\s*\$(\d+\.\d{2})', text)
        if match:
            raw_name = match.group(1).strip()
            quantity = int(match.group(2))
            unit_price = float(match.group(3))
            
            items.append({
                'raw_name': raw_name,
                'quantity': quantity,
                'unit_price': unit_price
            })
    
    return items


def parse_instacart_receipt(html_content: str) -> list:
    """
    Parse Instacart receipt HTML from email to extract items.
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
        raw_name = ''
        for content in name_div.children:
            if isinstance(content, str):
                raw_name = content.strip()
                if raw_name:
                    break
            elif content.name and content.name != 'small' and content.name != 'br':
                text = content.get_text(strip=True)
                if text and not text.startswith('$'):
                    raw_name = text
                    break

        if not raw_name:
            full_text = name_div.get_text(separator='|', strip=True)
            parts = full_text.split('|')
            if parts:
                raw_name = parts[0].strip()

        raw_name = re.sub(r'\([^)]*\)$', '', raw_name).strip()

        if not raw_name or len(raw_name) < 3:
            continue

        if any(keyword in raw_name.lower() for keyword in SKIP_KEYWORDS):
            continue

        quantity = 1
        muted_small = name_div.find('small', class_='muted')
        if muted_small:
            muted_text = muted_small.get_text()
            qty_match = re.search(r'(\d+)\s*x\s*\$', muted_text)
            if qty_match:
                quantity = int(qty_match.group(1))
            elif 'lb' in muted_text.lower():
                quantity = 1

        price = 0.0
        price_div = name_div.find_next('div', class_='item-price')
        if price_div:
            total_div = price_div.find('div', class_='total')
            if total_div:
                all_totals = price_div.find_all('div', class_='total')
                for t in reversed(all_totals):
                    if 'strike' not in t.get('class', []):
                        price_text = t.get_text(strip=True)
                        price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                        if price_match:
                            price = float(price_match.group(1))
                            break

        if price <= 0 or price > 200:
            continue

        items.append({
            'raw_name': raw_name,
            'quantity': quantity,
            'unit_price': price
        })

    seen = set()
    unique_items = []
    for item in items:
        if item['raw_name'] not in seen:
            seen.add(item['raw_name'])
            unique_items.append(item)

    return unique_items


def parse_costco_receipt(html_content: str) -> list:
    """Parse Costco receipt HTML to extract items."""
    SKIP_KEYWORDS = [
        'subtotal', 'total', 'tax', 'tip', 'fee', 'delivery', 'service',
        'savings', 'you saved', 'original charge', 'adjusted', 'refund',
        'checkout', 'promotions', 'credit'
    ]

    items = []
    soup = BeautifulSoup(html_content, 'html.parser')
    product_tables = soup.find_all('table', class_='full-width')

    for table in product_tables:
        product_td = table.find('td', class_='full-width')
        if not product_td:
            continue

        quantity = 1
        strong_tag = product_td.find('strong')
        if strong_tag:
            qty_text = strong_tag.get_text(strip=True)
            qty_match = re.search(r'(\d+)\s*x', qty_text)
            if qty_match:
                quantity = int(qty_match.group(1))

        span_tag = product_td.find('span')
        if not span_tag:
            continue

        raw_name = span_tag.get_text(strip=True)

        if not raw_name or len(raw_name) < 3:
            continue

        if any(keyword in raw_name.lower() for keyword in SKIP_KEYWORDS):
            continue

        price = 0.0
        all_tds = table.find_all('td')
        for td in all_tds:
            if td == product_td or 'full-width' in td.get('class', []):
                continue

            discounted = td.find('strong', class_='discounted-price')
            if discounted:
                price_text = discounted.get_text(strip=True)
                price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                if price_match:
                    price = float(price_match.group(1))
                    break

            regular_price = td.find('strong')
            if regular_price and not regular_price.get('class'):
                price_text = regular_price.get_text(strip=True)
                price_match = re.search(r'\$(\d+\.?\d*)', price_text)
                if price_match:
                    price = float(price_match.group(1))
                    break

        if price <= 0 or price > 500:
            continue

        items.append({
            'raw_name': raw_name,
            'quantity': quantity,
            'unit_price': price
        })

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

    since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
    print(f"  Searching for emails SINCE {since_date}")

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

    emails = []
    for i, email_id in enumerate(email_ids):
        status, msg_data = mail.fetch(email_id, "(RFC822)")
        if status != "OK":
            continue

        for response_part in msg_data:
            if isinstance(response_part, tuple):
                msg = email.message_from_bytes(response_part[1])
                emails.append(msg)

        if (i + 1) % 10 == 0:
            print(f"  Fetched {i + 1}/{len(email_ids)} emails...")

    return emails


def main():
    print("=" * 60)
    print("Pantry Observer - Gmail Receipt Ingestion")
    print("(with full receipt fetching for Instacart)")
    print("=" * 60)

    if not EMAIL_USER or not EMAIL_PASS:
        print("ERROR: EMAIL_USER and EMAIL_PASS must be set in .env")
        return

    print(f"Connecting as: {EMAIL_USER}")

    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_USER, EMAIL_PASS)
        print("Connected to Gmail")
    except Exception as e:
        print(f"Failed to connect to Gmail: {e}")
        return

    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()

    try:
        print("\nSearching for receipts (Instacart + Costco)...")
        emails = fetch_receipt_emails(mail, days_back=90)
        print(f"Found {len(emails)} receipt(s) to process\n")

        total_imported = 0
        emails_processed = 0

        for msg in emails:
            subject = decode_email_header(msg["Subject"])
            date_str = msg["Date"]
            email_from = msg.get("From", "")

            try:
                date_tuple = email.utils.parsedate_tz(date_str)
                if date_tuple:
                    timestamp = email.utils.mktime_tz(date_tuple)
                    purchase_date = datetime.fromtimestamp(timestamp)
                else:
                    purchase_date = datetime.now()
            except Exception:
                purchase_date = datetime.now()

            source_id = generate_source_id(subject, date_str)

            if "receipt" not in subject.lower():
                continue

            if source_id_exists(cursor, source_id):
                print(f"  SKIP: Already imported - {subject[:50]}...")
                continue

            html_body = get_email_body(msg)
            if not html_body:
                continue

            # Route to appropriate parser based on sender
            if "costco" in email_from.lower():
                items = parse_costco_receipt(html_body)
                source_label = "Costco"
            else:
                # Instacart - check if we need to fetch full receipt
                items = parse_instacart_receipt(html_body)
                source_label = "Instacart"
                
                # If email has few items, try to get full receipt via Playwright
                full_receipt_link = find_full_receipt_link(html_body)
                if full_receipt_link and len(items) <= 12:
                    print(f"    Fetching full receipt via Playwright...")
                    full_html = fetch_full_receipt_playwright(full_receipt_link)
                    if full_html:
                        web_items = parse_instacart_receipt_web(full_html)
                        if len(web_items) > len(items):
                            print(f"    Found {len(web_items)} items (vs {len(items)} in email)")
                            items = web_items
                            source_label = "Instacart (full)"

            if not items:
                print(f"  SKIP: No items found - {subject[:50]}...")
                continue

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
