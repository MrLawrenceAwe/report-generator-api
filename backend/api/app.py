import asyncio
import json
import os
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routers import reports, suggestions, topics

app = FastAPI(title="Explorer", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reports.router)
app.include_router(suggestions.router)
app.include_router(topics.router)

@app.get("/_routes")
def list_routes():
    return {"paths": [route.path for route in app.routes]}

