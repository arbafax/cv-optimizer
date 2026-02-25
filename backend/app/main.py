from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from app.core.config import settings
from app.core.database import engine, Base

# Import routers
from app.api import cv, optimize
from app.api.competence import router as competence_router
from app.api.auth import router as auth_router
from app.api.candidate_profile import router as sokprofil_router
from app.api.kandidater import router as kandidater_router

# Import all models so Base.metadata knows about them
from app.models import cv as cv_models                   # noqa: F401
from app.models import competence as competence_models   # noqa: F401
from app.models import user as user_models               # noqa: F401
from app.models import search_profile as sp_models       # noqa: F401
from app.models import candidate_profile as cp_models   # noqa: F401
from app.models import candidate_bank as cb_models      # noqa: F401

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Tabellmigrationer som måste köras FÖRE create_all (hanterar befintliga installationer)
from sqlalchemy import text  # noqa: E402
with engine.connect() as _conn:
    # Döp om job_seeker_profiles → candidate_profiles
    _conn.execute(text("""
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_tables
                WHERE schemaname = 'public' AND tablename = 'job_seeker_profiles'
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_tables
                WHERE schemaname = 'public' AND tablename = 'candidate_profiles'
            ) THEN
                ALTER TABLE job_seeker_profiles RENAME TO candidate_profiles;
            END IF;
        END $$;
    """))
    _conn.commit()

# Create all database tables
Base.metadata.create_all(bind=engine)

# Idempotenta kolumnmigrationer (hanterar befintliga installationer)
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS roles VARCHAR(500)"))
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
        "managed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
    ))
    # Tillåt NULL i user_id (för säljar-hanterade kandidatprofiler)
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ALTER COLUMN user_id DROP NOT NULL"
    ))
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS available_from VARCHAR(20)"
    ))
    _conn.commit()

# Initialize FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    description="AI-powered CV optimization service",
)

# Configure CORS — credentials kräver explicita origins (ej wildcard)
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
app.include_router(auth_router, prefix="/api/v1")
app.include_router(cv.router, prefix="/api/v1")
app.include_router(optimize.router, prefix="/api/v1")
app.include_router(competence_router, prefix="/api/v1")
app.include_router(sokprofil_router, prefix="/api/v1")
app.include_router(kandidater_router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
