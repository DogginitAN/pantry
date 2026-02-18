# Project Pantry

## Overview
AI-powered grocery intelligence app. Scan receipts, track inventory, predict what's running low, suggest meals from what you have, generate smart shopping lists based on actual consumption patterns.

Migrating from a working Streamlit prototype (dashboard/app.py) to a FastAPI + Next.js production app.

## Tech Stack
- **Existing:** Python 3.11+, PostgreSQL (pantry_db on localhost:5432), Ollama (localhost:11434), LiteLLM proxy (localhost:4000)
- **Backend (new):** FastAPI on port 8060
- **Frontend (new):** Next.js 14 + Tailwind CSS on port 3060, dark theme
- **Database:** Existing `products` and `purchases` tables, plus new tables per PRD (receipts, shopping_lists, shopping_list_items, meal_suggestions, settings)

## Directory Structure
```
/home/dogginitan/development/project_pantry/
├── dashboard/app.py          # Streamlit prototype (839 lines, reference only)
├── logic/
│   ├── classifier.py         # LLM product categorization (qwen2.5:3b via Ollama)
│   ├── meal_planner.py       # Meal suggestions from inventory (LiteLLM gpt-oss:120b)
│   └── ocr_processor.py      # Receipt OCR (EasyOCR + regex parsing)
├── ingest/
│   ├── ingest_gmail.py       # Gmail IMAP receipt scraper (Instacart/Costco)
│   ├── ingest_manual.py      # Manual photo upload processor
│   └── ingest_mock.py        # Test data generator
├── agents/                   # Playwright automation (Instacart) — not in MVP
├── config.py                 # Centralized config (DB, email, LLM from .env)
├── backend/                  # NEW — FastAPI app (to be created)
├── frontend/                 # NEW — Next.js app (to be created)
├── requirements.txt          # Python dependencies
├── .env                      # Credentials (DB, email, LLM keys)
└── PRD.md                    # Full product requirements
```

## Database
- **Host:** localhost:5432, database `pantry_db`, user `dbuser`
- **Existing tables:** `products` (279 rows), `purchases` (363 rows)
- **New tables (from PRD):** receipts, shopping_lists, shopping_list_items, meal_suggestions, settings
- **Column additions:** products gets consumption_profile, unit_type, unit_quantity, current_stock_estimate, predicted_out_date, times_wasted, times_consumed; purchases gets receipt_id, ocr_confidence, raw_ocr_line

## Key Existing Logic (Reuse These)
- **Velocity engine** (dashboard/app.py lines 131-164): calculates avg_interval_days from purchase history, applies CATEGORY_THRESHOLDS multipliers, determines reorder status
- **Classifier** (logic/classifier.py): sends product names to qwen2.5:3b via Ollama, returns canonical_name + category
- **Meal planner** (logic/meal_planner.py): filters inventory by generous shelf-life thresholds, calls LiteLLM for meal suggestions
- **OCR** (logic/ocr_processor.py): EasyOCR text extraction + regex price parsing

## How to Run
```bash
# Backend (once created)
cd /home/dogginitan/development/project_pantry/backend
uvicorn app.main:app --host 0.0.0.0 --port 8060 --reload

# Frontend (once created)
cd /home/dogginitan/development/project_pantry/frontend
npx next dev -p 3060 -H 0.0.0.0

# Existing Streamlit (reference)
cd /home/dogginitan/development/project_pantry
streamlit run dashboard/app.py --server.port 8501
```

## How to Verify Changes
```bash
# Python syntax check
python3 -m py_compile <file.py>

# Backend runs without import errors
cd /home/dogginitan/development/project_pantry/backend && python3 -c "from app.main import app; print('OK')"

# Frontend compiles
cd /home/dogginitan/development/project_pantry/frontend && npx next build 2>&1 | tail -5

# Database connection
python3 -c "import psycopg2; c=psycopg2.connect('dbname=pantry_db user=dbuser password=secure_password_2024 host=localhost'); print('DB OK'); c.close()"
```

## Conventions
- Backend follows FastAPI best practices: routers, Pydantic models, dependency injection
- Frontend uses Next.js App Router, "use client" for interactive components, Tailwind for styling
- Dark theme throughout (zinc-900/950 backgrounds, consistent with Mission Control)
- Reuse existing logic modules by importing them — don't rewrite what works
- Environment variables via python-dotenv and config.py

## Response Format
End every response with either:
SUCCESS: <brief summary>
or
BLOCKED: <reason>
