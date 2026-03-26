from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import flights, optimize, watch

app = FastAPI(
    title="FlightPath API",
    description="Multi-city flight route optimizer",
    version="0.1.0",
)

# CORS
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(flights.router)
app.include_router(optimize.router)
app.include_router(watch.router)


@app.get("/")
async def root():
    return {
        "app": "FlightPath",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
