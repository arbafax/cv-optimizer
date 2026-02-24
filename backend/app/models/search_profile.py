from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class SearchProfile(Base):
    __tablename__ = "search_profiles"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name              = Column(String(255), nullable=False)
    job_description   = Column(Text, nullable=True)
    job_url           = Column(String(2048), nullable=True)
    last_match_result = Column(JSON, nullable=True)
    last_cv_draft     = Column(JSON, nullable=True)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())
    updated_at        = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<SearchProfile(id={self.id}, name={self.name}, user_id={self.user_id})>"
