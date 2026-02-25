from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import os
import shutil
from datetime import datetime

from app.core.database import get_db
from app.core.config import settings
from app.core.auth import get_current_user
from app.models.candidate_profile import CandidateProfile
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.user import User
from app.services.pdf_parser import PDFParser
from app.services.ai_service import AIService
from app.services.competence_service import categorise_skill

_pdf_parser  = PDFParser()
_ai_service  = AIService()

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/kandidater", tags=["Kandidater"])


class KandidatRequest(BaseModel):
    public_name:        str
    public_phone:       str | None  = None
    roles:              str | None  = None
    desired_city:       str | None  = None
    desired_employment: list[str]   = []
    desired_workplace:  list[str]   = []
    willing_to_commute: bool        = False
    searchable:         bool        = False
    available_from:     str | None  = None


def _to_dict(p: CandidateProfile) -> dict:
    return {
        "id":                 p.id,
        "public_name":        p.public_name,
        "public_phone":       p.public_phone,
        "roles":              p.roles,
        "desired_city":       p.desired_city,
        "desired_employment": p.desired_employment.split(",") if p.desired_employment else [],
        "desired_workplace":  p.desired_workplace.split(",")  if p.desired_workplace  else [],
        "willing_to_commute": p.willing_to_commute,
        "searchable":         p.searchable,
        "available_from":     p.available_from,
    }


def _apply_body(p: CandidateProfile, body: KandidatRequest) -> None:
    p.public_name        = body.public_name.strip()
    p.public_phone       = body.public_phone.strip()       if body.public_phone       else None
    p.roles              = body.roles.strip()              if body.roles              else None
    p.desired_city       = body.desired_city.strip()       if body.desired_city       else None
    p.desired_employment = ",".join(body.desired_employment) if body.desired_employment else None
    p.desired_workplace  = ",".join(body.desired_workplace)  if body.desired_workplace  else None
    p.willing_to_commute = body.willing_to_commute
    p.searchable         = body.searchable
    p.available_from     = body.available_from or None


