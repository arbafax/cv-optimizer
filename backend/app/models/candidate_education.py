from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class CandidateEducation(Base):
    __tablename__ = "candidate_education"

    id                   = Column(Integer, primary_key=True, index=True)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    source_cv_id         = Column(Integer, ForeignKey("candidate_cvs.id", ondelete="SET NULL"),
                                  nullable=True)
    degree               = Column(String(500), nullable=False)
    institution          = Column(String(500), nullable=True)
    field_of_study       = Column(String(500), nullable=True)
    start_date           = Column(String(20), nullable=True)
    end_date             = Column(String(20), nullable=True)
    description          = Column(Text, nullable=True)
    embedding            = Column(Vector(1536), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<CandidateEducation(id={self.id}, degree={self.degree}, institution={self.institution})>"
