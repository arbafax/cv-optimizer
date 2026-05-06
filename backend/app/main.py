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
from app.api.candidate_cvs import router as candidate_cvs_router
from app.api.personality import router as personality_router

# Import all models so Base.metadata knows about them
# NOTE: competence_models (SkillEntry/ExperienceEntry) NOT imported — those tables are dropped
from app.models import cv as cv_models                          # noqa: F401
from app.models import user as user_models                      # noqa: F401
from app.models import search_profile as sp_models              # noqa: F401
from app.models import candidate_profile as cp_models           # noqa: F401
from app.models import candidate_bank as cb_models              # noqa: F401
from app.models import seller_candidates as sc_models           # noqa: F401
from app.models import candidate_cv as ccv_models               # noqa: F401
from app.models import candidate_education as cedu_models       # noqa: F401
from app.models import candidate_certification as ccert_models  # noqa: F401
from app.models import personality as personality_models         # noqa: F401

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# ── Pre-create_all migrations ─────────────────────────────────────────────────
from sqlalchemy import text  # noqa: E402
with engine.connect() as _conn:
    # Döp om job_seeker_profiles → candidate_profiles (historisk migration)
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

    # Ta bort gamla kompetenstabeller (ersätts av candidate_skills/candidate_experiences)
    _conn.execute(text("DROP TABLE IF EXISTS skills_collection CASCADE"))
    _conn.execute(text("DROP TABLE IF EXISTS experiences_pool CASCADE"))

    # Ta bort managed_by_user_id (ersätts av seller_candidates-tabellen)
    _conn.execute(text("""
        ALTER TABLE candidate_profiles
        DROP COLUMN IF EXISTS managed_by_user_id
    """))

    _conn.commit()

# ── Skapa saknade tabeller ────────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── Post-create_all idempotenta kolumnmigrationer ─────────────────────────────
with engine.connect() as _conn:
    # users
    _conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS roles VARCHAR(500)"))

    # candidate_profiles
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ALTER COLUMN user_id DROP NOT NULL"
    ))
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS available_from VARCHAR(20)"
    ))
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255)"
    ))

    # candidate_profiles — beskrivning (sätts från första CV:ns summary)
    _conn.execute(text(
        "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS description TEXT"
    ))

    # candidate_skills — embedding + source_cv_ids + unique constraint
    _conn.execute(text(
        "ALTER TABLE candidate_skills ADD COLUMN IF NOT EXISTS embedding vector(1536)"
    ))
    _conn.execute(text(
        "ALTER TABLE candidate_skills ADD COLUMN IF NOT EXISTS source_cv_ids JSON"
    ))
    _conn.execute(text("""
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_candidate_skill'
            ) THEN
                ALTER TABLE candidate_skills
                ADD CONSTRAINT uq_candidate_skill
                UNIQUE (candidate_profile_id, skill_name);
            END IF;
        END $$;
    """))

    # candidate_experiences — embedding
    _conn.execute(text(
        "ALTER TABLE candidate_experiences ADD COLUMN IF NOT EXISTS embedding vector(1536)"
    ))

    # personality_questions — embedding (for job matching)
    _conn.execute(text(
        "ALTER TABLE personality_questions ADD COLUMN IF NOT EXISTS embedding vector(1536)"
    ))

    # personality_answers — embedding
    _conn.execute(text(
        "ALTER TABLE personality_answers ADD COLUMN IF NOT EXISTS embedding vector(1536)"
    ))

    # users — ensure Admin role is supported (no schema change needed; stored in roles string)

    _conn.commit()

# ── FastAPI app ───────────────────────────────────────────────────────────────
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
app.include_router(candidate_cvs_router, prefix="/api/v1")
app.include_router(personality_router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8018, reload=settings.DEBUG)
