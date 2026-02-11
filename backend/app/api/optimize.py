from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from app.core.database import get_db
from app.models.cv import CV, OptimizedCV
from app.schemas.cv import CVStructure, JobPosting, OptimizedCVResponse
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/optimize", tags=["CV Optimization"])

# Initialize AI service
ai_service = AIService()


class OptimizeRequest(BaseModel):
    """Request model for CV optimization"""
    cv_id: int
    job_posting: JobPosting


@router.post("/", response_model=OptimizedCVResponse, status_code=201)
async def optimize_cv(
    request: OptimizeRequest,
    db: Session = Depends(get_db)
):
    """
    Optimize a CV for a specific job posting
    
    - **cv_id**: ID of the CV to optimize
    - **job_posting**: Job posting details (title, description, etc.)
    """
    # Get original CV
    original_cv = db.query(CV).filter(CV.id == request.cv_id).first()
    
    if not original_cv:
        raise HTTPException(status_code=404, detail="CV not found")
    
    try:
        # Convert stored data to CVStructure
        original_structure = CVStructure(**original_cv.structured_data)
        
        # Optimize CV for job posting
        optimized_structure = ai_service.optimize_cv_for_job(
            cv_data=original_structure,
            job_title=request.job_posting.title,
            job_description=request.job_posting.description
        )
        
        if not optimized_structure:
            raise HTTPException(
                status_code=500, 
                detail="Failed to optimize CV"
            )
        
        # Generate embedding for job description
        job_embedding = ai_service.generate_embeddings(
            f"{request.job_posting.title}\n{request.job_posting.description}"
        )
        
        # Calculate match score (cosine similarity between CV and job)
        # For now, we'll use a simple placeholder
        # In production, you'd calculate cosine similarity between embeddings
        match_score = 85  # Placeholder
        
        # Save optimized CV to database
        optimized_cv = OptimizedCV(
            original_cv_id=request.cv_id,
            job_title=request.job_posting.title,
            job_description=request.job_posting.description,
            job_description_embedding=job_embedding,
            optimized_data=optimized_structure.model_dump(),
            match_score=match_score
        )
        
        db.add(optimized_cv)
        db.commit()
        db.refresh(optimized_cv)
        
        logger.info(f"Created optimized CV with ID: {optimized_cv.id}")
        
        return OptimizedCVResponse(
            id=optimized_cv.id,
            original_cv_id=optimized_cv.original_cv_id,
            job_title=optimized_cv.job_title,
            optimized_data=CVStructure(**optimized_cv.optimized_data),
            match_score=optimized_cv.match_score,
            created_at=optimized_cv.created_at
        )
        
    except Exception as e:
        logger.error(f"Error optimizing CV: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Error optimizing CV: {str(e)}"
        )


@router.get("/{optimized_cv_id}", response_model=OptimizedCVResponse)
async def get_optimized_cv(
    optimized_cv_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific optimized CV by ID
    
    - **optimized_cv_id**: The ID of the optimized CV
    """
    optimized_cv = db.query(OptimizedCV).filter(
        OptimizedCV.id == optimized_cv_id
    ).first()
    
    if not optimized_cv:
        raise HTTPException(status_code=404, detail="Optimized CV not found")
    
    return OptimizedCVResponse(
        id=optimized_cv.id,
        original_cv_id=optimized_cv.original_cv_id,
        job_title=optimized_cv.job_title,
        optimized_data=CVStructure(**optimized_cv.optimized_data),
        match_score=optimized_cv.match_score,
        created_at=optimized_cv.created_at
    )


@router.get("/by-cv/{cv_id}")
async def get_optimized_versions(
    cv_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all optimized versions of a specific CV
    
    - **cv_id**: The ID of the original CV
    """
    optimized_cvs = db.query(OptimizedCV).filter(
        OptimizedCV.original_cv_id == cv_id
    ).all()
    
    return [
        {
            "id": cv.id,
            "job_title": cv.job_title,
            "match_score": cv.match_score,
            "created_at": cv.created_at
        }
        for cv in optimized_cvs
    ]
