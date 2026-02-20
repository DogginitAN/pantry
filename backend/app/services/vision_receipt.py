"""
Vision-based receipt parser.

Sends receipt images to llama3.2-vision:11b via Ollama's /api/chat endpoint.
Large images are resized to ≤1MP before encoding to avoid timeouts.
"""
import base64
import io
import json
import os
import re
from typing import Optional

import requests
from PIL import Image

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL = "llama3.2-vision:11b"

# Resize threshold: images above this pixel count get scaled down.
# ~1MP keeps the receipt readable while fitting in ~100-200KB JPEG.
_MAX_PIXELS = 1_000_000
_JPEG_QUALITY = 85

_SYSTEM_PROMPT = (
    "You are a grocery receipt parser. Extract data from receipt images and return "
    "ONLY valid JSON — no explanation, no markdown, no extra text. "
    "Use null for any field you cannot read clearly."
)

_USER_PROMPT = """Extract the following from this grocery receipt image and return as JSON:

{
  "store_name": "Store name string or null",
  "date": "Date in YYYY-MM-DD format or null",
  "total": total amount as a number or null,
  "items": [
    {"name": "item name", "quantity": 1, "unit_price": 0.00, "total_price": 0.00}
  ]
}

Rules:
- Only include purchased line items in "items" — exclude subtotal, tax, fees, discounts, and totals
- quantity should be a number (default 1 if not shown)
- All prices must be numbers, not strings
- Return ONLY the JSON object, nothing else"""


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
        "stream": False,
        "options": {"temperature": 0.1},
    }

    resp = requests.post(
        f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat",
        json=payload,
        timeout=180,
    )
    resp.raise_for_status()

    content = resp.json()["message"]["content"]
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


def _parse_response(content: str) -> dict:
    """Parse model response into structured receipt data with graceful fallback."""
    empty = {"store_name": None, "date": None, "total": None, "items": []}

    raw_json = _extract_json(content)
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, ValueError):
        return empty

    if not isinstance(data, dict):
        return empty

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

    return {
        "store_name": str(data["store_name"]).strip() or None
        if data.get("store_name") else None,
        "date": str(data["date"]).strip() or None
        if data.get("date") else None,
        "total": _coerce_float(data.get("total")),
        "items": items,
    }
