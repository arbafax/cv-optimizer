from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.core.database import Base


class PersonalityQuestion(Base):
    """System-level personality questions, managed by admins."""
    __tablename__ = "personality_questions"

    id              = Column(Integer, primary_key=True, index=True)
    question_text   = Column(Text, nullable=False)
    context         = Column(Text, nullable=True)          # framing / AI context
    category        = Column(String(100), nullable=True)   # e.g. "Arbetslivs", "Relationer"
    big_five_trait  = Column(String(1), nullable=True)     # O / C / E / A / N
    big_five_dir    = Column(Integer, nullable=True)       # +1 or -1
    order_index     = Column(Integer, nullable=False, default=0)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    embedding       = Column(Vector(1536), nullable=True)  # for job-ad matching

    answers = relationship("PersonalityAnswer", back_populates="question", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PersonalityQuestion(id={self.id}, trait={self.big_five_trait})>"


class PersonalityAnswer(Base):
    """A candidate's answer to a personality question."""
    __tablename__ = "personality_answers"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id   = Column(Integer, ForeignKey("personality_questions.id", ondelete="CASCADE"), nullable=False, index=True)
    answer_text   = Column(Text, nullable=False)
    likert_score  = Column(Integer, nullable=True)   # 1–5, used for Big Five math
    created_at    = Column(DateTime(timezone=True), server_default=func.now())
    updated_at    = Column(DateTime(timezone=True), onupdate=func.now())

    question = relationship("PersonalityQuestion", back_populates="answers")

    def __repr__(self):
        return f"<PersonalityAnswer(id={self.id}, user={self.user_id}, q={self.question_id})>"
