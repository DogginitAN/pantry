"""
Pantry FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import inventory, meals, classifier, spending, export, receipts

app = FastAPI(title="Project Pantry API", version="0.1.0")

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
