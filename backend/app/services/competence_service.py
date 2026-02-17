from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified
import re
import logging

from app.models.competence import SkillEntry, ExperienceEntry

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Skill categorisation (rule-based)
# ──────────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────────
# Experience deduplication helpers
# ──────────────────────────────────────────────────────────────────────────────

def _normalise(text: str | None) -> str:
    """Lowercase, strip och ta bort skiljetecken för jämförelse."""
    if not text:
        return ""
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def _experience_key(title: str | None, organization: str | None, start_date: str | None) -> str:
    """Nyckel för att identifiera duplikat-erfarenheter."""
    return f"{_normalise(title)}|{_normalise(organization)}|{_normalise(start_date)}"


def _merge_descriptions(existing: str | None, incoming: str | None) -> str | None:
    """
    Slå ihop två beskrivningar utan dubbletter.
    Strategi:
    1. Dela upp i meningar.
    2. Behåll alla unika meningar (case-insensitive jämförelse).
    3. Returnera den sammansatta texten.
    """
    if not existing and not incoming:
        return None
    if not existing:
        return incoming
    if not incoming:
        return existing

    def split_sentences(text: str) -> list[str]:
        # Dela på punkt, utropstecken, frågetecken följt av mellanslag eller slut
        parts = re.split(r'(?<=[.!?])\s+', text.strip())
        return [p.strip() for p in parts if p.strip()]

    existing_sentences  = split_sentences(existing)
    incoming_sentences  = split_sentences(incoming)

    # Normaliserade versioner för jämförelse
    seen_normalised = {_normalise(s) for s in existing_sentences}

    merged = list(existing_sentences)
    for sentence in incoming_sentences:
        if _normalise(sentence) not in seen_normalised:
            merged.append(sentence)
            seen_normalised.add(_normalise(sentence))

    return " ".join(merged)


def _merge_skill_list(existing: list, incoming: list) -> list:
    """Slå ihop två skill-listor utan dubbletter (case-insensitive)."""
    seen  = {s.lower() for s in existing}
    result = list(existing)
    for s in incoming:
        if s.lower() not in seen:
            result.append(s)
            seen.add(s.lower())
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Core merge logic
# ──────────────────────────────────────────────────────────────────────────────

def merge_cv_into_bank(cv, db: Session) -> dict:
    """
    Extrahera skills och erfarenheter från ett CV och upserta i kompetensbanken.
    Returnerar statistik för vad som lades till / hoppades över.
    """
    data         = cv.structured_data or {}
    skills_added = 0
    exp_added    = 0
    exp_merged   = 0   # duplikat som slogs ihop med befintlig post
    duplicates   = 0

    # ── Skills ──────────────────────────────────────────────────────────────
    raw_skills: list[str] = list(data.get("skills", []))
    for exp  in data.get("work_experience", []): raw_skills.extend(exp.get("technologies", []))
    for proj in data.get("projects", []):        raw_skills.extend(proj.get("technologies", []))

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

    def _upsert_experience(
        title: str,
        organization: str | None,
        experience_type: str,
        start_date: str | None,
        end_date: str | None,
        is_current: bool,
        description: str | None,
        related_skills: list[str],
        achievements: list[str] | None = None,
    ):
        nonlocal exp_added, exp_merged

        key      = _experience_key(title, organization, start_date)
        existing = db.query(ExperienceEntry).filter(
            ExperienceEntry.experience_type == experience_type,
            func.lower(func.regexp_replace(ExperienceEntry.title,       r'[^\w\s]', '', 'g'))
            == _normalise(title),
            func.lower(func.regexp_replace(
                func.coalesce(ExperienceEntry.organization, ''), r'[^\w\s]', '', 'g'))
            == _normalise(organization),
            func.lower(func.coalesce(ExperienceEntry.start_date, ''))
            == _normalise(start_date),
        ).first()

        if existing:
            # Slå ihop med befintlig post
            changed = False

            merged_desc = _merge_descriptions(existing.description, description)
            if merged_desc != existing.description:
                existing.description = merged_desc
                changed = True

            merged_skills = _merge_skill_list(existing.related_skills or [], related_skills)
            if merged_skills != existing.related_skills:
                existing.related_skills = merged_skills
                flag_modified(existing, "related_skills")
                changed = True

            if achievements:
                merged_ach = _merge_skill_list(existing.achievements or [], achievements)
                if merged_ach != existing.achievements:
                    existing.achievements = merged_ach
                    flag_modified(existing, "achievements")
                    changed = True

            sources = list(existing.source_cv_ids or [])
            if cv.id not in sources:
                sources.append(cv.id)
                existing.source_cv_ids = sources
                flag_modified(existing, "source_cv_ids")
                changed = True

            # Uppdatera is_current om nyaste uppgiften säger "nuvarande"
            if is_current and not existing.is_current:
                existing.is_current = True
                changed = True

            if changed:
                exp_merged += 1
        else:
            db.add(ExperienceEntry(
                title           = title,
                organization    = organization,
                experience_type = experience_type,
                start_date      = start_date,
                end_date        = end_date,
                is_current      = is_current,
                description     = description,
                achievements    = achievements or [],
                related_skills  = related_skills,
                source_cv_ids   = [cv.id],
                source_cv_id    = cv.id,   # bakåtkompatibilitet
            ))
            exp_added += 1

    # Arbetslivserfarenhet
    for exp in data.get("work_experience", []):
        skills = list(exp.get("technologies", []))
        _upsert_experience(
            title           = exp.get("position") or "Okänd position",
            organization    = exp.get("company"),
            experience_type = "work",
            start_date      = exp.get("start_date"),
            end_date        = exp.get("end_date"),
            is_current      = bool(exp.get("current", False)),
            description     = exp.get("description"),
            related_skills  = skills,
            achievements    = list(exp.get("achievements", [])),
        )

    # Utbildning
    for edu in data.get("education", []):
        title = " - ".join(filter(None, [edu.get("degree"), edu.get("field_of_study")])) or "Utbildning"
        _upsert_experience(
            title           = title,
            organization    = edu.get("institution"),
            experience_type = "education",
            start_date      = edu.get("start_date"),
            end_date        = edu.get("end_date"),
            is_current      = False,
            description     = None,
            related_skills  = [],
            achievements    = list(edu.get("achievements", [])),
        )

    # Certifieringar
    for cert in data.get("certifications", []):
        _upsert_experience(
            title           = cert.get("name") or "Certifiering",
            organization    = cert.get("issuing_organization"),
            experience_type = "certification",
            start_date      = cert.get("issue_date"),
            end_date        = cert.get("expiry_date"),
            is_current      = False,
            description     = None,
            related_skills  = [],
        )

    # Projekt
    for proj in data.get("projects", []):
        skills = list(proj.get("technologies", []))
        _upsert_experience(
            title           = proj.get("name") or "Projekt",
            organization    = proj.get("role"),
            experience_type = "project",
            start_date      = proj.get("start_date"),
            end_date        = proj.get("end_date"),
            is_current      = False,
            description     = proj.get("description"),
            related_skills  = skills,
        )

    db.commit()

    cv_name = (data.get("personal_info") or {}).get("full_name") or cv.filename
    return {
        "cv_name"           : cv_name,
        "skills_added"      : skills_added,
        "experiences_added" : exp_added,
        "experiences_merged": exp_merged,
        "duplicates_skipped": duplicates,
    }


