# Project Pantry — Product Requirements Document
## v2.0: From Streamlit Prototype to Shippable Product

---

## What It Is

Pantry is an AI-powered grocery intelligence app. You scan receipts, it tracks your inventory, predicts what you're running low on, suggests meals from what you have, and generates smart shopping lists based on actual consumption patterns — not guesswork.

**The insight:** Every grocery app fails because it requires manual entry. Pantry's input is a photo of your receipt — something you already have in your hand at the store. Everything else flows from that.

## What Exists Today

A working Streamlit prototype (839-line app.py) with:
- PostgreSQL backend (279 products, 363 purchases tracked)
- Gmail receipt scraping (Instacart/Costco)
- Receipt OCR via EasyOCR + regex parsing
- LLM-powered item classification (qwen2.5:3b via Ollama)
- Velocity-based reorder prediction engine
- LLM meal planner using current inventory
- Instacart cart automation via Playwright
- Category-aware shelf life thresholds

The logic works. The interface doesn't scale beyond personal use.

## Business Model

**$25 one-time purchase.** You own the software.

**AI usage is pay-as-you-go:**
- Receipt OCR, meal suggestions, and smart classification run through LLM calls
- Users with local LLM setups (Ollama, llama.cpp) → free AI, no ongoing cost
- Users without local LLMs → AI calls routed through Pantry Cloud at utility pricing with margin (e.g., ~$0.02/receipt scan, ~$0.01/meal suggestion batch)
- Think AWS billing: you pay for what you use, metered transparently

**Why this model:**
- No subscription fatigue — people hate recurring charges for tools
- Local LLM option is a trust signal and a differentiator ("your data never leaves your machine")
- Usage-based AI revenue scales with engagement, not arbitrary tiers
- $25 price point is impulse-buy territory ("two takeout meals")

## Target Users

**Primary: Busy households** who spend $800-1500/month on groceries and throw away 30-40% of what they buy. They want something that works without manual entry.

**Secondary: Budget-conscious singles/couples** tracking spending and trying to eat what they have before it goes bad.

**Power users: Self-hosters** who run local LLMs and want a privacy-first tool they control completely.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  NEXT.JS FRONTEND (PWA)                                         │
│  • Dashboard: inventory, spending, predictions                  │
│  • Receipt capture: camera or photo upload                      │
│  • Shopping list: auto-generated, editable                      │
│  • Meal planner: LLM suggestions from inventory                 │
│  • Settings: AI provider config (local vs cloud)                │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND                                                │
│  • Receipt processing pipeline (OCR → classify → store)         │
│  • Velocity engine (burn rate calculations)                     │
│  • Shopping list generator                                      │
│  • Meal planner (LLM integration)                               │
│  • AI router (local Ollama OR Pantry Cloud)                     │
│  • Budget/spending analytics                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌──────────────────────┐ ┌──────────────────────┐
│  PostgreSQL          │ │  AI Provider         │
│  • products          │ │  Option A: Ollama    │
│  • purchases         │ │  (localhost:11434)   │
│  • categories        │ │  Option B: Cloud     │
│  • shopping_lists    │ │  (api.pantryapp.com) │
│  • meal_history      │ └──────────────────────┘
└──────────────────────┘
```

**Key architectural principles:**

1. **Swappable AI provider.** Both local and cloud implementations expose the same methods: `ocr_receipt(image)`, `classify_item(name)`, `suggest_meals(inventory)`. The frontend settings page lets users point at their own Ollama instance or use the cloud default.

2. **Consumption profiles, not flat velocity.** A 24-pack of TP and a gallon of milk have wildly different burn rates. The classification layer assigns each product a consumption profile that informs the velocity engine:
   - **Perishable** (milk, berries, greens): high velocity, short shelf life, aggressive reorder
   - **Pantry staple** (rice, flour, canned goods): low velocity, long shelf life, relaxed reorder
   - **Household/bulk** (detergent, paper towels, TP): very low velocity, bulk purchase patterns
   - **Frozen** (meats, vegetables, prepared): medium velocity, extended shelf life
   The classifier assigns profile at ingest time. The velocity engine uses profile-specific decay curves instead of a single linear burn rate.

3. **Waste-aware intelligence.** Items marked "Wasted" instead of "Consumed" feed back into the system — the meal planner learns to suggest perishable items earlier, and the shopping list may reduce quantities for chronically wasted items.

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14 + Tailwind | PWA with camera access, SSR for speed, same stack as Mission Control |
| Backend | FastAPI | Wraps existing Python logic modules directly |
| Database | PostgreSQL | Already running, schema works, just needs a few new tables |
| OCR | Claude Vision API (cloud) / Ollama vision models (local) | Best accuracy for receipts |
| Classification | Claude Haiku (cloud) / qwen2.5 (local) | Fast, cheap categorization |
| Meal Planning | Claude Sonnet (cloud) / larger Ollama models (local) | Needs reasoning for good suggestions |
| Hosting (dev) | Spark DGX — frontend :3060, backend :8060 | Existing infra |

## Database Changes

Keep existing `products` and `purchases` tables. Extend and add:

```sql
-- Extend products with consumption profiles and unit normalization
ALTER TABLE products ADD COLUMN consumption_profile TEXT DEFAULT 'pantry';
  -- 'perishable', 'pantry', 'household', 'frozen'
