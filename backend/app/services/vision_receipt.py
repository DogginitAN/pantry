"""
Vision-based receipt parser.

Sends receipt images to llama3.2-vision:11b via Ollama's /api/chat endpoint.
Large images are resized to ≤1MP before encoding to avoid timeouts.
"""
import base64
import io
import json
import logging
import os
import re
from typing import Optional

import requests
from PIL import Image

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL = "llama3.2-vision:11b"

# Resize threshold: images above this pixel count get scaled down.
# ~1MP keeps the receipt readable while fitting in ~100-200KB JPEG.
_MAX_PIXELS = 1_000_000
_JPEG_QUALITY = 85

_SYSTEM_PROMPT = (
    "You are a grocery receipt parser. Extract data from receipt images and return "
    "ONLY valid JSON. No explanation, no markdown, no extra text."
)

_USER_PROMPT = """Extract store name, date, total, and line items from this receipt image.
Return ONLY a JSON object in this exact format:

{"store_name":"Trader Joes","date":"2026-01-15","total":42.67,"items":[{"name":"Organic Bananas","quantity":1,"unit_price":0.79,"total_price":0.79},{"name":"Sourdough Bread","quantity":2,"unit_price":4.49,"total_price":8.98}]}

Rules:
- Use null for any field you cannot read
- "date" must be YYYY-MM-DD format
- "items" must only contain purchased products — no subtotals, tax, fees, or discounts
- quantity defaults to 1 if not shown
- All prices must be numbers, not strings"""


def _preprocess_image(image_path: str) -> bytes:
    """
    Load image, resize if larger than _MAX_PIXELS, and return JPEG bytes.
    Resizing a 2MB phone photo to ~800x1000 cuts the b64 payload 10-20x,
    which is the difference between a timeout and a 30-second response.
    """
    with Image.open(image_path) as img:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        if w * h > _MAX_PIXELS:
            ratio = (_MAX_PIXELS / (w * h)) ** 0.5
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=_JPEG_QUALITY)
        return buf.getvalue()


def parse_receipt(image_path: str) -> dict:
    """
    Send a receipt image to llama3.2-vision and return structured data.

    Returns:
        {
            "store_name": str | None,
            "date": str | None,       # YYYY-MM-DD
            "total": float | None,
            "items": [
                {"name": str, "quantity": float, "unit_price": float, "total_price": float}
            ]
        }
    Raises:
        RuntimeError on network/model failure (caller should handle gracefully).
    """
    image_bytes = _preprocess_image(image_path)
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _USER_PROMPT,
                "images": [image_b64],
            },
        ],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1},
    }

    resp = requests.post(
        f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat",
        json=payload,
        timeout=300,
    )
    logger.info("Ollama response status=%d, content-length=%s", resp.status_code, resp.headers.get("content-length", "?"))
    resp.raise_for_status()

    content = resp.json()["message"]["content"]
    logger.info("Ollama raw response (first 1000 chars): %s", content[:1000])
    return _parse_response(content)


