from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base


class CV(Base):
    """CV model with vector embeddings for semantic search"""
    __tablename__ = "cvs"

    id = Column(Integer, primary_key=True, index=True)

    # Metadata
    filename   = Column(String, nullable=False)
    title      = Column(String, nullable=True)   # ← NY: användarsatt titel
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())

    # Original PDF content (as text)
    original_text = Column(Text)

    # Structured CV data as JSON
    structured_data = Column(JSON, nullable=False)

    # Vector embeddings for semantic search
    full_content_embedding = Column(Vector(1536))
    summary_embedding      = Column(Vector(1536))
    skills_embedding       = Column(Vector(1536))

    def __repr__(self):
        return f"<CV(id={self.id}, title={self.title or self.filename})>"


class OptimizedCV(Base):
    """Optimized CV versions generated for specific job postings"""
    __tablename__ = "optimized_cvs"

    id             = Column(Integer, primary_key=True, index=True)
    original_cv_id = Column(Integer, nullable=False)

    # Job posting information
    job_title               = Column(String)
    job_description         = Column(Text)
    job_description_embedding = Column(Vector(1536))

    # Optimized content
    optimized_data = Column(JSON, nullable=False)

    # Metadata
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    match_score = Column(Integer)

    def __repr__(self):
        return f"<OptimizedCV(id={self.id}, job_title={self.job_title})>"
