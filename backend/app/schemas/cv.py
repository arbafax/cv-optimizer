from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime, date


class PersonalInfo(BaseModel):
    """Personal information section"""
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None


class WorkExperience(BaseModel):
    """Single work experience entry"""
    company: str
    position: str
    start_date: Optional[str] = None  # We'll parse dates flexibly
    end_date: Optional[str] = None
    current: bool = False
    location: Optional[str] = None
    description: Optional[str] = None
    achievements: List[str] = Field(default_factory=list)
    technologies: List[str] = Field(default_factory=list)


class Education(BaseModel):
    """Education entry"""
    institution: str
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None
    achievements: List[str] = Field(default_factory=list)


class Certification(BaseModel):
    """Certification or license"""
    name: str
    issuing_organization: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    credential_id: Optional[str] = None


class Project(BaseModel):
    """Project entry"""
    name: str
    description: Optional[str] = None
    role: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)
    url: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class Language(BaseModel):
    """Language proficiency"""
    language: str
    proficiency: Optional[str] = None  # e.g., "Native", "Fluent", "Professional"


class CVStructure(BaseModel):
    """Complete structured CV data"""
    personal_info: PersonalInfo
    summary: Optional[str] = None
    work_experience: List[WorkExperience] = Field(default_factory=list)
    education: List[Education] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    certifications: List[Certification] = Field(default_factory=list)
    projects: List[Project] = Field(default_factory=list)
    languages: List[Language] = Field(default_factory=list)
    
    class Config:
        json_schema_extra = {
            "example": {
                "personal_info": {
                    "full_name": "Anna Andersson",
                    "email": "anna@example.com",
                    "phone": "+46701234567",
                    "location": "Stockholm, Sweden"
                },
                "summary": "Erfaren backend-utvecklare med fokus på Python och API-design",
                "work_experience": [
                    {
                        "company": "Tech AB",
                        "position": "Senior Backend Developer",
                        "start_date": "2020-01",
                        "current": True,
                        "achievements": ["Byggde skalbar microservice-arkitektur"]
                    }
                ],
                "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"]
            }
        }


class CVResponse(BaseModel):
    """Response model for CV"""
    id: int
    filename: str
    upload_date: datetime
    structured_data: CVStructure
    
    class Config:
        from_attributes = True


class JobPosting(BaseModel):
    """Job posting for CV optimization"""
    title: str
    description: str
    company: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    preferred_skills: List[str] = Field(default_factory=list)


class OptimizedCVResponse(BaseModel):
    """Response model for optimized CV"""
    id: int
    original_cv_id: int
    job_title: str
    optimized_data: CVStructure
    match_score: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
