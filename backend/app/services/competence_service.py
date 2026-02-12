"""
Competence Bank Merge Service
File: backend/app/services/competence_service.py

Merges CV data into the aggregated competence bank.
Handles deduplication of skills and experiences.
"""
import logging
import time
from typing import Optional
from dataclasses import dataclass, field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.competence import (
    SkillsCollection,
    ExperiencesPool,
    SkillExperienceEvidence,
    SourceDocuments,
    CompetenceMetadata,
)
from app.models.cv import CV
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# Result dataclass returned to the API endpoint
# ──────────────────────────────────────────────
@dataclass
class MergeResult:
    success: bool
    cv_id: int
    cv_name: str = ""
    skills_added: int = 0
    skills_updated: int = 0
    experiences_added: int = 0
    experiences_updated: int = 0
    links_created: int = 0
    duplicates_skipped: int = 0
    processing_time_seconds: float = 0.0
    warnings: list = field(default_factory=list)
    error: Optional[str] = None


# ──────────────────────────────────────────────
# Skill type classifier
# ──────────────────────────────────────────────
SOFT_SKILL_KEYWORDS = {
    "leadership", "communication", "teamwork", "collaboration",
    "problem solving", "critical thinking", "creativity", "adaptability",
    "time management", "project management", "presentation", "negotiation",
    "mentoring", "coaching", "conflict resolution", "empathy", "motivation",
    "organisation", "organization", "planning", "decision making",
    "analytical", "strategic", "interpersonal", "customer service",
}

LANGUAGE_KEYWORDS = {
    "swedish", "english", "german", "french", "spanish", "italian",
    "portuguese", "dutch", "mandarin", "chinese", "japanese", "arabic",
    "russian", "hindi", "korean", "svenska", "engelska", "tyska",
    "franska", "spanska",
}

TOOL_KEYWORDS = {
    "jira", "confluence", "slack", "teams", "notion", "trello",
    "figma", "sketch", "photoshop", "illustrator", "excel", "powerpoint",
    "word", "outlook", "salesforce", "hubspot", "zendesk",
    "github", "gitlab", "bitbucket", "jenkins", "circleci", "travis",
}

DOMAIN_KEYWORDS = {
    "finance", "healthcare", "e-commerce", "retail", "logistics",
    "manufacturing", "education", "marketing", "sales", "hr",
    "fintech", "medtech", "saas", "b2b", "b2c",
}


def classify_skill(skill_name: str) -> tuple[str, str]:
    """
    Returns (skill_type, category) for a given skill name.
    skill_type: technical | soft | language | tool | domain
    """
    lower = skill_name.lower().strip()

    if lower in LANGUAGE_KEYWORDS:
        return "language", "Languages"

    if lower in SOFT_SKILL_KEYWORDS or any(kw in lower for kw in SOFT_SKILL_KEYWORDS):
        return "soft", "Soft Skills"

    if lower in TOOL_KEYWORDS or any(kw in lower for kw in TOOL_KEYWORDS):
        return "tool", "Tools"

    if lower in DOMAIN_KEYWORDS or any(kw in lower for kw in DOMAIN_KEYWORDS):
        return "domain", "Domain Knowledge"

    # Default → technical
    # Assign a sub-category based on common patterns
    if any(kw in lower for kw in ["sql", "postgres", "mysql", "mongo", "redis", "database", "db"]):
        return "technical", "Databases"
    if any(kw in lower for kw in ["aws", "azure", "gcp", "cloud", "kubernetes", "docker", "terraform"]):
        return "technical", "Cloud & DevOps"
    if any(kw in lower for kw in ["react", "vue", "angular", "html", "css", "frontend", "javascript", "typescript"]):
        return "technical", "Frontend"
    if any(kw in lower for kw in ["python", "java", "go", "rust", "c++", "c#", "ruby", "php", "swift", "kotlin"]):
        return "technical", "Programming Languages"
    if any(kw in lower for kw in ["fastapi", "django", "flask", "spring", "rails", "express", "api", "rest", "graphql"]):
        return "technical", "Frameworks & APIs"
    if any(kw in lower for kw in ["machine learning", "ml", "ai", "deep learning", "nlp", "tensorflow", "pytorch"]):
        return "technical", "AI & Machine Learning"

    return "technical", "Technical Skills"


