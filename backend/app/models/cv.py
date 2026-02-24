from sqlalchemy import Column, Integer, String, DateTime, JSON, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class CV(Base):
    __tablename__ = "cvs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename    = Column(String, nullable=False)
    title       = Column(String, nullable=True)
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())
    original_text   = Column(Text)
    structured_data = Column(JSON, nullable=False)

    def __repr__(self):
        return f"<CV(id={self.id}, title={self.title or self.filename})>"


class OptimizedCV(Base):
    __tablename__ = "optimized_cvs"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    original_cv_id = Column(Integer, nullable=False)
    job_title       = Column(String)
    job_description = Column(Text)
    optimized_data  = Column(JSON, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    match_score = Column(Integer)

    def __repr__(self):
        return f"<OptimizedCV(id={self.id}, job_title={self.job_title})>"
