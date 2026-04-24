"""
German Car Reliability Dashboard - API Server

Run with:
    uvicorn backend.main:app --reload

Or:
    python -m uvicorn backend.main:app --reload

The --reload flag auto-restarts when you edit code.
Open http://127.0.0.1:8000 in your browser.
API docs at http://127.0.0.1:8000/docs
"""

import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from routes import router

app = FastAPI(
    title="German Car Reliability API",
    description="Complaint data for Mercedes-Benz, BMW, Audi, VW, and Porsche",
    version="0.1.0",
)

# Include the API routes
app.include_router(router)

# Serve frontend files
frontend_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "frontend"
)

if os.path.exists(frontend_dir):
    @app.get("/")
    def serve_home():
        return FileResponse(os.path.join(frontend_dir, "index.html"))

    app.mount(
        "/static",
        StaticFiles(directory=frontend_dir),
        name="static",
    )