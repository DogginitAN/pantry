from dotenv import load_dotenv
import os
load_dotenv()

#!/usr/bin/env python3
"""
Smart Meal Planner - Suggest meals based on current inventory
Uses LLM to recommend recipes you can make with what you have
"""

import psycopg2
import openai
import os
import json
from datetime import datetime, timedelta

# Database configuration
DB_PARAMS = {
    "host": "localhost",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": "pantry_db"
}

# LLM configuration
llm_client = openai.OpenAI(
    base_url="http://localhost:4000/v1",
    api_key=os.getenv("LITELLM_API_KEY")
)

# =============================================================================
# MEAL PLANNER SHELF LIFE SETTINGS
# These are MORE GENEROUS than dashboard thresholds because for meal planning
# we want to include anything the user likely still has available to cook with.
# The dashboard uses stricter thresholds for reorder suggestions.
# =============================================================================

# For items with 3+ purchases, multiply avg_interval by this threshold
CATEGORY_THRESHOLDS = {
    'Produce': 1.2,      # Produce can last a bit beyond typical buy cycle
    'Dairy': 1.5,        # Cheese, butter last longer than milk
    'Meat': 1.5,         # Includes bacon, deli meats that last longer
    'Frozen': 2.0,       # Frozen items last very long
    'Pantry': 2.0,       # Shelf-stable - very relaxed
    'Household': 3.0,    # Non-perishables
}
DEFAULT_THRESHOLD = 1.5

# Default shelf life in days for items with < 3 purchases
# These are REALISTIC shelf lives for meal planning purposes
CATEGORY_DEFAULT_SHELF_LIFE = {
    'Produce': 21,       # Most produce ~3 weeks if stored properly
    'Dairy': 45,         # Cheese 4-6 weeks, butter longer, milk shorter
    'Meat': 30,          # Includes cured meats, bacon, deli - fresh meat would be frozen
    'Frozen': 180,       # Frozen items ~6 months
    'Pantry': 365,       # Pantry staples ~1 year
    'Household': 365,    # Household items ~1 year
}
DEFAULT_SHELF_LIFE = 60  # Default to 2 months


def get_current_inventory():
    """
    Get list of products user likely has in stock for meal planning.
    
    Uses generous thresholds since we want to include anything the user
    might still have available to cook with, not just items that are "fresh".
    """
    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()
    
    query = """
    WITH purchase_metrics AS (
        SELECT 
            p.canonical_name,
            p.category,
            MAX(pur.purchase_date) as last_purchase,
            COUNT(pur.id) as buy_count,
            MIN(pur.purchase_date) as first_purchase
        FROM purchases pur
        JOIN products p ON pur.product_id = p.id
        WHERE p.canonical_name IS NOT NULL
        GROUP BY p.canonical_name, p.category
    )
    SELECT 
        canonical_name,
        category,
        last_purchase,
        buy_count,
        CASE 
            WHEN buy_count >= 3 THEN
                ROUND((last_purchase::date - first_purchase::date)::numeric / (buy_count - 1), 1)
            ELSE NULL
        END as avg_interval_days,
        CURRENT_DATE - last_purchase::date as days_since_last
    FROM purchase_metrics
    ORDER BY category, canonical_name
    """
    
    cursor.execute(query)
    results = cursor.fetchall()
    conn.close()
    
    # Group by category
    inventory = {
        'Produce': [],
        'Meat': [],
        'Dairy': [],
        'Pantry': [],
        'Frozen': [],
        'Household': [],
        'Other': []
    }
    
    for name, category, last_purchase, buy_count, avg_interval, days_since in results:
        if category is None:
            category = 'Other'
        
        # Determine effective shelf life
        if avg_interval is not None and buy_count >= 3:
            threshold = CATEGORY_THRESHOLDS.get(category, DEFAULT_THRESHOLD)
            effective_shelf_life = float(avg_interval) * threshold
        else:
            effective_shelf_life = CATEGORY_DEFAULT_SHELF_LIFE.get(category, DEFAULT_SHELF_LIFE)
        
        # Item is "in stock" if not past its effective shelf life
        if days_since <= effective_shelf_life:
            if category in inventory:
                inventory[category].append(name)
            else:
                inventory['Other'].append(name)
    
    return inventory


