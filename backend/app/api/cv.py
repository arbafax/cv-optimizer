from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from datetime import datetime
import logging

from app.core.database import get_db
from app.core.config import settings
from app.models.cv import CV
from app.schemas.cv import CVResponse, CVStructure
from app.services.pdf_parser import PDFParser
from app.services.ai_service import AIService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["CV Management"])

# Initialize services
pdf_parser = PDFParser()
ai_service = AIService()

# Ensure upload directory exists
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


@router.post("/upload", response_model=CVResponse, status_code=201)
async def upload_cv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload a CV PDF file, extract text, and structure it with AI
    
    - **file**: PDF file containing the CV
    """
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Validate file size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400, 
            detail=f"File too large. Maximum size is {settings.MAX_UPLOAD_SIZE} bytes"
        )
    
    # Save uploaded file temporarily
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_filename = f"{timestamp}_{file.filename}"
    temp_path = os.path.join(settings.UPLOAD_DIR, temp_filename)
    
    try:
        # Save file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Saved uploaded file: {temp_filename}")
        
        # Validate PDF
        if not pdf_parser.validate_pdf(temp_path):
            raise HTTPException(status_code=400, detail="Invalid or corrupted PDF file")
        
        # Extract text from PDF
        cv_text = pdf_parser.extract_text(temp_path)
        if not cv_text:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")
        
        logger.info(f"Extracted {len(cv_text)} characters from PDF")
        
        # Structure CV with AI
        cv_structure = ai_service.structure_cv_text(cv_text)
        if not cv_structure:
            raise HTTPException(status_code=500, detail="Failed to structure CV data")
        
        # Generate embeddings
        # Full content embedding
        full_content_text = f"{cv_structure.personal_info.full_name}\n{cv_structure.summary or ''}\n"
        full_content_text += "\n".join([
            f"{exp.position} at {exp.company}" 
            for exp in cv_structure.work_experience
        ])
        full_embedding = ai_service.generate_embeddings(full_content_text)
        
        # Summary embedding
        summary_text = cv_structure.summary or cv_structure.personal_info.full_name
        summary_embedding = ai_service.generate_embeddings(summary_text)
        
        # Skills embedding
        skills_text = ", ".join(cv_structure.skills)
        skills_embedding = ai_service.generate_embeddings(skills_text) if skills_text else None
        
        # Save to database
        db_cv = CV(
            filename=file.filename,
            original_text=cv_text,
            structured_data=cv_structure.model_dump(),
            full_content_embedding=full_embedding,
            summary_embedding=summary_embedding,
            skills_embedding=skills_embedding
        )
        
        db.add(db_cv)
        db.commit()
        db.refresh(db_cv)
        
        logger.info(f"Successfully saved CV to database with ID: {db_cv.id}")
        
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return CVResponse(
            id=db_cv.id,
            filename=db_cv.filename,
            upload_date=db_cv.upload_date,
            structured_data=CVStructure(**db_cv.structured_data)
        )
        
    except HTTPException:
        # Clean up temp file on HTTP errors
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    except Exception as e:
        # Clean up temp file on other errors
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"Error processing CV upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error processing CV: {str(e)}")


@router.get("/", response_model=List[CVResponse])
async def list_cvs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    List all uploaded CVs
    
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return
    """
    cvs = db.query(CV).offset(skip).limit(limit).all()
    
    return [
        CVResponse(
            id=cv.id,
            filename=cv.filename,
            upload_date=cv.upload_date,
            structured_data=CVStructure(**cv.structured_data)
        )
        for cv in cvs
    ]


@router.get("/{cv_id}", response_model=CVResponse)
async def get_cv(
    cv_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a specific CV by ID
    
    - **cv_id**: The ID of the CV to retrieve
    """
    cv = db.query(CV).filter(CV.id == cv_id).first()
    
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    
    return CVResponse(
        id=cv.id,
        filename=cv.filename,
        upload_date=cv.upload_date,
        structured_data=CVStructure(**cv.structured_data)
    )


@router.delete("/{cv_id}", status_code=204)
async def delete_cv(
    cv_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a CV by ID
    
    - **cv_id**: The ID of the CV to delete
    """
    cv = db.query(CV).filter(CV.id == cv_id).first()
    
    if not cv:
        raise HTTPException(status_code=404, detail="CV not found")
    
    db.delete(cv)
    db.commit()
    
    logger.info(f"Deleted CV with ID: {cv_id}")
    return None
