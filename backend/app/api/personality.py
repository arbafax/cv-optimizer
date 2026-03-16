"""
Personality API
  Admin  : CRUD for PersonalityQuestion  + .md bulk-import
  Kandidat: CRUD for PersonalityAnswer   + /next + /big-five
"""
import logging
from difflib import SequenceMatcher
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, require_role, SystemRole
from app.core.database import get_db
from app.models.candidate_bank import CandidateSkillEntry, CandidateExperienceEntry
from app.models.candidate_cv import CandidateCV
from app.models.candidate_profile import CandidateProfile
from app.models.personality import PersonalityQuestion, PersonalityAnswer
from app.models.user import User
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/personality", tags=["personality"])
_ai = AIService()


# ── Pydantic models ───────────────────────────────────────────────────────────

class QuestionIn(BaseModel):
    question_text: str
    context:       Optional[str] = None
    category:      Optional[str] = None
    big_five_trait: Optional[str] = None   # O / C / E / A / N
    big_five_dir:   Optional[int] = None   # +1 / -1
    order_index:    int = 0
    is_active:      bool = True


class QuestionOut(BaseModel):
    id:             int
    question_text:  str
    context:        Optional[str]
    category:       Optional[str]
    big_five_trait: Optional[str]
    big_five_dir:   Optional[int]
    order_index:    int
    is_active:      bool

    class Config:
        from_attributes = True


class AnswerIn(BaseModel):
    question_id:  int
    answer_text:  str
    likert_score: Optional[int] = None   # 1–5


class AnswerOut(BaseModel):
    id:            int
    question_id:   int
    question_text: str
    context:       Optional[str]
    category:      Optional[str]
    answer_text:   str
    likert_score:  Optional[int]

    class Config:
        from_attributes = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _answer_out(a: PersonalityAnswer) -> dict:
    return {
        "id":            a.id,
        "question_id":   a.question_id,
        "question_text": a.question.question_text if a.question else "",
        "context":       a.question.context if a.question else None,
        "category":      a.question.category if a.question else None,
        "answer_text":   a.answer_text,
        "likert_score":  a.likert_score,
    }


def _embed_answer(answer: PersonalityAnswer) -> None:
    """Generate and store embedding for an answer (best-effort)."""
    try:
        q = answer.question
        text = f"Fråga: {q.question_text}"
        if q.context:
            text += f"\nKontext: {q.context}"
        text += f"\nSvar: {answer.answer_text}"
        vec = _ai.generate_embeddings(text)
        if vec:
            answer.embedding = vec
    except Exception as e:
        logger.warning(f"Could not embed answer {answer.id}: {e}")


# ── ADMIN: Questions ──────────────────────────────────────────────────────────

