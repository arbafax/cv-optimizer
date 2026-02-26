from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging
import httpx
from bs4 import BeautifulSoup

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.cv import CV
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_education import CandidateEducation
from app.models.candidate_certification import CandidateCertification
from app.models.user import User
from app.models.candidate_profile import CandidateProfile
from app.services.competence_service import (
    merge_cv_into_bank, clear_bank, rebuild_bank,
    add_skill, delete_skill, delete_experience,
    add_achievement, update_achievement, delete_achievement,
    add_experience_skill, remove_experience_skill, create_experience,
    update_experience_description,
    update_experience_period,
    get_education, add_education, delete_education,
    get_certifications, add_certification, delete_certification,
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
    matched_experience_ids: list[int]
    skills: list[str] = []


class ImprovementTipsRequest(BaseModel):
    job_description: str
    overall_score: int
    current_skills: list[str] = []
    missing_skills: list[str] = []
    matched_experience_ids: list[int] = []


class UpdateDescriptionRequest(BaseModel):
    description: str


class UpdatePeriodRequest(BaseModel):
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False


class ReplaceAchievementsRequest(BaseModel):
    achievements: list[str]


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


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_or_create_profile(user_id: int, db: Session) -> CandidateProfile:
    """Hämtar eller skapar en candidate_profile för användaren (lazy)."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == user_id
    ).first()
    if not p:
        from app.models.user import User as UserModel
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        p = CandidateProfile(
            user_id=user_id,
            email=user.email if user else None,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_bank_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returnerar aggregerad statistik för kompetensbanken."""
    profile = _get_or_create_profile(current_user.id, db)
    pid = profile.id

    total_skills = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == pid
    ).count()
    total_exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == pid
    ).count()

    all_sources: set = set()
    for row in db.query(CandidateSkillEntry.source_cv_ids).filter(
        CandidateSkillEntry.candidate_profile_id == pid
    ).all():
        if row[0]:
            all_sources.update(row[0])

    skills_by_category: dict = {}
    for row in db.query(
        CandidateSkillEntry.category, func.count(CandidateSkillEntry.id)
    ).filter(CandidateSkillEntry.candidate_profile_id == pid).group_by(
        CandidateSkillEntry.category
    ).all():
        skills_by_category[row[0]] = row[1]

    return {
        "total_skills"          : total_skills,
        "total_experiences"     : total_exp,
        "total_source_documents": len(all_sources),
        "skills_by_category"    : skills_by_category,
    }


