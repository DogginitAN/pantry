# Phase 2: Receipt Pipeline — Task Breakdown

## Context
Phase 1 is complete: FastAPI backend + Next.js frontend with dashboard and inventory screens.
Phase 2 builds the receipt processing pipeline: upload receipt image → AI extracts items → user reviews/edits → save to database → auto-classify.

## Prerequisites
- Backend running on :8060 with existing routers (inventory, meals, classifier)
- Frontend running on :3060 with existing pages (dashboard, inventory)
- Database has receipts table (created in Phase 1 migration)
- ai_router.py has AIRouter class with Ollama provider
- logic/ocr_processor.py exists but uses EasyOCR — we are replacing with AI Vision

## Task 1: Create receipt processing service
**File:** backend/app/services/receipt_processor.py

Create a receipt processing service that:
1. Takes an image (bytes) and calls the AI router for Vision OCR
2. Add an `ocr_receipt(image_bytes)` method to AIRouter._OllamaProvider in ai_router.py that sends the image to an Ollama vision model (llama3.2-vision or similar) with a prompt to extract line items as JSON: [{name, quantity, unit_price, total_price}]
3. The receipt_processor service should: receive image bytes, call ai_router.ocr_receipt(), parse the JSON response, return structured items with confidence scores
4. Handle common OCR issues: strip store headers/footers, ignore subtotals/tax/tip lines, handle abbreviations

**Acceptance criteria:**
- receipt_processor.py exists with a `process_receipt(image_bytes: bytes, ai_provider: str = "ollama") -> dict` function
- Returns: {items: [{name, quantity, unit_price, total_price, confidence}], raw_text: str, store_name: str|None}
- ai_router.py has ocr_receipt method on _OllamaProvider
- python3 -m py_compile backend/app/services/receipt_processor.py

## Task 2: Create receipt API endpoints
**File:** backend/app/routers/receipts.py

Create receipt router with these endpoints:
1. POST /api/receipts/upload — accepts multipart file upload, saves image to /tmp/receipts/, creates receipt row with status=processing, processes via receipt_processor, updates receipt with extracted items, returns receipt_id + extracted items
2. GET /api/receipts — list all receipts (id, store_name, receipt_date, total_amount, processing_status, item_count, created_at)
3. GET /api/receipts/{id} — single receipt with its extracted items
4. POST /api/receipts/{id}/confirm — user confirms/edits items, saves to purchases table, auto-classifies new products, updates receipt status to saved
5. DELETE /api/receipts/{id} — delete receipt and associated data

Register the router in main.py.

**Acceptance criteria:**
- All 5 endpoints exist and are registered
- Upload endpoint handles multipart form data (UploadFile)
- Confirm endpoint creates purchase records and triggers classification
- python3 -c "from app.main import app; print(OK)"

## Task 3: Create receipt upload UI component
**File:** frontend/app/receipts/page.tsx

Build the receipt scan/upload screen:
1. Large upload zone (drag-and-drop + click to browse + camera capture button for mobile)
2. Camera capture uses <input type="file" accept="image/*" capture="environment"> for mobile
3. After upload: show "Processing..." state with a spinner
4. When items return: show editable table with columns: name, quantity, unit price, total price, confidence
5. Low-confidence rows (< 0.7) highlighted in amber
6. Each row is editable (inline text inputs)
7. "Confirm & Save" button at bottom
8. After save: success message with link to receipt detail

Use the dark zinc theme consistent with dashboard and inventory pages. Import from lib/api.ts.

**Acceptance criteria:**
- /receipts route exists and renders
- File upload triggers POST to /api/receipts/upload
- Shows extracted items in editable table
- Confirm button calls POST /api/receipts/{id}/confirm
- Mobile-friendly (camera capture input)

## Task 4: Add receipt API functions to frontend client
**File:** frontend/lib/api.ts

Add these functions to the API client:
1. uploadReceipt(file: File) — POST multipart to /api/receipts/upload
2. getReceipts() — GET /api/receipts
3. getReceipt(id: number) — GET /api/receipts/{id}
4. confirmReceipt(id: number, items: ReceiptItem[]) — POST /api/receipts/{id}/confirm
5. deleteReceipt(id: number) — DELETE /api/receipts/{id}

Note: uploadReceipt must use FormData, not JSON. Do NOT set Content-Type header (let browser set multipart boundary).

**Acceptance criteria:**
- All 5 functions exported from lib/api.ts
- uploadReceipt uses FormData correctly
- TypeScript compiles: cd frontend && npx next build

## Task 5: Create receipt history page
**File:** frontend/app/receipts/history/page.tsx

Build a receipt history list:
1. Table/card list of all receipts: date, store name, total amount, item count, status badge
2. Click receipt → navigate to /receipts/{id} detail view
3. Status badges: processing (blue pulse), ready (amber), saved (green), failed (red)
4. Empty state for no receipts yet

**Acceptance criteria:**
- /receipts/history route exists
- Fetches from GET /api/receipts
- Shows receipt list with status badges
- Links to individual receipt detail

## Task 6: Create receipt detail page
**File:** frontend/app/receipts/[id]/page.tsx

Build the receipt detail view:
1. Shows receipt metadata (store, date, total, status)
2. Item table showing what was extracted
3. If status is "ready" (not yet confirmed): show editable items table with "Confirm & Save" button (reuse pattern from upload page)
4. If status is "saved": show read-only items table with green checkmarks
5. Delete receipt button with confirmation dialog

**Acceptance criteria:**
- /receipts/[id] route exists with dynamic parameter
- Fetches from GET /api/receipts/{id}
- Shows appropriate view based on receipt status
- Delete button works

## Task 7: Add receipts to sidebar navigation and dashboard
**Files:** frontend/components/Sidebar.tsx, frontend/app/dashboard/page.tsx

1. Add "Receipts" nav item to Sidebar between "Inventory" and "Shopping List"
2. Update dashboard "Scan Receipt" quick action to link to /receipts (it may already)
3. Add "Recent Receipts" section to dashboard below the alerts, showing last 3 receipts as compact cards

**Acceptance criteria:**
- Sidebar shows Receipts link
- Dashboard has recent receipts section
- All links navigate correctly

## Task 8: Create receipt image storage directory and cleanup
**Files:** backend/app/routers/receipts.py (update), backend/app/config.py (update)

1. Add RECEIPT_STORAGE_DIR to config.py (default: /home/dogginitan/development/project_pantry/data/receipts/)
2. Create the directory if it does not exist on startup
3. Save uploaded images with receipt_id as filename (e.g., receipt_42.jpg)
4. Store relative path in receipts.image_path column
5. Add GET /api/receipts/{id}/image endpoint that serves the stored image

**Acceptance criteria:**
- Images are saved to disk, not just /tmp
- Image path stored in database
- Image retrieval endpoint works
- Directory created automatically
