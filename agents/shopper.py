#!/usr/bin/env python3
"""
Pantry Shopper Agent - Instacart Automation
Verifies session and performs shopping tasks.
"""

from playwright.sync_api import sync_playwright
import time
import os
import json


def verify_session():
    if not os.path.exists("instacart_state.json"):
        print("Error: instacart_state.json missing.")
        return

    # Load cookies from state file
    with open("instacart_state.json", 'r') as f:
        state = json.load(f)

    cookies = state.get("cookies", [])
    print(f"Loaded {len(cookies)} cookies")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )

        # Add cookies one by one, skipping problematic ones
        added = 0
        failed = []
        for cookie in cookies:
            try:
                context.add_cookies([cookie])
                added += 1
            except Exception as e:
                failed.append((cookie["name"], str(e)))

        print(f"Added {added} cookies, {len(failed)} failed")
        if failed:
            for name, err in failed:
                print(f"  FAILED: {name}")
                print(f"    Error: {err[:100]}")

        page = context.new_page()

        print("Navigating to Instacart (Your Orders)...")
        page.goto("https://www.instacart.com/store/account/orders")
        time.sleep(8)

        print(f"Final URL: {page.url}")
        print(f"Title: {page.title()}")

        # Screenshot to visually confirm login
        page.screenshot(path="dashboard/session_verify.png")
        print("Verification screenshot saved to dashboard/session_verify.png")

        browser.close()


if __name__ == "__main__":
    verify_session()
