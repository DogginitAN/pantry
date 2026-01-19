# 🥫 Pantry - AI-Powered Grocery Intelligence

**Pantry** is an intelligent grocery management system that learns your household's consumption patterns, predicts when you'll run out of items, suggests meals based on what you have, and automates shopping.

## The Problem

30-40% of food purchased in US households goes to waste (~$1,500/year per family). Meanwhile, "what's for dinner?" remains the most asked question in any home. Existing apps require tedious manual entry that nobody maintains.

## The Solution

Pantry automatically tracks your groceries by scraping email receipts, uses velocity-based algorithms to predict when items need replenishment, and leverages local AI to suggest meals using ingredients you actually have on hand.

## Features

- 📧 **Automatic Receipt Ingestion** - Scrapes Instacart & Costco receipts from Gmail
- 📸 **Receipt OCR** - Snap a photo of any receipt for instant item extraction (BakLLaVA vision model)
- 🧠 **Smart Reordering** - Velocity-based predictions tell you what's running low
- 🍽️ **AI Meal Planner** - Get meal suggestions based on your current inventory
- 💰 **Budget Tracking** - Monitor spending by category with projections
- 🛒 **Shopping Automation** - Auto-add items to Instacart cart via Playwright

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Streamlit (dashboard) |
| **Backend** | Python 3.11 |
| **Database** | PostgreSQL |
| **AI/ML** | Ollama (local LLMs), BakLLaVA (vision OCR) |
| **Automation** | Playwright (browser automation) |
| **Parsing** | BeautifulSoup4 |

## Architecture

```
Gmail (IMAP) ──► Receipt Parser ──► PostgreSQL
                     │                   │
                     ▼                   ▼
              LLM Classifier      Velocity Engine
                     │                   │
                     ▼                   ▼
              Meal Planner ◄──── Streamlit Dashboard
                                        │
                                        ▼
                                 Playwright Agent ──► Instacart
```

## Quick Start

```bash
# Clone and setup
git clone https://github.com/yourusername/pantry.git
cd pantry
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your credentials

# Run
streamlit run dashboard/app.py
```

## Configuration

Copy `.env.example` to `.env` and configure:
- Database credentials
- Gmail app password (for receipt scraping)
- LiteLLM API key (local LLM gateway)

## Privacy

All data stays local - no cloud services required. Your grocery habits are nobody's business.

## License

MIT

## Author

**Andrew Nolan** - [andrewdavidnolan.com](https://www.andrewdavidnolan.com)

---
*Part of the [Builder Mode](https://www.andrewdavidnolan.com/builder-mode) portfolio*
