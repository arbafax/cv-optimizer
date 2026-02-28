from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db


# ── System roles ──────────────────────────────────────────────────────────────

class SystemRole:
    KANDIDAT    = "Kandidat"
    SALJARE     = "Säljare"
    REKRYTERARE = "Rekryterare"

    ALL = {KANDIDAT, SALJARE, REKRYTERARE}


def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None


def get_current_user(request: Request, db: Session = Depends(get_db)):
    """FastAPI-dependency som läser access_token-cookien och returnerar inloggad User."""
    from app.models.user import User  # lokalt import för att undvika cirkulära beroenden

    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Inte inloggad")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Ogiltig eller utgången session")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=401, detail="Användaren hittades inte")

    return user


# ── Role guard dependency ─────────────────────────────────────────────────────

def require_role(*roles: str):
    """
    FastAPI dependency that enforces one or more system roles (OR logic).
    Usage:
        @router.get("/endpoint")
        async def my_endpoint(user: User = Depends(require_role(SystemRole.SALJARE))):
            ...

        # Multiple roles (user needs at least one):
        async def my_endpoint(user: User = Depends(require_role(SystemRole.SALJARE, SystemRole.REKRYTERARE))):
    """
    required = set(roles)

    def _check(user=Depends(get_current_user)):
        user_roles = set(user.roles.split(",")) if user.roles else set()
        if not required & user_roles:
            raise HTTPException(status_code=403, detail="Åtkomst nekad")
        return user

    return _check
