#!/usr/bin/env python3
"""
Gmail OTP Helper - Fetches verification codes from Gmail
Used by shopper agent for Instacart 2FA.
"""

import imaplib
import email
import re
import os
import time
from dotenv import load_dotenv

load_dotenv()


def get_instacart_code(retries=30, delay=5):
    """
    Scan Gmail for Instacart verification code.

    Args:
        retries: Number of attempts to find the code
        delay: Seconds between retries

    Returns:
        6-digit code string or None
    """
    username = os.getenv("EMAIL_USER")
    password = os.getenv("EMAIL_PASS")

    if not username or not password:
        print("ERROR: Gmail credentials missing from .env")
        return None

    print(f"Scanning {username} for Instacart code...")

    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com")
        mail.login(username, password)
    except Exception as e:
        print(f"ERROR: Failed to connect to Gmail: {e}")
        return None

    for i in range(retries):
        mail.select("inbox")

        # Search for UNSEEN emails from Instacart
        status, messages = mail.search(None, '(FROM "instacart.com" UNSEEN)')

        if status == "OK" and messages[0]:
            email_ids = messages[0].split()

            # Process newest first
            for num in reversed(email_ids):
                _, msg_data = mail.fetch(num, "(RFC822)")
                msg = email.message_from_bytes(msg_data[0][1])

                subject = msg["Subject"] or ""
                print(f"   Checking: {subject[:60]}...")

                # Try to find 6-digit code in subject first
                match = re.search(r'\b(\d{6})\b', subject)

                if not match:
                    # Check body if not in subject
                    body_text = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            if content_type == "text/plain":
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body_text = payload.decode('utf-8', errors='replace')
                                    break
                            elif content_type == "text/html" and not body_text:
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body_text = payload.decode('utf-8', errors='replace')
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body_text = payload.decode('utf-8', errors='replace')

                    match = re.search(r'\b(\d{6})\b', body_text)

                if match:
                    code = match.group(1)
                    print(f"FOUND CODE: {code}")
                    mail.close()
                    mail.logout()
                    return code

        print(f"   ...attempt {i + 1}/{retries} (waiting for email)...")
        time.sleep(delay)

    print("ERROR: Code not found within timeout.")
    mail.close()
    mail.logout()
    return None


if __name__ == "__main__":
    # Test standalone
    code = get_instacart_code(retries=3, delay=2)
    if code:
        print(f"Retrieved code: {code}")
    else:
        print("No code found.")
