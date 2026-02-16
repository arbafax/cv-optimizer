from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import logging

from app.core.database import get_db
from app.models.cv import CV
from app.models.competence import SkillEntry, ExperienceEntry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/competence", tags=["Competence Bank"])


# ──────────────────────────────────────────
# Skill categorisation (rule-based, no AI)
# ──────────────────────────────────────────

CATEGORY_RULES = {
    "Programming Languages": [
        "python", "javascript", "typescript", "java", "c#", "c++", "c",
        "go", "rust", "swift", "kotlin", "ruby", "php", "scala", "r",
        "matlab", "bash", "powershell", "perl", "haskell", "elixir",
    ],
    "Frameworks & APIs": [
        "fastapi", "django", "flask", "spring", "express", "nestjs",
        "rails", "laravel", "asp.net", ".net", "react", "angular",
        "vue", "next.js", "nuxt", "svelte", "fastify", "graphql",
        "rest", "grpc", "openapi", "swagger",
    ],
    "Databases": [
        "postgresql", "postgres", "mysql", "sqlite", "mongodb", "redis",
        "elasticsearch", "cassandra", "dynamodb", "firestore", "oracle",
        "sql server", "mssql", "mariadb", "neo4j", "pgvector",
    ],
    "Cloud & DevOps": [
        "aws", "azure", "gcp", "google cloud", "docker", "kubernetes",
        "terraform", "ansible", "jenkins", "github actions", "ci/cd",
        "helm", "nginx", "linux", "unix", "heroku", "vercel", "netlify",
        "s3", "ec2", "lambda", "ecs",
    ],
    "AI & Machine Learning": [
        "machine learning", "deep learning", "tensorflow", "pytorch",
        "scikit-learn", "keras", "openai", "langchain", "llm",
        "nlp", "computer vision", "opencv", "huggingface", "transformers",
        "pandas", "numpy", "scipy", "jupyter",
    ],
    "Frontend": [
        "html", "css", "sass", "less", "tailwind", "bootstrap",
        "webpack", "vite", "babel", "figma", "ux", "ui design",
        "responsive design", "accessibility", "wcag",
    ],
    "Tools": [
        "git", "github", "gitlab", "bitbucket", "jira", "confluence",
        "notion", "slack", "postman", "vs code", "intellij", "vim",
    ],
    "Soft Skills": [
        "ledarskap", "kommunikation", "teamwork", "problemlösning",
        "agil", "scrum", "kanban", "projektledning", "mentorskap",
        "leadership", "communication", "project management", "agile",
    ],
    "Languages": [
        "svenska", "english", "engelska", "tyska", "franska",
        "spanska", "kinesiska", "japanese", "arabic", "norwegian",
        "danska", "finska",
    ],
}


def categorise_skill(skill_name: str) -> tuple[str, str]:
    """Returns (category, skill_type)."""
    lower = skill_name.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(kw in lower for kw in keywords):
            skill_type = (
                "soft"     if category == "Soft Skills" else
                "language" if category == "Languages"   else
                "technical"
            )
            return category, skill_type
    return "Övrigt", "technical"


# ──────────────────────────────────────────
# Core merge logic
# ──────────────────────────────────────────

