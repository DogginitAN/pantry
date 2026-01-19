#!/usr/bin/env python3
"""
Receipt OCR Module - Extract items from receipt images
Supports both local Tesseract and GPT-4 Vision
"""

import os
import base64
from PIL import Image
import openai
import json
import re

# LLM client for GPT-4 Vision
vision_client = openai.OpenAI(
    api_key=os.getenv("OPENAI_API_KEY", "your-key-here")
)


def extract_with_gpt4_vision(image_path: str, store_name: str = "Unknown") -> list:
    """
    Use GPT-4 Vision to extract receipt items.
    
    Returns list of dicts: [{"raw_name": str, "quantity": int, "unit_price": float}]
    """
    # Read and encode image
    with open(image_path, 'rb') as f:
        image_data = base64.b64encode(f.read()).decode('utf-8')
    
    prompt = f"""Extract ALL grocery items from this {store_name} receipt.

For each item, provide:
- raw_name (exact product name as printed)
- quantity (number of items, default 1 if not shown)
- unit_price (price per item in dollars)

Skip: subtotals, tax, fees, tips, delivery charges.

Return ONLY a JSON array with this exact structure:
[
  {{"raw_name": "Organic Bananas", "quantity": 2, "unit_price": 1.99}},
  {{"raw_name": "Whole Milk", "quantity": 1, "unit_price": 4.29}}
]

No markdown, no explanation, just the JSON array."""
    
    try:
        response = vision_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_data}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens=2000,
            temperature=0.1
        )
        
        content = response.choices[0].message.content
        
        # Strip markdown if present
        content = re.sub(r'```json\s*', '', content)
        content = re.sub(r'```\s*$', '', content)
        content = content.strip()
        
        items = json.loads(content)
        
        print(f"✅ Extracted {len(items)} items from receipt")
        return items
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON: {e}")
        print(f"Raw response: {content}")
        return []
    except Exception as e:
        print(f"❌ OCR failed: {e}")
        return []


def extract_with_tesseract(image_path: str) -> str:
    """
    Fallback: Use Tesseract OCR to extract raw text.
    Requires: apt-get install tesseract-ocr
    """
    try:
        import pytesseract
        image = Image.open(image_path)
        text = pytesseract.image_to_string(image)
        return text
    except ImportError:
        print("⚠️  Tesseract not installed. Install with: apt-get install tesseract-ocr")
        return ""
    except Exception as e:
        print(f"❌ Tesseract failed: {e}")
        return ""


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python receipt_ocr.py <image_path> [store_name]")
        sys.exit(1)
    
    image_path = sys.argv[1]
    store_name = sys.argv[2] if len(sys.argv) > 2 else "Unknown"
    
    print(f"Processing receipt: {image_path}")
    items = extract_with_gpt4_vision(image_path, store_name)
    
    print("\n=== EXTRACTED ITEMS ===")
    for item in items:
        print(f"  {item['raw_name']} x{item['quantity']} @ ${item['unit_price']}")
