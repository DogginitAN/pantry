#!/usr/bin/env python3
"""
Session Forge - Converts raw browser cookies to Playwright state file.
"""

import json
import os

RAW_FILE = "dashboard/raw_cookies.txt"
STATE_FILE = "instacart_state.json"


def forge_session():
    if not os.path.exists(RAW_FILE):
        print(f"Error: {RAW_FILE} not found.")
        return

    with open(RAW_FILE, 'r') as f:
        raw_data = f.read().strip()

    cookies = []
    # Parse the raw cookie string (key=value; key2=value2)
    pairs = raw_data.split(';')

    for pair in pairs:
        if '=' in pair:
            parts = pair.strip().split('=', 1)
            if len(parts) == 2:
                key, value = parts
                key = key.strip()
                value = value.strip()

                # __Host- prefixed cookies CANNOT have a domain attribute
                # Use 'url' only (not path) per Playwright requirements
                if key.startswith('__Host-'):
                    cookies.append({
                        "name": key,
                        "value": value,
                        "url": "https://www.instacart.com/"
                    })
                else:
                    cookies.append({
                        "name": key,
                        "value": value,
                        "domain": ".instacart.com",
                        "path": "/"
                    })

    state = {
        "cookies": cookies,
        "origins": []
    }

    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

    print(f"Forged {len(cookies)} cookies into {STATE_FILE}")

    # Show which cookies are __Host- prefixed
    host_cookies = [c for c in cookies if c["name"].startswith("__Host-")]
    if host_cookies:
        print(f"Special handling for {len(host_cookies)} __Host- cookie(s)")


if __name__ == "__main__":
    forge_session()
