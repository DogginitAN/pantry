#!/usr/bin/env python3
"""
Receipt OCR Processor using BakLLaVA (local vision LLM)
Extracts structured grocery data from receipt images AND web screenshots.
"""

import requests
import base64
import json
from typing import Optional


class ReceiptOCR:
    """Process receipt images using local BakLLaVA model via Ollama."""
    
    def __init__(self, ollama_host: str = "http://localhost:11434"):
        self.ollama_host = ollama_host
        self.model = "bakllava"
    
    def _encode_image(self, image_path: str) -> str:
        """Convert image file to base64."""
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    
    def _encode_image_bytes(self, image_bytes: bytes) -> str:
        """Convert image bytes to base64."""
        return base64.b64encode(image_bytes).decode("utf-8")
    
    def extract_text(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> str:
        """
        Extract raw text from a receipt image.
        
        Args:
            image_path: Path to image file
            image_bytes: Raw image bytes (for uploaded files)
            
        Returns:
            Extracted text from the receipt
        """
        if image_path:
            image_b64 = self._encode_image(image_path)
        elif image_bytes:
            image_b64 = self._encode_image_bytes(image_bytes)
        else:
            raise ValueError("Must provide either image_path or image_bytes")
        
        prompt = """You are an expert at reading grocery orders. This image could be:
1. A paper receipt (printed text, possibly damaged or wet)
2. A screenshot of an online order (web UI, app, or email confirmation)

Extract ALL grocery items from this image. For EACH item, identify:
- Product name
- Quantity (look for "Quantity:", "Qty:", "x", or number before item)
- Price (usually on the right side, with $ symbol)

Output each item on its own line in this format:
ITEM: [product name] | QTY: [number] | PRICE: [dollar amount]

Example outputs:
ITEM: Eggs, Large, Non-GMO, Pasture Raised | QTY: 2 | PRICE: $9.98
ITEM: Organic Bananas | QTY: 1 | PRICE: $2.49

Be thorough - extract EVERY product. Skip headers, tabs, delivery info, subtotals, taxes, and fees."""
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False
        }
        
        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json=payload,
            timeout=120
        )
        response.raise_for_status()
        
        return response.json().get("response", "")
    
    def parse_items(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> list:
        """
        Extract structured item data from a receipt image.
        
        Returns:
            List of dicts with keys: name, quantity, price, original_line
        """
        if image_path:
            image_b64 = self._encode_image(image_path)
        elif image_bytes:
            image_b64 = self._encode_image_bytes(image_bytes)
        else:
            raise ValueError("Must provide either image_path or image_bytes")
        
        prompt = """You are an expert at extracting grocery items from images. This could be:
- A paper receipt (printed, possibly damaged or wet)
- A screenshot of a web order (like Instacart, farm co-op, grocery delivery app)
- An email order confirmation

TASK: Find every grocery item and output as JSON.

Look for these patterns in the image:
- Web/app screenshots: Item name with small product image, quantity shown as "Quantity: 2" below it, price on the right
- Paper receipts: Item name followed by price, quantity might show as "2 x $4.99"
- Unit info in brackets like [dozen], [lb], [oz], [each], [3 count] - just extract the main quantity number

For EACH product found, output one JSON object per line:
{"name": "Eggs, Large, Non-GMO, Pasture Raised", "quantity": 2, "unit_price": 4.99, "total_price": 9.98}
{"name": "Apple, Pink Lady", "quantity": 1, "unit_price": 3.49, "total_price": 3.49}
{"name": "Cheddar Cheese Spread - Local", "quantity": 1, "unit_price": 6.99, "total_price": 6.99}

Rules:
- Output ONLY valid JSON objects, one item per line
- "quantity" must be a number (extract from "Quantity: 2" or "2 x" patterns)
- "unit_price" = total_price / quantity (calculate it)
- "total_price" is the price shown for that line item
- SKIP: navigation tabs, headers, delivery dates/times, subtotals, taxes, tips, fees
- INCLUDE: ALL actual food and grocery products visible in the image

Extract all items now:"""
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [image_b64],
            "stream": False
        }
        
        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json=payload,
            timeout=120
        )
        response.raise_for_status()
        
        raw_response = response.json().get("response", "")
        
        # Parse JSON objects from response
        items = []
        for line in raw_response.strip().split("\n"):
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                item = json.loads(line)
                # Validate required fields
                if "name" in item:
                    items.append({
                        "name": str(item.get("name", "")),
                        "quantity": int(item.get("quantity", 1)),
                        "unit_price": float(item.get("unit_price", 0)),
                        "total_price": float(item.get("total_price", item.get("unit_price", 0))),
                        "original_line": line
                    })
            except (json.JSONDecodeError, ValueError):
                continue
        
        return items
    
    def health_check(self) -> dict:
        """Check if BakLLaVA model is available and responding."""
        try:
            response = requests.get(f"{self.ollama_host}/api/tags", timeout=5)
            response.raise_for_status()
            models = response.json().get("models", [])
            bakllava_found = any(m.get("name", "").startswith("bakllava") for m in models)
            return {
                "status": "healthy" if bakllava_found else "model_missing",
                "bakllava_available": bakllava_found,
                "ollama_running": True,
                "models": [m.get("name") for m in models]
            }
        except requests.exceptions.RequestException as e:
            return {
                "status": "unhealthy",
                "bakllava_available": False,
                "ollama_running": False,
                "error": str(e)
            }


# CLI testing
if __name__ == "__main__":
    import sys
    
    ocr = ReceiptOCR()
    
    # Health check
    health = ocr.health_check()
    print(f"Health: {health}")
    
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print(f"\nProcessing: {image_path}")
        
        print("\n--- Raw Text ---")
        text = ocr.extract_text(image_path=image_path)
        print(text)
        
        print("\n--- Parsed Items ---")
        items = ocr.parse_items(image_path=image_path)
        for item in items:
            print(f"  {item['quantity']}x {item['name']} @ ${item['unit_price']:.2f} = ${item['total_price']:.2f}")
