from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                nullable=True, index=True)
    managed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"),
                                nullable=True, index=True)
    public_name        = Column(String(255), nullable=True)
    public_phone       = Column(String(50), nullable=True)
    roles              = Column(String(1000), nullable=True)   # kommaseparerad
    desired_city       = Column(String(255), nullable=True)
    desired_employment = Column(String(200), nullable=True)    # kommasep: Heltid,Deltid,Timmar
    desired_workplace  = Column(String(200), nullable=True)    # kommasep: På plats,Hybrid,Distans
    willing_to_commute = Column(Boolean, nullable=False, default=False, server_default="false")
    searchable         = Column(Boolean, nullable=False, default=False, server_default="false")
    available_from     = Column(String(20), nullable=True)   # ISO-datum: YYYY-MM-DD
    updated_at         = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<CandidateProfile(user_id={self.user_id}, managed_by={self.managed_by_user_id})>"