def merge_experiences(experience_ids: list[int], db: Session) -> dict:
    """
    Slå ihop flera erfarenhetsposter till en.
    Behåller den första som bas och sammanfogar resten.
    """
    if len(experience_ids) < 2:
        raise ValueError("Minst 2 erfarenheter krävs för sammanslagning")

    experiences = db.query(ExperienceEntry).filter(
        ExperienceEntry.id.in_(experience_ids)
    ).all()

    if len(experiences) < 2:
        raise ValueError("Kunde inte hitta tillräckligt med erfarenheter")

    # Sort so we process in the order the caller gave us
    id_order = {eid: i for i, eid in enumerate(experience_ids)}
    experiences.sort(key=lambda e: id_order.get(e.id, 999))

    base = experiences[0]

    for other in experiences[1:]:
        base.description = _merge_descriptions(base.description, other.description)

        base.related_skills = _merge_skill_list(
            base.related_skills or [], other.related_skills or []
        )
        flag_modified(base, "related_skills")

        base.achievements = _merge_skill_list(
            base.achievements or [], other.achievements or []
        )
        flag_modified(base, "achievements")

        sources = set(base.source_cv_ids or [])
        sources.update(other.source_cv_ids or [])
        base.source_cv_ids = list(sources)
        flag_modified(base, "source_cv_ids")

        if other.title and len(other.title) > len(base.title or ""):
            base.title = other.title

        if other.organization and len(other.organization) > len(base.organization or ""):
            base.organization = other.organization

        if other.start_date and (not base.start_date or other.start_date < base.start_date):
            base.start_date = other.start_date
        if other.end_date and (not base.end_date or other.end_date > base.end_date):
            base.end_date = other.end_date

        if other.is_current:
            base.is_current = True

        db.delete(other)

    db.commit()

    return {
        "id": base.id,
        "title": base.title,
        "organization": base.organization,
        "experience_type": base.experience_type,
        "start_date": base.start_date,
        "end_date": base.end_date,
        "is_current": base.is_current,
        "description": base.description,
        "achievements": base.achievements or [],
        "related_skills": base.related_skills or [],
        "source_cv_ids": base.source_cv_ids or [],
        "merged_count": len(experiences),
    }


def clear_bank(db: Session) -> None:
    """Rensa hela kompetensbanken."""
    db.query(ExperienceEntry).delete()
    db.query(SkillEntry).delete()
    db.commit()


def rebuild_bank(cvs: list, db: Session) -> dict:
    """Rensa banken och bygg om från en lista med CV-objekt."""
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
