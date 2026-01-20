from dotenv import load_dotenv
import os
load_dotenv()

#!/usr/bin/env python3
"""
Nash Pantry Tracker - Streamlit Dashboard
Visualizes grocery inventory and suggests reorder items.
"""

import streamlit as st
import pandas as pd
import psycopg2
from datetime import datetime, timedelta
import sys
import os

# Add parent directory to path for OCR imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from logic.ocr_processor import ReceiptOCR
from logic.meal_planner import get_current_inventory, get_purchase_history_patterns, suggest_meals

# Page config
st.set_page_config(
    page_title="Nash Pantry Tracker",
    page_icon="🥬",
    layout="wide"
)

# Database configuration
DB_PARAMS = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME", "pantry_db")
}

# Initialize OCR processor
@st.cache_resource
def get_ocr():
    """Get cached OCR processor instance."""
    return ReceiptOCR()


def save_scanned_items_to_db(items, source="receipt_scan"):
    """Save items from receipt scan to database."""
    conn = psycopg2.connect(**DB_PARAMS)
    cur = conn.cursor()
    
    results = {"inserted": 0, "errors": []}
    
    for item in items:
        try:
            # Insert or get product
            cur.execute("""
                INSERT INTO products (raw_name, inventory_status)
                VALUES (%s, 'IN_STOCK')
                ON CONFLICT (raw_name) DO UPDATE SET inventory_status = 'IN_STOCK'
                RETURNING id
            """, (item["name"],))
            product_id = cur.fetchone()[0]
            
            # Insert purchase record
            cur.execute("""
                INSERT INTO purchases (product_id, purchase_date, quantity, unit_price, source_email_id)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                product_id,
                datetime.now(),
                item["quantity"],
                item["unit_price"],
                source[:16]
            ))
            
            results["inserted"] += 1
            conn.commit()
            
        except Exception as e:
            results["errors"].append(f"{item['name']}: {str(e)}")
            conn.rollback()
    
    cur.close()
    conn.close()
    
    return results

# Velocity thresholds by category (multiplier on avg_interval_days)
CATEGORY_THRESHOLDS = {
    'Produce': 0.8,      # Fresh items - reorder early (20% before normal)
    'Dairy': 0.9,        # Moderate buffer (10% early)
    'Meat': 0.85,        # Perishable - slightly early
    'Frozen': 1.1,       # Can last longer - slight buffer
    'Pantry': 1.2,       # Shelf-stable - relaxed (20% buffer)
    'Household': 1.5,    # Non-perishables - very relaxed (50% buffer)
}
DEFAULT_THRESHOLD = 1.0  # Fallback for uncategorized items


@st.cache_data(ttl=60)
def load_inventory_data():
    """Load inventory data with last purchase dates."""
    conn = psycopg2.connect(**DB_PARAMS)

    query = """
        SELECT
            p.id,
            p.raw_name,
            p.canonical_name,
            p.category,
            p.inventory_status,
            MAX(pu.purchase_date) as last_purchase,
            SUM(pu.quantity) as total_qty,
            AVG(pu.unit_price) as avg_price
        FROM products p
        LEFT JOIN purchases pu ON p.id = pu.product_id
        GROUP BY p.id, p.raw_name, p.canonical_name, p.category, p.inventory_status
        ORDER BY p.category, p.canonical_name
    """

    df = pd.read_sql(query, conn)
    conn.close()

    # Calculate days since last purchase
    df['last_purchase'] = pd.to_datetime(df['last_purchase'])
    df['days_since_purchase'] = (datetime.now() - df['last_purchase']).dt.days

    return df


@st.cache_data(ttl=60)
def get_velocity_data():
    """Calculates consumption velocity for items with sufficient history."""
    conn = psycopg2.connect(**DB_PARAMS)

    query = """
    WITH metrics AS (
        SELECT
            p.canonical_name,
            p.category,
            MAX(pur.purchase_date) as last_purchased,
            COUNT(pur.id) as buy_count,
            MIN(pur.purchase_date) as first_purchased
        FROM purchases pur
        JOIN products p ON pur.product_id = p.id
        GROUP BY p.canonical_name, p.category
    )
    SELECT
        canonical_name,
        category,
        last_purchased,
        buy_count,
        CURRENT_DATE - last_purchased::date AS days_since_last,
        CASE
            WHEN buy_count >= 3 THEN
                ROUND((last_purchased::date - first_purchased::date)::numeric / (buy_count - 1), 1)
            ELSE NULL
        END as avg_interval_days
    FROM metrics
    ORDER BY days_since_last DESC;
    """

    df = pd.read_sql(query, conn)
    conn.close()
    return df


def style_inventory_status(val):
    """Color code inventory status."""
    if val == 'IN_STOCK':
        return 'background-color: #90EE90'  # Light green
    elif val == 'LOW':
        return 'background-color: #FFD700'  # Gold
    elif val == 'OUT':
        return 'background-color: #FF6B6B'  # Light red
    return ''


# Main App
st.title("🥬 Nash Pantry Tracker")

# Load data
try:
    df = load_inventory_data()
except Exception as e:
    st.error(f"Failed to connect to database: {e}")
    st.stop()

# Sidebar filters
st.sidebar.header("Filters")

# Category filter
categories = ['All'] + sorted(df['category'].dropna().unique().tolist())
selected_category = st.sidebar.selectbox("Category", categories)

# Apply category filter
if selected_category != 'All':
    filtered_df = df[df['category'] == selected_category]
else:
    filtered_df = df

# Tabs
tab1, tab2, tab3, tab4, tab5 = st.tabs(["🛒 Suggested Order", "🍽️ Meal Planner", "📦 Master Inventory", "💸 Financials", "📸 Receipt Scanner"])

# Tab 1: Smart Replenishment
with tab1:
    st.header("Smart Replenishment")
    st.caption("Velocity-based reorder suggestions with category-specific thresholds")
    
    # Refresh button
    col_refresh, col_spacer = st.columns([1, 4])
    with col_refresh:
        if st.button("🔄 Refresh Data", use_container_width=True, help="Recalculate burn rates from latest purchase data"):
            load_inventory_data.clear()
            get_velocity_data.clear()
            st.rerun()

    # Load velocity data
    try:
        velocity_df = get_velocity_data()
    except Exception as e:
        st.error(f"Failed to load velocity data: {e}")
        st.stop()

    # Apply category filter if set
    if selected_category != 'All':
        velocity_df = velocity_df[velocity_df['category'] == selected_category]

    # Calculate status based on velocity with category-specific thresholds
    def get_status(row):
        if row['buy_count'] < 3:
            return "🧪 Calibrating"  # Not enough data
        
        # Get category-specific threshold
        threshold = CATEGORY_THRESHOLDS.get(row['category'], DEFAULT_THRESHOLD)
        
        # Apply threshold to determine if overdue
        if pd.notna(row['avg_interval_days']) and row['days_since_last'] > (row['avg_interval_days'] * threshold):
            return "🔴 Overdue"
        else:
            return "🟢 Stocked"

    velocity_df['status'] = velocity_df.apply(get_status, axis=1)

    # Calculate effective threshold for display
    def get_threshold_info(row):
        threshold = CATEGORY_THRESHOLDS.get(row['category'], DEFAULT_THRESHOLD)
        if pd.notna(row['avg_interval_days']):
            return round(row['avg_interval_days'] * threshold, 1)
        return None
    
    velocity_df['threshold_days'] = velocity_df.apply(get_threshold_info, axis=1)

    # Filter for display: Overdue items OR Calibrating items older than 14 days
    display_mask = (
        (velocity_df['status'] == "🔴 Overdue") |
        ((velocity_df['status'] == "🧪 Calibrating") & (velocity_df['days_since_last'] > 14))
    )

    to_order = velocity_df[display_mask].sort_values(by='days_since_last', ascending=False)

    if to_order.empty:
        st.success("All items are stocked according to your consumption patterns!")
    else:
        # Summary metrics
        overdue_count = len(to_order[to_order['status'] == "🔴 Overdue"])
        calibrating_count = len(to_order[to_order['status'] == "🧪 Calibrating"])

        col1, col2 = st.columns(2)
        with col1:
            st.metric("Overdue", overdue_count)
        with col2:
            st.metric("Needs Data", calibrating_count)

        st.divider()

        # Render table with threshold info
        st.dataframe(
            to_order[['status', 'canonical_name', 'category', 'days_since_last', 'avg_interval_days', 'threshold_days', 'buy_count', 'last_purchased']],
            column_config={
                "status": st.column_config.TextColumn("Status"),
                "canonical_name": st.column_config.TextColumn("Item"),
                "category": st.column_config.TextColumn("Category"),
                "days_since_last": st.column_config.NumberColumn("Days Ago", format="%d"),
                "avg_interval_days": st.column_config.NumberColumn("Avg Interval", format="%.1f"),
                "threshold_days": st.column_config.NumberColumn("Reorder At", format="%.1f", help="Days until overdue (category-adjusted)"),
                "buy_count": st.column_config.NumberColumn("Purchases"),
                "last_purchased": st.column_config.DateColumn("Last Buy"),
            },
            use_container_width=True,
            hide_index=True
        )

        # Auto-Replenish Integration
        st.divider()

        # Get list of overdue items only (not calibrating)
        overdue_items = velocity_df[velocity_df['status'] == "🔴 Overdue"]['canonical_name'].tolist()

        col1, col2 = st.columns([1, 3])
        with col1:
            if not overdue_items:
                st.button("All Caught Up", disabled=True)
            else:
                if st.button(f"Auto-Replenish ({len(overdue_items)} Items)"):
                    import subprocess
                    import time as t

                    status_box = st.status("AI Shopper Active...", expanded=True)

                    # Format command
                    cmd = [".venv/bin/python", "agents/cart_manager.py"] + overdue_items

                    status_box.write("Launching browser agent...")
                    status_box.write(f"Shopping list: {', '.join(overdue_items)}")

                    # Execute
                    try:
                        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                        status_box.code(result.stdout)
                        if result.returncode == 0:
                            status_box.update(label="Shopping Complete!", state="complete", expanded=False)
                            st.success("Items added to Instacart cart! Check your phone to finish checkout.")
                            t.sleep(2)
                            st.rerun()
                        else:
                            status_box.update(label="Agent Failed", state="error")
                            st.error(result.stderr)
                    except subprocess.TimeoutExpired:
                        status_box.update(label="Timeout", state="error")
                        st.error("Shopping agent timed out after 5 minutes")
                    except Exception as e:
                        status_box.update(label="System Error", state="error")
                        st.error(str(e))

        with col2:
            if overdue_items:
                st.caption(f"Will add to cart: {', '.join(overdue_items[:5])}{'...' if len(overdue_items) > 5 else ''}")


# Tab 2: Meal Planner
with tab2:
    st.header("Meal Planner")
    st.caption("AI-powered meal suggestions based on your current inventory")
    
    # Dietary preferences input
    col_pref1, col_pref2 = st.columns([2, 1])
    with col_pref1:
        dietary_prefs = st.text_input(
            "Dietary preferences (optional)",
            placeholder="e.g., vegetarian, low-carb, no dairy...",
            help="Add any dietary restrictions or preferences"
        )
    with col_pref2:
        num_meals = st.selectbox("Number of suggestions", [3, 5, 7], index=1)
    
    # Generate button
    if st.button("🍽️ Generate Meal Ideas", type="primary", use_container_width=True):
        with st.spinner("Analyzing your pantry and generating meal ideas... (this may take 30-60 seconds with 120b model)"):
            try:
                # Get inventory and patterns
                inventory = get_current_inventory()
                favorites = get_purchase_history_patterns()
                
                total_items = sum(len(items) for items in inventory.values())
                
                if total_items == 0:
                    st.warning("No items found in inventory. Make sure you have recent purchases in the database.")
                else:
                    # Generate suggestions
                    meals = suggest_meals(inventory, favorites, dietary_prefs if dietary_prefs else None, num_suggestions=num_meals)
                    
                    if meals:
                        st.session_state["meal_suggestions"] = meals
                        st.session_state["meal_inventory"] = inventory
                        st.success(f"Generated {len(meals)} meal ideas based on {total_items} items in stock!")
                    else:
                        st.error("Failed to generate meal suggestions. Check LLM service.")
                        
            except Exception as e:
                st.error(f"Error: {str(e)}")
    
    # Display meal suggestions
    if "meal_suggestions" in st.session_state and st.session_state["meal_suggestions"]:
        meals = st.session_state["meal_suggestions"]
        inventory = st.session_state.get("meal_inventory", {})
        
        # Show inventory summary in sidebar
        with st.sidebar:
            st.divider()
            st.subheader("📦 Current Inventory")
            for category, items in inventory.items():
                if items:
                    with st.expander(f"{category} ({len(items)})"):
                        st.write(", ".join(items[:10]))
                        if len(items) > 10:
                            st.caption(f"...and {len(items) - 10} more")
        
        st.divider()
        
        # Display meals in cards
        for i, meal in enumerate(meals):
            with st.container():
                col_info, col_status = st.columns([3, 1])
                
                with col_info:
                    st.subheader(f"{i+1}. {meal.get('name', 'Unnamed Meal')}")
                    
                    # Tags row
                    tags = []
                    if meal.get('category'):
                        tags.append(f"🍽️ {meal['category']}")
                    if meal.get('cook_time_minutes'):
                        tags.append(f"⏱️ {meal['cook_time_minutes']} min")
                    if meal.get('difficulty'):
                        tags.append(f"📊 {meal['difficulty']}")
                    
                    if tags:
                        st.caption(" | ".join(tags))
                
                with col_status:
                    missing = meal.get('missing_ingredients', [])
                    if not missing:
                        st.success("✨ Ready to cook!")
                    else:
                        st.warning(f"🛒 Need {len(missing)} items")
                
                # Ingredients
                col_have, col_need = st.columns(2)
                
                with col_have:
                    available = meal.get('available_ingredients', [])
                    if available:
                        st.markdown("**✅ You have:**")
                        st.write(", ".join(available))
                
                with col_need:
                    if missing:
                        st.markdown("**🛒 Need to buy:**")
                        st.write(", ".join(missing))
                
                # Description
                if meal.get('prep_description'):
                    st.markdown(f"**📝 How to make:** {meal['prep_description']}")
                
                st.divider()
        
        # Clear button
        if st.button("🗑️ Clear Suggestions"):
            del st.session_state["meal_suggestions"]
            if "meal_inventory" in st.session_state:
                del st.session_state["meal_inventory"]
            st.rerun()
    
    else:
        # Empty state
        st.info("👆 Click 'Generate Meal Ideas' to get personalized meal suggestions based on your current inventory")
        
        with st.expander("ℹ️ How it works"):
            st.markdown("""
            **The Meal Planner analyzes:**
            1. **Your current inventory** - Items purchased in the last 30 days that aren't overdue
            2. **Your purchase history** - What you frequently buy (to match your preferences)
            3. **Dietary preferences** - Any restrictions you specify
            
            **It then suggests meals that:**
            - Use as many ingredients you already have
            - Match your typical cooking style
            - Minimize additional shopping
            - Are practical (not gourmet, just good home cooking)
            
            *Powered by local LLM (gpt-oss:120b) - your data stays on your server!*
            """)


# Tab 3: Master Inventory
with tab3:
    st.header("Master Inventory")
    st.caption("Complete history of all purchased items")
    
    # Action buttons row
    col_fetch, col_classify, col_spacer = st.columns([1, 1, 2])
    
    with col_fetch:
        if st.button("📬 Fetch New Receipts", use_container_width=True, help="Scrape new receipts from Gmail (Instacart + Costco)"):
            import subprocess
            
            with st.status("Fetching receipts from Gmail...", expanded=True) as status:
                status.write("Connecting to Gmail IMAP...")
                status.write("Searching for Instacart and Costco receipts...")
                
                try:
                    result = subprocess.run(
                        [".venv/bin/python", "ingest/ingest_gmail.py"],
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    status.code(result.stdout)
                    
                    if result.returncode == 0:
                        status.update(label="✅ Receipt fetch complete!", state="complete", expanded=False)
                        st.success("New receipts imported! Run classifier to categorize new items.")
                        # Clear both caches to show new data
                        load_inventory_data.clear()
                        get_velocity_data.clear()
                        st.rerun()
                    else:
                        status.update(label="❌ Fetch failed", state="error")
                        st.error(result.stderr if result.stderr else "Unknown error")
                        
                except subprocess.TimeoutExpired:
                    status.update(label="⏱️ Timeout", state="error")
                    st.error("Receipt fetch timed out after 2 minutes")
                except Exception as e:
                    status.update(label="❌ Error", state="error")
                    st.error(str(e))
    
    with col_classify:
        if st.button("🏷️ Classify Products", use_container_width=True, help="Use AI to categorize unclassified products"):
            import subprocess
            
            with st.status("Classifying products with AI...", expanded=True) as status:
                status.write("Finding unclassified products...")
                status.write("Sending to LLM for categorization...")
                
                try:
                    result = subprocess.run(
                        [".venv/bin/python", "logic/classifier.py"],
                        capture_output=True,
                        text=True,
                        timeout=180
                    )
                    
                    status.code(result.stdout)
                    
                    if result.returncode == 0:
                        status.update(label="✅ Classification complete!", state="complete", expanded=False)
                        st.success("Products classified! Refresh to see updates.")
                        load_inventory_data.clear()
                        get_velocity_data.clear()
                        st.rerun()
                    else:
                        status.update(label="❌ Classification failed", state="error")
                        st.error(result.stderr if result.stderr else "Unknown error")
                        
                except subprocess.TimeoutExpired:
                    status.update(label="⏱️ Timeout", state="error")
                    st.error("Classification timed out after 3 minutes")
                except Exception as e:
                    status.update(label="❌ Error", state="error")
                    st.error(str(e))
    
    st.divider()

    # Search
    search = st.text_input("🔍 Search products", placeholder="Type to filter...")

    display_df = filtered_df.copy()

    if search:
        mask = (
            display_df['raw_name'].str.contains(search, case=False, na=False) |
            display_df['canonical_name'].str.contains(search, case=False, na=False)
        )
        display_df = display_df[mask]

    # Format for display
    display_cols = ['canonical_name', 'raw_name', 'category', 'inventory_status',
                    'last_purchase', 'days_since_purchase', 'total_qty', 'avg_price']

    display_df = display_df[display_cols].copy()
    display_df.columns = ['Name', 'Raw Name', 'Category', 'Status',
                          'Last Purchase', 'Days Ago', 'Total Qty', 'Avg Price']

    # Format price
    display_df['Avg Price'] = display_df['Avg Price'].apply(
        lambda x: f"${x:.2f}" if pd.notna(x) else "-"
    )

    # Format date
    display_df['Last Purchase'] = display_df['Last Purchase'].dt.strftime('%Y-%m-%d')

    # Display with styling
    st.dataframe(
        display_df.style.applymap(
            style_inventory_status,
            subset=['Status']
        ),
        use_container_width=True,
        hide_index=True
    )

    # Stats
    st.divider()
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Products", len(filtered_df))
    with col2:
        in_stock = len(filtered_df[filtered_df['inventory_status'] == 'IN_STOCK'])
        st.metric("In Stock", in_stock)
    with col3:
        avg_days = filtered_df['days_since_purchase'].mean()
        st.metric("Avg Days Since Purchase", f"{avg_days:.0f}" if pd.notna(avg_days) else "-")

# Tab 4: Financials
with tab4:
    st.header("Financial Overview")

    # 1. Monthly Budget Configuration
    budget = st.slider("Monthly Budget Target", 200, 1000, 500, step=50)

    # 2. Get Financial Data
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        fin_query = """
            SELECT
                pur.purchase_date as date,
                (pur.quantity * pur.unit_price) as cost,
                p.category
            FROM purchases pur
            JOIN products p ON pur.product_id = p.id
            WHERE pur.purchase_date >= CURRENT_DATE - INTERVAL '90 days'
        """
        fin_df = pd.read_sql(fin_query, conn)
        conn.close()
        fin_df['date'] = pd.to_datetime(fin_df['date'])

        # 3. Calculate Metrics
        current_month = pd.Timestamp.now().strftime('%Y-%m')
        current_month_df = fin_df[fin_df['date'].dt.strftime('%Y-%m') == current_month]

        spend_mtd = current_month_df['cost'].sum()
        avg_weekly = fin_df.set_index('date').resample('W')['cost'].sum().mean()
        days_in_month = pd.Timestamp.now().day
        projected = spend_mtd / max(1, days_in_month) * 30

        # KPI Row
        kpi1, kpi2, kpi3 = st.columns(3)
        remaining = budget - spend_mtd
        delta_color = "normal" if remaining > 0 else "inverse"
        kpi1.metric("Spend MTD", f"${spend_mtd:.2f}", delta=f"${remaining:.2f} Remaining")
        kpi2.metric("Avg Weekly Spend", f"${avg_weekly:.2f}")
        kpi3.metric("Projected Total", f"${projected:.2f}")

        # 4. Progress Bar
        pct_used = min(1.0, spend_mtd / budget)
        st.caption(f"Budget Utilization: {int(pct_used * 100)}%")
        st.progress(pct_used)

        # 5. Charts
        st.divider()
        col_chart1, col_chart2 = st.columns(2)

        with col_chart1:
            st.subheader("Spend by Category")
            cat_spend = fin_df.groupby('category')['cost'].sum().sort_values(ascending=True)
            st.bar_chart(cat_spend)

        with col_chart2:
            st.subheader("Weekly Trend")
            weekly_trend = fin_df.set_index('date').resample('W')['cost'].sum()
            st.line_chart(weekly_trend)

        # 6. Monthly History Table
        st.divider()
        st.subheader("Monthly History")
        monthly_query = """
            SELECT
                TO_CHAR(purchase_date, 'YYYY-MM') as month,
                SUM(quantity * unit_price) as total_spend,
                COUNT(*) as items_bought
            FROM purchases
            GROUP BY 1
            ORDER BY 1 DESC
        """
        conn = psycopg2.connect(**DB_PARAMS)
        monthly_df = pd.read_sql(monthly_query, conn)
        conn.close()
        monthly_df.columns = ['Month', 'Total Spend', 'Items']
        monthly_df['Total Spend'] = monthly_df['Total Spend'].apply(lambda x: f"${x:.2f}")
        st.dataframe(monthly_df, use_container_width=True, hide_index=True)

    except Exception as e:
        st.error(f"Failed to load financial data: {e}")


# Tab 5: Receipt Scanner
with tab5:
    st.header("Receipt Scanner")
    st.caption("AI-powered receipt OCR using BakLLaVA (100% local, free)")
    
    # Initialize OCR
    ocr = get_ocr()
    
    # System status in sidebar (only show when on this tab)
    with st.sidebar:
        st.divider()
        st.subheader("🤖 OCR Status")
        health = ocr.health_check()
        
        if health["status"] == "healthy":
            st.success("✅ BakLLaVA Ready")
        elif health["status"] == "model_missing":
            st.warning("⚠️ BakLLaVA not found")
            st.code("ollama pull bakllava")
        else:
            st.error("❌ Ollama not running")
    
    # File upload
    uploaded_file = st.file_uploader(
        "Upload Receipt Image",
        type=["jpg", "jpeg", "png", "webp"],
        help="Take a photo of your grocery receipt"
    )
    
    if uploaded_file:
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.subheader("📷 Receipt Image")
            st.image(uploaded_file, use_container_width=True)
        
        with col2:
            st.subheader("🔍 Extracted Items")
            
            if st.button("🚀 Extract Items", type="primary", use_container_width=True):
                with st.spinner("Analyzing receipt with AI... (30-60 seconds)"):
                    try:
                        image_bytes = uploaded_file.getvalue()
                        items = ocr.parse_items(image_bytes=image_bytes)
                        
                        if items:
                            st.session_state["scanned_items"] = items
                            st.success(f"Found {len(items)} items!")
                        else:
                            st.warning("No items detected. Try a clearer image.")
                            st.caption("Raw text extraction:")
                            raw_text = ocr.extract_text(image_bytes=image_bytes)
                            st.text_area("Raw OCR Output", raw_text, height=200)
                            
                    except Exception as e:
                        st.error(f"OCR failed: {str(e)}")
            
            # Display extracted items
            if "scanned_items" in st.session_state and st.session_state["scanned_items"]:
                items = st.session_state["scanned_items"]
                
                scan_df = pd.DataFrame(items)
                scan_df = scan_df[["name", "quantity", "unit_price", "total_price"]]
                scan_df.columns = ["Item Name", "Qty", "Unit Price", "Total"]
                
                edited_df = st.data_editor(
                    scan_df,
                    num_rows="dynamic",
                    use_container_width=True,
                    column_config={
                        "Item Name": st.column_config.TextColumn(width="large"),
                        "Qty": st.column_config.NumberColumn(min_value=1, max_value=100),
                        "Unit Price": st.column_config.NumberColumn(format="$%.2f", min_value=0),
                        "Total": st.column_config.NumberColumn(format="$%.2f", min_value=0),
                    }
                )
                
                total = edited_df["Total"].sum()
                st.metric("Receipt Total", f"${total:.2f}")
                
                st.divider()
                
                col_save, col_clear = st.columns(2)
                
                with col_save:
                    if st.button("💾 Save to Inventory", type="primary", use_container_width=True):
                        save_items = []
                        for _, row in edited_df.iterrows():
                            save_items.append({
                                "name": row["Item Name"],
                                "quantity": int(row["Qty"]),
                                "unit_price": float(row["Unit Price"]),
                            })
                        
                        result = save_scanned_items_to_db(save_items)
                        
                        if result["errors"]:
                            st.warning(f"Saved {result['inserted']} items with errors:")
                            for err in result["errors"]:
                                st.text(f"  ⚠️ {err}")
                        else:
                            st.success(f"✅ Saved {result['inserted']} items to inventory!")
                            st.balloons()
                            del st.session_state["scanned_items"]
                            st.rerun()
                
                with col_clear:
                    if st.button("🗑️ Clear", use_container_width=True):
                        del st.session_state["scanned_items"]
                        st.rerun()
    
    else:
        st.info("👆 Upload a receipt image to get started")
        
        with st.expander("🧪 Test AI Connection"):
            if st.button("Run Health Check"):
                health = ocr.health_check()
                st.json(health)
