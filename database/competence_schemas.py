"""
Pydantic schemas for Competence Bank API
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal


# ================================================
# SKILLS SCHEMAS
# ================================================

class SkillBase(BaseModel):
    """Base skill information"""
    skill_name: str
    skill_type: str  # technical, soft, domain, language, tool
    category: Optional[str] = None
    proficiency_level: Optional[str] = None  # beginner, intermediate, advanced, expert
    years_experience: Optional[Decimal] = None
    last_used_date: Optional[date] = None


class SkillCreate(SkillBase):
    """Create new skill"""
    pass


class SkillWithEvidence(SkillBase):
    """Skill with experience evidence"""
    id: int
    confidence_score: Decimal
    experience_count: int = 0
    organizations_used: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class SkillSimple(BaseModel):
    """Simple skill representation"""
    id: int
    skill_name: str
    skill_type: str
    proficiency_level: Optional[str] = None
    
    class Config:
        from_attributes = True


# ================================================
# EXPERIENCE SCHEMAS
# ================================================

class ExperienceBase(BaseModel):
    """Base experience information"""
    experience_type: str  # work, education, project, certification
    title: str
    organization: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_current: bool = False
    description: Optional[str] = None
    achievements: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)


class ExperienceCreate(ExperienceBase):
    """Create new experience"""
    source_cv_id: Optional[int] = None
    source_document_name: Optional[str] = None


class ExperienceDetail(ExperienceBase):
    """Detailed experience with metadata"""
    id: int
    source_cv_id: Optional[int] = None
    source_document_name: Optional[str] = None
    confidence_score: Decimal
    demonstrated_skills: List[SkillSimple] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ================================================
# COMPETENCE BANK SCHEMAS
# ================================================

class CompetenceBankStats(BaseModel):
    """Overall statistics for the competence bank"""
    total_skills: int
    total_experiences: int
    total_source_documents: int
    last_updated: datetime
    
    # Breakdowns
    skills_by_type: dict = Field(default_factory=dict)  # {technical: 45, soft: 12, ...}
    skills_by_proficiency: dict = Field(default_factory=dict)  # {expert: 10, advanced: 20, ...}
    experiences_by_type: dict = Field(default_factory=dict)  # {work: 5, education: 3, ...}
    
    class Config:
        from_attributes = True


class MergeRequest(BaseModel):
    """Request to merge a CV into the competence bank"""
    cv_id: int
    merge_strategy: str = "smart"  # smart, append, replace
    deduplicate: bool = True
    confidence_threshold: float = 0.7


class MergeResult(BaseModel):
    """Result of merging a CV into competence bank"""
    success: bool
    cv_id: int
    skills_added: int
    skills_updated: int
    experiences_added: int
    experiences_updated: int
    duplicates_found: int
    processing_time_seconds: float
    warnings: List[str] = Field(default_factory=list)


# ================================================
# SKILL ANALYSIS SCHEMAS
# ================================================

class SkillGap(BaseModel):
    """Identified skill gap"""
    skill_name: str
    required_level: str
    current_level: Optional[str] = None
    gap_severity: str  # critical, important, nice-to-have
    learning_resources: List[str] = Field(default_factory=list)


class SkillRecommendation(BaseModel):
    """Skill development recommendation"""
    skill_name: str
    current_proficiency: Optional[str] = None
    target_proficiency: str
    priority: str  # high, medium, low
    reasoning: str
    estimated_learning_time: Optional[str] = None


# ================================================
# SOURCE DOCUMENT SCHEMAS
# ================================================

class SourceDocumentBase(BaseModel):
    """Base source document info"""
    document_type: str  # cv, cover_letter, linkedin, portfolio
    original_filename: str


class SourceDocumentDetail(SourceDocumentBase):
    """Detailed source document with processing status"""
    id: int
    cv_id: Optional[int] = None
    processed_at: datetime
    skills_extracted: int
    experiences_extracted: int
    processing_status: str
    
    class Config:
        from_attributes = True


# ================================================
# SEARCH & FILTER SCHEMAS
# ================================================

class SkillFilter(BaseModel):
    """Filter criteria for skills"""
    skill_types: Optional[List[str]] = None
    categories: Optional[List[str]] = None
    proficiency_levels: Optional[List[str]] = None
    min_years_experience: Optional[float] = None
    search_query: Optional[str] = None  # Semantic search


class ExperienceFilter(BaseModel):
    """Filter criteria for experiences"""
    experience_types: Optional[List[str]] = None
    organizations: Optional[List[str]] = None
    is_current: Optional[bool] = None
    required_skills: Optional[List[str]] = None  # Must have these skills
    search_query: Optional[str] = None  # Semantic search


# ================================================
# RESPONSE SCHEMAS
# ================================================

class SkillsListResponse(BaseModel):
    """Response for skills list endpoint"""
    total: int
    skills: List[SkillWithEvidence]
    filters_applied: Optional[SkillFilter] = None


class ExperiencesListResponse(BaseModel):
    """Response for experiences list endpoint"""
    total: int
    experiences: List[ExperienceDetail]
    filters_applied: Optional[ExperienceFilter] = None


class CompetenceBankOverview(BaseModel):
    """Complete overview of competence bank"""
    stats: CompetenceBankStats
    top_skills: List[SkillWithEvidence]
    recent_experiences: List[ExperienceDetail]
    source_documents: List[SourceDocumentDetail]


# ================================================
# TIMELINE SCHEMAS
# ================================================

class TimelineEntry(BaseModel):
    """Single entry in career timeline"""
    date: str
    type: str  # started, ended, achievement, certification
    title: str
    organization: Optional[str] = None
    description: Optional[str] = None
    skills_gained: List[str] = Field(default_factory=list)


class CareerTimeline(BaseModel):
    """Complete career timeline"""
    entries: List[TimelineEntry]
    total_years: float
    career_gaps: List[dict] = Field(default_factory=list)  # Periods with no activity