@router.get("/")
async def list_kandidater(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista alla kandidatprofiler som hanteras av inloggad säljare."""
    profiles = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.managed_by_user_id == current_user.id)
        .order_by(CandidateProfile.id)
        .all()
    )
    return {"kandidater": [_to_dict(p) for p in profiles]}


@router.post("/")
async def create_kandidat(
    body: KandidatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skapa en ny kandidatprofil för inloggad säljare."""
    p = CandidateProfile(managed_by_user_id=current_user.id)
    _apply_body(p, body)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.get("/{kandidat_id}")
async def get_kandidat(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hämta en specifik kandidatprofil."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    return _to_dict(p)


@router.put("/{kandidat_id}")
async def update_kandidat(
    kandidat_id: int,
    body: KandidatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en kandidatprofil."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    _apply_body(p, body)
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.delete("/{kandidat_id}")
async def delete_kandidat(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en kandidatprofil."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    name = p.public_name or "Kandidat"
    db.delete(p)
    db.commit()
    return {"message": f"'{name}' borttagen"}


# ── Kompetensbank ─────────────────────────────────────────────────────────────

class AddSkillRequest(BaseModel):
    skill_name: str
    category:   str | None = None
    skill_type: str | None = None


def _require_kandidat(kandidat_id: int, current_user: User, db: Session) -> CandidateProfile:
    """Hämtar kandidatprofilen och verifierar ägarskap — eller kastar 404."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    return p


@router.get("/{kandidat_id}/bank")
async def get_kandidat_bank(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hämta kompetensbanken för en specifik kandidat."""
    _require_kandidat(kandidat_id, current_user, db)

    skills = (
        db.query(CandidateSkillEntry)
        .filter(CandidateSkillEntry.candidate_profile_id == kandidat_id)
        .order_by(CandidateSkillEntry.category, CandidateSkillEntry.skill_name)
        .all()
    )
    experiences = (
        db.query(CandidateExperienceEntry)
        .filter(CandidateExperienceEntry.candidate_profile_id == kandidat_id)
        .order_by(CandidateExperienceEntry.start_date.desc())
        .all()
    )

    return {
        "skills": [
            {
                "id":         s.id,
                "skill_name": s.skill_name,
                "category":   s.category,
                "skill_type": s.skill_type,
            }
            for s in skills
        ],
        "experiences": [
            {
                "id":              e.id,
                "title":           e.title,
                "organization":    e.organization,
                "experience_type": e.experience_type,
                "start_date":      e.start_date,
                "end_date":        e.end_date,
                "is_current":      e.is_current,
                "description":     e.description,
                "achievements":    e.achievements or [],
                "related_skills":  e.related_skills or [],
            }
            for e in experiences
        ],
    }


@router.post("/{kandidat_id}/bank/skills")
async def add_kandidat_skill(
    kandidat_id: int,
    body: AddSkillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lägg till en skill i kandidatens kompetensbank."""
    _require_kandidat(kandidat_id, current_user, db)

    name = body.skill_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Skill-namn får inte vara tomt")

    existing = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == kandidat_id,
        CandidateSkillEntry.skill_name == name,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Skill finns redan")

    s = CandidateSkillEntry(
        candidate_profile_id=kandidat_id,
        skill_name=name,
        category=body.category or "Övrigt",
        skill_type=body.skill_type or "technical",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "skill_name": s.skill_name, "category": s.category, "skill_type": s.skill_type}


@router.delete("/{kandidat_id}/bank/skills/{skill_id}")
async def delete_kandidat_skill(
    kandidat_id: int,
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en skill från kandidatens kompetensbank."""
    _require_kandidat(kandidat_id, current_user, db)

    s = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.id == skill_id,
        CandidateSkillEntry.candidate_profile_id == kandidat_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Skill hittades inte")
    db.delete(s)
    db.commit()
    return {"message": "Skill borttagen"}


@router.post("/{kandidat_id}/bank/upload-cv")
async def upload_cv_to_kandidat_bank(
    kandidat_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ladda upp ett CV-PDF och lägg till kompetenser och erfarenheter i kandidatens bank."""
    _require_kandidat(kandidat_id, current_user, db)

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Endast PDF-filer är tillåtna")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_path = os.path.join(settings.UPLOAD_DIR, f"kand_{kandidat_id}_{timestamp}_{file.filename}")

    try:
        with open(temp_path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        if not _pdf_parser.validate_pdf(temp_path):
            raise HTTPException(status_code=400, detail="Ogiltig eller skadad PDF-fil")

        cv_text = _pdf_parser.extract_text(temp_path)
        if not cv_text:
            raise HTTPException(status_code=400, detail="Kunde inte extrahera text från PDF")

        cv_structure = _ai_service.structure_cv_text(cv_text)
        if not cv_structure:
            raise HTTPException(status_code=500, detail="Misslyckades med att strukturera CV-data")

        data = cv_structure.model_dump()

        # ── Skills ──────────────────────────────────────────────────────────
        raw_skills: list[str] = list(data.get("skills", []))
        for exp  in data.get("work_experience", []): raw_skills.extend(exp.get("technologies", []))
        for proj in data.get("projects", []):        raw_skills.extend(proj.get("technologies", []))

        seen, unique_skills = set(), []
        for s in raw_skills:
            norm = s.strip()
            if norm and norm.lower() not in seen:
                seen.add(norm.lower())
                unique_skills.append(norm)

        skills_added = skills_skipped = 0
        for skill_name in unique_skills:
            exists = db.query(CandidateSkillEntry).filter(
                CandidateSkillEntry.candidate_profile_id == kandidat_id,
                func.lower(CandidateSkillEntry.skill_name) == skill_name.lower(),
            ).first()
            if exists:
                skills_skipped += 1
            else:
                category, skill_type = categorise_skill(skill_name)
                db.add(CandidateSkillEntry(
                    candidate_profile_id=kandidat_id,
                    skill_name=skill_name,
                    category=category,
                    skill_type=skill_type,
                ))
                skills_added += 1

        # ── Work experience ──────────────────────────────────────────────────
        exp_added = exp_skipped = 0

        def _upsert_exp(title, org, exp_type, start, end, is_current, desc, achievements, related):
            nonlocal exp_added, exp_skipped
            exists = db.query(CandidateExperienceEntry).filter(
                CandidateExperienceEntry.candidate_profile_id == kandidat_id,
                CandidateExperienceEntry.experience_type == exp_type,
                func.lower(CandidateExperienceEntry.title) == title.lower(),
                func.lower(func.coalesce(CandidateExperienceEntry.organization, ""))
                == (org or "").lower(),
            ).first()
            if exists:
                exp_skipped += 1
            else:
                db.add(CandidateExperienceEntry(
                    candidate_profile_id=kandidat_id,
                    title=title,
                    organization=org,
                    experience_type=exp_type,
                    start_date=start,
                    end_date=end,
                    is_current=is_current,
                    description=desc,
                    achievements=achievements or [],
                    related_skills=related or [],
                ))
                exp_added += 1

        for exp in data.get("work_experience", []):
            _upsert_exp(
                title       = exp.get("position") or "Okänd tjänst",
                org         = exp.get("company"),
                exp_type    = "work",
                start       = exp.get("start_date"),
                end         = exp.get("end_date"),
                is_current  = exp.get("current", False),
                desc        = exp.get("description"),
                achievements= exp.get("achievements", []),
                related     = exp.get("technologies", []),
            )

        for edu in data.get("education", []):
            title = edu.get("degree") or "Utbildning"
            if edu.get("field_of_study"):
                title = f"{title} – {edu['field_of_study']}"
            _upsert_exp(
                title       = title,
                org         = edu.get("institution"),
                exp_type    = "education",
                start       = edu.get("start_date"),
                end         = edu.get("end_date"),
                is_current  = False,
                desc        = None,
                achievements= edu.get("achievements", []),
                related     = [],
            )

        db.commit()

        cv_name = (data.get("personal_info") or {}).get("full_name") or file.filename
        return {
            "name":               cv_name,
            "skills_added":       skills_added,
            "skills_skipped":     skills_skipped,
            "experiences_added":  exp_added,
            "experiences_skipped": exp_skipped,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fel vid bearbetning av CV: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
