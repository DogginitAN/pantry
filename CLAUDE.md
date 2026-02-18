# Project Pantry

## Overview
AI-powered grocery intelligence app. Scan receipts, track inventory, predict what you are running low on, suggest meals from what you have, generate smart shopping lists based on actual consumption patterns.

**Phase 1 COMPLETE** — FastAPI backend + Next.js frontend scaffolded and working.
**Phase 2 IN PROGRESS** — Receipt processing pipeline (camera/upload → OCR → classify → save).

## Tech Stack
- **Backend:** FastAPI on port 8060
- **Frontend:** Next.js 14 + Tailwind CSS on port 3060, dark zinc theme
- **Database:** PostgreSQL (pantry_db on localhost:5432, user dbuser)
- **AI:** Ollama (localhost:11434) — qwen2.5:3b for classification, gpt-oss:120b for meal planning
- **Existing logic:** Python modules in logic/ directory (classifier, meal_planner, ocr_processor)

## Directory Structure
```
/home/dogginitan/development/project_pantry/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry, CORS, router registration
│   │   ├── config.py            # Environment config via python-dotenv
│   │   ├── database.py          # SQLAlchemy engine, session, get_db dependency
│   │   ├── ai_router.py         # AI provider abstraction (Ollama vs Cloud)
│   │   ├── routers/
│   │   │   ├── inventory.py     # GET /api/inventory, /api/inventory/low
│   │   │   ├── meals.py         # POST /api/meals/suggest
│   │   │   └── classifier.py    # POST /api/classify, POST /api/classify/batch
│   │   └── services/
│   │       └── velocity.py      # Consumption rate engine with category thresholds
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with Sidebar
│   │   ├── page.tsx             # Redirects to /dashboard
│   │   ├── dashboard/page.tsx   # Stats, low alerts, spending placeholder, quick actions
│   │   ├── inventory/page.tsx   # Full table with search, filter tabs, expandable rows, bulk actions
│   │   ├── meal-planner/page.tsx    # Placeholder
│   │   ├── shopping-list/page.tsx   # Placeholder
│   │   ├── spending/page.tsx        # Placeholder
│   │   └── settings/page.tsx        # Placeholder
│   ├── components/
│   │   └── Sidebar.tsx          # Navigation sidebar
│   └── lib/
│       └── api.ts               # API client (BASE_URL from env, typed fetch wrappers)
├── logic/
│   ├── classifier.py            # LLM product categorization (qwen2.5:3b)
│   ├── meal_planner.py          # Meal suggestions (LiteLLM gpt-oss:120b)
│   └── ocr_processor.py         # Receipt OCR (EasyOCR + regex) — to be replaced with AI Vision
├── dashboard/app.py             # Streamlit prototype (reference only)
├── config.py                    # Root config
├── .env                         # Credentials
├── PRD.md                       # Full product requirements
└── LEARNINGS.md                 # Dev agent accumulated knowledge
```

## Database Schema
- **products** — 279 rows. Columns: id, raw_name, canonical_name, category, consumption_profile, unit_type, unit_quantity, current_stock_estimate, predicted_out_date, times_wasted, times_consumed, inventory_status
- **purchases** — 363 rows. Columns: id, product_id, purchase_date, price, quantity, receipt_id, ocr_confidence, raw_ocr_line
- **receipts** — id, store_name, receipt_date, total_amount, image_path, raw_ocr_text, ai_provider, processing_status, created_at
- **shopping_lists** — id, name, created_at, completed_at
- **shopping_list_items** — id, list_id, product_id, product_name, quantity, checked, source
- **meal_suggestions** — id, suggestion_text, ingredients_used (JSONB), saved, created_at
- **settings** — key (PK), value, updated_at

## Working Endpoints
- GET /api/inventory — all products with velocity status
- GET /api/inventory/low — filtered to low/out status
- POST /api/meals/suggest — LLM meal suggestions from inventory
- POST /api/classify — classify single item name
- POST /api/classify/batch — classify all unclassified products
- GET /health — health check

## Patterns & Conventions
- **Backend:** FastAPI routers with Pydantic models, SQLAlchemy sessions via get_db dependency
- **Frontend:** Next.js App Router, "use client" for interactive pages, Tailwind zinc dark theme
- **API client:** frontend/lib/api.ts — all pages should import from here, never hardcode BASE_URL
- **Logic imports:** backend imports from logic/ via sys.path at module level (project root = ../../.. from routers/)
- **AI Router:** ai_router.py has _OllamaProvider and _CloudProvider — use AIRouter class for all LLM calls

## How to Run
```bash
# Backend
cd /home/dogginitan/development/project_pantry/backend
uvicorn app.main:app --host 0.0.0.0 --port 8060 --reload

# Frontend
cd /home/dogginitan/development/project_pantry/frontend
npx next dev -p 3060 -H 0.0.0.0
```

## How to Verify Changes
```bash
# Python syntax
find backend -name "*.py" -exec python3 -m py_compile {} +

# Backend imports clean
cd /home/dogginitan/development/project_pantry/backend && python3 -c "from app.main import app; print(OK)"

# Frontend builds
cd /home/dogginitan/development/project_pantry/frontend && npx next build

# DB connection
python3 -c "import psycopg2; c=psycopg2.connect(dbname=pantry_db user=dbuser password=secure_password_2024 host=localhost); print(DB OK); c.close()"
```

## Known Issues
- logic/meal_planner.py and logic/classifier.py manage their own DB connections (psycopg2) — not using SQLAlchemy
- No ORM models defined — database.py has Base but no model classes, all queries use raw SQL via text()
- Bulk actions (consumed/wasted) on inventory page are client-only — no backend endpoint yet
- No migration files — DDL was run directly on DB. Need migrations/ directory for reproducible setup

## Response Format
End every response with either:
SUCCESS: <brief summary>
or
BLOCKED: <reason>
