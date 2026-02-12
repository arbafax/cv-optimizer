"""
SQLAlchemy models for Competence Bank
File: backend/app/models/competence.py
"""
from sqlalchemy import (
    Column, Integer, String, Text, Boolean,
    DECIMAL, TIMESTAMP, Date, ForeignKey, ARRAY
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class SkillsCollection(Base):
    __tablename__ = "skills_collection"

    id = Column(Integer, primary_key=True, index=True)
    skill_name = Column(String(200), unique=True, nullable=False, index=True)
    skill_type = Column(String(50), nullable=False)   # technical, soft, domain, language, tool
    category = Column(String(100))
    proficiency_level = Column(String(50))            # beginner, intermediate, advanced, expert
    years_experience = Column(DECIMAL(3, 1))
    last_used_date = Column(Date)
    confidence_score = Column(DECIMAL(3, 2), default=1.0)
    embedding = Column(Vector(1536))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    evidences = relationship(
        "SkillExperienceEvidence",
        back_populates="skill",
        cascade="all, delete-orphan"
    )


class ExperiencesPool(Base):
    __tablename__ = "experiences_pool"

    id = Column(Integer, primary_key=True, index=True)
    experience_type = Column(String(50), nullable=False)  # work, education, project, certification
    title = Column(String(300), nullable=False)
    organization = Column(String(300))
    location = Column(String(200))
    start_date = Column(String(50))
    end_date = Column(String(50))
    is_current = Column(Boolean, default=False)
    description = Column(Text)
    achievements = Column(ARRAY(Text))
    technologies = Column(ARRAY(Text))
    source_cv_id = Column(Integer, ForeignKey("cvs.id", ondelete="SET NULL"), index=True)
    source_document_name = Column(String(500))
    confidence_score = Column(DECIMAL(3, 2), default=1.0)
    embedding = Column(Vector(1536))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    evidences = relationship(
        "SkillExperienceEvidence",
        back_populates="experience",
        cascade="all, delete-orphan"
    )


class SkillExperienceEvidence(Base):
    __tablename__ = "skill_experience_evidence"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(
        Integer, ForeignKey("skills_collection.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    experience_id = Column(
        Integer, ForeignKey("experiences_pool.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    evidence_strength = Column(DECIMAL(3, 2), default=1.0)
    context = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    skill = relationship("SkillsCollection", back_populates="evidences")
    experience = relationship("ExperiencesPool", back_populates="evidences")


class CompetenceMetadata(Base):
    __tablename__ = "competence_metadata"

    id = Column(Integer, primary_key=True, index=True)
    total_skills = Column(Integer, default=0)
    total_experiences = Column(Integer, default=0)
    total_source_documents = Column(Integer, default=0)
    last_updated = Column(TIMESTAMP, server_default=func.now())
    embeddings_version = Column(String(50), default="text-embedding-3-small")


class SourceDocuments(Base):
    __tablename__ = "source_documents"

    id = Column(Integer, primary_key=True, index=True)
    document_type = Column(String(50), nullable=False)   # cv, cover_letter
    original_filename = Column(String(500))
    cv_id = Column(Integer, ForeignKey("cvs.id", ondelete="SET NULL"), index=True)
    processed_at = Column(TIMESTAMP, server_default=func.now())
    skills_extracted = Column(Integer, default=0)
    experiences_extracted = Column(Integer, default=0)
    processing_status = Column(String(50), default="completed")
