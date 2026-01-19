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
