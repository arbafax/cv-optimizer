from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.candidate_profile import CandidateProfile
from app.models.user import User

router = APIRouter(prefix="/sokprofil", tags=["Sökprofil"])


class SokprofilRequest(BaseModel):
    public_name:        str | None  = None
    public_phone:       str | None  = None
    roles:              str | None  = None
    desired_city:       str | None  = None
    desired_employment: list[str]   = []
    desired_workplace:  list[str]   = []
    willing_to_commute: bool        = False
    searchable:         bool        = False


def _to_dict(p: CandidateProfile) -> dict:
    return {
        "public_name":        p.public_name,
        "public_phone":       p.public_phone,
        "roles":              p.roles,
        "desired_city":       p.desired_city,
        "desired_employment": p.desired_employment.split(",") if p.desired_employment else [],
        "desired_workplace":  p.desired_workplace.split(",")  if p.desired_workplace  else [],
        "willing_to_commute": p.willing_to_commute,
        "searchable":         p.searchable,
    }


@router.get("/")
async def get_sokprofil(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Hämta inloggad användares kandidatprofil (sökprofil). Returnerar defaults om ingen finns."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id,
        CandidateProfile.managed_by_user_id == None,  # noqa: E711
    ).first()
    if not p:
        return {
            "public_name":        current_user.name,
            "public_phone":       current_user.phone,
            "roles":              None,
            "desired_city":       None,
            "desired_employment": [],
            "desired_workplace":  [],
            "willing_to_commute": False,
            "searchable":         False,
        }
    return _to_dict(p)


@router.put("/")
async def save_sokprofil(
    body: SokprofilRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Spara (upsert) kandidatprofil (sökprofil) för inloggad användare."""
    p = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id,
        CandidateProfile.managed_by_user_id == None,  # noqa: E711
    ).first()
    if not p:
        p = CandidateProfile(user_id=current_user.id)
        db.add(p)

    p.public_name        = body.public_name.strip()        if body.public_name        else None
    p.public_phone       = body.public_phone.strip()       if body.public_phone       else None
    p.roles              = body.roles.strip()              if body.roles              else None
    p.desired_city       = body.desired_city.strip()       if body.desired_city       else None
    p.desired_employment = ",".join(body.desired_employment) if body.desired_employment else None
    p.desired_workplace  = ",".join(body.desired_workplace)  if body.desired_workplace  else None
    p.willing_to_commute = body.willing_to_commute
    p.searchable         = body.searchable

    db.commit()
    db.refresh(p)
    return _to_dict(p)
