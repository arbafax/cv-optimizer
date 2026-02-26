from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.candidate_profile import CandidateProfile
from app.models.candidate_cv import CandidateCV
from app.models.seller_candidates import SellerCandidate
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_education import CandidateEducation
from app.models.candidate_certification import CandidateCertification
from app.models.user import User
from app.services.competence_service import (
    categorise_skill,
    get_education, add_education, delete_education,
    get_certifications, add_certification, delete_certification,
)
from app.api.candidate_cvs import process_and_store_cv, _cv_summary, _delete_cv_and_entries
from app.services.ai_service import AIService

_ai_service = AIService()

router = APIRouter(prefix="/kandidater", tags=["Kandidater"])


class KandidatRequest(BaseModel):
    public_name:        str
    email:              str | None  = None
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
        "email":              p.email,
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
    if body.email is not None:
        p.email = body.email.strip() or None
    p.public_phone       = body.public_phone.strip()       if body.public_phone       else None
    p.roles              = body.roles.strip()              if body.roles              else None
    p.desired_city       = body.desired_city.strip()       if body.desired_city       else None
    p.desired_employment = ",".join(body.desired_employment) if body.desired_employment else None
    p.desired_workplace  = ",".join(body.desired_workplace)  if body.desired_workplace  else None
    p.willing_to_commute = body.willing_to_commute
    p.searchable         = body.searchable
    p.available_from     = body.available_from or None


