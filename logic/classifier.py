from dotenv import load_dotenv
import os
load_dotenv()

#!/usr/bin/env python3
"""
Pantry Taxonomist - Local LLM Classification Layer
Uses gpt-oss:20b via LiteLLM gateway to classify grocery items.
"""

import openai
import psycopg2
import json
import re

# LiteLLM Gateway configuration
import os

client = openai.OpenAI(
    base_url="http://localhost:4000/v1",
    api_key=os.getenv("LITELLM_API_KEY")
)

# Database configuration
DB_PARAMS = {
    "host": "localhost",
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": "pantry_db"
}

SYSTEM_PROMPT = "You are a data cleaning assistant. Output only valid JSON."

USER_PROMPT_TEMPLATE = """Classify this grocery item. Return JSON with 'clean_name' (generic name) and 'category' (Produce, Dairy, Meat, Pantry, Frozen, Household).

Item: {raw_name}"""


def strip_markdown_json(text: str) -> str:
    """Remove markdown code blocks if present."""
    # Handle ```json ... ``` or ``` ... ```
    pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
    match = re.search(pattern, text)
    if match:
        return match.group(1).strip()
    return text.strip()


def classify_item(raw_name: str) -> dict:
    """Call local LLM to classify a grocery item."""
    response = client.chat.completions.create(
        model="ollama/gpt-oss:20b",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(raw_name=raw_name)}
        ],
        temperature=0.1  # Low temperature for consistent output
    )

    content = response.choices[0].message.content
    cleaned = strip_markdown_json(content)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"  Warning: Failed to parse JSON for '{raw_name}': {e}")
        print(f"  Raw response: {content}")
        return {"clean_name": raw_name, "category": "Unknown"}


def main():
    print("Pantry Taxonomist - Starting classification...")
    print("-" * 50)

    conn = psycopg2.connect(**DB_PARAMS)
    cursor = conn.cursor()

    try:
        # Get unclassified products
        cursor.execute("""
            SELECT id, raw_name
            FROM products
            WHERE canonical_name IS NULL OR canonical_name = raw_name
        """)
        products = cursor.fetchall()

        if not products:
            print("No products to classify.")
            return

        print(f"Found {len(products)} product(s) to classify\n")

        for product_id, raw_name in products:
            print(f"Processing: {raw_name}")

            # Classify using local LLM
            result = classify_item(raw_name)
            clean_name = result.get("clean_name", raw_name)
            category = result.get("category", "Unknown")

            # Update database
            cursor.execute("""
                UPDATE products
                SET canonical_name = %s, category = %s
                WHERE id = %s
            """, (clean_name, category, product_id))

            print(f"  Mapped: {raw_name} -> {clean_name} [{category}]")

        conn.commit()
        print("-" * 50)
        print(f"Classification complete: {len(products)} item(s) processed")

    except Exception as e:
        conn.rollback()
        print(f"Error during classification: {e}")
        raise
    finally:
        cursor.close()
        conn.close()


if __name__ == "__main__":
    main()
