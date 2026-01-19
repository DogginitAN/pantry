#!/bin/bash
# Pantry GitHub Preparation Script
# Run this BEFORE committing to GitHub

set -e

PROJECT_DIR=~/development/project_pantry
cd "$PROJECT_DIR"

echo "🔒 Preparing Pantry for GitHub..."

# 1. Backup current files
echo "📦 Creating backup..."
BACKUP_DIR="$PROJECT_DIR/.backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r . "$BACKUP_DIR/" 2>/dev/null || true

# 2. Copy new config files
echo "📝 Installing new config files..."

# .gitignore
cat > .gitignore << 'GITIGNORE'
# Dependencies
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
.venv/
venv/
ENV/

# Environment & Secrets
.env
.env.local
.env.*.local
*.key
*.pem
secrets.json

# Session & Auth Files (CRITICAL - NEVER COMMIT)
instacart_state.json
*_state.json
*_cookies.txt
raw_cookies.txt

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Build & Logs
dist/
build/
*.log
*.egg-info/

# Database dumps
*.sql
*.dump

# Test artifacts
.pytest_cache/
.coverage
htmlcov/

# Streamlit
.streamlit/

# Debug files
dashboard/error_*.png
ingest/debug_*.html

# Backup files
*.backup
*.backup_*
*.bak
.backup_*/

# Internal documentation (contains credentials)
.clinerules
GITIGNORE

# .env.example
cat > .env.example << 'ENVEXAMPLE'
# Pantry - Environment Configuration
# Copy this file to .env and fill in your values

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pantry_db
DB_USER=your_db_user
DB_PASSWORD=your_secure_password

# Gmail IMAP (for receipt scraping)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# LiteLLM / Ollama
LITELLM_API_KEY=your_litellm_key
LITELLM_BASE_URL=http://localhost:4000/v1

# OpenAI (optional - for cloud OCR)
OPENAI_API_KEY=sk-your-openai-key-here
ENVEXAMPLE

echo "✅ Config files created"

# 3. Create db_config.py module
echo "🔧 Creating centralized config module..."
cat > config.py << 'CONFIGPY'
"""
Centralized configuration for Pantry.
Loads all settings from environment variables.
"""
import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# Database configuration
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "pantry_db"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}

# Email configuration
EMAIL_CONFIG = {
    "user": os.getenv("EMAIL_USER"),
    "password": os.getenv("EMAIL_PASS"),
}

# LLM configuration
LLM_CONFIG = {
    "base_url": os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1"),
    "api_key": os.getenv("LITELLM_API_KEY"),
}

# OpenAI (optional)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def get_db_connection_string():
    """Returns PostgreSQL connection string."""
    return f"postgresql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
CONFIGPY

echo "✅ Config module created"

# 4. Update files to use environment variables
echo "🔄 Refactoring files to use environment variables..."

# Update dashboard/app.py
if [ -f dashboard/app.py ]; then
    sed -i 's/"host": "localhost"/"host": os.getenv("DB_HOST", "localhost")/g' dashboard/app.py
    sed -i 's/"user": "dbuser"/"user": os.getenv("DB_USER")/g' dashboard/app.py
    sed -i 's/"password": "secure_password_2024"/"password": os.getenv("DB_PASSWORD")/g' dashboard/app.py
    sed -i 's/"database": "pantry_db"/"database": os.getenv("DB_NAME", "pantry_db")/g' dashboard/app.py
    # Add import if not present
    grep -q "from dotenv import load_dotenv" dashboard/app.py || sed -i '1i from dotenv import load_dotenv\nimport os\nload_dotenv()\n' dashboard/app.py
    echo "  ✅ dashboard/app.py"
fi

# Update logic/classifier.py
if [ -f logic/classifier.py ]; then
    sed -i 's/api_key=os.getenv("LITELLM_API_KEY", "sk-[^"]*")/api_key=os.getenv("LITELLM_API_KEY")/g' logic/classifier.py
    sed -i 's/"password": "secure_password_2024"/"password": os.getenv("DB_PASSWORD")/g' logic/classifier.py
    sed -i 's/"user": "dbuser"/"user": os.getenv("DB_USER")/g' logic/classifier.py
    grep -q "from dotenv import load_dotenv" logic/classifier.py || sed -i '1i from dotenv import load_dotenv\nimport os\nload_dotenv()\n' logic/classifier.py
    echo "  ✅ logic/classifier.py"
fi

# Update logic/meal_planner.py
if [ -f logic/meal_planner.py ]; then
    sed -i 's/api_key=os.getenv("LITELLM_API_KEY", "sk-[^"]*")/api_key=os.getenv("LITELLM_API_KEY")/g' logic/meal_planner.py
    sed -i 's/"password": "secure_password_2024"/"password": os.getenv("DB_PASSWORD")/g' logic/meal_planner.py
    sed -i 's/"user": "dbuser"/"user": os.getenv("DB_USER")/g' logic/meal_planner.py
    grep -q "from dotenv import load_dotenv" logic/meal_planner.py || sed -i '1i from dotenv import load_dotenv\nimport os\nload_dotenv()\n' logic/meal_planner.py
    echo "  ✅ logic/meal_planner.py"
fi

# Update ingest files
for f in ingest/ingest_gmail.py ingest/ingest_mock.py ingest/ingest_manual.py; do
    if [ -f "$f" ]; then
        sed -i 's/"password": "secure_password_2024"/"password": os.getenv("DB_PASSWORD")/g' "$f"
        sed -i 's/"user": "dbuser"/"user": os.getenv("DB_USER")/g' "$f"
        grep -q "from dotenv import load_dotenv" "$f" || sed -i '1i from dotenv import load_dotenv\nimport os\nload_dotenv()\n' "$f"
        echo "  ✅ $f"
    fi
done

# 5. Remove/sanitize sensitive files
echo "🗑️  Removing sensitive files from git tracking..."

# Create sanitized README
cat > README.md << 'README'
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
README

echo "✅ README updated"

# 6. Delete files that should never be committed
echo "🗑️  Cleaning up sensitive files..."
rm -f raw_cookies.txt dashboard/raw_cookies.txt 2>/dev/null || true
rm -f *.backup *.backup_* 2>/dev/null || true
rm -f dashboard/*.backup* 2>/dev/null || true

# 7. Create requirements.txt
echo "📋 Creating requirements.txt..."
cat > requirements.txt << 'REQUIREMENTS'
# Pantry - Python Dependencies

# Web Framework
streamlit>=1.30.0

# Database
psycopg2-binary>=2.9.0

# Data Processing
pandas>=2.1.0
beautifulsoup4>=4.12.0

# AI/LLM
openai>=1.0.0

# Browser Automation
playwright>=1.40.0

# Image Processing
Pillow>=10.0.0

# Environment
python-dotenv>=1.0.0

# HTTP
requests>=2.31.0
REQUIREMENTS

echo "✅ requirements.txt created"

# 8. Summary
echo ""
echo "========================================="
echo "✅ PREPARATION COMPLETE"
echo "========================================="
echo ""
echo "Files created/updated:"
echo "  - .gitignore"
echo "  - .env.example"
echo "  - config.py"
echo "  - README.md"
echo "  - requirements.txt"
echo ""
echo "⚠️  BEFORE PUSHING TO GITHUB:"
echo "  1. Review all Python files for remaining secrets"
echo "  2. Ensure .env exists with real credentials (for local use)"
echo "  3. Run: git status (verify no sensitive files)"
echo "  4. Test the app still works: streamlit run dashboard/app.py"
echo ""
echo "📦 Backup saved to: $BACKUP_DIR"