@router.get("/skills")
async def get_bank_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returnerar alla skills i kompetensbanken, sorterade per kategori."""
    profile = _get_or_create_profile(current_user.id, db)
    skills = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == profile.id
    ).order_by(CandidateSkillEntry.category, CandidateSkillEntry.skill_name).all()
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
async def get_bank_experiences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returnerar alla erfarenheter i kompetensbanken."""
    profile = _get_or_create_profile(current_user.id, db)
    experiences = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == profile.id
    ).order_by(
        CandidateExperienceEntry.experience_type,
        CandidateExperienceEntry.start_date.desc()
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


@router.post("/skills")
async def create_skill(
    body: AddSkillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lägg till en enskild skill i kompetensbanken."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        result = add_skill(body.skill_name, body.category, body.skill_type, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.delete("/skills/{skill_id}")
async def remove_skill(
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en enskild skill."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        delete_skill(skill_id, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Skill borttagen"}


@router.delete("/experiences/{experience_id}")
async def remove_experience(
    experience_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en enskild erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        delete_experience(experience_id, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Erfarenhet borttagen"}


@router.post("/experiences/{experience_id}/achievements")
async def create_achievement(
    experience_id: int,
    body: AchievementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lägg till en prestation på en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        achievements = add_achievement(experience_id, body.text, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"achievements": achievements}


@router.put("/experiences/{experience_id}/achievements/{index}")
async def edit_achievement(
    experience_id: int,
    index: int,
    body: AchievementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en prestation."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        achievements = update_achievement(experience_id, index, body.text, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"achievements": achievements}


@router.delete("/experiences/{experience_id}/achievements/{index}")
async def remove_achievement(
    experience_id: int,
    index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en prestation."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        achievements = delete_achievement(experience_id, index, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"achievements": achievements}


@router.put("/experiences/{experience_id}/achievements")
async def replace_achievements(
    experience_id: int,
    body: ReplaceAchievementsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ersätt hela prestationslistan för en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == experience_id,
        CandidateExperienceEntry.candidate_profile_id == profile.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Erfarenhet hittades inte")
    exp.achievements = body.achievements
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(exp, "achievements")
    db.commit()
    return {"achievements": exp.achievements}


@router.post("/experiences/{experience_id}/improve-achievements")
async def improve_achievements(
    experience_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analysera och förbättra prestationslistan med AI."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == experience_id,
        CandidateExperienceEntry.candidate_profile_id == profile.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Erfarenhet hittades inte")
    if not exp.achievements:
        raise HTTPException(status_code=400, detail="Inga prestationer att förbättra")

    ai = AIService()
    improved = ai.improve_achievements(
        achievements=exp.achievements,
        title=exp.title or "",
        organization=exp.organization or "",
    )
    return {"improved": improved, "original": exp.achievements}


@router.put("/experiences/{experience_id}/description")
async def update_exp_description(
    experience_id: int,
    body: UpdateDescriptionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera beskrivningen på en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        description = update_experience_description(experience_id, body.description, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"description": description}


@router.put("/experiences/{experience_id}/period")
async def update_exp_period(
    experience_id: int,
    body: UpdatePeriodRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera tidsperiod på en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        result = update_experience_period(
            experience_id, body.start_date, body.end_date, body.is_current, profile.id, db
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.post("/experiences/{experience_id}/skills")
async def create_experience_skill(
    experience_id: int,
    body: ExperienceSkillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lägg till en skill på en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        skills = add_experience_skill(experience_id, body.skill_name, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"related_skills": skills}


@router.delete("/experiences/{experience_id}/skills/{index}")
async def remove_exp_skill(
    experience_id: int,
    index: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en skill från en erfarenhetspost."""
    profile = _get_or_create_profile(current_user.id, db)
    try:
        skills = remove_experience_skill(experience_id, index, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"related_skills": skills}


@router.post("/experiences")
async def create_new_experience(
    body: CreateExperienceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skapa en ny erfarenhetspost manuellt."""
    profile = _get_or_create_profile(current_user.id, db)
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
            candidate_profile_id=profile.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/match-job")
async def match_job(
    body: MatchJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Matcha kompetensbanken mot en jobbannons med AI."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)
    pid = profile.id

    skills = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == pid
    ).order_by(CandidateSkillEntry.category, CandidateSkillEntry.skill_name).all()
    experiences = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == pid
    ).order_by(CandidateExperienceEntry.start_date.desc()).all()

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

    # Hämta kandidatprofil för sökpreferenser
    seeker_profile = {
        "roles":              profile.roles,
        "desired_city":       profile.desired_city,
        "desired_employment": profile.desired_employment.split(",") if profile.desired_employment else [],
        "desired_workplace":  profile.desired_workplace.split(",")  if profile.desired_workplace  else [],
        "willing_to_commute": profile.willing_to_commute,
    }

    ai = AIService()
    result = ai.match_competences_to_job(
        skills=skills_data,
        experiences=experiences_data,
        job_title=body.job_title,
        job_description=body.job_description,
        seeker_profile=seeker_profile,
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
async def generate_cv(
    body: GenerateCVRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genererar ett anpassat CV-utkast för en jobbannons."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)

    # Hämta alla erfarenheter för komplett tidslinje
    all_experiences = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == profile.id
    ).all()
    if not all_experiences:
        raise HTTPException(status_code=400, detail="Inga erfarenheter i kompetensbanken")

    matched_ids = set(body.matched_experience_ids)
    exp_by_id   = {e.id: e for e in all_experiences}

    # Skicka bara matchade erfarenheter till AI för pitch + prestationshighlighting
    matched_data = [
        {
            "id": exp.id,
            "title": exp.title,
            "organization": exp.organization,
            "start_date": exp.start_date,
            "end_date": exp.end_date,
            "is_current": exp.is_current,
            "experience_type": exp.experience_type,
            "description": exp.description,
            "achievements": exp.achievements or [],
        }
        for eid in body.matched_experience_ids
        if (exp := exp_by_id.get(eid))
    ]

    ai = AIService()
    ai_result = ai.generate_cv_for_job(
        job_description=body.job_description,
        experiences_data=matched_data,
        skills=body.skills,
    )

    # Bygg upp AI:ns highlighted achievements per ID
    ai_highlights = {
        item["id"]: item.get("highlighted_achievements", [])
        for item in ai_result.get("experiences", [])
    }

    # Sortera alla erfarenheter i omvänd kronologisk ordning
    def sort_key(e):
        if e.is_current:
            return "9999-99"
        return e.start_date or "0000-00"

    sorted_all = sorted(all_experiences, key=sort_key, reverse=True)

    # Bygg komplett tidslinje: matchade får AI-prestationer, övriga sina egna
    timeline = []
    for exp in sorted_all:
        is_matched = exp.id in matched_ids
        achievements = (
            ai_highlights.get(exp.id) or exp.achievements or []
            if is_matched
            else exp.achievements or []
        )
        timeline.append({
            "id":                     exp.id,
            "title":                  exp.title,
            "organization":           exp.organization,
            "start_date":             exp.start_date,
            "end_date":               exp.end_date,
            "is_current":             exp.is_current,
            "experience_type":        exp.experience_type,
            "is_matched":             is_matched,
            "highlighted_achievements": achievements,
        })

    return {
        "pitch":       ai_result.get("pitch", ""),
        "experiences": timeline,
        "skills":      body.skills,
    }


@router.post("/improvement-tips")
async def get_improvement_tips(
    body: ImprovementTipsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Genererar förbättringstips och föreslagna skills för att öka matchningspoängen."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)

    experiences = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id.in_(body.matched_experience_ids),
        CandidateExperienceEntry.candidate_profile_id == profile.id,
    ).all() if body.matched_experience_ids else []

    experiences_data = [
        {
            "title":        e.title,
            "organization": e.organization,
            "description":  e.description,
            "achievements": e.achievements or [],
        }
        for e in experiences
    ]

    ai = AIService()
    return ai.generate_improvement_tips(
        job_description=body.job_description,
        overall_score=body.overall_score,
        current_skills=body.current_skills,
        missing_skills=body.missing_skills,
        experiences_data=experiences_data,
    )


@router.post("/fetch-job-url")
async def fetch_job_url(
    body: FetchUrlRequest,
    current_user: User = Depends(get_current_user),
):
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
async def reset_bank(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa hela kompetensbanken."""
    profile = _get_or_create_profile(current_user.id, db)
    clear_bank(profile.id, db)
    return {"message": "Kompetensbanken rensad"}


@router.delete("/skills")
async def clear_all_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla kompetenser för den inloggade användarens profil."""
    profile = _get_or_create_profile(current_user.id, db)
    db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == profile.id
    ).delete()
    db.commit()
    return {"message": "Alla kompetenser raderade"}


@router.delete("/experiences")
async def clear_all_experiences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla erfarenheter för den inloggade användarens profil."""
    profile = _get_or_create_profile(current_user.id, db)
    db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == profile.id
    ).delete()
    db.commit()
    return {"message": "Alla erfarenheter raderade"}


@router.delete("/education")
async def clear_all_education(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa all utbildning för den inloggade användarens profil."""
    profile = _get_or_create_profile(current_user.id, db)
    db.query(CandidateEducation).filter(
        CandidateEducation.candidate_profile_id == profile.id
    ).delete()
    db.commit()
    return {"message": "All utbildning raderad"}


@router.delete("/certifications")
async def clear_all_certifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla certifieringar för den inloggade användarens profil."""
    profile = _get_or_create_profile(current_user.id, db)
    db.query(CandidateCertification).filter(
        CandidateCertification.candidate_profile_id == profile.id
    ).delete()
    db.commit()
    return {"message": "Alla certifieringar raderade"}


# ── Education endpoints ───────────────────────────────────────────────────────

class EducationRequest(BaseModel):
    degree: str
    institution: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None


@router.get("/education")
async def list_education(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    return {"education": get_education(profile.id, db)}


@router.post("/education", status_code=201)
async def create_education(
    body: EducationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    return add_education(body.model_dump(), profile.id, db)


@router.delete("/education/{edu_id}")
async def remove_education(
    edu_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    try:
        delete_education(edu_id, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Utbildning borttagen"}


# ── Certification endpoints ───────────────────────────────────────────────────

class CertificationRequest(BaseModel):
    name: str
    issuer: str | None = None
    date: str | None = None
    description: str | None = None


@router.get("/certifications")
async def list_certifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    return {"certifications": get_certifications(profile.id, db)}


@router.post("/certifications", status_code=201)
async def create_certification(
    body: CertificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    return add_certification(body.model_dump(), profile.id, db)


@router.delete("/certifications/{cert_id}")
async def remove_certification(
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(current_user.id, db)
    try:
        delete_certification(cert_id, profile.id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Certifiering borttagen"}


# ── PUT endpoints (update + re-vectorize) ─────────────────────────────────────

class SkillUpdateRequest(BaseModel):
    skill_name: str
    category: str = "Övrigt"
    skill_type: str = "technical"


class ExperienceUpdateRequest(BaseModel):
    title: str
    organization: str | None = None
    experience_type: str = "work"
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None
    achievements: list[str] = []
    related_skills: list[str] = []


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: int,
    body: SkillUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en skill och regenerera dess embedding."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)
    skill = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.id == skill_id,
        CandidateSkillEntry.candidate_profile_id == profile.id,
    ).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill hittades inte")
    skill.skill_name = body.skill_name.strip()
    skill.category   = body.category
    skill.skill_type = body.skill_type
    text = f"{body.skill_name} [{body.category}] [{body.skill_type}]"
    skill.embedding = AIService().generate_embeddings(text)
    db.commit()
    db.refresh(skill)
    return {"id": skill.id, "skill_name": skill.skill_name,
            "category": skill.category, "skill_type": skill.skill_type}


@router.put("/experiences/{experience_id}")
async def update_experience(
    experience_id: int,
    body: ExperienceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en erfarenhetspost och regenerera dess embedding."""
    from app.services.ai_service import AIService
    from sqlalchemy.orm.attributes import flag_modified
    profile = _get_or_create_profile(current_user.id, db)
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == experience_id,
        CandidateExperienceEntry.candidate_profile_id == profile.id,
    ).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Erfarenhet hittades inte")
    exp.title           = body.title
    exp.organization    = body.organization
    exp.experience_type = body.experience_type
    exp.start_date      = body.start_date
    exp.end_date        = body.end_date
    exp.is_current      = body.is_current
    exp.description     = body.description
    exp.achievements    = body.achievements
    exp.related_skills  = body.related_skills
    flag_modified(exp, "achievements")
    flag_modified(exp, "related_skills")
    parts = [f"{body.title} vid {body.organization or ''}"]
    if body.description:
        parts.append(body.description)
    if body.achievements:
        parts.extend(body.achievements)
    exp.embedding = AIService().generate_embeddings("\n".join(parts))
    db.commit()
    db.refresh(exp)
    return {
        "id": exp.id, "title": exp.title, "organization": exp.organization,
        "experience_type": exp.experience_type, "start_date": exp.start_date,
        "end_date": exp.end_date, "is_current": exp.is_current,
        "description": exp.description, "achievements": exp.achievements or [],
        "related_skills": exp.related_skills or [],
    }


@router.put("/education/{edu_id}")
async def update_education(
    edu_id: int,
    body: EducationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en utbildning och regenerera dess embedding."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)
    edu = db.query(CandidateEducation).filter(
        CandidateEducation.id == edu_id,
        CandidateEducation.candidate_profile_id == profile.id,
    ).first()
    if not edu:
        raise HTTPException(status_code=404, detail="Utbildning hittades inte")
    edu.degree         = body.degree
    edu.institution    = body.institution
    edu.field_of_study = body.field_of_study
    edu.start_date     = body.start_date
    edu.end_date       = body.end_date
    edu.description    = body.description
    text = f"{body.degree} vid {body.institution or ''}, {body.field_of_study or ''}\n{body.description or ''}"
    edu.embedding = AIService().generate_embeddings(text)
    db.commit()
    db.refresh(edu)
    return {"id": edu.id, "degree": edu.degree, "institution": edu.institution,
            "field_of_study": edu.field_of_study, "start_date": edu.start_date,
            "end_date": edu.end_date, "description": edu.description}


@router.put("/certifications/{cert_id}")
async def update_certification_item(
    cert_id: int,
    body: CertificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera ett certifikat och regenerera dess embedding."""
    from app.services.ai_service import AIService
    profile = _get_or_create_profile(current_user.id, db)
    cert = db.query(CandidateCertification).filter(
        CandidateCertification.id == cert_id,
        CandidateCertification.candidate_profile_id == profile.id,
    ).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certifiering hittades inte")
    cert.name        = body.name
    cert.issuer      = body.issuer
    cert.date        = body.date
    cert.description = body.description
    text = f"{body.name} utfärdad av {body.issuer or ''}\n{body.description or ''}"
    cert.embedding = AIService().generate_embeddings(text)
    db.commit()
    db.refresh(cert)
    return {"id": cert.id, "name": cert.name, "issuer": cert.issuer,
            "date": cert.date, "description": cert.description}