ALTER TABLE products ADD COLUMN unit_type TEXT;
  -- 'count', 'oz', 'lbs', 'gal', 'each'
ALTER TABLE products ADD COLUMN unit_quantity NUMERIC;
  -- e.g., 12 for "Eggs (12ct)", 64 for "OJ 64oz"
ALTER TABLE products ADD COLUMN current_stock_estimate NUMERIC;
  -- 0.0 to 1.0 percentage, updated by velocity engine
ALTER TABLE products ADD COLUMN predicted_out_date TIMESTAMP;
  -- when velocity engine thinks you'll run out

-- Track how items were used (consumed vs wasted)
ALTER TABLE products ADD COLUMN times_wasted INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN times_consumed INTEGER DEFAULT 0;

-- Track receipt scans with confidence data
CREATE TABLE receipts (
    id SERIAL PRIMARY KEY,
    store_name TEXT,
    receipt_date TIMESTAMP,
    total_amount NUMERIC,
    image_path TEXT,
    raw_ocr_text TEXT,
    ai_provider TEXT,           -- 'ollama' or 'cloud'
    processing_status TEXT DEFAULT 'pending',  -- 'pending', 'processing', 'ready', 'saved'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Link purchases to receipts, add confidence scoring
ALTER TABLE purchases ADD COLUMN receipt_id INTEGER REFERENCES receipts(id);
ALTER TABLE purchases ADD COLUMN ocr_confidence NUMERIC;  -- 0.0 to 1.0
ALTER TABLE purchases ADD COLUMN raw_ocr_line TEXT;       -- original OCR text before cleanup

-- Shopping lists (persistent, not just computed)
CREATE TABLE shopping_lists (
    id SERIAL PRIMARY KEY,
    name TEXT DEFAULT 'Shopping List',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE shopping_list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER REFERENCES shopping_lists(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_name TEXT NOT NULL,
    quantity NUMERIC DEFAULT 1,
    checked BOOLEAN DEFAULT FALSE,
    source TEXT DEFAULT 'auto',     -- 'auto' (velocity) or 'manual'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Meal planning history
CREATE TABLE meal_suggestions (
    id SERIAL PRIMARY KEY,
    suggestion_text TEXT NOT NULL,
    ingredients_used JSONB,
    saved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- AI provider config and app settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## MVP Screens

### 1. Dashboard (Home)
- Inventory summary: total items, items in stock / low / out
- "Running Low" alert cards (velocity-based predictions)
- Spending this month vs last month (simple bar comparison)
- Quick action buttons: Scan Receipt, View Shopping List, Get Meal Ideas
- Recent activity feed (last 5 receipts scanned)

### 2. Scan Receipt
- Camera capture (mobile) or file upload (desktop) — fallback upload always available (iOS Safari `getUserMedia` quirks)
- Send image to AI provider for OCR
- **Async processing:** user uploads → receipt enters "Processing" state → user can leave screen → notification/alert when items are ready for review
- Show extracted items in editable table: name, quantity, price, category
- **Confidence scoring:** AI returns a confidence flag per line item. Low-confidence rows highlighted in amber so the user fixes them before saving. Prevents garbage-in data corruption from crinkled receipts and weird abbreviations (e.g., `ORNG JCE 64OZ`)
- User confirms/edits, then saves to database
- Auto-classify items into categories and consumption profiles via LLM
- Show receipt total vs sum of items as sanity check

### 3. Inventory
- Full product list with search/filter
- Columns: name, category, consumption profile, status (in stock/low/out), last purchased, avg buy frequency
- Click item → detail view with purchase history chart
- Status actions: mark as **Consumed** (normal use) or **Wasted** (thrown away unused) — waste data feeds back into meal planner and quantity predictions
- Bulk actions: mark selected as out of stock
- **Stale data section:** "Is this still in your fridge?" — when an item's predicted burn date has passed and no new receipt has been scanned, prompt the user to confirm status. Keeps inventory accurate without full manual audits

### 4. Shopping List
- Auto-generated section: items predicted to need reorder (velocity engine)
- Manual section: items user added by hand
- Checkboxes for in-store use
- Category grouping (so you shop aisle by aisle)
- "Regenerate" button to recalculate predictions
- Share/export as text

### 5. Meal Planner
- "What can I make?" button → sends current inventory to LLM
- Shows 3-5 meal suggestions with ingredients list
- Highlights which ingredients you have vs need to buy
- "Save" to bookmark good suggestions
- "Add missing to shopping list" one-click action
- History of past suggestions

### 6. Spending
- Monthly spend chart (last 6 months)
- Category breakdown (pie/bar chart)
- Top items by spend
- Budget setting (optional) with over/under indicator

### 7. Settings
- **AI Provider**: toggle between Local (Ollama URL) and Cloud (Pantry Cloud)
- Test connection button for local setup
- Usage meter for cloud (how much AI you've consumed)
- Database connection (for self-hosters)
- Data export (JSON/CSV)
- Email scraping config (power user feature, hidden by default)

## What Gets Reused From Prototype

| Module | Location | Reuse Strategy |
|--------|----------|---------------|
| Velocity engine | dashboard/app.py (load_inventory_data, reorder logic) | Extract into standalone module, add consumption profiles |
| Category thresholds | dashboard/app.py (CATEGORY_THRESHOLDS) | Move to config |
| Meal planner | logic/meal_planner.py | Wrap in FastAPI endpoint, works as-is |
| Item classifier | logic/classifier.py | Wrap in FastAPI endpoint, swap model per provider |
| OCR processor | logic/ocr_processor.py | Replace EasyOCR with AI vision, keep interface |
| Gmail ingester | ingest/ingest_gmail.py | Keep as optional feature behind settings toggle |
| DB schema | products + purchases tables | Keep, extend with new tables |

## What Gets Built New

1. **Next.js frontend** — all 7 screens above
2. **FastAPI backend** — REST API wrapping the existing logic
3. **AI router** — abstraction layer for local vs cloud LLM calls
4. **Receipt processing pipeline** — image → AI Vision OCR → structured items → classify → store
5. **Shopping list engine** — velocity predictions → persistent list with manual additions
6. **Database migrations** — new tables and column additions from PRD

## What Gets Cut (Not in MVP)

- Instacart/Playwright automation (fragile, legal gray area)
- Barcode scanning (camera OCR is enough)
- Multi-user / household support (add post-launch)
- Nutritional tracking
- Store price comparison
- Voice interface
- Mobile native apps (PWA first)
- User auth / accounts (single-user local app for MVP)
- Pantry Cloud billing (build the app first, add cloud metering later)

## Development Phases

### Phase 1: Foundation (Backend + Core UI)
- FastAPI backend with existing logic modules wrapped as endpoints
- New database tables (migrations)
- AI router interface (local Ollama support first)
- Next.js app shell with navigation
- Dashboard screen (inventory summary, spending overview)
- Inventory list screen (CRUD)

### Phase 2: Receipt Pipeline
- Receipt capture UI (camera + upload)
- AI Vision OCR integration (Ollama vision → Claude Vision)
- Item extraction → editable confirmation → save flow
- Auto-classification on ingest
- Receipt history

### Phase 3: Intelligence Features
- Shopping list screen (velocity-based auto-generation + manual)
- Meal planner screen (LLM suggestions from inventory)
- Spending analytics screen (charts, category breakdown)

### Phase 4: Polish & Ship
- Settings screen (AI provider config, data export)
- PWA manifest (installable on mobile)
- Responsive design pass (mobile-first)
- Loading states, error handling, empty states
- README / docs for self-hosting
- Landing page

### Phase 5: Monetization (Post-MVP)
- Pantry Cloud API proxy (auth + metering + billing)
- Stripe integration for usage-based billing
- Cloud onboarding flow vs local setup flow
- $25 purchase gate (license key or similar)

## Ports & Infrastructure

| Service | Port | Notes |
|---------|------|-------|
| Pantry Frontend | 3060 | Next.js dev server on Spark |
| Pantry Backend | 8060 | FastAPI on Spark |
| PostgreSQL | 5432 | Existing shared_postgres, pantry_db |
| Ollama | 11434 | Existing on Spark |

## Success Criteria (MVP)

**Functional:**
- [ ] Can scan a receipt photo and see items appear in inventory
- [ ] Dashboard shows what's running low based on consumption-profile-aware velocity
- [ ] Shopping list auto-generates from burn rates, is editable, checkable
- [ ] Meal planner suggests meals from current inventory
- [ ] Works with local Ollama (no cloud dependency)
- [ ] Responsive on mobile (camera capture works, with upload fallback)
- [ ] Stale inventory prompts keep data accurate without manual audits

**Measurable (The "Andrew Test"):**
- [ ] **Accuracy:** 90%+ item name extraction accuracy on Costco/Instacart receipts
- [ ] **Speed:** Camera open → items saved to database in under 60 seconds (including AI processing)
- [ ] **Reliability:** <15% sync errors (app says you have something you don't)
- [ ] **Adoption:** Andrew uses it daily instead of the Streamlit version

## Technical Considerations

**PWA Camera:** iOS Safari has specific quirks with `getUserMedia`. Always provide a file upload fallback alongside live camera. Test on iPhone Safari early in Phase 2.

**Local LLM Latency:** Ollama on a standard laptop can take 10-30 seconds for receipt OCR. The scan flow must be fully async — upload → processing state → user navigates away → notification when ready. Never block the UI waiting for AI.

**Unit Normalization:** "Eggs (12ct)" and "Eggs (18ct)" need to resolve to the same product with different quantities. The classifier must extract unit_type and unit_quantity at ingest time so the velocity engine can track actual consumption rate regardless of package size.

**Receipt Messiness:** Crinkled, faded, thermally-printed receipts with abbreviations like `ORNG JCE 64OZ` are the norm, not the exception. The confidence scoring system is essential — better to flag uncertainty than to silently corrupt the database.

---

*PRD Version: 2.0*
*Project: Project Pantry*
*Last Updated: February 18, 2026*
