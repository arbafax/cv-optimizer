from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime


class PersonalInfo(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


class WorkExperience(BaseModel):
    company: Optional[str] = None
    position: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    current: bool = False
    location: Optional[str] = None
    description: Optional[str] = None
    achievements: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)


class Education(BaseModel):
    institution: Optional[str] = None
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None
    achievements: List[str] = Field(default_factory=list)


class Certification(BaseModel):
    name: Optional[str] = None
    issuing_organization: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    credential_id: Optional[str] = None


class Project(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    role: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    url: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class Language(BaseModel):
    language: Optional[str] = None
    proficiency: Optional[str] = None


class CVStructure(BaseModel):
    personal_info: PersonalInfo
    summary: Optional[str] = None
    work_experience: List[WorkExperience] = Field(default_factory=list)
    education: List[Education] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    certifications: List[Certification] = Field(default_factory=list)
    projects: List[Project] = Field(default_factory=list)
    languages: List[Language] = Field(default_factory=list)


class CVResponse(BaseModel):
    id: int
    filename: str
    title: Optional[str] = None          # ← NY: användarsatt titel
    upload_date: datetime
    structured_data: CVStructure

    class Config:
        from_attributes = True


class CVUpdateTitle(BaseModel):
    """Request body för att uppdatera titel."""
    title: str = Field(..., min_length=1, max_length=200)


class JobPosting(BaseModel):
    title: str
    description: str
    company: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)


class OptimizedCVResponse(BaseModel):
    id: int
    original_cv_id: int
    job_title: str
    optimized_data: CVStructure
    match_score: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True
