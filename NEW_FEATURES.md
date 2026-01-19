# Project Pantry - Current Features Guide

## 📊 Dashboard Overview (Port 8502)

Project Pantry now has a unified Streamlit dashboard with 5 tabs:

| Tab | Purpose | Status |
|-----|---------|--------|
| 🛒 **Suggested Order** | Velocity-based reorder predictions | ✅ Production |
| 🍽️ **Meal Planner** | AI meal suggestions from inventory | ✅ Production |
| 📦 **Master Inventory** | View all products & history | ✅ Production |
| 💸 **Financials** | Budget tracking & spending analytics | ✅ Production |
| 📸 **Receipt Scanner** | OCR receipt import via BakLLaVA | ✅ Beta |

---

## 🛒 Tab 1: Suggested Order

### What It Does
Uses velocity-based algorithms to predict when you'll run out of items and suggests what to reorder.

### How It Works
1. Calculates average purchase interval for each item (needs 3+ purchases)
2. Applies category-specific thresholds:
   - Produce: 0.8x (reorder early - perishable)
   - Dairy: 0.9x
   - Meat: 0.85x
   - Frozen: 1.1x (can last longer)
   - Pantry: 1.2x (shelf-stable)
   - Household: 1.5x (very relaxed)
3. Shows items as "🔴 Overdue" or "🧪 Calibrating" (needs more data)

### Features
- **Auto-Replenish Button**: Triggers Playwright agent to add items to Instacart cart
- **Category Filter**: Focus on specific categories via sidebar
- **Threshold Display**: Shows exactly when items become overdue

---

## 🍽️ Tab 2: Meal Planner

### What It Does
Analyzes your current inventory and suggests meals you can cook **right now** with what you have.

### How It Works
1. Queries all items "in stock" using velocity-based logic
2. Identifies your frequently purchased items (cooking preferences)
3. Sends to **gpt-oss:120b** (local LLM) for intelligent suggestions
4. Returns 3-7 meal ideas with ingredients and prep instructions

### Key Improvements (January 2025)
- **Velocity-based inventory**: Now includes pantry staples like flour, spices, etc. that were bought months ago (not just last 30 days)
- **Category-aware shelf life**: Produce expires faster than pantry items
- **120b model**: Higher quality suggestions than 20b

### Features
- **Dietary Preferences**: Enter "vegetarian", "low-carb", etc.
- **Adjustable Count**: Get 3, 5, or 7 suggestions
- **Missing Ingredients**: Shows what you'd need to buy
- **Prep Instructions**: Brief cooking guidance

### Usage Tips
- More purchase history = better suggestions
- Be specific with dietary prefs: "no dairy, gluten-free"
- Generation takes 30-60 seconds (large model)

---

## 📦 Tab 3: Master Inventory

### What It Does
Complete view of all products ever purchased, with search and filtering.

### Features
- **Search**: Filter by product name
- **Category Filter**: Via sidebar
- **Status Colors**: Green (in stock), Yellow (low), Red (out)
- **Metrics**: Total products, in-stock count, average days since purchase

### Data Shown
- Canonical name (cleaned by LLM)
- Raw name (original from receipt)
- Category
- Last purchase date
- Days since purchase
- Total quantity bought
- Average price paid

---

## 💸 Tab 4: Financials

### What It Does
Tracks grocery spending with budget monitoring and trend analysis.

### Features
- **Budget Slider**: Set monthly target ($200-$1000)
- **Spend MTD**: Current month spending with remaining budget
- **Projected Total**: Extrapolated month-end spend
- **Progress Bar**: Visual budget utilization
- **Category Breakdown**: Bar chart of spending by category
- **Weekly Trend**: Line chart of spending over time
- **Monthly History**: Table of all months

---

## 📸 Tab 5: Receipt Scanner (NEW)

### What It Does
Upload a photo of any grocery receipt and extract items using local AI vision (BakLLaVA).

