from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging
import httpx
from bs4 import BeautifulSoup

from app.core.database import get_db
from app.models.cv import CV
from app.models.competence import SkillEntry, ExperienceEntry
from app.services.competence_service import (
    merge_cv_into_bank, merge_experiences, clear_bank, rebuild_bank,
    add_skill, delete_skill, delete_experience,
    add_achievement, update_achievement, delete_achievement,
    add_experience_skill, remove_experience_skill, create_experience,
    update_experience_description,
)


class AddSkillRequest(BaseModel):
    skill_name: str
    category: str | None = None
    skill_type: str | None = None


class AchievementRequest(BaseModel):
    text: str


class ExperienceSkillRequest(BaseModel):
    skill_name: str


class MatchJobRequest(BaseModel):
    job_title: str = ''
    job_description: str


class FetchUrlRequest(BaseModel):
    url: str


class GenerateCVRequest(BaseModel):
    job_description: str
    experience_ids: list[int]
    skills: list[str] = []


class UpdateDescriptionRequest(BaseModel):
    description: str


class CreateExperienceRequest(BaseModel):
    title: str
    organization: str | None = None
    experience_type: str = "work"
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None
    related_skills: list[str] = []
    achievements: list[str] = []

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


@router.put("/experiences/{experience_id}/description")
async def update_exp_description(
    experience_id: int, body: UpdateDescriptionRequest, db: Session = Depends(get_db),
):
    """Uppdatera beskrivningen på en erfarenhetspost."""
    try:
        description = update_experience_description(experience_id, body.description, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"description": description}


@router.post("/experiences/{experience_id}/skills")
async def create_experience_skill(
    experience_id: int, body: ExperienceSkillRequest, db: Session = Depends(get_db),
):
    """Lägg till en skill på en erfarenhetspost."""
    try:
        skills = add_experience_skill(experience_id, body.skill_name, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"related_skills": skills}


@router.delete("/experiences/{experience_id}/skills/{index}")
async def remove_exp_skill(
    experience_id: int, index: int, db: Session = Depends(get_db),
):
    """Ta bort en skill från en erfarenhetspost."""
    try:
        skills = remove_experience_skill(experience_id, index, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"related_skills": skills}


@router.post("/experiences")
async def create_new_experience(
    body: CreateExperienceRequest, db: Session = Depends(get_db),
):
    """Skapa en ny erfarenhetspost manuellt."""
    try:
        result = create_experience(
            title=body.title,
            organization=body.organization,
            experience_type=body.experience_type,
            start_date=body.start_date,
            end_date=body.end_date,
            is_current=body.is_current,
            description=body.description,
            related_skills=body.related_skills,
            achievements=body.achievements,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/match-job")
async def match_job(body: MatchJobRequest, db: Session = Depends(get_db)):
    """Matcha kompetensbanken mot en jobbannons med AI."""
    from app.services.ai_service import AIService

    skills = db.query(SkillEntry).order_by(SkillEntry.category, SkillEntry.skill_name).all()
    experiences = db.query(ExperienceEntry).order_by(ExperienceEntry.start_date.desc()).all()

    if not skills and not experiences:
        raise HTTPException(status_code=400, detail="Kompetensbanken är tom")

    skills_data = [
        {"skill_name": s.skill_name, "category": s.category or "Övrigt"}
        for s in skills
    ]
    experiences_data = [
        {
            "id": e.id,
            "title": e.title,
            "organization": e.organization,
            "start_date": e.start_date,
            "end_date": e.end_date,
            "description": e.description,
            "achievements": e.achievements or [],
        }
        for e in experiences
    ]

    ai = AIService()
    result = ai.match_competences_to_job(
        skills=skills_data,
        experiences=experiences_data,
        job_title=body.job_title,
        job_description=body.job_description,
    )

    # Berikar erfarenheterna med full data från DB
    exp_by_id = {e.id: e for e in experiences}
    enriched_experiences = []
    for item in result.get("experiences", []):
        exp = exp_by_id.get(item["id"])
        if exp:
            enriched_experiences.append({
                **item,
                "title": exp.title,
                "organization": exp.organization,
                "start_date": exp.start_date,
                "end_date": exp.end_date,
                "is_current": exp.is_current,
                "experience_type": exp.experience_type,
            })

    result["experiences"] = enriched_experiences
    return result


@router.post("/generate-cv")
async def generate_cv(body: GenerateCVRequest, db: Session = Depends(get_db)):
    """Genererar ett anpassat CV-utkast för en jobbannons."""
    from app.services.ai_service import AIService

    if not body.experience_ids:
        raise HTTPException(status_code=400, detail="Inga erfarenheter angivna")

    experiences = db.query(ExperienceEntry).filter(
        ExperienceEntry.id.in_(body.experience_ids)
    ).all()

    exp_by_id = {e.id: e for e in experiences}

    ordered_experiences = []
    for eid in body.experience_ids:
        exp = exp_by_id.get(eid)
        if exp:
            ordered_experiences.append({
                "id": exp.id,
                "title": exp.title,
                "organization": exp.organization,
                "start_date": exp.start_date,
                "end_date": exp.end_date,
                "is_current": exp.is_current,
                "experience_type": exp.experience_type,
                "description": exp.description,
                "achievements": exp.achievements or [],
            })

    ai = AIService()
    result = ai.generate_cv_for_job(
        job_description=body.job_description,
        experiences_data=ordered_experiences,
        skills=body.skills,
    )

    # Berika AI-svaret med full DB-data
    enriched = []
    for item in result.get("experiences", []):
        exp = exp_by_id.get(item["id"])
        if exp:
            enriched.append({
                **item,
                "title": exp.title,
                "organization": exp.organization,
                "start_date": exp.start_date,
                "end_date": exp.end_date,
                "is_current": exp.is_current,
                "experience_type": exp.experience_type,
            })

    result["experiences"] = enriched
    result["skills"] = body.skills
    return result


@router.post("/fetch-job-url")
async def fetch_job_url(body: FetchUrlRequest):
    """Hämtar en jobbannons från en URL och returnerar texten."""
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Ogiltig URL – måste börja med http:// eller https://")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "sv,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            resp = await client.get(url, headers=headers)
        resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Tidsgräns överskreds vid hämtning av URL")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Sidan svarade med statuskod {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Kunde inte hämta URL: {str(e)}")

    soup = BeautifulSoup(resp.text, "html.parser")

    # Ta bort skript, stilar och navigeringselement
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
        tag.decompose()

    # Försök hitta huvudinnehållet
    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id="job-description")
        or soup.find(class_=lambda c: c and any(
            kw in c.lower() for kw in ("job-description", "job_description", "jobdescription",
                                        "vacancy", "posting", "ad-description", "job-detail")
        ))
        or soup.find("body")
    )

    text = main.get_text(separator="\n") if main else soup.get_text(separator="\n")

    # Rensa upp blankrader
    lines = [line.strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)

    if len(cleaned) < 100:
        raise HTTPException(status_code=422, detail="Kunde inte extrahera tillräckligt med text från sidan")

    return {"text": cleaned}


@router.delete("/reset")
async def reset_bank(db: Session = Depends(get_db)):
    """Rensa hela kompetensbanken."""
    clear_bank(db)
    return {"message": "Kompetensbanken rensad"}
