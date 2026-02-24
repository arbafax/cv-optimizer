from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class SkillEntry(Base):
    __tablename__ = "skills_collection"
    __table_args__ = (
        UniqueConstraint("user_id", "skill_name", name="uq_skill_per_user"),
    )

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_name    = Column(String(255), nullable=False, index=True)
    category      = Column(String(100), default="Övrigt")
    skill_type    = Column(String(50), default="technical")  # technical | soft | language
    source_cv_ids = Column(JSON, default=list)               # [1, 3, 5, ...]
    created_at    = Column(DateTime(timezone=True), server_default=func.now())


class ExperienceEntry(Base):
    __tablename__ = "experiences_pool"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title           = Column(String(500), nullable=False)
    organization    = Column(String(500))
    experience_type = Column(String(50), default="work")  # work | education | certification | project
    start_date      = Column(String(50))
    end_date        = Column(String(50))
    is_current      = Column(Boolean, default=False)
    description     = Column(Text)
    achievements    = Column(JSONB, default=list)   # ["Ökade försäljningen med 20%", ...]
    related_skills  = Column(JSON, default=list)   # ["Python", "FastAPI", ...]
    source_cv_ids   = Column(JSON, default=list)   # [1, 2, 3] – alla CV:n som bidragit
    source_cv_id    = Column(Integer, nullable=True)  # bakåtkompatibelt, används ej längre
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
