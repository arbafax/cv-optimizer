"""
API endpoints for CandidateCV management.
Serves both the logged-in user's own profile and seller-managed candidates.

Own profile  : /competence/cvs/*   (uses get_current_user → _get_or_create_profile)
Seller's cand: /kandidater/{id}/cvs/* (in kandidater.py — delegates to helpers here)
"""
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy import cast
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.candidate_profile import CandidateProfile
from app.models.candidate_cv import CandidateCV
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_education import CandidateEducation
from app.models.candidate_certification import CandidateCertification
from app.services.pdf_parser import PDFParser
from app.services.ai_service import AIService
from app.services.competence_service import merge_candidate_cv_into_bank
from app.services.embedding_service import vectorize_candidate_cv, re_vectorize_candidate_cv

logger    = logging.getLogger(__name__)
router    = APIRouter(prefix="/competence/cvs", tags=["Candidate CVs"])
_parser   = PDFParser()
_ai       = AIService()


# ── Helper — get or create the candidate profile for the current user ─────────

def _get_or_create_profile(user: User, db: Session) -> CandidateProfile:
    p = db.query(CandidateProfile).filter(CandidateProfile.user_id == user.id).first()
    if not p:
        p = CandidateProfile(user_id=user.id, email=user.email)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


# ── Shared processing pipeline (also called from kandidater.py) ───────────────

def process_and_store_cv(
    file_bytes: bytes,
    filename: str,
    candidate_profile_id: int,
    db: Session,
) -> CandidateCV:
    """
    Full pipeline:
      1. Store raw PDF
      2. Extract text
      3. AI → structured JSON (same format as CV.structured_data)
      4. Merge into competence tree (skills, experiences, education, certifications)
      5. Generate + store vector embeddings
    Returns the created CandidateCV object.
    """
    # 1. Persist raw file + basic record
    cv_record = CandidateCV(
        candidate_profile_id = candidate_profile_id,
        filename             = filename,
        file_data            = file_bytes,
        is_processed         = False,
        is_vectorized        = False,
    )
    db.add(cv_record)
    db.commit()
    db.refresh(cv_record)

    try:
        # 2. Extract text from PDF
        import io
        import tempfile, os
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        try:
            raw_text = _parser.extract_text(tmp_path) or ""
        finally:
            os.unlink(tmp_path)

        cv_record.raw_text = raw_text

        # 3. AI structuring
        cv_structure = _ai.structure_cv_text(raw_text)
        if not cv_structure:
            raise RuntimeError("AI structuring returned None")

        cv_record.structured_json = cv_structure.model_dump()
        cv_record.is_processed    = True
        db.commit()

        # Update profile description from summary (first CV sets it; user can edit later)
        profile = db.query(CandidateProfile).filter(
            CandidateProfile.id == candidate_profile_id
        ).first()
        if profile and not profile.description and cv_structure.summary:
            profile.description = cv_structure.summary
            db.commit()

        # 4. Merge into competence tree
        merge_candidate_cv_into_bank(cv_record, candidate_profile_id, db)

        # 5. Vectorize
        vectorize_candidate_cv(cv_record.id, db)

    except Exception as exc:
        logger.error(f"Error processing CandidateCV {cv_record.id}: {exc}", exc_info=True)
        # Leave partial record — user can retry via /vectorize endpoint
        db.rollback()
        db.refresh(cv_record)

    return cv_record


# ── Serialisation helper ──────────────────────────────────────────────────────

def _cv_summary(cv: CandidateCV, db: Session) -> dict:
    skill_count = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == cv.candidate_profile_id,
        cast(CandidateSkillEntry.source_cv_ids, JSONB).contains([cv.id]),
    ).count()
    exp_count = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == cv.candidate_profile_id,
        cast(CandidateExperienceEntry.source_cv_ids, JSONB).contains([cv.id]),
    ).count()
    edu_count  = db.query(CandidateEducation).filter(
        CandidateEducation.source_cv_id == cv.id
    ).count()
    cert_count = db.query(CandidateCertification).filter(
        CandidateCertification.source_cv_id == cv.id
    ).count()
    return {
        "id"           : cv.id,
        "filename"     : cv.filename,
        "upload_date"  : cv.upload_date.isoformat() if cv.upload_date else None,
        "is_processed" : cv.is_processed,
        "is_vectorized": cv.is_vectorized,
        "skill_count"  : skill_count,
        "experience_count": exp_count,
        "education_count" : edu_count,
        "certification_count": cert_count,
    }


# ── Own-profile endpoints ─────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a PDF, run AI structuring and vectorization for the current user's profile."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Endast PDF-filer är tillåtna")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Filen är för stor. Max 10 MB")

    profile = _get_or_create_profile(current_user, db)
    cv = process_and_store_cv(file_bytes, file.filename, profile.id, db)
    return _cv_summary(cv, db)


@router.get("/")
async def list_cvs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all CandidateCVs for the current user's profile."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        return []
    cvs = db.query(CandidateCV).filter(
        CandidateCV.candidate_profile_id == profile.id
    ).order_by(CandidateCV.upload_date.desc()).all()
    return [_cv_summary(cv, db) for cv in cvs]


@router.delete("/{cv_id}")
async def delete_cv(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a CandidateCV record and PDF blob. Competence data is kept."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil saknas")

    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == profile.id,
    ).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")

    _delete_cv_and_entries(cv, db)
    return {"message": f"'{cv.filename}' raderat"}


@router.post("/{cv_id}/vectorize")
async def vectorize_cv(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """(Re)generate vector embeddings for a CandidateCV."""
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil saknas")

    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == profile.id,
    ).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")
    if not cv.is_processed:
        raise HTTPException(status_code=400, detail="CV är inte behandlat ännu")

    re_vectorize_candidate_cv(cv_id, db)
    return _cv_summary(cv, db)


@router.get("/{cv_id}/file")
async def download_cv_file(
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the original PDF file."""
    from fastapi.responses import Response
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil saknas")

    cv = db.query(CandidateCV).filter(
        CandidateCV.id == cv_id,
        CandidateCV.candidate_profile_id == profile.id,
    ).first()
    if not cv or not cv.file_data:
        raise HTTPException(status_code=404, detail="Fil saknas")

    return Response(
        content=cv.file_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{cv.filename}"'},
    )


# ── Shared delete helper (also used by kandidater.py) ────────────────────────

def _delete_cv_and_entries(cv: CandidateCV, db: Session) -> None:
    """Remove CandidateCV record and PDF blob. Competence data (skills, experiences,
    education, certifications) is kept. The DB ondelete='SET NULL' constraint
    automatically nulls source_cv_id on any linked education/certification rows."""
    db.delete(cv)
    db.commit()