def _require_kandidat(kandidat_id: int, current_user: User, db: Session) -> CandidateProfile:
    """Hämtar kandidatprofilen och verifierar att säljaren har koppling till den — eller kastar 404."""
    link = db.query(SellerCandidate).filter(
        SellerCandidate.seller_user_id == current_user.id,
        SellerCandidate.candidate_profile_id == kandidat_id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    p = db.query(CandidateProfile).filter(CandidateProfile.id == kandidat_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    return p


@router.get("/")
async def list_kandidater(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista alla kandidatprofiler som hanteras av inloggad säljare."""
    profiles = (
        db.query(CandidateProfile)
        .join(SellerCandidate, SellerCandidate.candidate_profile_id == CandidateProfile.id)
        .filter(SellerCandidate.seller_user_id == current_user.id)
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
    """Skapa en ny kandidatprofil (user_id=null) och lägg till i säljarens lista."""
    p = CandidateProfile(user_id=None)
    _apply_body(p, body)
    db.add(p)
    db.flush()  # hämta p.id innan commit

    link = SellerCandidate(
        seller_user_id=current_user.id,
        candidate_profile_id=p.id,
    )
    db.add(link)
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
    p = _require_kandidat(kandidat_id, current_user, db)
    return _to_dict(p)


@router.put("/{kandidat_id}")
async def update_kandidat(
    kandidat_id: int,
    body: KandidatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en kandidatprofil."""
    p = _require_kandidat(kandidat_id, current_user, db)
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
    """Ta bort kandidaten från säljarens lista.
    Om profilen saknar kopplat user-konto tas hela profilen bort.
    Om profilen är kopplad till ett user-konto tas bara kopplingen bort."""
    p = _require_kandidat(kandidat_id, current_user, db)
    name = p.public_name or "Kandidat"

    if p.user_id is None:
        # Säljar-skapad profil utan user_account — ta bort profilen (cascade hanterar resten)
        db.delete(p)
    else:
        # Kandidaten har ett konto — behåll profilen, ta bara bort kopplingen
        link = db.query(SellerCandidate).filter(
            SellerCandidate.seller_user_id == current_user.id,
            SellerCandidate.candidate_profile_id == kandidat_id,
        ).first()
        if link:
            db.delete(link)

    db.commit()
    return {"message": f"'{name}' borttagen"}


# ── Kompetensbank ─────────────────────────────────────────────────────────────

class AddSkillRequest(BaseModel):
    skill_name: str
    category:   str | None = None
    skill_type: str | None = None


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
        func.lower(CandidateSkillEntry.skill_name) == name.lower(),
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


@router.delete("/{kandidat_id}/bank/skills")
async def clear_kandidat_skills(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla kompetenser för en kandidat."""
    _require_kandidat(kandidat_id, current_user, db)
    db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == kandidat_id
    ).delete()
    db.commit()
    return {"message": "Alla kompetenser raderade"}


@router.delete("/{kandidat_id}/bank/experiences")
async def clear_kandidat_experiences(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla erfarenheter för en kandidat."""
    _require_kandidat(kandidat_id, current_user, db)
    db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == kandidat_id
    ).delete()
    db.commit()
    return {"message": "Alla erfarenheter raderade"}


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


@router.post("/{kandidat_id}/bank/upload-cv", status_code=201)
async def upload_cv_to_kandidat_bank(
    kandidat_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a CV PDF for a candidate: stores file, runs AI structuring and vectorization."""
    _require_kandidat(kandidat_id, current_user, db)

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Endast PDF-filer är tillåtna")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Filen är för stor. Max 10 MB")

    try:
        cv = process_and_store_cv(file_bytes, file.filename, kandidat_id, db)
        return _cv_summary(cv, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fel vid bearbetning av CV: {str(e)}")


# ── CV management for a candidate ────────────────────────────────────────────

@router.get("/{kandidat_id}/cvs")
async def list_kandidat_cvs(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all CandidateCVs for a candidate."""
    _require_kandidat(kandidat_id, current_user, db)
    cvs = db.query(CandidateCV).filter(
        CandidateCV.candidate_profile_id == kandidat_id
    ).order_by(CandidateCV.upload_date.desc()).all()
    return [_cv_summary(cv, db) for cv in cvs]


@router.delete("/{kandidat_id}/cvs/{cv_id}")
async def delete_kandidat_cv(
    kandidat_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a CandidateCV for a candidate."""
    _require_kandidat(kandidat_id, current_user, db)
    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == kandidat_id,
    ).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")
    _delete_cv_and_entries(cv, db)
    return {"message": f"'{cv.filename}' raderat"}


@router.post("/{kandidat_id}/cvs/{cv_id}/vectorize")
async def vectorize_kandidat_cv(
    kandidat_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """(Re)generate vector embeddings for a candidate's CandidateCV."""
    from app.services.embedding_service import re_vectorize_candidate_cv
    _require_kandidat(kandidat_id, current_user, db)
    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == kandidat_id,
    ).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")
    if not cv.is_processed:
        raise HTTPException(status_code=400, detail="CV är inte behandlat ännu")
    re_vectorize_candidate_cv(cv_id, db)
    return _cv_summary(cv, db)


@router.get("/{kandidat_id}/cvs/{cv_id}/file")
async def download_kandidat_cv_file(
    kandidat_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the original PDF file for a candidate's CV."""
    from fastapi.responses import Response
    _require_kandidat(kandidat_id, current_user, db)
    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == kandidat_id,
    ).first()
    if not cv or not cv.file_data:
        raise HTTPException(status_code=404, detail="Fil saknas")
    return Response(
        content=cv.file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cv.filename}"'},
    )


# ── Education for a candidate ─────────────────────────────────────────────────

class EducationRequest(BaseModel):
    degree: str
    institution: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None


@router.get("/{kandidat_id}/education")
async def list_kandidat_education(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    return {"education": get_education(kandidat_id, db)}


@router.post("/{kandidat_id}/education", status_code=201)
async def create_kandidat_education(
    kandidat_id: int,
    body: EducationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    return add_education(body.model_dump(), kandidat_id, db)


@router.delete("/{kandidat_id}/education")
async def clear_kandidat_education(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa all utbildning för en kandidat."""
    _require_kandidat(kandidat_id, current_user, db)
    db.query(CandidateEducation).filter(
        CandidateEducation.candidate_profile_id == kandidat_id
    ).delete()
    db.commit()
    return {"message": "All utbildning raderad"}


@router.delete("/{kandidat_id}/education/{edu_id}")
async def remove_kandidat_education(
    kandidat_id: int,
    edu_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    try:
        delete_education(edu_id, kandidat_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Utbildning borttagen"}


# ── Certifications for a candidate ───────────────────────────────────────────

class CertificationRequest(BaseModel):
    name: str
    issuer: str | None = None
    date: str | None = None
    description: str | None = None


@router.get("/{kandidat_id}/certifications")
async def list_kandidat_certifications(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    return {"certifications": get_certifications(kandidat_id, db)}


@router.post("/{kandidat_id}/certifications", status_code=201)
async def create_kandidat_certification(
    kandidat_id: int,
    body: CertificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    return add_certification(body.model_dump(), kandidat_id, db)


@router.delete("/{kandidat_id}/certifications")
async def clear_kandidat_certifications(
    kandidat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rensa alla certifieringar för en kandidat."""
    _require_kandidat(kandidat_id, current_user, db)
    db.query(CandidateCertification).filter(
        CandidateCertification.candidate_profile_id == kandidat_id
    ).delete()
    db.commit()
    return {"message": "Alla certifieringar raderade"}


@router.delete("/{kandidat_id}/certifications/{cert_id}")
async def remove_kandidat_certification(
    kandidat_id: int,
    cert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_kandidat(kandidat_id, current_user, db)
    try:
        delete_certification(cert_id, kandidat_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Certifiering borttagen"}


# ── PUT endpoints for kandidat items (update + re-vectorize) ──────────────────

class KandidatSkillUpdateRequest(BaseModel):
    skill_name: str
    category: str = "Övrigt"
    skill_type: str = "technical"


class KandidatExperienceUpdateRequest(BaseModel):
    title: str
    organization: str | None = None
    experience_type: str = "work"
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    description: str | None = None
    achievements: list[str] = []
    related_skills: list[str] = []


@router.put("/{kandidat_id}/bank/skills/{skill_id}")
async def update_kandidat_skill(
    kandidat_id: int,
    skill_id: int,
    body: KandidatSkillUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en skill för en kandidat och regenerera dess embedding."""
    from app.services.ai_service import AIService
    _require_kandidat(kandidat_id, current_user, db)
    skill = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.id == skill_id,
        CandidateSkillEntry.candidate_profile_id == kandidat_id,
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


@router.put("/{kandidat_id}/bank/experiences/{exp_id}")
async def update_kandidat_experience(
    kandidat_id: int,
    exp_id: int,
    body: KandidatExperienceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en erfarenhetspost för en kandidat och regenerera dess embedding."""
    from app.services.ai_service import AIService
    from sqlalchemy.orm.attributes import flag_modified
    _require_kandidat(kandidat_id, current_user, db)
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == exp_id,
        CandidateExperienceEntry.candidate_profile_id == kandidat_id,
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


@router.put("/{kandidat_id}/education/{edu_id}")
async def update_kandidat_education(
    kandidat_id: int,
    edu_id: int,
    body: EducationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en utbildning för en kandidat och regenerera dess embedding."""
    from app.services.ai_service import AIService
    _require_kandidat(kandidat_id, current_user, db)
    edu = db.query(CandidateEducation).filter(
        CandidateEducation.id == edu_id,
        CandidateEducation.candidate_profile_id == kandidat_id,
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


@router.put("/{kandidat_id}/certifications/{cert_id}")
async def update_kandidat_certification(
    kandidat_id: int,
    cert_id: int,
    body: CertificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera ett certifikat för en kandidat och regenerera dess embedding."""
    from app.services.ai_service import AIService
    _require_kandidat(kandidat_id, current_user, db)
    cert = db.query(CandidateCertification).filter(
        CandidateCertification.id == cert_id,
        CandidateCertification.candidate_profile_id == kandidat_id,
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


# ── Matcha mot jobbannons ─────────────────────────────────────────────────────

class MatchJobRequest(BaseModel):
    job_title:       str | None = None
    job_description: str


@router.post("/{kandidat_id}/match-job")
async def match_job_for_kandidat(
    kandidat_id: int,
    body: MatchJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Matcha en kandidats kompetensbank mot en jobbannons."""
    kandidat = _require_kandidat(kandidat_id, current_user, db)

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

    if not skills and not experiences:
        raise HTTPException(status_code=400, detail="Kandidatens kompetensbank är tom")

    skills_data = [
        {"skill_name": s.skill_name, "category": s.category or "Övrigt"}
        for s in skills
    ]
    experiences_data = [
        {
            "id":           e.id,
            "title":        e.title,
            "organization": e.organization,
            "start_date":   e.start_date,
            "end_date":     e.end_date,
            "description":  e.description,
            "achievements": e.achievements or [],
        }
        for e in experiences
    ]

    seeker_profile = {
        "roles":              kandidat.roles,
        "desired_city":       kandidat.desired_city,
        "desired_employment": kandidat.desired_employment.split(",") if kandidat.desired_employment else [],
        "desired_workplace":  kandidat.desired_workplace.split(",")  if kandidat.desired_workplace  else [],
        "willing_to_commute": kandidat.willing_to_commute,
    }

    result = _ai_service.match_competences_to_job(
        skills=skills_data,
        experiences=experiences_data,
        job_title=body.job_title or "",
        job_description=body.job_description,
        seeker_profile=seeker_profile,
    )

    exp_by_id = {e.id: e for e in experiences}
    enriched = []
    for item in result.get("experiences", []):
        exp = exp_by_id.get(item["id"])
        if exp:
            enriched.append({
                **item,
                "title":           exp.title,
                "organization":    exp.organization,
                "start_date":      exp.start_date,
                "end_date":        exp.end_date,
                "is_current":      exp.is_current,
                "experience_type": exp.experience_type,
            })

    result["experiences"] = enriched
    return result


# ── Generera CV-utkast ────────────────────────────────────────────────────────

class GenerateCVRequest(BaseModel):
    job_description:        str
    matched_experience_ids: list[int]
    skills:                 list[str] = []


@router.post("/{kandidat_id}/generate-cv")
async def generate_cv_for_kandidat(
    kandidat_id: int,
    body: GenerateCVRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generera ett anpassat CV-utkast baserat på en kandidats kompetensbank."""
    _require_kandidat(kandidat_id, current_user, db)

    all_experiences = (
        db.query(CandidateExperienceEntry)
        .filter(CandidateExperienceEntry.candidate_profile_id == kandidat_id)
        .all()
    )
    if not all_experiences:
        raise HTTPException(status_code=400, detail="Kandidaten har inga erfarenheter i kompetensbanken")

    matched_ids = set(body.matched_experience_ids)
    exp_by_id   = {e.id: e for e in all_experiences}

    matched_data = [
        {
            "id":              exp.id,
            "title":           exp.title,
            "organization":    exp.organization,
            "start_date":      exp.start_date,
            "end_date":        exp.end_date,
            "is_current":      exp.is_current,
            "experience_type": exp.experience_type,
            "description":     exp.description,
            "achievements":    exp.achievements or [],
        }
        for eid in body.matched_experience_ids
        if (exp := exp_by_id.get(eid))
    ]

    ai_result = _ai_service.generate_cv_for_job(
        job_description=body.job_description,
        experiences_data=matched_data,
        skills=body.skills,
    )

    ai_highlights = {
        item["id"]: item.get("highlighted_achievements", [])
        for item in ai_result.get("experiences", [])
    }

    def sort_key(e):
        if e.is_current:
            return "9999-99"
        return e.start_date or "0000-00"

    timeline = []
    for exp in sorted(all_experiences, key=sort_key, reverse=True):
        is_matched = exp.id in matched_ids
        achievements = (
            ai_highlights.get(exp.id) or exp.achievements or []
            if is_matched
            else exp.achievements or []
        )
        timeline.append({
            "id":                       exp.id,
            "title":                    exp.title,
            "organization":             exp.organization,
            "start_date":               exp.start_date,
            "end_date":                 exp.end_date,
            "is_current":               exp.is_current,
            "experience_type":          exp.experience_type,
            "is_matched":               is_matched,
            "highlighted_achievements": achievements,
        })

    return {
        "pitch":       ai_result.get("pitch", ""),
        "experiences": timeline,
        "skills":      body.skills,
    }
