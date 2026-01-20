#!/usr/bin/env python3
"""
Receipt OCR Processor using EasyOCR (traditional OCR) + regex parsing.
No AI hallucinations - just reads what is actually in the image.
"""

import re
import io
import numpy as np
import easyocr
from PIL import Image
from typing import Optional, List, Dict


class ReceiptOCR:
    """Process receipt images using EasyOCR + regex parsing."""
    
    def __init__(self):
        self._reader = None
    
    @property
    def reader(self):
        """Lazy load EasyOCR reader."""
        if self._reader is None:
            self._reader = easyocr.Reader(["en"], gpu=False)
        return self._reader
    
    def _load_image(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> np.ndarray:
        """Load image and convert to numpy array for EasyOCR."""
        if image_path:
            image = Image.open(image_path)
        elif image_bytes:
            image = Image.open(io.BytesIO(image_bytes))
        else:
            raise ValueError("Must provide either image_path or image_bytes")
        
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        return np.array(image)
    
    def extract_text(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> str:
        """Extract raw text from image using EasyOCR."""
        img_array = self._load_image(image_path, image_bytes)
        results = self.reader.readtext(img_array)
        results_sorted = sorted(results, key=lambda x: (x[0][0][1], x[0][0][0]))
        lines = [r[1] for r in results_sorted]
        return "\n".join(lines)
    
    def extract_with_debug(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> str:
        """Extract text with position info for debugging."""
        img_array = self._load_image(image_path, image_bytes)
        results = self.reader.readtext(img_array)
        results_sorted = sorted(results, key=lambda x: (x[0][0][1], x[0][0][0]))
        
        debug_lines = [f"Image: {img_array.shape[1]}w x {img_array.shape[0]}h", ""]
        for bbox, text, conf in results_sorted:
            y, x = int(bbox[0][1]), int(bbox[0][0])
            debug_lines.append(f"Y={y:4d} X={x:4d}: '{text}' ({conf:.2f})")
        
        return "\n".join(debug_lines)

    def parse_items(self, image_path: Optional[str] = None, image_bytes: Optional[bytes] = None) -> List[Dict]:
        """Extract structured item data from a receipt image."""
        img_array = self._load_image(image_path, image_bytes)
        results = self.reader.readtext(img_array)
        
        if not results:
            return []
        
        img_width = img_array.shape[1]
        price_x_threshold = img_width * 0.85  # Prices are in rightmost 15%
        
        items = []
        skip_keywords = ["order", "current", "all orders", "buy again", "delivery", 
                        "estimated", "subtotal", "total", "tax", "tip", "fee", 
                        "build", "items in", "receipt", "item name", "unit price",
                        "locked", "january", "february", "march", "april", "may",
                        "june", "july", "august", "september", "october", "november", "december"]
        
        # Sort all results by Y position
        results_sorted = sorted(results, key=lambda x: x[0][0][1])
        
        # Process results - find product lines (have a price on the right)
        i = 0
        while i < len(results_sorted):
            bbox, text, conf = results_sorted[i]
            y_pos = bbox[0][1]
            x_pos = bbox[0][0]
            
            # Skip if this is a navigation/header element
            if any(kw in text.lower() for kw in skip_keywords):
                i += 1
                continue
            
            # Skip "Quantity:" lines - we'll read them when processing product lines
            if text.lower().startswith("quantity"):
                i += 1
                continue
            
            # Skip unit descriptors in brackets
            if text.startswith("[") or text.startswith("("):
                i += 1
                continue
            
            # Collect all elements on the same Y level (within 15 pixels)
            row_elements = []
            j = i
            while j < len(results_sorted):
                other_bbox, other_text, other_conf = results_sorted[j]
                other_y = other_bbox[0][1]
                if abs(other_y - y_pos) < 15:
                    row_elements.append((other_bbox, other_text, other_conf))
                    j += 1
                elif other_y > y_pos + 15:
                    break
                else:
                    j += 1
            
            # Check if this row has a price (rightmost element looks like a price)
            price = None
            name_parts = []
            
            for el_bbox, el_text, el_conf in row_elements:
                el_x = el_bbox[0][0]
                
                # Is this in the price column (rightmost)?
                if el_x > price_x_threshold:
                    price = self._extract_price(el_text)
                else:
                    # Skip quantity/unit markers
                    if not el_text.lower().startswith("quantity") and not el_text.startswith("["):
                        name_parts.append(el_text)
            
            # If we found a price, this is a product row
            if price is not None and name_parts:
                name = " ".join(name_parts)
                name = re.sub(r'\s*;\s*', ', ', name)  # Semicolons to commas
                name = re.sub(r'\s+', ' ', name).strip()
                
                # Look for quantity in the next few lines
                quantity = 1
                for k in range(j, min(j + 3, len(results_sorted))):
                    _, next_text, _ = results_sorted[k]
                    qty_match = re.search(r'quantity[:\s]*(\d+)', next_text, re.IGNORECASE)
                    if qty_match:
                        quantity = int(qty_match.group(1))
                        break
                    # Also check for standalone quantity number
                    if re.match(r'^[1-9]$', next_text.strip()):
                        quantity = int(next_text.strip())
                        break
                
                unit_price = round(price / quantity, 2) if quantity > 0 else price
                
                items.append({
                    "name": name,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "total_price": price,
                })
            
            i = j if j > i else i + 1
        
        return items

    def _extract_price(self, text: str) -> Optional[float]:
        """Extract price from text, handling OCR errors like $ read as 5 or 8."""
        text = text.strip()
        
        # Try standard price format first: $X.XX
        match = re.match(r'^\$(\d{1,2}\.\d{2})$', text)
        if match:
            return float(match.group(1))
        
        # Handle S instead of $ (OCR error)
        match = re.match(r'^S(\d{1,2}\.\d{2})$', text)
        if match:
            return float(match.group(1))
        
        # Handle corrupted $ sign read as leading digit
        # Pattern: XX.XX where first digit might be corrupted $
        match = re.match(r'^(\d)(\d{1,2}\.\d{2})$', text)
        if match:
            first_digit = match.group(1)
            rest = match.group(2)
            full_price = float(text)
            clean_price = float(rest)
            
            # If the full price seems unreasonably high (> $20 for groceries)
            # and the clean price is reasonable, use the clean price
            # Common corruptions: $ -> 5, $ -> 8
            if full_price > 20 and clean_price < 20:
                return clean_price
            
            # If both are reasonable, prefer the full price
            return full_price
        
        # Try just X.XX format (no $ sign at all)
        match = re.match(r'^(\d{1,2}\.\d{2})$', text)
        if match:
            return float(match.group(1))
        
        return None
    
    def _group_into_rows(self, results, y_threshold=12) -> List[List]:
        """Group OCR results into rows based on Y position."""
        if not results:
            return []
        
        sorted_results = sorted(results, key=lambda x: x[0][0][1])
        rows = []
        current_row = [sorted_results[0]]
        current_y = sorted_results[0][0][0][1]
        
        for result in sorted_results[1:]:
            y = result[0][0][1]
            if abs(y - current_y) < y_threshold:
                current_row.append(result)
            else:
                current_row.sort(key=lambda x: x[0][0][0])
                rows.append(current_row)
                current_row = [result]
                current_y = y
        
        current_row.sort(key=lambda x: x[0][0][0])
        rows.append(current_row)
        return rows
    
    def health_check(self) -> dict:
        """Check if EasyOCR is available."""
        try:
            _ = self.reader
            return {"status": "healthy", "ocr_available": True, "engine": "EasyOCR"}
        except Exception as e:
            return {"status": "unhealthy", "ocr_available": False, "error": str(e)}
