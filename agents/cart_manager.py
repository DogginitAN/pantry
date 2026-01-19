#!/usr/bin/env python3
"""
Cart Manager - Adds multiple items to Instacart cart in a single session.
Usage: python cart_manager.py "Item 1" "Item 2" "Item 3"
"""

import sys
from playwright.sync_api import sync_playwright
import time

STATE_FILE = "instacart_state.json"
SCREENSHOT_DIR = "dashboard"


def shop_for_items(item_list):
    if not item_list:
        print("No items provided.")
        return

    with sync_playwright() as p:
        print("Launching Shopper Agent...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=STATE_FILE,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = context.new_page()

        print("Entering Store...")
        page.goto("https://www.instacart.com/store")
        time.sleep(5)  # Allow load

        # Dismiss any modal/overlay that might be blocking
        def dismiss_modals():
            """Attempt to dismiss any blocking modals."""
            try:
                # Try pressing Escape to close modals
                page.keyboard.press("Escape")
                time.sleep(0.5)

                # Try clicking outside any modal (click on body)
                page.evaluate("document.body.click()")
                time.sleep(0.3)

                # Look for common close button patterns
                close_selectors = [
                    'button[aria-label="Close"]',
                    'button[aria-label="close"]',
                    '[data-testid="modal-close"]',
                    '.modal-close',
                    'button:has-text("Close")',
                    'button:has-text("No thanks")',
                    'button:has-text("Maybe later")',
                ]
                for selector in close_selectors:
                    try:
                        close_btn = page.locator(selector).first
                        if close_btn.is_visible(timeout=500):
                            close_btn.click()
                            time.sleep(0.5)
                            break
                    except:
                        continue
            except:
                pass

        # Dismiss modals on initial load
        dismiss_modals()

        results = {"success": [], "failed": []}

        for item_name in item_list:
            print(f"\nProcessing: {item_name}")
            try:
                # Dismiss any modals before searching
                dismiss_modals()

                # 1. Search - find and use search box
                search_selectors = [
                    'input[placeholder*="Search"]',
                    'input[aria-label*="Search"]',
                    'input[type="search"]',
                ]

                search_box = None
                for selector in search_selectors:
                    try:
                        search_box = page.locator(selector).first
                        if search_box.is_visible(timeout=2000):
                            break
                    except:
                        continue

                if not search_box:
                    print(f"  Could not find search box for {item_name}")
                    results["failed"].append(item_name)
                    continue

                # Clear and fill search (use force=True to bypass intercepting elements)
                search_box.click(force=True)
                search_box.fill("")
                time.sleep(0.3)
                search_box.fill(item_name)
                search_box.press("Enter")

                # Wait for results
                time.sleep(4)

                # 2. Add First Result
                add_selectors = [
                    'button[aria-label*="Add"]',
                    'button:has-text("Add")',
                ]

                add_btn = None
                for selector in add_selectors:
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=2000):
                            add_btn = btn
                            break
                    except:
                        continue

                if add_btn:
                    add_btn.click(force=True)
                    print(f"  Added {item_name} to cart")
                    results["success"].append(item_name)
                    time.sleep(2)  # Allow cart to update
                else:
                    print(f"  Could not find 'Add' button for {item_name}")
                    page.screenshot(path=f"{SCREENSHOT_DIR}/error_{item_name.replace(' ', '_')}.png")
                    results["failed"].append(item_name)

                # Return to store page for clean state before next item
                page.goto("https://www.instacart.com/store")
                time.sleep(3)
                dismiss_modals()

            except Exception as e:
                print(f"  Failed to add {item_name}: {e}")
                results["failed"].append(item_name)
                # Try to recover by navigating back to store
                try:
                    page.goto("https://www.instacart.com/store")
                    time.sleep(3)
                    dismiss_modals()
                except:
                    pass

        # Final screenshot
        page.screenshot(path=f"{SCREENSHOT_DIR}/shopping_complete.png")

        print("\nSaving Session & Finishing...")
        context.storage_state(path=STATE_FILE)
        browser.close()

        # Summary
        print("\n" + "=" * 40)
        print("SHOPPING RUN COMPLETE")
        print("=" * 40)
        print(f"Added: {len(results['success'])} items")
        if results["success"]:
            for item in results["success"]:
                print(f"  + {item}")
        if results["failed"]:
            print(f"Failed: {len(results['failed'])} items")
            for item in results["failed"]:
                print(f"  - {item}")

        return results


if __name__ == "__main__":
    items = sys.argv[1:]
    if items:
        shop_for_items(items)
    else:
        print("Usage: python cart_manager.py 'Item 1' 'Item 2'")
