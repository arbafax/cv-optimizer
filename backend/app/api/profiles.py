from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.search_profile import SearchProfile
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profiles", tags=["Search Profiles"])


class CreateProfileRequest(BaseModel):
    name: str


class UpdateProfileNameRequest(BaseModel):
    name: str


class UpdateJobRequest(BaseModel):
    job_description: str | None = None
    job_url: str | None = None


class UpdateResultsRequest(BaseModel):
    last_match_result: dict | None = None
    last_cv_draft: dict | None = None


def _to_dict(p: SearchProfile) -> dict:
    return {
        "id":                p.id,
        "name":              p.name,
        "job_description":   p.job_description,
        "job_url":           p.job_url,
        "last_match_result": p.last_match_result,
        "last_cv_draft":     p.last_cv_draft,
        "created_at":        p.created_at.isoformat() if p.created_at else None,
        "updated_at":        p.updated_at.isoformat() if p.updated_at else None,
    }


def _get(profile_id: int, user_id: int, db: Session) -> SearchProfile:
    p = db.query(SearchProfile).filter(
        SearchProfile.id == profile_id,
        SearchProfile.user_id == user_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Profil hittades inte")
    return p


@router.get("/")
async def list_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista alla sökprofiler för inloggad användare."""
    profiles = (
        db.query(SearchProfile)
        .filter(SearchProfile.user_id == current_user.id)
        .order_by(SearchProfile.created_at)
        .all()
    )
    return {"profiles": [_to_dict(p) for p in profiles]}


@router.post("/", status_code=201)
async def create_profile(
    body: CreateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Skapa en ny sökprofil."""
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Namn krävs")
    p = SearchProfile(user_id=current_user.id, name=body.name.strip())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.get("/{profile_id}")
async def get_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hämta en specifik sökprofil."""
    return _to_dict(_get(profile_id, current_user.id, db))


@router.put("/{profile_id}")
async def update_profile_name(
    profile_id: int,
    body: UpdateProfileNameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Byta namn på en sökprofil."""
    p = _get(profile_id, current_user.id, db)
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Namn krävs")
    p.name = body.name.strip()
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.put("/{profile_id}/job")
async def update_profile_job(
    profile_id: int,
    body: UpdateJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Spara jobbannons + URL på en sökprofil."""
    p = _get(profile_id, current_user.id, db)
    if body.job_description is not None:
        p.job_description = body.job_description
    if body.job_url is not None:
        p.job_url = body.job_url.strip() or None
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.put("/{profile_id}/results")
async def save_profile_results(
    profile_id: int,
    body: UpdateResultsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Spara matchresultat och/eller CV-utkast på en sökprofil."""
    p = _get(profile_id, current_user.id, db)
    if body.last_match_result is not None:
        p.last_match_result = body.last_match_result
    if body.last_cv_draft is not None:
        p.last_cv_draft = body.last_cv_draft
    db.commit()
    db.refresh(p)
    return _to_dict(p)


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ta bort en sökprofil."""
    p = _get(profile_id, current_user.id, db)
    db.delete(p)
    db.commit()
