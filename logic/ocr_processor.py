#!/usr/bin/env python3
"""
Receipt OCR Processor using BakLLaVA (local vision LLM)
Extracts structured grocery data from receipt images.
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
        
        prompt = """You are an expert receipt reader. Extract ALL text from this grocery receipt image.
Include:
- Store name
- Date
- Every item name exactly as printed
- Quantities (look for 'x' or 'qty')
- Prices (individual and totals)
- Any discounts or savings

Output the text line by line as it appears on the receipt. Be thorough - don't miss any items."""
        
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
        
        prompt = """Analyze this grocery receipt image and extract each purchased item.

For EACH item, output a JSON object on its own line with these fields:
- "name": product name exactly as shown
- "quantity": number of units (default 1 if not shown)
- "unit_price": price per unit in dollars (number only, no $)
- "total_price": total price for this line item

Output ONLY valid JSON objects, one per line. Example:
{"name": "Organic Bananas", "quantity": 2, "unit_price": 1.49, "total_price": 2.98}
{"name": "Whole Milk 1 Gallon", "quantity": 1, "unit_price": 4.99, "total_price": 4.99}

Skip subtotals, taxes, tips, fees, and delivery charges - only include actual products.
Be thorough and extract EVERY product line item."""
        
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
