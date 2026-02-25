from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.candidate_profile import CandidateProfile
from app.models.user import User

router = APIRouter(prefix="/kandidater", tags=["Kandidater"])


class KandidatRequest(BaseModel):
    public_name:        str
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
    p.public_phone       = body.public_phone.strip()       if body.public_phone       else None
    p.roles              = body.roles.strip()              if body.roles              else None
    p.desired_city       = body.desired_city.strip()       if body.desired_city       else None
    p.desired_employment = ",".join(body.desired_employment) if body.desired_employment else None
    p.desired_workplace  = ",".join(body.desired_workplace)  if body.desired_workplace  else None
    p.willing_to_commute = body.willing_to_commute
    p.searchable         = body.searchable
    p.available_from     = body.available_from or None


@router.get("/")
async def list_kandidater(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista alla kandidatprofiler som hanteras av inloggad säljare."""
    profiles = (
        db.query(CandidateProfile)
        .filter(CandidateProfile.managed_by_user_id == current_user.id)
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
    """Skapa en ny kandidatprofil för inloggad säljare."""
    p = CandidateProfile(managed_by_user_id=current_user.id)
    _apply_body(p, body)
    db.add(p)
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
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    return _to_dict(p)


@router.put("/{kandidat_id}")
async def update_kandidat(
    kandidat_id: int,
    body: KandidatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uppdatera en kandidatprofil."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
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
    """Ta bort en kandidatprofil."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.id == kandidat_id,
        CandidateProfile.managed_by_user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Kandidat hittades inte")
    name = p.public_name or "Kandidat"
    db.delete(p)
    db.commit()
    return {"message": f"'{name}' borttagen"}