def is_duplicate_experience(
    existing: ExperiencesPool,
    exp_type: str,
    title: str,
    organization: Optional[str],
) -> bool:
    """
    Two experiences are duplicates if they have:
    - Same type
    - Same organization (case-insensitive)
    - Similar title (one contains the other)
    """
    if existing.experience_type != exp_type:
        return False

    # Both need an organization to compare
    if organization and existing.organization:
        org_match = existing.organization.lower().strip() == organization.lower().strip()
        title_match = (
            title.lower() in existing.title.lower()
            or existing.title.lower() in title.lower()
        )
        return org_match and title_match

    # No organization — compare title only (stricter)
    return existing.title.lower().strip() == title.lower().strip()


# ──────────────────────────────────────────────
# Main service class
# ──────────────────────────────────────────────
class CompetenceService:

    def __init__(self, db: Session):
        self.db = db
        self.ai = AIService()

    # ── Public entry point ─────────────────────
    def merge_cv(self, cv_id: int) -> MergeResult:
        """
        Merge a CV from the cvs table into the competence bank.

        Steps:
        1. Load CV from database
        2. Extract skills  → upsert into skills_collection
        3. Extract experiences → upsert into experiences_pool
        4. Link skills ↔ experiences
        5. Record source document
        """
        start = time.time()
        result = MergeResult(success=False, cv_id=cv_id)

        try:
            # 1. Load CV
            cv = self.db.query(CV).filter(CV.id == cv_id).first()
            if not cv:
                result.error = f"CV with id {cv_id} not found"
                return result

            result.cv_name = cv.filename
            structured = cv.structured_data
            logger.info(f"Merging CV {cv_id}: {cv.filename}")

            # 2. Merge skills
            skill_ids = self._merge_skills(structured, result)

            # 3. Merge experiences
            experience_ids = self._merge_experiences(structured, cv_id, cv.filename, result)

            # 4. Link skills ↔ experiences
            if skill_ids and experience_ids:
                self._link_skills_to_experiences(skill_ids, experience_ids, structured, result)

            # 5. Record source document
            self._record_source_document(cv_id, cv.filename, result)

            self.db.commit()

            result.success = True
            result.processing_time_seconds = round(time.time() - start, 2)
            logger.info(
                f"Merge complete for CV {cv_id}: "
                f"+{result.skills_added} skills, "
                f"+{result.experiences_added} experiences, "
                f"{result.duplicates_skipped} duplicates skipped"
            )

        except Exception as e:
            self.db.rollback()
            logger.error(f"Merge failed for CV {cv_id}: {e}", exc_info=True)
            result.error = str(e)
            result.processing_time_seconds = round(time.time() - start, 2)

        return result

    # ── Skills ─────────────────────────────────
    def _merge_skills(self, structured: dict, result: MergeResult) -> list[int]:
        """Upsert all skills from CV into skills_collection. Returns list of skill IDs."""
        skill_ids = []
        raw_skills: list[str] = structured.get("skills", [])

        for skill_name in raw_skills:
            if not skill_name or not skill_name.strip():
                continue

            skill_name = skill_name.strip()
            skill_id = self._upsert_skill(skill_name, result)
            if skill_id:
                skill_ids.append(skill_id)

        return skill_ids

    def _upsert_skill(self, skill_name: str, result: MergeResult) -> Optional[int]:
        """Insert or update a single skill. Returns skill ID."""
        # Case-insensitive lookup
        existing = (
            self.db.query(SkillsCollection)
            .filter(func.lower(SkillsCollection.skill_name) == skill_name.lower())
            .first()
        )

        if existing:
            # Already exists — bump confidence slightly
            existing.confidence_score = min(float(existing.confidence_score or 1.0) + 0.05, 1.0)
            result.skills_updated += 1
            return existing.id

        # New skill — classify and create embedding
        skill_type, category = classify_skill(skill_name)
        embedding = self._safe_embedding(skill_name)

        skill = SkillsCollection(
            skill_name=skill_name,
            skill_type=skill_type,
            category=category,
            proficiency_level=None,   # Will be enriched later
            years_experience=None,
            confidence_score=1.0,
            embedding=embedding,
        )
        self.db.add(skill)
        self.db.flush()   # Get the id without committing
        result.skills_added += 1
        logger.debug(f"New skill: {skill_name} ({skill_type} / {category})")
        return skill.id

    # ── Experiences ────────────────────────────
    def _merge_experiences(
        self,
        structured: dict,
        cv_id: int,
        filename: str,
        result: MergeResult,
    ) -> list[int]:
        """Upsert all experiences from CV. Returns list of experience IDs."""
        experience_ids = []

        # Work experience
        for exp in structured.get("work_experience", []):
            eid = self._upsert_experience(
                exp_type="work",
                title=exp.get("position") or "Unknown position",
                organization=exp.get("company"),
                location=exp.get("location"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date"),
                is_current=exp.get("current", False),
                description=exp.get("description"),
                achievements=exp.get("achievements", []),
                technologies=exp.get("technologies", []),
                cv_id=cv_id,
                filename=filename,
                result=result,
            )
            if eid:
                experience_ids.append(eid)

        # Education
        for edu in structured.get("education", []):
            degree = edu.get("degree") or ""
            field_of_study = edu.get("field_of_study") or ""
            title = f"{degree} {field_of_study}".strip() or "Unknown degree"
            eid = self._upsert_experience(
                exp_type="education",
                title=title,
                organization=edu.get("institution"),
                location=None,
                start_date=edu.get("start_date"),
                end_date=edu.get("end_date"),
                is_current=False,
                description=None,
                achievements=edu.get("achievements", []),
                technologies=[],
                cv_id=cv_id,
                filename=filename,
                result=result,
            )
            if eid:
                experience_ids.append(eid)

        # Certifications
        for cert in structured.get("certifications", []):
            if not cert.get("name"):
                continue
            eid = self._upsert_experience(
                exp_type="certification",
                title=cert.get("name"),
                organization=cert.get("issuing_organization"),
                location=None,
                start_date=cert.get("issue_date"),
                end_date=cert.get("expiry_date"),
                is_current=False,
                description=None,
                achievements=[],
                technologies=[],
                cv_id=cv_id,
                filename=filename,
                result=result,
            )
            if eid:
                experience_ids.append(eid)

        # Projects
        for proj in structured.get("projects", []):
            if not proj.get("name"):
                continue
            eid = self._upsert_experience(
                exp_type="project",
                title=proj.get("name"),
                organization=None,
                location=None,
                start_date=proj.get("start_date"),
                end_date=proj.get("end_date"),
                is_current=False,
                description=proj.get("description"),
                achievements=[],
                technologies=proj.get("technologies", []),
                cv_id=cv_id,
                filename=filename,
                result=result,
            )
            if eid:
                experience_ids.append(eid)

        return experience_ids

    def _upsert_experience(
        self,
        exp_type: str,
        title: str,
        organization: Optional[str],
        location: Optional[str],
        start_date: Optional[str],
        end_date: Optional[str],
        is_current: bool,
        description: Optional[str],
        achievements: list,
        technologies: list,
        cv_id: int,
        filename: str,
        result: MergeResult,
    ) -> Optional[int]:
        """Insert or update a single experience. Returns experience ID."""

        # Check for duplicate
        existing_list = (
            self.db.query(ExperiencesPool)
            .filter(ExperiencesPool.experience_type == exp_type)
            .all()
        )
        for existing in existing_list:
            if is_duplicate_experience(existing, exp_type, title, organization):
                # Update with richer data if available
                if description and not existing.description:
                    existing.description = description
                if achievements and not existing.achievements:
                    existing.achievements = achievements
                if technologies:
                    existing_techs = set(existing.technologies or [])
                    new_techs = set(technologies)
                    existing.technologies = list(existing_techs | new_techs)
                # Update end date if CV has "current"
                if is_current:
                    existing.is_current = True
                    existing.end_date = None

                result.duplicates_skipped += 1
                result.experiences_updated += 1
                return existing.id

        # New experience — generate embedding from title + org + achievements
        embed_text = f"{title} {organization or ''} {' '.join(achievements[:3])}"
        embedding = self._safe_embedding(embed_text)

        exp = ExperiencesPool(
            experience_type=exp_type,
            title=title,
            organization=organization,
            location=location,
            start_date=start_date,
            end_date=end_date,
            is_current=is_current,
            description=description,
            achievements=achievements or [],
            technologies=technologies or [],
            source_cv_id=cv_id,
            source_document_name=filename,
            confidence_score=1.0,
            embedding=embedding,
        )
        self.db.add(exp)
        self.db.flush()
        result.experiences_added += 1
        logger.debug(f"New experience: {exp_type} — {title} @ {organization}")
        return exp.id

    # ── Skill ↔ Experience links ───────────────
    def _link_skills_to_experiences(
        self,
        skill_ids: list[int],
        experience_ids: list[int],
        structured: dict,
        result: MergeResult,
    ):
        """
        Create links between skills and experiences.

        Strategy:
        - For work experience: link skills from technologies[] + global skills
        - For all experiences: link all skills (broad link)

        We keep it simple: link every skill to every work experience.
        More targeted linking can be added later via AI analysis.
        """
        # Collect per-experience technology skills to make targeted links
        work_exps = structured.get("work_experience", [])

        for exp_id in experience_ids:
            exp = self.db.query(ExperiencesPool).filter(ExperiencesPool.id == exp_id).first()
            if not exp:
                continue

            exp_techs = [t.lower() for t in (exp.technologies or [])]

            for skill_id in skill_ids:
                skill = self.db.query(SkillsCollection).filter(SkillsCollection.id == skill_id).first()
                if not skill:
                    continue

                # Only link if skill is relevant to this experience
                # (tech skill mentioned in experience technologies, OR it's a work experience)
                skill_lower = skill.skill_name.lower()
                is_relevant = (
                    skill_lower in exp_techs
                    or exp.experience_type == "work"
                )
                if not is_relevant:
                    continue

                # Check if link already exists
                exists = (
                    self.db.query(SkillExperienceEvidence)
                    .filter_by(skill_id=skill_id, experience_id=exp_id)
                    .first()
                )
                if not exists:
                    strength = 1.0 if skill_lower in exp_techs else 0.7
                    link = SkillExperienceEvidence(
                        skill_id=skill_id,
                        experience_id=exp_id,
                        evidence_strength=strength,
                        context=f"Linked from {exp.experience_type}: {exp.title}",
                    )
                    self.db.add(link)
                    result.links_created += 1

    # ── Source document tracking ───────────────
    def _record_source_document(self, cv_id: int, filename: str, result: MergeResult):
        """Record this CV as a processed source document."""
        # Don't insert duplicates
        existing = (
            self.db.query(SourceDocuments)
            .filter_by(cv_id=cv_id, document_type="cv")
            .first()
        )
        if existing:
            existing.skills_extracted = result.skills_added + result.skills_updated
            existing.experiences_extracted = result.experiences_added + result.experiences_updated
            return

        doc = SourceDocuments(
            document_type="cv",
            original_filename=filename,
            cv_id=cv_id,
            skills_extracted=result.skills_added + result.skills_updated,
            experiences_extracted=result.experiences_added + result.experiences_updated,
            processing_status="completed",
        )
        self.db.add(doc)

    # ── Helpers ────────────────────────────────
    def _safe_embedding(self, text: str) -> Optional[list]:
        """Generate embedding, return None on failure (non-fatal)."""
        try:
            return self.ai.generate_embeddings(text[:500])  # cap length
        except Exception as e:
            logger.warning(f"Embedding generation failed (non-fatal): {e}")
            return None

    # ── Read methods ───────────────────────────
    def get_bank_stats(self) -> dict:
        """Return current competence bank statistics."""
        meta = self.db.query(CompetenceMetadata).first()

        skills_by_type = dict(
            self.db.query(SkillsCollection.skill_type, func.count())
            .group_by(SkillsCollection.skill_type)
            .all()
        )
        skills_by_category = dict(
            self.db.query(SkillsCollection.category, func.count())
            .group_by(SkillsCollection.category)
            .order_by(func.count().desc())
            .limit(10)
            .all()
        )
        exp_by_type = dict(
            self.db.query(ExperiencesPool.experience_type, func.count())
            .group_by(ExperiencesPool.experience_type)
            .all()
        )

        return {
            "total_skills": meta.total_skills if meta else 0,
            "total_experiences": meta.total_experiences if meta else 0,
            "total_source_documents": meta.total_source_documents if meta else 0,
            "last_updated": meta.last_updated if meta else None,
            "skills_by_type": skills_by_type,
            "skills_by_category": skills_by_category,
            "experiences_by_type": exp_by_type,
        }

    def get_all_skills(self, skill_type: Optional[str] = None) -> list:
        """Return all skills, optionally filtered by type."""
        q = self.db.query(SkillsCollection)
        if skill_type:
            q = q.filter(SkillsCollection.skill_type == skill_type)
        return q.order_by(SkillsCollection.category, SkillsCollection.skill_name).all()

    def get_all_experiences(self, exp_type: Optional[str] = None) -> list:
        """Return all experiences, optionally filtered by type."""
        q = self.db.query(ExperiencesPool)
        if exp_type:
            q = q.filter(ExperiencesPool.experience_type == exp_type)
        return q.order_by(
            ExperiencesPool.is_current.desc(),
            ExperiencesPool.start_date.desc()
        ).all()