@router.get("/questions", response_model=list[QuestionOut])
async def list_questions(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List personality questions. Admins see all; others see active only."""
    user_roles = set(current_user.roles.split(",")) if current_user.roles else set()
    is_admin = SystemRole.ADMIN in user_roles
    q = db.query(PersonalityQuestion)
    if not is_admin or not include_inactive:
        q = q.filter(PersonalityQuestion.is_active == True)
    return q.order_by(PersonalityQuestion.order_index, PersonalityQuestion.id).all()


@router.post("/questions", response_model=QuestionOut, status_code=201)
async def create_question(
    body: QuestionIn,
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = PersonalityQuestion(**body.model_dump())
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: int,
    body: QuestionIn,
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = db.query(PersonalityQuestion).filter(PersonalityQuestion.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Frågan hittades inte")
    for k, v in body.model_dump().items():
        setattr(q, k, v)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(
    question_id: int,
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
    db: Session = Depends(get_db),
):
    q = db.query(PersonalityQuestion).filter(PersonalityQuestion.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Frågan hittades inte")
    db.delete(q)
    db.commit()


@router.post("/questions/import", status_code=201)
async def import_questions_md(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """
    Use GPT-4o to extract personality questions from a free-form Markdown file.
    Each extracted question is stored with an embedding (for future job matching).
    """
    content = (await file.read()).decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(status_code=422, detail="Filen är tom")

    # Ask GPT-4o to extract structured questions
    extracted = _ai.extract_personality_questions(content)
    if not extracted:
        raise HTTPException(status_code=422, detail="Inga frågor kunde extraheras ur filen")

    order = db.query(PersonalityQuestion).count()
    created = 0

    for item in extracted:
        question_text = (item.get("question_text") or "").strip()
        if not question_text:
            continue

        context    = item.get("context") or None
        category   = item.get("category") or None
        trait_raw  = item.get("big_five_trait")
        trait      = trait_raw.upper() if trait_raw and trait_raw.upper() in "OCEAN" else None
        direction  = item.get("big_five_dir")
        direction  = int(direction) if direction in (1, -1, "1", "-1") else None

        q = PersonalityQuestion(
            question_text=question_text,
            context=context,
            category=category,
            big_five_trait=trait,
            big_five_dir=direction,
            order_index=order,
        )
        # Embed the question for future job-ad matching
        embed_text = f"Fråga: {question_text}"
        if context:
            embed_text += f"\nKontext: {context}"
        vec = _ai.generate_embeddings(embed_text)
        if vec:
            q.embedding = vec

        db.add(q)

        order += 1
        created += 1

    db.commit()
    logger.info(f"Imported {created} personality questions via AI")
    return {"imported": created}


@router.post("/questions/extract")
async def extract_questions_from_md(
    file: UploadFile = File(...),
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
):
    """
    Use GPT-4o to extract structured questions from a .md file.
    Returns the list without saving anything to the database.
    """
    content = (await file.read()).decode("utf-8", errors="replace")
    if not content.strip():
        raise HTTPException(status_code=422, detail="Filen är tom")
    extracted = _ai.extract_personality_questions(content)
    if not extracted:
        raise HTTPException(status_code=422, detail="Inga frågor kunde extraheras ur filen")
    return {"questions": extracted}


class SimilarCheckIn(BaseModel):
    question_text: str
    threshold: float = 0.75


@router.post("/questions/check-similar")
async def check_similar_question(
    body: SimilarCheckIn,
    current_user: User = Depends(require_role(SystemRole.ADMIN)),
    db: Session = Depends(get_db),
):
    """
    Return up to 3 existing active questions whose text is similar
    to the given question_text (uses difflib SequenceMatcher).
    """
    existing = (
        db.query(PersonalityQuestion)
        .filter(PersonalityQuestion.is_active == True)
        .all()
    )
    candidate = body.question_text.lower().strip()
    matches = []
    for q in existing:
        ratio = SequenceMatcher(None, candidate, q.question_text.lower().strip()).ratio()
        if ratio >= body.threshold:
            matches.append({
                "id":             q.id,
                "question_text":  q.question_text,
                "context":        q.context,
                "category":       q.category,
                "big_five_trait": q.big_five_trait,
                "big_five_dir":   q.big_five_dir,
                "similarity":     round(ratio, 2),
            })
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return {"matches": matches[:3]}


# ── KANDIDAT: Answers ─────────────────────────────────────────────────────────

@router.get("/answers")
async def list_my_answers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all answered questions with progress stats."""
    answers = (
        db.query(PersonalityAnswer)
        .filter(PersonalityAnswer.user_id == current_user.id)
        .all()
    )
    total_active = db.query(PersonalityQuestion).filter(PersonalityQuestion.is_active == True).count()
    return {
        "answered": len(answers),
        "total":    total_active,
        "answers":  [_answer_out(a) for a in answers],
    }


@router.get("/answers/next")
async def next_unanswered(
    skip_ids: str = "",          # comma-separated question IDs to skip this session
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the next active question the user has not yet answered."""
    answered_ids = {
        row.question_id
        for row in db.query(PersonalityAnswer.question_id)
        .filter(PersonalityAnswer.user_id == current_user.id)
        .all()
    }
    # Merge in any IDs the frontend wants to skip this session
    if skip_ids:
        for part in skip_ids.split(","):
            part = part.strip()
            if part.isdigit():
                answered_ids.add(int(part))

    next_q = (
        db.query(PersonalityQuestion)
        .filter(
            PersonalityQuestion.is_active == True,
            PersonalityQuestion.id.notin_(answered_ids) if answered_ids else True,
        )
        .order_by(PersonalityQuestion.order_index, PersonalityQuestion.id)
        .first()
    )
    if not next_q:
        return {"done": True, "question": None}
    return {
        "done": False,
        "question": {
            "id":            next_q.id,
            "question_text": next_q.question_text,
            "context":       next_q.context,
            "category":      next_q.category,
            "big_five_trait": next_q.big_five_trait,
        },
    }


@router.post("/answers", status_code=201)
async def submit_answer(
    body: AnswerIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(PersonalityQuestion).filter(PersonalityQuestion.id == body.question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Frågan hittades inte")

    # Upsert — one answer per user+question
    existing = (
        db.query(PersonalityAnswer)
        .filter(
            PersonalityAnswer.user_id    == current_user.id,
            PersonalityAnswer.question_id == body.question_id,
        )
        .first()
    )
    if existing:
        existing.answer_text  = body.answer_text
        existing.likert_score = body.likert_score
        answer = existing
    else:
        answer = PersonalityAnswer(
            user_id      = current_user.id,
            question_id  = body.question_id,
            answer_text  = body.answer_text,
            likert_score = body.likert_score,
        )
        db.add(answer)

    db.flush()
    _embed_answer(answer)
    db.commit()
    db.refresh(answer)
    return _answer_out(answer)


@router.put("/answers/{answer_id}")
async def update_answer(
    answer_id: int,
    body: AnswerIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    answer = (
        db.query(PersonalityAnswer)
        .filter(
            PersonalityAnswer.id      == answer_id,
            PersonalityAnswer.user_id == current_user.id,
        )
        .first()
    )
    if not answer:
        raise HTTPException(status_code=404, detail="Svaret hittades inte")
    answer.answer_text  = body.answer_text
    answer.likert_score = body.likert_score
    answer.embedding    = None
    _embed_answer(answer)
    db.commit()
    db.refresh(answer)
    return _answer_out(answer)


@router.get("/answers/big-five")
async def big_five_scores(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compute Big Five scores (O/C/E/A/N) from Likert answers.
    Returns a dict with trait → score (1.0–5.0) and answer count per trait.
    Traits with no answers are omitted.
    """
    answers = (
        db.query(PersonalityAnswer)
        .filter(
            PersonalityAnswer.user_id     == current_user.id,
            PersonalityAnswer.likert_score != None,
        )
        .all()
    )

    trait_scores: dict[str, list[float]] = {}
    for a in answers:
        q = a.question
        if not q or not q.big_five_trait or not q.big_five_dir:
            continue
        trait = q.big_five_trait.upper()
        # Normalise: direction +1 means high score = high trait, -1 = inverted
        score = a.likert_score * q.big_five_dir
        # Re-map to 1–5 range if inverted (e.g. dir=-1, likert=1 → effective=5)
        if q.big_five_dir == -1:
            score = 6 + score  # 6 + (-1 * 1..5) = 5..1
        trait_scores.setdefault(trait, []).append(float(score))

    result = {}
    for trait, scores in trait_scores.items():
        result[trait] = {
            "score": round(sum(scores) / len(scores), 2),
            "n":     len(scores),
        }
    return result


# ── KANDIDAT: Personality description ────────────────────────────────────────

MIN_ANSWER_PCT  = 0.10   # must have answered at least 10 % of active questions
MIN_CATEGORIES  = 5      # must have answers in at least 5 distinct categories


@router.post("/description")
async def generate_description(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a Markdown personality description.
    Requires ≥10 % of active questions answered AND ≥5 distinct categories.
    """
    answers = (
        db.query(PersonalityAnswer)
        .filter(PersonalityAnswer.user_id == current_user.id)
        .all()
    )
    total_active = (
        db.query(PersonalityQuestion)
        .filter(PersonalityQuestion.is_active == True)
        .count()
    )

    # Guard: too few answers
    answered = len(answers)
    if total_active > 0 and answered / total_active < MIN_ANSWER_PCT:
        raise HTTPException(
            status_code=422,
            detail={
                "code":     "too_few_answers",
                "answered": answered,
                "total":    total_active,
                "pct":      round(answered / total_active * 100, 1),
            },
        )

    # Guard: too few categories
    categories = {
        a.question.category
        for a in answers
        if a.question and a.question.category
    }
    if len(categories) < MIN_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail={
                "code":       "too_few_categories",
                "categories": len(categories),
                "needed":     MIN_CATEGORIES,
            },
        )

    # Gather professional context
    profile = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.user_id == current_user.id)
        .first()
    )

    skills:      list = []
    experiences: list = []
    cv_texts:    list = []

    if profile:
        skills = (
            db.query(CandidateSkillEntry)
            .filter(CandidateSkillEntry.candidate_profile_id == profile.id)
            .all()
        )
        experiences = (
            db.query(CandidateExperienceEntry)
            .filter(CandidateExperienceEntry.candidate_profile_id == profile.id)
            .order_by(CandidateExperienceEntry.start_date.desc())
            .all()
        )
        cvs = (
            db.query(CandidateCV)
            .filter(
                CandidateCV.candidate_profile_id == profile.id,
                CandidateCV.is_processed == True,
            )
            .order_by(CandidateCV.upload_date.desc())
            .limit(3)
            .all()
        )
        cv_texts = [cv.raw_text for cv in cvs if cv.raw_text]

    answers_data = [
        {
            "category": a.question.category if a.question else None,
            "question": a.question.question_text if a.question else "",
            "context":  a.question.context if a.question else None,
            "big_five": a.question.big_five_trait if a.question else None,
            "answer":   a.answer_text,
            "likert":   a.likert_score,
        }
        for a in answers
    ]

    profile_data = {
        "roles":              profile.roles if profile else None,
        "desired_city":       profile.desired_city if profile else None,
        "desired_employment": profile.desired_employment if profile else None,
        "desired_workplace":  profile.desired_workplace if profile else None,
        "description":        profile.description if profile else None,
    }

    skills_data = [
        {"name": s.skill_name, "category": s.category, "type": s.skill_type}
        for s in skills
    ]

    experiences_data = [
        {
            "title":        e.title,
            "organization": e.organization,
            "type":         e.experience_type,
            "start":        e.start_date,
            "end":          e.end_date,
            "current":      e.is_current,
            "description":  e.description,
            "achievements": e.achievements or [],
        }
        for e in experiences
    ]

    md = _ai.generate_personality_description(
        answers=answers_data,
        profile=profile_data,
        skills=skills_data,
        experiences=experiences_data,
        cv_texts=cv_texts,
        name=current_user.name or current_user.email.split("@")[0],
    )

    return {"markdown": md}