def _extract_json(text: str) -> str:
    """
    Pull the first JSON object out of model output.

    Handles:
    - Markdown code fences (```json ... ```)
    - Bare JSON with surrounding text
    - Truncated JSON (tries to close open arrays/objects)
    """
    # Strip markdown fences first
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    candidate = m.group(1).strip() if m else text.strip()

    # Find the outermost { ... } span
    start = candidate.find("{")
    if start == -1:
        return candidate

    # Walk to find matching close brace, tracking nesting
    depth = 0
    end = -1
    in_string = False
    escape_next = False
    for i, ch in enumerate(candidate[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break

    if end != -1:
        return candidate[start : end + 1]

    # Truncated — try to close open braces/brackets so json.loads has a chance
    fragment = candidate[start:]
    open_braces = fragment.count("{") - fragment.count("}")
    open_brackets = fragment.count("[") - fragment.count("]")
    # Close any open string first (if we're mid-string, JSON will still fail,
    # but closing brackets rescues truncated-but-otherwise-valid output)
    suffix = "]" * max(open_brackets, 0) + "}" * max(open_braces, 0)
    return fragment + suffix


def _coerce_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _parse_markdown(content: str) -> Optional[dict]:
    """
    Fallback parser for when the model returns markdown instead of JSON.

    Handles formats like:
        **Store Name:** Off the Muck Market
        **Date:** 2026-02-18
        **Total:** $25.89
        **Items:**
        *   **Build Your Own:** 1, $3.00
        *   **Eggs:** 2, $4.49
    """
    store = None
    date = None
    total = None
    items = []

    # Header fields — match "**Label:** value" or "Label: value"
    m = re.search(r"\*{0,2}Store\s*Name\*{0,2}:\s*(.+)", content, re.IGNORECASE)
    if m:
        store = m.group(1).strip().strip("*").strip() or None

    m = re.search(r"\*{0,2}Date\*{0,2}:\s*(.+)", content, re.IGNORECASE)
    if m:
        raw_date = m.group(1).strip().strip("*").strip()
        # Try to normalize "February 18, 2026" → "2026-02-18"
        if raw_date:
            try:
                from datetime import datetime as _dt
                for fmt in ("%B %d, %Y", "%b %d, %Y", "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
                    try:
                        date = _dt.strptime(raw_date, fmt).strftime("%Y-%m-%d")
                        break
                    except ValueError:
                        continue
                else:
                    date = raw_date  # pass through raw — router's _parse_date will try again
            except Exception:
                date = raw_date

    m = re.search(r"\*{0,2}Total\*{0,2}:\s*\$?([\d,.]+)", content, re.IGNORECASE)
    if m:
        total = _coerce_float(m.group(1).replace(",", ""))

    # Items — match bullet lines in various formats the model returns:
    #   * **Build Your Own:** 1, $3.00       (bold name, qty, comma, price)
    #   * Eggs: Large (dozen) - $3.00        (plain name, dash, price)
    #   - Fresh Fruit: Apple (2 lb) - $8.98  (dash bullet variant)
    #   * **Eggs:** $4.49                    (bold name, price only)
    #
    # Strategy: find all bullet lines, then extract price from the end.
    bullet_pattern = re.compile(
        r"^[ \t]*[*\-]\s+(.+)",   # bullet + content
        re.MULTILINE,
    )
    # Price at end of line: "- $3.00" or ", $3.00" or ": $3.00" or just "$3.00"
    price_at_end = re.compile(r"[-–,:\s]+\$?([\d,.]+)\s*$")

    for bm in bullet_pattern.finditer(content):
        line = bm.group(1).strip()
        # Skip lines that are section headers (e.g. "**Items:**")
        if re.match(r"^\*{0,2}(Items|Total|Date|Store)\*{0,2}\s*:?\s*$", line, re.IGNORECASE):
            continue

        pm = price_at_end.search(line)
        if not pm:
            continue
        price = _coerce_float(pm.group(1).replace(",", "")) or 0.0

        # Everything before the price match is the name (possibly with qty)
        name_part = line[:pm.start()].strip()
        # Strip bold markers
        name_part = re.sub(r"\*{1,2}", "", name_part).strip()
        # Try to extract "qty, " prefix: "2, $4.49" → qty=2
        qty = 1.0
        qty_match = re.match(r"^(.+?):\s*(\d+)\s*$", name_part)
        if qty_match:
            name_part = qty_match.group(1).strip()
            qty = _coerce_float(qty_match.group(2)) or 1.0

        # Clean trailing colons/dashes from name
        name_part = name_part.rstrip(":- ").strip()
        if not name_part:
            continue

        items.append({
            "name": name_part,
            "quantity": qty,
            "unit_price": price,
            "total_price": round(price * qty, 2),
        })

    # Only return if we extracted something useful
    if not store and not items:
        return None

    logger.info("Parsed via markdown fallback: store=%s, items=%d", store, len(items))
    return {
        "store_name": store,
        "date": date,
        "total": total,
        "items": items,
    }


def _parse_response(content: str) -> dict:
    """
    Parse model response into structured receipt data.

    Strategy: try JSON first → markdown fallback → raise RuntimeError.
    """
    # ── Try JSON first ──────────────────────────────────────────────────
    raw_json = _extract_json(content)
    has_json_block = "{" in raw_json
    if has_json_block:
        try:
            data = json.loads(raw_json)
            if isinstance(data, dict):
                items = []
                for raw in data.get("items") or []:
                    if not isinstance(raw, dict):
                        continue
                    name = str(raw.get("name") or "").strip()
                    if not name:
                        continue
                    qty = _coerce_float(raw.get("quantity")) or 1.0
                    unit_price = _coerce_float(raw.get("unit_price")) or 0.0
                    total_price = _coerce_float(raw.get("total_price")) or round(unit_price * qty, 2)
                    items.append({
                        "name": name,
                        "quantity": qty,
                        "unit_price": unit_price,
                        "total_price": total_price,
                    })

                result = {
                    "store_name": str(data["store_name"]).strip() or None
                    if data.get("store_name") else None,
                    "date": str(data["date"]).strip() or None
                    if data.get("date") else None,
                    "total": _coerce_float(data.get("total")),
                    "items": items,
                }
                # Only accept if we got something useful
                if result["store_name"] or result["items"]:
                    return result
                logger.warning("JSON parsed but empty result, trying markdown fallback")
        except (json.JSONDecodeError, ValueError):
            logger.warning("JSON parse failed, trying markdown fallback. Raw: %s", content[:500])

    # ── Try markdown fallback ───────────────────────────────────────────
    md_result = _parse_markdown(content)
    if md_result is not None:
        return md_result

    # ── Both failed — raise so caller can mark receipt as failed ────────
    logger.error("All parsers failed. Raw response (first 1000 chars): %s", content[:1000])
    raise RuntimeError("Vision model returned unparseable response")
