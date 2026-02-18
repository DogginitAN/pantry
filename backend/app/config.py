"""
Backend configuration for Pantry FastAPI app.
Loads DB and LLM settings from environment variables.
Mirrors patterns from ../config.py.
"""
import os
import sys
from dotenv import load_dotenv

# Load .env from project root (one level up from backend/)
_env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(_env_path)

# Database configuration
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "pantry_db")
DB_USER = os.getenv("DB_USER", "dbuser")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# LLM configuration
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://localhost:4000/v1")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# AI provider: 'local' (Ollama) or 'cloud' (LiteLLM/Claude)
AI_PROVIDER = os.getenv("AI_PROVIDER", "local")

# OpenAI-compatible key (optional)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def get_db_url() -> str:
    """Returns SQLAlchemy-compatible PostgreSQL connection URL."""
    return f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
