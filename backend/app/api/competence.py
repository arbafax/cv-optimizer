"""
Competence Bank API Router
File: backend/app/api/competence.py
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.core.database import get_db
from app.models.cv import CV
from app.services.competence_service import CompetenceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/competence", tags=["Competence Bank"])


# ──────────────────────────────────────────────
# MERGE
# ──────────────────────────────────────────────

@router.post("/merge/{cv_id}")
def merge_cv_into_bank(cv_id: int, db: Session = Depends(get_db)):
    """
    Merge a CV (by id) into the competence bank.
    Skills and experiences are aggregated and deduplicated.
    """
    service = CompetenceService(db)
    result = service.merge_cv(cv_id)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error or "Merge failed")

    return {
        "success": True,
        "cv_id": result.cv_id,
        "cv_name": result.cv_name,
        "skills_added": result.skills_added,
        "skills_updated": result.skills_updated,
        "experiences_added": result.experiences_added,
        "experiences_updated": result.experiences_updated,
        "links_created": result.links_created,
        "duplicates_skipped": result.duplicates_skipped,
        "processing_time_seconds": result.processing_time_seconds,
        "warnings": result.warnings,
    }


@router.post("/merge-all")
def merge_all_cvs(db: Session = Depends(get_db)):
    """
    Merge ALL uploaded CVs into the competence bank.
    Safe to run multiple times — duplicates are handled.
    """
    cvs = db.query(CV).all()
    if not cvs:
        raise HTTPException(status_code=404, detail="No CVs found to merge")

    service = CompetenceService(db)
    results = []
    total_skills = 0
    total_experiences = 0

    for cv in cvs:
        result = service.merge_cv(cv.id)
        results.append({
            "cv_id": cv.id,
            "cv_name": cv.filename,
            "success": result.success,
            "skills_added": result.skills_added,
            "experiences_added": result.experiences_added,
            "duplicates_skipped": result.duplicates_skipped,
            "error": result.error,
        })
        total_skills += result.skills_added
        total_experiences += result.experiences_added

    return {
        "total_cvs_processed": len(cvs),
        "total_skills_added": total_skills,
        "total_experiences_added": total_experiences,
        "results": results,
    }


# ──────────────────────────────────────────────
# STATS & OVERVIEW
# ──────────────────────────────────────────────

@router.get("/stats")
def get_bank_stats(db: Session = Depends(get_db)):
    """
    Return overall statistics for the competence bank.
    """
    service = CompetenceService(db)
    return service.get_bank_stats()


# ──────────────────────────────────────────────
# SKILLS
# ──────────────────────────────────────────────

@router.get("/skills")
def get_skills(
    skill_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Return all skills in the competence bank.
    Optional filter: ?skill_type=technical|soft|language|tool|domain
    """
    service = CompetenceService(db)
    skills = service.get_all_skills(skill_type=skill_type)

    return {
        "total": len(skills),
        "skills": [
            {
                "id": s.id,
                "skill_name": s.skill_name,
                "skill_type": s.skill_type,
                "category": s.category,
                "proficiency_level": s.proficiency_level,
                "years_experience": float(s.years_experience) if s.years_experience else None,
            }
            for s in skills
        ],
    }


# ──────────────────────────────────────────────
# EXPERIENCES
# ──────────────────────────────────────────────

@router.get("/experiences")
def get_experiences(
    experience_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Return all experiences in the competence bank.
    Optional filter: ?experience_type=work|education|project|certification
    """
    service = CompetenceService(db)
    experiences = service.get_all_experiences(exp_type=experience_type)

    return {
        "total": len(experiences),
        "experiences": [
            {
                "id": e.id,
                "experience_type": e.experience_type,
                "title": e.title,
                "organization": e.organization,
                "start_date": e.start_date,
                "end_date": e.end_date,
                "is_current": e.is_current,
                "achievements": e.achievements or [],
                "technologies": e.technologies or [],
                "source_document": e.source_document_name,
            }
            for e in experiences
        ],
    }
