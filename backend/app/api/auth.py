from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import hash_password, verify_password, create_access_token, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request/response models ───────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: str
    phone: str | None = None
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileRequest(BaseModel):
    name:     str | None       = None
    email:    str | None       = None
    phone:    str | None       = None
    address:  str | None       = None
    roles:    list[str] | None = None
    language: str | None       = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Helpers ───────────────────────────────────────────────

def _user_response(user: User) -> dict:
    return {
        "id":       user.id,
        "name":     user.name,
        "email":    user.email,
        "phone":    user.phone,
        "address":  user.address,
        "roles":    user.roles.split(",") if user.roles else [],
        "language": user.language or "sv",
    }


def _set_auth_cookie(response: Response, user_id: int) -> None:
    token = create_access_token(user_id)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # sätt True vid produktionsdrift över HTTPS
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
    )


# ── Endpoints ─────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """Registrera nytt konto. Loggar in direkt och sätter session-cookie."""
    if db.query(User).filter(func.lower(User.email) == body.email.strip().lower()).first():
        raise HTTPException(status_code=409, detail="E-postadressen används redan")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Lösenordet måste vara minst 8 tecken")

    user = User(
        email=body.email.strip().lower(),
        name=body.name.strip(),
        phone=body.phone.strip() if body.phone else None,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_auth_cookie(response, user.id)
    return _user_response(user)


@router.post("/login")
async def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Logga in med e-post och lösenord. Sätter httpOnly session-cookie."""
    user = db.query(User).filter(func.lower(User.email) == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Felaktig e-post eller lösenord")
    _set_auth_cookie(response, user.id)
    return _user_response(user)


@router.post("/logout")
async def logout(response: Response):
    """Logga ut — rensar session-cookie."""
    response.delete_cookie("access_token", samesite="lax")
    return {"message": "Utloggad"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Returnerar inloggad användares profil."""
    return _user_response(current_user)


@router.put("/me")
async def update_me(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Uppdatera namn, mejl eller telefonnummer."""
    if body.email is not None:
        new_email = body.email.strip().lower()
        conflict = db.query(User).filter(
            func.lower(User.email) == new_email, User.id != current_user.id
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="E-postadressen används redan av ett annat konto")
        current_user.email = new_email
    if body.name is not None:
        current_user.name = body.name.strip()
    if body.phone is not None:
        current_user.phone = body.phone.strip() or None
    if body.address is not None:
        current_user.address = body.address.strip() or None
    if body.roles is not None:
        current_user.roles = ",".join(body.roles) if body.roles else None
    if body.language is not None:
        current_user.language = body.language
    db.commit()
    db.refresh(current_user)
    return _user_response(current_user)


@router.put("/me/password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Byt lösenord. Kräver att nuvarande lösenord anges."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Nuvarande lösenord är felaktigt")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Lösenordet måste vara minst 8 tecken")
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "Lösenordet har ändrats"}
