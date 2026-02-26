"""
Generates and stores vector embeddings for candidate competence entities.
Uses the existing AIService.generate_embeddings() (OpenAI text-embedding-3-small).
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.services.ai_service import AIService
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_education import CandidateEducation
from app.models.candidate_certification import CandidateCertification
from app.models.candidate_cv import CandidateCV

logger = logging.getLogger(__name__)
_ai = AIService()


# ── Text builders ────────────────────────────────────────────────────────────

def _skill_text(s: CandidateSkillEntry) -> str:
    return f"{s.skill_name} ({s.category or 'kompetens'})"


def _experience_text(e: CandidateExperienceEntry) -> str:
    parts = [e.title or ""]
    if e.organization:
        parts.append(f"at {e.organization}")
    period = " – ".join(filter(None, [e.start_date, "nu" if e.is_current else e.end_date]))
    if period:
        parts.append(f"({period})")
    if e.description:
        parts.append(e.description[:400])
    if e.achievements:
        parts.append("Achievements: " + "; ".join((e.achievements or [])[:5]))
    return " ".join(parts)


def _education_text(e: CandidateEducation) -> str:
    parts = [e.degree or ""]
    if e.field_of_study:
        parts.append(f"in {e.field_of_study}")
    if e.institution:
        parts.append(f"at {e.institution}")
    period = " – ".join(filter(None, [e.start_date, e.end_date]))
    if period:
        parts.append(f"({period})")
    if e.description:
        parts.append(e.description[:300])
    return " ".join(parts)


def _certification_text(c: CandidateCertification) -> str:
    parts = [c.name or ""]
    if c.issuer:
        parts.append(f"by {c.issuer}")
    if c.date:
        parts.append(f"({c.date})")
    if c.description:
        parts.append(c.description[:200])
    return " ".join(parts)


# ── Core vectorization ───────────────────────────────────────────────────────

def vectorize_candidate_cv(cv_id: int, db: Session) -> None:
    """
    Generate and store embeddings for all competence entities related to a
    CandidateCV.  Entities that already have an embedding are skipped.
    Marks the CV as is_vectorized = True on success.
    """
    cv = db.query(CandidateCV).filter(CandidateCV.id == cv_id).first()
    if not cv:
        logger.warning(f"CandidateCV {cv_id} not found for vectorization")
        return

    profile_id = cv.candidate_profile_id

    # ── Skills (all for the profile; embedding is shared across CV sources) ──
    skills = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == profile_id,
        CandidateSkillEntry.embedding.is_(None),
    ).all()
    for skill in skills:
        vec = _ai.generate_embeddings(_skill_text(skill))
        if vec:
            skill.embedding = vec

    # ── Work/project experiences from this CV ────────────────────────────────
    experiences = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == profile_id,
        CandidateExperienceEntry.embedding.is_(None),
    ).all()
    for exp in experiences:
        vec = _ai.generate_embeddings(_experience_text(exp))
        if vec:
            exp.embedding = vec

    # ── Education from this CV ───────────────────────────────────────────────
    educations = db.query(CandidateEducation).filter(
        CandidateEducation.candidate_profile_id == profile_id,
        CandidateEducation.source_cv_id == cv_id,
        CandidateEducation.embedding.is_(None),
    ).all()
    for edu in educations:
        vec = _ai.generate_embeddings(_education_text(edu))
        if vec:
            edu.embedding = vec

    # ── Certifications from this CV ──────────────────────────────────────────
    certs = db.query(CandidateCertification).filter(
        CandidateCertification.candidate_profile_id == profile_id,
        CandidateCertification.source_cv_id == cv_id,
        CandidateCertification.embedding.is_(None),
    ).all()
    for cert in certs:
        vec = _ai.generate_embeddings(_certification_text(cert))
        if vec:
            cert.embedding = vec

    cv.is_vectorized = True
    cv.vectorized_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(
        f"Vectorized CandidateCV {cv_id} for profile {profile_id}: "
        f"{len(skills)} skills, {len(experiences)} experiences, "
        f"{len(educations)} education, {len(certs)} certifications"
    )


def re_vectorize_candidate_cv(cv_id: int, db: Session) -> None:
    """Force re-vectorization by clearing existing embeddings first."""
    cv = db.query(CandidateCV).filter(CandidateCV.id == cv_id).first()
    if not cv:
        return

    profile_id = cv.candidate_profile_id

    for skill in db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == profile_id
    ).all():
        skill.embedding = None

    for exp in db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == profile_id
    ).all():
        exp.embedding = None

    for edu in db.query(CandidateEducation).filter(
        CandidateEducation.source_cv_id == cv_id
    ).all():
        edu.embedding = None

    for cert in db.query(CandidateCertification).filter(
        CandidateCertification.source_cv_id == cv_id
    ).all():
        cert.embedding = None

    cv.is_vectorized = False
    db.commit()
    vectorize_candidate_cv(cv_id, db)
