from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified
import re
import logging

from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_education import CandidateEducation
from app.models.candidate_certification import CandidateCertification

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# Skill categorisation (rule-based)
# ──────────────────────────────────────────────────────────────────────────────

CATEGORY_RULES = {
    "Mjukvaruutveckling": [
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
    if not text:
        return ""
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def _experience_key(title: str | None, organization: str | None, start_date: str | None) -> str:
    return f"{_normalise(title)}|{_normalise(organization)}|{_normalise(start_date)}"


def _merge_descriptions(existing: str | None, incoming: str | None) -> str | None:
    if not existing and not incoming:
        return None
    if not existing:
        return incoming
    if not incoming:
        return existing

    def split_sentences(text: str) -> list[str]:
        parts = re.split(r'(?<=[.!?])\s+', text.strip())
        return [p.strip() for p in parts if p.strip()]

    existing_sentences = split_sentences(existing)
    incoming_sentences = split_sentences(incoming)
    seen_normalised    = {_normalise(s) for s in existing_sentences}

    merged = list(existing_sentences)
    for sentence in incoming_sentences:
        if _normalise(sentence) not in seen_normalised:
            merged.append(sentence)
            seen_normalised.add(_normalise(sentence))

    return " ".join(merged)


def _merge_skill_list(existing: list, incoming: list) -> list:
    seen   = {s.lower() for s in existing}
    result = list(existing)
    for s in incoming:
        if s.lower() not in seen:
            result.append(s)
            seen.add(s.lower())
    return result


# ──────────────────────────────────────────────────────────────────────────────
# Core merge logic
# ──────────────────────────────────────────────────────────────────────────────

def merge_cv_into_bank(cv, candidate_profile_id: int, db: Session) -> dict:
    """
    Extrahera skills och erfarenheter från ett CV och upserta i kompetensbanken.
    Filtrerar alltid på candidate_profile_id för att hålla data isolerad per profil.
    """
    data         = cv.structured_data or {}
    skills_added = 0
    exp_added    = 0
    exp_merged   = 0
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
        existing = db.query(CandidateSkillEntry).filter(
            CandidateSkillEntry.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateSkillEntry.skill_name) == skill_name.lower(),
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
            db.add(CandidateSkillEntry(
                candidate_profile_id = candidate_profile_id,
                skill_name           = skill_name,
                category             = category,
                skill_type           = skill_type,
                source_cv_ids        = [cv.id],
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

        existing = db.query(CandidateExperienceEntry).filter(
            CandidateExperienceEntry.candidate_profile_id == candidate_profile_id,
            CandidateExperienceEntry.experience_type == experience_type,
            func.lower(func.regexp_replace(CandidateExperienceEntry.title,       r'[^\w\s]', '', 'g'))
            == _normalise(title),
            func.lower(func.regexp_replace(
                func.coalesce(CandidateExperienceEntry.organization, ''), r'[^\w\s]', '', 'g'))
            == _normalise(organization),
            func.lower(func.coalesce(CandidateExperienceEntry.start_date, ''))
            == _normalise(start_date),
        ).first()

        if existing:
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

            if is_current and not existing.is_current:
                existing.is_current = True
                changed = True

            if changed:
                exp_merged += 1
        else:
            db.add(CandidateExperienceEntry(
                candidate_profile_id = candidate_profile_id,
                title                = title,
                organization         = organization,
                experience_type      = experience_type,
                start_date           = start_date,
                end_date             = end_date,
                is_current           = is_current,
                description          = description,
                achievements         = achievements or [],
                related_skills       = related_skills,
                source_cv_ids        = [cv.id],
            ))
            exp_added += 1

    for exp in data.get("work_experience", []):
        _upsert_experience(
            title           = exp.get("position") or "Okänd position",
            organization    = exp.get("company"),
            experience_type = "work",
            start_date      = exp.get("start_date"),
            end_date        = exp.get("end_date"),
            is_current      = bool(exp.get("current", False)),
            description     = exp.get("description"),
            related_skills  = list(exp.get("technologies", [])),
            achievements    = list(exp.get("achievements", [])),
        )

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

    for proj in data.get("projects", []):
        _upsert_experience(
            title           = proj.get("name") or "Projekt",
            organization    = proj.get("role"),
            experience_type = "project",
            start_date      = proj.get("start_date"),
            end_date        = proj.get("end_date"),
            is_current      = False,
            description     = proj.get("description"),
            related_skills  = list(proj.get("technologies", [])),
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


def clear_bank(candidate_profile_id: int, db: Session) -> None:
    """Rensa kompetensbanken för en specifik profil."""
    db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.candidate_profile_id == candidate_profile_id
    ).delete()
    db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.candidate_profile_id == candidate_profile_id
    ).delete()
    db.commit()


def rebuild_bank(cvs: list, candidate_profile_id: int, db: Session) -> dict:
    """Rensa och bygg om kompetensbanken från en lista med CV-objekt."""
    clear_bank(candidate_profile_id, db)
    total_skills, total_experiences = 0, 0
    for cv in cvs:
        result = merge_cv_into_bank(cv, candidate_profile_id, db)
        total_skills      += result["skills_added"]
        total_experiences += result["experiences_added"]
    return {
        "total_cvs_processed"    : len(cvs),
        "total_skills_added"     : total_skills,
        "total_experiences_added": total_experiences,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Enhanced merge for CandidateCV — populates education + certifications too
# ──────────────────────────────────────────────────────────────────────────────

def merge_candidate_cv_into_bank(
    candidate_cv,          # CandidateCV ORM object
    candidate_profile_id: int,
    db: Session,
) -> dict:
    """
    Full merge for CandidateCV objects.  In addition to skills and work/project
    experiences (handled by the base merge), this function also populates:
      - CandidateEducation
      - CandidateCertification
    The candidate_cv.structured_json uses the same format as CV.structured_data.
    """
    data            = candidate_cv.structured_json or {}
    cv_id           = candidate_cv.id
    skills_added    = 0
    exp_added       = 0
    exp_merged      = 0
    duplicates      = 0
    edu_added       = 0
    cert_added      = 0

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
        existing = db.query(CandidateSkillEntry).filter(
            CandidateSkillEntry.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateSkillEntry.skill_name) == skill_name.lower(),
        ).first()
        if existing:
            sources = list(existing.source_cv_ids or [])
            if cv_id not in sources:
                sources.append(cv_id)
                existing.source_cv_ids = sources
                flag_modified(existing, "source_cv_ids")
            duplicates += 1
        else:
            category, skill_type = categorise_skill(skill_name)
            db.add(CandidateSkillEntry(
                candidate_profile_id = candidate_profile_id,
                skill_name           = skill_name,
                category             = category,
                skill_type           = skill_type,
                source_cv_ids        = [cv_id],
            ))
            skills_added += 1

    # ── Work experiences ─────────────────────────────────────────────────────
    for w in data.get("work_experience", []):
        title  = w.get("position") or w.get("title") or "Okänd roll"
        org    = w.get("company")  or w.get("organization")
        start  = w.get("start_date")
        end    = w.get("end_date")
        current= bool(w.get("current") or w.get("is_current"))
        key    = _experience_key(title, org, start)

        existing = db.query(CandidateExperienceEntry).filter(
            CandidateExperienceEntry.candidate_profile_id == candidate_profile_id,
            CandidateExperienceEntry.experience_type == "work",
            func.lower(func.regexp_replace(CandidateExperienceEntry.title, r'[^\w\s]', '', 'g'))
            == _normalise(title),
        ).first()

        if existing:
            existing.description  = _merge_descriptions(existing.description, w.get("description"))
            existing.achievements = list(dict.fromkeys(
                (existing.achievements or []) + (w.get("achievements") or [])
            ))
            existing.related_skills = _merge_skill_list(
                existing.related_skills or [], w.get("technologies") or []
            )
            sources = list(existing.source_cv_ids or [])
            if cv_id not in sources:
                sources.append(cv_id)
                existing.source_cv_ids = sources
                flag_modified(existing, "source_cv_ids")
            flag_modified(existing, "achievements")
            flag_modified(existing, "related_skills")
            exp_merged += 1
        else:
            db.add(CandidateExperienceEntry(
                candidate_profile_id = candidate_profile_id,
                experience_type      = "work",
                title                = title,
                organization         = org,
                start_date           = start,
                end_date             = end,
                is_current           = current,
                description          = w.get("description"),
                achievements         = list(w.get("achievements") or []),
                related_skills       = list(w.get("technologies") or []),
                source_cv_ids        = [cv_id],
            ))
            exp_added += 1

    # ── Projects ─────────────────────────────────────────────────────────────
    for proj in data.get("projects", []):
        title = proj.get("name") or "Projekt"
        db.add(CandidateExperienceEntry(
            candidate_profile_id = candidate_profile_id,
            experience_type      = "project",
            title                = title,
            organization         = proj.get("role"),
            start_date           = proj.get("start_date"),
            end_date             = proj.get("end_date"),
            is_current           = False,
            description          = proj.get("description"),
            achievements         = [],
            related_skills       = list(proj.get("technologies") or []),
            source_cv_ids        = [cv_id],
        ))
        exp_added += 1

    # ── Education ────────────────────────────────────────────────────────────
    for edu in data.get("education", []):
        institution = edu.get("institution") or ""
        degree      = edu.get("degree") or edu.get("field_of_study") or "Utbildning"

        # Dedup: same degree + institution
        existing_edu = db.query(CandidateEducation).filter(
            CandidateEducation.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateEducation.institution) == institution.lower(),
            func.lower(CandidateEducation.degree)      == degree.lower(),
        ).first()

        if not existing_edu:
            db.add(CandidateEducation(
                candidate_profile_id = candidate_profile_id,
                source_cv_id         = cv_id,
                degree               = degree,
                institution          = institution or None,
                field_of_study       = edu.get("field_of_study"),
                start_date           = edu.get("start_date"),
                end_date             = edu.get("end_date"),
                description          = "; ".join(edu.get("achievements") or []) or None,
            ))
            edu_added += 1

    # ── Certifications ───────────────────────────────────────────────────────
    for cert in data.get("certifications", []):
        name   = cert.get("name") or "Certifiering"
        issuer = cert.get("issuing_organization") or cert.get("issuer")

        existing_cert = db.query(CandidateCertification).filter(
            CandidateCertification.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateCertification.name) == name.lower(),
        ).first()

        if not existing_cert:
            db.add(CandidateCertification(
                candidate_profile_id = candidate_profile_id,
                source_cv_id         = cv_id,
                name                 = name,
                issuer               = issuer,
                date                 = cert.get("issue_date") or cert.get("date"),
                description          = None,
            ))
            cert_added += 1

    db.commit()

    cv_name = (data.get("personal_info") or {}).get("full_name") or candidate_cv.filename
    return {
        "cv_name"           : cv_name,
        "skills_added"      : skills_added,
        "experiences_added" : exp_added,
        "experiences_merged": exp_merged,
        "education_added"   : edu_added,
        "certifications_added": cert_added,
        "duplicates_skipped": duplicates,
    }


# ── Education CRUD ────────────────────────────────────────────────────────────

def get_education(candidate_profile_id: int, db: Session) -> list:
    rows = db.query(CandidateEducation).filter(
        CandidateEducation.candidate_profile_id == candidate_profile_id
    ).order_by(CandidateEducation.start_date.desc().nullsfirst()).all()
    return [_edu_to_dict(e) for e in rows]


def add_education(data: dict, candidate_profile_id: int, db: Session) -> dict:
    edu = CandidateEducation(
        candidate_profile_id = candidate_profile_id,
        degree               = data["degree"],
        institution          = data.get("institution"),
        field_of_study       = data.get("field_of_study"),
        start_date           = data.get("start_date"),
        end_date             = data.get("end_date"),
        description          = data.get("description"),
    )
    db.add(edu)
    db.commit()
    db.refresh(edu)
    return _edu_to_dict(edu)


def delete_education(edu_id: int, candidate_profile_id: int, db: Session) -> None:
    edu = db.query(CandidateEducation).filter(
        CandidateEducation.id == edu_id,
        CandidateEducation.candidate_profile_id == candidate_profile_id,
    ).first()
    if not edu:
        raise ValueError(f"Education {edu_id} not found")
    db.delete(edu)
    db.commit()


def _edu_to_dict(e: CandidateEducation) -> dict:
    return {
        "id"           : e.id,
        "degree"       : e.degree,
        "institution"  : e.institution,
        "field_of_study": e.field_of_study,
        "start_date"   : e.start_date,
        "end_date"     : e.end_date,
        "description"  : e.description,
        "source_cv_id" : e.source_cv_id,
    }


# ── Certification CRUD ────────────────────────────────────────────────────────

def get_certifications(candidate_profile_id: int, db: Session) -> list:
    rows = db.query(CandidateCertification).filter(
        CandidateCertification.candidate_profile_id == candidate_profile_id
    ).order_by(CandidateCertification.date.desc().nullsfirst()).all()
    return [_cert_to_dict(c) for c in rows]


def add_certification(data: dict, candidate_profile_id: int, db: Session) -> dict:
    cert = CandidateCertification(
        candidate_profile_id = candidate_profile_id,
        name                 = data["name"],
        issuer               = data.get("issuer"),
        date                 = data.get("date"),
        description          = data.get("description"),
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _cert_to_dict(cert)


def delete_certification(cert_id: int, candidate_profile_id: int, db: Session) -> None:
    cert = db.query(CandidateCertification).filter(
        CandidateCertification.id == cert_id,
        CandidateCertification.candidate_profile_id == candidate_profile_id,
    ).first()
    if not cert:
        raise ValueError(f"Certification {cert_id} not found")
    db.delete(cert)
    db.commit()


def _cert_to_dict(c: CandidateCertification) -> dict:
    return {
        "id"         : c.id,
        "name"       : c.name,
        "issuer"     : c.issuer,
        "date"       : c.date,
        "description": c.description,
        "source_cv_id": c.source_cv_id,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Individual CRUD operations
# ──────────────────────────────────────────────────────────────────────────────

def add_skill(
    skill_name: str, category: str | None, skill_type: str | None,
    candidate_profile_id: int, db: Session,
) -> dict:
    """Lägg till en eller flera skills (kommaseparerade) i kompetensbanken."""
    names = [n.strip() for n in skill_name.split(",") if n.strip()]
    if not names:
        raise ValueError("Skill-namn får inte vara tomt")

    added, skipped = [], []
    for name in names:
        existing = db.query(CandidateSkillEntry).filter(
            CandidateSkillEntry.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateSkillEntry.skill_name) == name.lower(),
        ).first()
        if existing:
            skipped.append(name)
            continue

        cat, stype = (category, skill_type or "technical") if category else categorise_skill(name)
        db.add(CandidateSkillEntry(
            candidate_profile_id = candidate_profile_id,
            skill_name           = name,
            category             = cat,
            skill_type           = stype,
            source_cv_ids        = [],
        ))
        added.append(name)

    if not added and skipped:
        raise ValueError(f"Skill(s) finns redan: {', '.join(skipped)}")

    db.commit()
    return {"added": added, "skipped": skipped, "count": len(added)}


def delete_skill(skill_id: int, candidate_profile_id: int, db: Session) -> None:
    """Ta bort en enskild skill (måste tillhöra profilen)."""
    skill = db.query(CandidateSkillEntry).filter(
        CandidateSkillEntry.id == skill_id,
        CandidateSkillEntry.candidate_profile_id == candidate_profile_id,
    ).first()
    if not skill:
        raise ValueError("Skill hittades inte")
    db.delete(skill)
    db.commit()


def delete_experience(experience_id: int, candidate_profile_id: int, db: Session) -> None:
    """Ta bort en enskild erfarenhetspost (måste tillhöra profilen)."""
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == experience_id,
        CandidateExperienceEntry.candidate_profile_id == candidate_profile_id,
    ).first()
    if not exp:
        raise ValueError("Erfarenhet hittades inte")
    db.delete(exp)
    db.commit()


def _get_experience(experience_id: int, candidate_profile_id: int, db: Session) -> CandidateExperienceEntry:
    """Hämta en erfarenhetspost och verifiera ägarskap. Kastar ValueError om ej hittad."""
    exp = db.query(CandidateExperienceEntry).filter(
        CandidateExperienceEntry.id == experience_id,
        CandidateExperienceEntry.candidate_profile_id == candidate_profile_id,
    ).first()
    if not exp:
        raise ValueError("Erfarenhet hittades inte")
    return exp


def add_achievement(experience_id: int, text: str, candidate_profile_id: int, db: Session) -> list:
    """Lägg till en prestation på en erfarenhetspost."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    achievements = list(exp.achievements or [])
    achievements.append(text.strip())
    exp.achievements = achievements
    flag_modified(exp, "achievements")
    db.commit()
    return exp.achievements


def update_achievement(
    experience_id: int, index: int, new_text: str, candidate_profile_id: int, db: Session
) -> list:
    """Uppdatera en prestation på en erfarenhetspost (via arrayindex)."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    achievements = list(exp.achievements or [])
    if index < 0 or index >= len(achievements):
        raise ValueError("Ogiltigt index")
    achievements[index] = new_text.strip()
    exp.achievements = achievements
    flag_modified(exp, "achievements")
    db.commit()
    return exp.achievements


def delete_achievement(experience_id: int, index: int, candidate_profile_id: int, db: Session) -> list:
    """Ta bort en prestation från en erfarenhetspost (via arrayindex)."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    achievements = list(exp.achievements or [])
    if index < 0 or index >= len(achievements):
        raise ValueError("Ogiltigt index")
    achievements.pop(index)
    exp.achievements = achievements
    flag_modified(exp, "achievements")
    db.commit()
    return exp.achievements


def add_experience_skill(
    experience_id: int, skill_name: str, candidate_profile_id: int, db: Session
) -> list:
    """Lägg till en eller flera skills (kommaseparerade) på en erfarenhetspost och i kompetensbanken."""
    exp = _get_experience(experience_id, candidate_profile_id, db)

    names = [n.strip() for n in skill_name.split(",") if n.strip()]
    if not names:
        raise ValueError("Skill-namn får inte vara tomt")

    skills = list(exp.related_skills or [])
    existing_lower = {s.lower() for s in skills}

    for name in names:
        if name.lower() in existing_lower:
            continue
        skills.append(name)
        existing_lower.add(name.lower())

        existing_skill = db.query(CandidateSkillEntry).filter(
            CandidateSkillEntry.candidate_profile_id == candidate_profile_id,
            func.lower(CandidateSkillEntry.skill_name) == name.lower(),
        ).first()
        if not existing_skill:
            category, stype = categorise_skill(name)
            db.add(CandidateSkillEntry(
                candidate_profile_id = candidate_profile_id,
                skill_name           = name,
                category             = category,
                skill_type           = stype,
                source_cv_ids        = [],
            ))

    exp.related_skills = skills
    flag_modified(exp, "related_skills")
    db.commit()
    return exp.related_skills


def remove_experience_skill(experience_id: int, index: int, candidate_profile_id: int, db: Session) -> list:
    """Ta bort en skill från en erfarenhetspost (via arrayindex)."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    skills = list(exp.related_skills or [])
    if index < 0 or index >= len(skills):
        raise ValueError("Ogiltigt index")
    skills.pop(index)
    exp.related_skills = skills
    flag_modified(exp, "related_skills")
    db.commit()
    return exp.related_skills


def update_experience_description(
    experience_id: int, description: str, candidate_profile_id: int, db: Session
) -> str | None:
    """Uppdatera beskrivningen på en erfarenhetspost."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    exp.description = description.strip() or None
    db.commit()
    return exp.description


def update_experience_period(
    experience_id: int,
    start_date: str | None,
    end_date: str | None,
    is_current: bool,
    candidate_profile_id: int,
    db: Session,
) -> dict:
    """Uppdatera tidsperiod på en erfarenhetspost."""
    exp = _get_experience(experience_id, candidate_profile_id, db)
    exp.start_date = start_date.strip() if start_date else None
    exp.end_date   = None if is_current else (end_date.strip() if end_date else None)
    exp.is_current = is_current
    db.commit()
    return {"start_date": exp.start_date, "end_date": exp.end_date, "is_current": exp.is_current}


def create_experience(
    title: str,
    organization: str | None,
    experience_type: str,
    start_date: str | None,
    end_date: str | None,
    is_current: bool,
    description: str | None,
    related_skills: list[str] | None,
    achievements: list[str] | None,
    candidate_profile_id: int,
    db: Session,
) -> dict:
    """Skapa en ny erfarenhetspost manuellt."""
    if not title or not title.strip():
        raise ValueError("Titel krävs")

    entry = CandidateExperienceEntry(
        candidate_profile_id = candidate_profile_id,
        title                = title.strip(),
        organization         = (organization or "").strip() or None,
        experience_type      = experience_type or "work",
        start_date           = (start_date or "").strip() or None,
        end_date             = (end_date or "").strip() or None,
        is_current           = bool(is_current),
        description          = (description or "").strip() or None,
        related_skills       = related_skills or [],
        achievements         = achievements or [],
        source_cv_ids        = [],
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    return {
        "id": entry.id, "title": entry.title, "organization": entry.organization,
        "experience_type": entry.experience_type, "start_date": entry.start_date,
        "end_date": entry.end_date, "is_current": entry.is_current,
        "description": entry.description, "achievements": entry.achievements or [],
        "related_skills": entry.related_skills or [], "source_cv_ids": entry.source_cv_ids or [],
    }