### How It Works
1. Upload receipt image (JPG, PNG, WEBP)
2. Click "Extract Items" - BakLLaVA analyzes the image
3. Review/edit extracted items in data editor
4. Click "Save to Inventory" to add to database

### Technical Details
- **OCR Model**: BakLLaVA (4.7GB, runs locally via Ollama)
- **Cost**: Free (no API calls)
- **Processing Time**: 30-60 seconds
- **Accuracy**: Good for clear photos, may need manual corrections

### Tips for Best Results
- Take photo in good lighting
- Ensure text is readable (not blurry)
- Capture the full receipt
- Works best with standard store receipts

### Fallback
If item extraction fails, raw OCR text is displayed for manual copy/paste.

---

## 🔧 Backend Components

### Data Ingestion
| Method | File | Status |
|--------|------|--------|
| Gmail scraping | `ingest/ingest_gmail.py` | ✅ Production |
| Mock data | `ingest/ingest_mock.py` | ✅ Testing |
| Receipt OCR | `logic/ocr_processor.py` | ✅ Beta |

### AI/ML
| Component | File | Model |
|-----------|------|-------|
| Product classifier | `logic/classifier.py` | gpt-oss:20b |
| Meal planner | `logic/meal_planner.py` | gpt-oss:120b |
| Receipt OCR | `logic/ocr_processor.py` | BakLLaVA |

### Automation
| Component | File | Status |
|-----------|------|--------|
| Instacart cart | `agents/cart_manager.py` | ✅ Production |
| Session manager | `agents/session_forge.py` | ✅ Production |
| Session verifier | `agents/shopper.py` | ✅ Production |

---

## 🚀 Quick Start

```bash
# SSH to Spark
ssh -L 9999:localhost:22 dogginitan@192.168.68.71

# Navigate to project
ssh -p 9999 dogginitan@localhost
cd ~/development/project_pantry
source .venv/bin/activate

# Launch dashboard
streamlit run dashboard/app.py --server.port 8502

# Access at: http://localhost:8502
```

---

## 📈 Workflow Recommendations

### Weekly Routine
1. **Monday**: Run `python ingest/ingest_gmail.py` to scrape receipts
2. **Monday**: Run `python logic/classifier.py` to categorize new items
3. **Tuesday**: Check 🛒 Suggested Order tab for reorder needs
4. **Daily**: Use 🍽️ Meal Planner for dinner ideas
5. **As needed**: Upload paper receipts via 📸 Receipt Scanner

### When Shopping In-Store
1. Take photo of receipt before leaving store
2. Upload to Receipt Scanner when home
3. Edit any OCR errors
4. Save to inventory

---

## 🐛 Known Limitations

### Streamlit UI
- Tab jumping when clicking buttons (Streamlit limitation)
- No mobile-optimized view
- Session state resets on page refresh

### Receipt Scanner
- Requires clear, well-lit photos
- May struggle with faded or crumpled receipts
- Processing time is 30-60 seconds

### Meal Planner
- Large model (120b) is slow but accurate
- Suggestions depend on inventory data quality
- No recipe saving yet

### Instacart Automation
- Session expires periodically
- Requires manual re-auth via `session_forge.py`
- Only works with Instacart (not other stores)

---

## 🔮 Planned Improvements

See `PRODUCT_VISION.md` for commercial roadmap.

### Short Term
- [ ] Improve receipt OCR accuracy
- [ ] Add recipe saving to meal planner
- [ ] Barcode scanning support
- [ ] Multi-store shopping lists

### Medium Term
- [ ] Mobile-friendly web app
- [ ] Push notifications for reorder reminders
- [ ] Price tracking and alerts
- [ ] Household multi-user support

### Long Term
- [ ] Native mobile apps (iOS/Android)
- [ ] Voice interface ("What should I make?")
- [ ] Smart home integration
- [ ] Nutritional tracking

---

*Last Updated: January 2025*
*Dashboard: http://192.168.68.71:8502*
