from sqlalchemy import Column, Integer, String, Boolean, Text, LargeBinary, JSON, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class CandidateCV(Base):
    __tablename__ = "candidate_cvs"

    id                   = Column(Integer, primary_key=True, index=True)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    filename             = Column(String(500), nullable=False)
    file_data            = Column(LargeBinary, nullable=True)   # raw PDF bytes
    raw_text             = Column(Text, nullable=True)
    structured_json      = Column(JSON, nullable=True)          # full AI output dict
    is_processed         = Column(Boolean, default=False, nullable=False)
    is_vectorized        = Column(Boolean, default=False, nullable=False)
    upload_date          = Column(DateTime(timezone=True), server_default=func.now())
    vectorized_at        = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<CandidateCV(id={self.id}, filename={self.filename}, profile_id={self.candidate_profile_id})>"
