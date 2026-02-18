from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging

from app.core.database import get_db
from app.models.cv import CV
from app.models.competence import SkillEntry, ExperienceEntry
from app.services.competence_service import (
    merge_cv_into_bank, merge_experiences, clear_bank, rebuild_bank,
    add_skill, delete_skill, delete_experience,
    add_achievement, update_achievement, delete_achievement,
)


class AddSkillRequest(BaseModel):
    skill_name: str
    category: str | None = None
    skill_type: str | None = None


class AchievementRequest(BaseModel):
    text: str

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/competence", tags=["Competence Bank"])


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/merge-all")
async def merge_all_cvs(db: Session = Depends(get_db)):
    """Merge alla CV:n i databasen till kompetensbanken."""
    cvs = db.query(CV).all()
    if not cvs:
        raise HTTPException(status_code=404, detail="Inga CV:n hittades")

    total_skills, total_experiences, results = 0, 0, []
    for cv in cvs:
        r = merge_cv_into_bank(cv, db)
        total_skills      += r["skills_added"]
        total_experiences += r["experiences_added"]
        results.append(r)

    return {
        "total_cvs_processed"    : len(cvs),
        "total_skills_added"     : total_skills,
        "total_experiences_added": total_experiences,
        "details"                : results,
    }


@router.post("/merge/{cv_id}")
async def merge_cv(cv_id: int, db: Session = Depends(get_db)):
    """Merge ett enskilt CV till kompetensbanken."""
    cv = db.query(CV).filter(CV.id == cv_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")
    return merge_cv_into_bank(cv, db)


@router.get("/stats")
async def get_bank_stats(db: Session = Depends(get_db)):
    """Returnerar aggregerad statistik för kompetensbanken."""
    total_skills = db.query(SkillEntry).count()
    total_exp    = db.query(ExperienceEntry).count()

    all_sources: set = set()
    for row in db.query(SkillEntry.source_cv_ids).all():
        if row[0]:
            all_sources.update(row[0])

    skills_by_category: dict = {}
    for row in db.query(
        SkillEntry.category, func.count(SkillEntry.id)
    ).group_by(SkillEntry.category).all():
        skills_by_category[row[0]] = row[1]

    return {
        "total_skills"          : total_skills,
        "total_experiences"     : total_exp,
        "total_source_documents": len(all_sources),
        "skills_by_category"    : skills_by_category,
    }


@router.get("/skills")
async def get_bank_skills(db: Session = Depends(get_db)):
    """Returnerar alla skills i kompetensbanken, sorterade per kategori."""
    skills = db.query(SkillEntry).order_by(
        SkillEntry.category, SkillEntry.skill_name
    ).all()
    return {
        "skills": [
            {
                "id"          : s.id,
                "skill_name"  : s.skill_name,
                "category"    : s.category,
                "skill_type"  : s.skill_type,
                "source_count": len(s.source_cv_ids or []),
            }
            for s in skills
        ]
    }


@router.get("/experiences")
async def get_bank_experiences(db: Session = Depends(get_db)):
    """Returnerar alla erfarenheter i kompetensbanken."""
    experiences = db.query(ExperienceEntry).order_by(
        ExperienceEntry.experience_type,
        ExperienceEntry.start_date.desc()
    ).all()
    return {
        "experiences": [
            {
                "id"             : e.id,
                "title"          : e.title,
                "organization"   : e.organization,
                "experience_type": e.experience_type,
                "start_date"     : e.start_date,
                "end_date"       : e.end_date,
                "is_current"     : e.is_current,
                "description"    : e.description,
                "achievements"   : e.achievements or [],
                "related_skills" : e.related_skills or [],
                "source_cv_ids"  : e.source_cv_ids or [],
            }
            for e in experiences
        ]
    }


@router.post("/experiences/merge")
async def merge_experience_entries(
    body: dict,
    db: Session = Depends(get_db),
):
    """Slå ihop flera erfarenhetsposter till en."""
    experience_ids = body.get("experience_ids", [])
    if len(experience_ids) < 2:
        raise HTTPException(status_code=400, detail="Minst 2 erfarenhets-ID krävs")

    try:
        result = merge_experiences(experience_ids, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.post("/skills")
async def create_skill(body: AddSkillRequest, db: Session = Depends(get_db)):
    """Lägg till en enskild skill i kompetensbanken."""
    try:
        result = add_skill(body.skill_name, body.category, body.skill_type, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.delete("/skills/{skill_id}")
async def remove_skill(skill_id: int, db: Session = Depends(get_db)):
    """Ta bort en enskild skill."""
    try:
        delete_skill(skill_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Skill borttagen"}


@router.delete("/experiences/{experience_id}")
async def remove_experience(experience_id: int, db: Session = Depends(get_db)):
    """Ta bort en enskild erfarenhetspost."""
    try:
        delete_experience(experience_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Erfarenhet borttagen"}


@router.post("/experiences/{experience_id}/achievements")
async def create_achievement(
    experience_id: int, body: AchievementRequest, db: Session = Depends(get_db),
):
    """Lägg till en prestation på en erfarenhetspost."""
    try:
        achievements = add_achievement(experience_id, body.text, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"achievements": achievements}


@router.put("/experiences/{experience_id}/achievements/{index}")
async def edit_achievement(
    experience_id: int, index: int, body: AchievementRequest, db: Session = Depends(get_db),
):
    """Uppdatera en prestation."""
    try:
        achievements = update_achievement(experience_id, index, body.text, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"achievements": achievements}


@router.delete("/experiences/{experience_id}/achievements/{index}")
async def remove_achievement(
    experience_id: int, index: int, db: Session = Depends(get_db),
):
    """Ta bort en prestation."""
    try:
        achievements = delete_achievement(experience_id, index, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"achievements": achievements}


@router.delete("/reset")
async def reset_bank(db: Session = Depends(get_db)):
    """Rensa hela kompetensbanken."""
    clear_bank(db)
    return {"message": "Kompetensbanken rensad"}