def get_purchase_history_patterns():
    """
    Analyze what types of meals user typically buys ingredients for.
    Returns common ingredient combinations.
    """
    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()
    
    query = """
    SELECT p.canonical_name, COUNT(*) as frequency
    FROM purchases pur
    JOIN products p ON pur.product_id = p.id
    WHERE p.canonical_name IS NOT NULL
    GROUP BY p.canonical_name
    ORDER BY frequency DESC
    LIMIT 50
    """
    
    cursor.execute(query)
    favorites = [row[0] for row in cursor.fetchall()]
    conn.close()
    
    return favorites


def suggest_meals(inventory, favorites, dietary_prefs=None, num_suggestions=5):
    """
    Use LLM to suggest meals based on current inventory.
    """
    # Format inventory for prompt
    inventory_text = ""
    for category, items in inventory.items():
        if items:
            inventory_text += f"\n{category}: {', '.join(items)}"
    
    favorites_text = ", ".join(favorites[:20])
    
    system_prompt = """You are a meal planning assistant. Suggest practical, delicious meals 
based on what the user already has in their pantry. Focus on:
1. Using as many current ingredients as possible
2. Suggesting meals similar to their purchase history
3. Minimizing additional purchases
4. Being realistic (not gourmet, just good home cooking)"""
    
    user_prompt = f"""Based on this inventory, suggest {num_suggestions} meal ideas.

CURRENT INVENTORY:{inventory_text}

PURCHASE HISTORY (frequently bought items):
{favorites_text}

{"DIETARY PREFERENCES: " + dietary_prefs if dietary_prefs else ""}

For each meal, provide:
1. Meal name
2. What you can make with current ingredients
3. What you'd need to buy (if anything)
4. Brief preparation description (2-3 sentences)

Return as JSON array:
[
  {{
    "name": "Meal Name",
    "category": "Dinner|Lunch|Breakfast",
    "available_ingredients": ["ingredient1", "ingredient2"],
    "missing_ingredients": ["ingredient3"],
    "prep_description": "Quick description...",
    "difficulty": "Easy|Medium|Hard",
    "cook_time_minutes": 30
  }}
]"""
    
    try:
        response = llm_client.chat.completions.create(
            model="ollama/gpt-oss:120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=2000
        )
        
        content = response.choices[0].message.content
        
        import re
        content = re.sub(r'```json\s*', '', content)
        content = re.sub(r'```\s*$', '', content)
        content = content.strip()
        
        meals = json.loads(content)
        return meals
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON: {e}")
        print(f"Raw response: {content}")
        return []
    except Exception as e:
        print(f"❌ LLM request failed: {e}")
        return []


def print_meal_suggestions(meals):
    """Pretty print meal suggestions."""
    print("\n" + "=" * 60)
    print("🍽️  SMART MEAL SUGGESTIONS")
    print("=" * 60)
    
    for i, meal in enumerate(meals, 1):
        print(f"\n{i}. {meal['name']} ({meal.get('category', 'Meal')})")
        print(f"   ⏱️  {meal.get('cook_time_minutes', '?')} minutes | {meal.get('difficulty', 'Unknown')} difficulty")
        
        if meal.get('available_ingredients'):
            print(f"   ✅ You have: {', '.join(meal['available_ingredients'][:5])}")
            if len(meal['available_ingredients']) > 5:
                print(f"      ...and {len(meal['available_ingredients']) - 5} more")
        
        if meal.get('missing_ingredients'):
            print(f"   🛒 Need to buy: {', '.join(meal['missing_ingredients'])}")
        else:
            print(f"   ✨ No shopping needed!")
        
        print(f"   📝 {meal.get('prep_description', 'No description')}")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    import sys
    
    print("🔍 Analyzing your pantry...")
    inventory = get_current_inventory()
    
    total_items = sum(len(items) for items in inventory.values())
    print(f"   Found {total_items} items currently in stock")
    
    for category, items in inventory.items():
        if items:
            print(f"   - {category}: {len(items)} items")
    
    print("\n📊 Analyzing purchase patterns...")
    favorites = get_purchase_history_patterns()
    print(f"   Identified {len(favorites)} frequently purchased items")
    
    dietary_prefs = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else None
    if dietary_prefs:
        print(f"\n🥗 Dietary preferences: {dietary_prefs}")
    
    print("\n🤖 Generating meal suggestions...")
    meals = suggest_meals(inventory, favorites, dietary_prefs, num_suggestions=5)
    
    if meals:
        print_meal_suggestions(meals)
    else:
        print("\n❌ Failed to generate meal suggestions")
        print("   Check LiteLLM service: http://localhost:4000/v1/models")
