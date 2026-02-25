from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class SellerCandidate(Base):
    __tablename__ = "seller_candidates"

    id                   = Column(Integer, primary_key=True, index=True)
    seller_user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    candidate_profile_id = Column(Integer, ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
                                  nullable=False, index=True)
    invited_at           = Column(DateTime(timezone=True), server_default=func.now())
    accepted_at          = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("seller_user_id", "candidate_profile_id", name="uq_seller_candidate"),
    )

    def __repr__(self):
        return f"<SellerCandidate(seller={self.seller_user_id}, profile={self.candidate_profile_id})>"
