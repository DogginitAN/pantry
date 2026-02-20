"""
Pantry FastAPI application entry point.
"""
import logging
import os
from contextlib import asynccontextmanager

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import inventory, meals, classifier, spending, export, receipts

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL = "llama3.2-vision:11b"


def _prewarm_vision_model():
    """Send a tiny request to load the vision model into VRAM."""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL.rstrip('/')}/api/chat",
            json={
                "model": VISION_MODEL,
                "messages": [{"role": "user", "content": "hello"}],
                "stream": False,
                "options": {"num_predict": 1},
            },
            timeout=120,
        )
        logger.info("Vision model pre-warm: status=%d", resp.status_code)
    except Exception:
        logger.warning("Vision model pre-warm failed (model may cold-start on first upload)", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    asyncio.get_event_loop().run_in_executor(None, _prewarm_vision_model)
    yield


app = FastAPI(title="Project Pantry API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3060", "http://0.0.0.0:3060"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(inventory.router)
app.include_router(meals.router)
app.include_router(classifier.router)
app.include_router(spending.spending_router)
app.include_router(spending.settings_router)
app.include_router(export.router, prefix="/api/export")
app.include_router(receipts.router)


@app.get("/health")
def health():
    return {"status": "ok"}
