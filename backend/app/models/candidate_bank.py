from sqlalchemy import Column, Integer, String, Boolean, Text, JSON, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class CandidateSkillEntry(Base):
    __tablename__ = "candidate_skills"

    id                   = Column(Integer, primary_key=True, index=True)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    skill_name           = Column(String(255), nullable=False)
    category             = Column(String(100), default="Övrigt")
    skill_type           = Column(String(50), default="technical")   # technical | soft | language | tool
    source_cv_ids        = Column(JSON, default=list)
    embedding            = Column(Vector(1536), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("candidate_profile_id", "skill_name", name="uq_candidate_skill"),
    )


class CandidateExperienceEntry(Base):
    __tablename__ = "candidate_experiences"

    id                   = Column(Integer, primary_key=True, index=True)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    title                = Column(String(500), nullable=False)
    organization         = Column(String(500))
    experience_type      = Column(String(50), default="work")   # work | education | certification | project
    start_date           = Column(String(50))
    end_date             = Column(String(50))
    is_current           = Column(Boolean, default=False)
    description          = Column(Text)
    achievements         = Column(JSONB, default=list)
    related_skills       = Column(JSON, default=list)
    source_cv_ids        = Column(JSON, default=list)
    embedding            = Column(Vector(1536), nullable=True)
    created_at           = Column(DateTime(timezone=True), server_default=func.now())
