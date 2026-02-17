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
from app.schemas.cv import CVResponse, CVStructure, CVUpdateTitle
from app.services.pdf_parser import PDFParser
from app.services.ai_service import AIService
from app.services.competence_service import rebuild_bank

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
    Ladda upp en CV-PDF, extrahera text och strukturera med AI.
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Endast PDF-filer är tillåtna")

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Filen är för stor. Max {settings.MAX_UPLOAD_SIZE} bytes"
        )

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_filename = f"{timestamp}_{file.filename}"
    temp_path = os.path.join(settings.UPLOAD_DIR, temp_filename)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"Sparade uppladdad fil: {temp_filename}")

        if not pdf_parser.validate_pdf(temp_path):
            raise HTTPException(status_code=400, detail="Ogiltig eller skadad PDF-fil")

        cv_text = pdf_parser.extract_text(temp_path)
        if not cv_text:
            raise HTTPException(status_code=400, detail="Kunde inte extrahera text från PDF")

        logger.info(f"Extraherade {len(cv_text)} tecken från PDF")

        cv_structure = ai_service.structure_cv_text(cv_text)
        if not cv_structure:
            raise HTTPException(status_code=500, detail="Misslyckades med att strukturera CV-data")

        # Generate embeddings
        full_content_text = f"{cv_structure.personal_info.full_name}\n{cv_structure.summary or ''}\n"
        full_content_text += "\n".join([
            f"{exp.position} at {exp.company}"
            for exp in cv_structure.work_experience
        ])
        full_embedding    = ai_service.generate_embeddings(full_content_text)
        summary_text      = cv_structure.summary or cv_structure.personal_info.full_name
        summary_embedding = ai_service.generate_embeddings(summary_text)
        skills_text       = ", ".join(cv_structure.skills)
        skills_embedding  = ai_service.generate_embeddings(skills_text) if skills_text else None

        db_cv = CV(
            filename               = file.filename,
            original_text          = cv_text,
            structured_data        = cv_structure.model_dump(),
            full_content_embedding = full_embedding,
            summary_embedding      = summary_embedding,
            skills_embedding       = skills_embedding,
        )

        db.add(db_cv)
        db.commit()
        db.refresh(db_cv)

        logger.info(f"Sparade CV till databasen med ID: {db_cv.id}")

        if os.path.exists(temp_path):
            os.remove(temp_path)

        return CVResponse(
            id              = db_cv.id,
            filename        = db_cv.filename,
            title           = db_cv.title,
            upload_date     = db_cv.upload_date,
            structured_data = CVStructure(**db_cv.structured_data),
        )

    except HTTPException:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"Fel vid CV-uppladdning: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Fel vid bearbetning av CV: {str(e)}")


@router.get("/", response_model=List[CVResponse])
async def list_cvs(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Lista alla uppladdade CV:n."""
    cvs = db.query(CV).offset(skip).limit(limit).all()
    return [
        CVResponse(
            id              = cv.id,
            filename        = cv.filename,
            title           = cv.title,
            upload_date     = cv.upload_date,
            structured_data = CVStructure(**cv.structured_data),
        )
        for cv in cvs
    ]


@router.get("/{cv_id}", response_model=CVResponse)
async def get_cv(cv_id: int, db: Session = Depends(get_db)):
    """Hämta ett specifikt CV med ID."""
    cv = db.query(CV).filter(CV.id == cv_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")
    return CVResponse(
        id              = cv.id,
        filename        = cv.filename,
        title           = cv.title,
        upload_date     = cv.upload_date,
        structured_data = CVStructure(**cv.structured_data),
    )


@router.patch("/{cv_id}/title", response_model=CVResponse)
async def update_cv_title(
    cv_id: int,
    body: CVUpdateTitle,
    db: Session = Depends(get_db)
):
    """Uppdatera titeln på ett CV."""
    cv = db.query(CV).filter(CV.id == cv_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")

    cv.title = body.title.strip()
    db.commit()
    db.refresh(cv)

    logger.info(f"Uppdaterade titel för CV {cv_id}: '{cv.title}'")

    return CVResponse(
        id              = cv.id,
        filename        = cv.filename,
        title           = cv.title,
        upload_date     = cv.upload_date,
        structured_data = CVStructure(**cv.structured_data),
    )


@router.delete("/{cv_id}")
async def delete_cv(cv_id: int, db: Session = Depends(get_db)):
    """
    Radera ett CV och bygg automatiskt om kompetensbanken
    från kvarvarande CV:n.
    """
    cv = db.query(CV).filter(CV.id == cv_id).first()
    if not cv:
        raise HTTPException(status_code=404, detail="CV hittades inte")

    cv_name = (cv.structured_data.get("personal_info") or {}).get("full_name") or cv.filename

    # Ta bort CV:t
    db.delete(cv)
    db.commit()
    logger.info(f"Raderade CV {cv_id} ({cv_name})")

    # Hämta kvarvarande CV:n och bygg om banken
    remaining_cvs = db.query(CV).all()
    result = rebuild_bank(remaining_cvs, db)
    logger.info(
        f"Ombyggd kompetensbank: {result['total_skills_added']} skills, "
        f"{result['total_experiences_added']} erfarenheter från "
        f"{result['total_cvs_processed']} CV:n"
    )

    return {
        "message"          : f"'{cv_name}' raderat och kompetensbanken ombyggd",
        "remaining_cvs"    : result["total_cvs_processed"],
        "total_skills"     : result["total_skills_added"],
        "total_experiences": result["total_experiences_added"],
    }
