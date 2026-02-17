from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.core.config import settings
from app.core.database import engine, Base
from sqlalchemy import text

# Import routers
from app.api import cv, optimize
from app.api.competence import router as competence_router

# Import all models so Base.metadata knows about them
from app.models import cv as cv_models  # noqa: F401
from app.models import competence as competence_models  # noqa: F401

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Create database tables
Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    conn.execute(
        text(
            """
        ALTER TABLE cvs ADD COLUMN IF NOT EXISTS title VARCHAR
    """
        )
    )
    conn.commit()

with engine.connect() as conn:
    conn.execute(
        text(
            """
        ALTER TABLE skills_collection 
        ADD COLUMN IF NOT EXISTS source_cv_ids JSONB NOT NULL DEFAULT '[]'
    """
        )
    )
    conn.execute(
        text(
            """
        ALTER TABLE experiences_pool 
        ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE
    """
        )
    )
    conn.commit()

with engine.connect() as conn:
    conn.execute(
        text(
            "ALTER TABLE experiences_pool ADD COLUMN IF NOT EXISTS related_skills JSONB DEFAULT '[]'"
        )
    )
    conn.execute(
        text(
            "ALTER TABLE experiences_pool ADD COLUMN IF NOT EXISTS source_cv_ids JSONB DEFAULT '[]'"
        )
    )
    conn.commit()

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    description="AI-powered CV optimization service with semantic search",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


# Include API routers
app.include_router(cv.router, prefix="/api/v1")
app.include_router(optimize.router, prefix="/api/v1")
app.include_router(competence_router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
