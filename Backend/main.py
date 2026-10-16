"""
Main FastAPI application entry point.
"""

import os
import sys
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

import config
from database.session import init_db
from api.v1 import router as api_router

# Paths
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "Frontend"


# Create FastAPI app
app = FastAPI(
    title=config.settings.APP_NAME,
    version=config.settings.APP_VERSION,
    description="CPU Scheduling Simulator API",
    docs_url="/docs" if config.settings.DEBUG else None,
    redoc_url="/redoc" if config.settings.DEBUG else None,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()


@app.get("/", include_in_schema=False)
async def read_root():
    """Serve the account sign-in page."""
    return FileResponse(FRONTEND_DIR / "auth.html")


@app.get("/workspace", include_in_schema=False)
async def read_workspace():
    """Workspace endpoint."""
    return FileResponse(FRONTEND_DIR / "workspace.html")


@app.get("/simulator", include_in_schema=False)
async def read_simulator():
    """Simulator endpoint."""
    return FileResponse(FRONTEND_DIR / "index.html")


# Include API router
app.include_router(api_router)


# Serve static files from Frontend directory
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=config.settings.DEBUG
    )