def _merge_cv_into_bank(cv: CV, db: Session) -> dict:
    data           = cv.structured_data or {}
    skills_added   = 0
    exp_added      = 0
    duplicates     = 0

    # Collect all skills (top-level + tech tags from experiences/projects)
    raw_skills: list[str] = list(data.get("skills", []))
    for exp  in data.get("work_experience", []): raw_skills.extend(exp.get("technologies", []))
    for proj in data.get("projects", []):        raw_skills.extend(proj.get("technologies", []))

    # Deduplicate within this CV
    seen, unique_skills = set(), []
    for s in raw_skills:
        norm = s.strip()
        if norm and norm.lower() not in seen:
            seen.add(norm.lower())
            unique_skills.append(norm)

    for skill_name in unique_skills:
        existing = db.query(SkillEntry).filter(
            func.lower(SkillEntry.skill_name) == skill_name.lower()
        ).first()

        if existing:
            sources = list(existing.source_cv_ids or [])
            if cv.id not in sources:
                sources.append(cv.id)
                existing.source_cv_ids = sources
            duplicates += 1
        else:
            category, skill_type = categorise_skill(skill_name)
            db.add(SkillEntry(
                skill_name=skill_name,
                category=category,
                skill_type=skill_type,
                source_cv_ids=[cv.id],
            ))
            skills_added += 1

    # Only add experiences if this CV hasn't been merged before
    already_merged = db.query(ExperienceEntry).filter(
        ExperienceEntry.source_cv_id == cv.id
    ).count() > 0

    if not already_merged:
        for exp in data.get("work_experience", []):
            db.add(ExperienceEntry(
                title           = exp.get("position") or "Okänd position",
                organization    = exp.get("company"),
                experience_type = "work",
                start_date      = exp.get("start_date"),
                end_date        = exp.get("end_date"),
                is_current      = bool(exp.get("current", False)),
                description     = exp.get("description"),
                source_cv_id    = cv.id,
            ))
            exp_added += 1

        for edu in data.get("education", []):
            title = " - ".join(filter(None, [edu.get("degree"), edu.get("field_of_study")])) or "Utbildning"
            db.add(ExperienceEntry(
                title           = title,
                organization    = edu.get("institution"),
                experience_type = "education",
                start_date      = edu.get("start_date"),
                end_date        = edu.get("end_date"),
                is_current      = False,
                source_cv_id    = cv.id,
            ))
            exp_added += 1

        for cert in data.get("certifications", []):
            db.add(ExperienceEntry(
                title           = cert.get("name") or "Certifiering",
                organization    = cert.get("issuing_organization"),
                experience_type = "certification",
                start_date      = cert.get("issue_date"),
                end_date        = cert.get("expiry_date"),
                is_current      = False,
                source_cv_id    = cv.id,
            ))
            exp_added += 1

        for proj in data.get("projects", []):
            db.add(ExperienceEntry(
                title           = proj.get("name") or "Projekt",
                organization    = proj.get("role"),
                experience_type = "project",
                start_date      = proj.get("start_date"),
                end_date        = proj.get("end_date"),
                is_current      = False,
                description     = proj.get("description"),
                source_cv_id    = cv.id,
            ))
            exp_added += 1
    else:
        duplicates += db.query(ExperienceEntry).filter(
            ExperienceEntry.source_cv_id == cv.id
        ).count()

    db.commit()

    cv_name = (data.get("personal_info") or {}).get("full_name") or cv.filename
    return {
        "cv_name"           : cv_name,
        "skills_added"      : skills_added,
        "experiences_added" : exp_added,
        "duplicates_skipped": duplicates,
    }


# ──────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────

@router.post("/merge/{cv_id}")
async def merge_cv(cv_id: int, db: Session = Depends(get_db)):
    cv = db.query(CV).filter(CV.id == cv_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    return _merge_cv_into_bank(cv, db)


@router.post("/merge-all")
async def merge_all_cvs(db: Session = Depends(get_db)):
    cvs = db.query(CV).all()
    if not cvs:
        raise HTTPException(status_code=404, detail="No CVs found")

    total_skills, total_experiences, results = 0, 0, []
    for cv in cvs:
        r = _merge_cv_into_bank(cv, db)
        total_skills      += r["skills_added"]
        total_experiences += r["experiences_added"]
        results.append(r)

    return {
        "total_cvs_processed"    : len(cvs),
        "total_skills_added"     : total_skills,
        "total_experiences_added": total_experiences,
        "details"                : results,
    }


@router.get("/stats")
async def get_bank_stats(db: Session = Depends(get_db)):
    total_skills = db.query(SkillEntry).count()
    total_exp    = db.query(ExperienceEntry).count()

    all_sources: set = set()
    for row in db.query(SkillEntry.source_cv_ids).all():
        if row[0]:
            all_sources.update(row[0])

    skills_by_category: dict = {}
    for row in db.query(SkillEntry.category, func.count(SkillEntry.id)).group_by(SkillEntry.category).all():
        skills_by_category[row[0]] = row[1]

    return {
        "total_skills"          : total_skills,
        "total_experiences"     : total_exp,
        "total_source_documents": len(all_sources),
        "skills_by_category"    : skills_by_category,
    }


@router.get("/skills")
async def get_bank_skills(db: Session = Depends(get_db)):
    skills = db.query(SkillEntry).order_by(SkillEntry.category, SkillEntry.skill_name).all()
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
                "source_cv_id"   : e.source_cv_id,
            }
            for e in experiences
        ]
    }


@router.delete("/reset")
async def reset_bank(db: Session = Depends(get_db)):
    """Rensa hela kompetensbanken (för omprocessning)."""
    db.query(ExperienceEntry).delete()
    db.query(SkillEntry).delete()
    db.commit()
    return {"message": "Kompetensbanken rensad"}
