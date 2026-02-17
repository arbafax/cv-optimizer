from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified
import logging

from app.models.competence import SkillEntry, ExperienceEntry

logger = logging.getLogger(__name__)


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


def merge_cv_into_bank(cv, db: Session) -> dict:
    """
    Extract skills and experiences from one CV and upsert into the competence bank.
    Returns counts of what was added / skipped.
    """
    data         = cv.structured_data or {}
    skills_added = 0
    exp_added    = 0
    duplicates   = 0

    # ── Skills ──────────────────────────────────────────────────────────────
    # Collect from top-level skills + tech tags in experiences and projects
    raw_skills: list[str] = list(data.get("skills", []))
    for exp  in data.get("work_experience", []): raw_skills.extend(exp.get("technologies", []))
    for proj in data.get("projects", []):        raw_skills.extend(proj.get("technologies", []))

    # Deduplicate within this CV before hitting the DB
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
                flag_modified(existing, "source_cv_ids")
            duplicates += 1
        else:
            category, skill_type = categorise_skill(skill_name)
            db.add(SkillEntry(
                skill_name    = skill_name,
                category      = category,
                skill_type    = skill_type,
                source_cv_ids = [cv.id],
            ))
            skills_added += 1

    # ── Experiences ─────────────────────────────────────────────────────────
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
            title = " - ".join(filter(None, [
                edu.get("degree"), edu.get("field_of_study")
            ])) or "Utbildning"
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


def clear_bank(db: Session) -> None:
    """Rensa hela kompetensbanken."""
    db.query(ExperienceEntry).delete()
    db.query(SkillEntry).delete()
    db.commit()


def rebuild_bank(cvs: list, db: Session) -> dict:
    """Rensa banken och bygg om den från en lista med CV-objekt."""
    clear_bank(db)
    total_skills, total_experiences = 0, 0
    for cv in cvs:
        result = merge_cv_into_bank(cv, db)
        total_skills      += result["skills_added"]
        total_experiences += result["experiences_added"]
    return {
        "total_cvs_processed"    : len(cvs),
        "total_skills_added"     : total_skills,
        "total_experiences_added": total_experiences,
    }
