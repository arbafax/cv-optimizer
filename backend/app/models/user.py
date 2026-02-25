from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String(255), nullable=False, unique=True, index=True)
    name            = Column(String(255), nullable=False)
    phone           = Column(String(50), nullable=True)
    address         = Column(String(500), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    roles           = Column(String(500), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"
