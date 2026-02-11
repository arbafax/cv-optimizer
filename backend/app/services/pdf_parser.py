import pdfplumber
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class PDFParser:
    """Service for extracting text from PDF files"""
    
    @staticmethod
    def extract_text(pdf_path: str) -> Optional[str]:
        """
        Extract text content from a PDF file
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Extracted text as string, or None if extraction fails
        """
        try:
            text_content = []
            
            with pdfplumber.open(pdf_path) as pdf:
                logger.info(f"Processing PDF with {len(pdf.pages)} pages")
                
                for page_num, page in enumerate(pdf.pages, 1):
                    # Extract text from page
                    page_text = page.extract_text()
                    
                    if page_text:
                        text_content.append(page_text)
                        logger.debug(f"Extracted {len(page_text)} characters from page {page_num}")
            
            full_text = "\n\n".join(text_content)
            logger.info(f"Successfully extracted {len(full_text)} total characters")
            
            return full_text if full_text.strip() else None
            
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {str(e)}")
            return None
    
    @staticmethod
    def validate_pdf(file_path: str) -> bool:
        """
        Validate that the file is a readable PDF
        
        Args:
            file_path: Path to the file
            
        Returns:
            True if valid PDF, False otherwise
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                # Check if we can access at least one page
                return len(pdf.pages) > 0
        except Exception as e:
            logger.error(f"PDF validation failed: {str(e)}")
            return False
