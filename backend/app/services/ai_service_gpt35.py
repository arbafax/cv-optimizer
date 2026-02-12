from openai import OpenAI
from typing import Optional
import json
import logging
from app.core.config import settings
from app.schemas.cv import CVStructure

logger = logging.getLogger(__name__)


class AIService:
    """Service for AI-powered CV structuring using OpenAI"""
    
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
    
    def structure_cv_text(self, cv_text: str) -> Optional[CVStructure]:
        """
        Use AI to extract structured data from CV text
        
        Args:
            cv_text: Raw text extracted from CV PDF
            
        Returns:
            CVStructure object with structured data, or None if parsing fails
        """
        try:
            logger.info("Sending CV text to OpenAI for structuring")
            logger.debug(f"CV text length: {len(cv_text)} characters")
            
            system_prompt = """Du är en expert på att extrahera strukturerad information från CV:n.
Analysera CV-texten och extrahera all relevant information i följande JSON-format:

{
  "personal_info": {
    "full_name": "string",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null",
    "github": "string or null",
    "website": "string or null"
  },
  "summary": "string or null",
  "work_experience": [
    {
      "company": "string",
      "position": "string",
      "start_date": "string or null",
      "end_date": "string or null",
      "current": false,
      "location": "string or null",
      "description": "string or null",
      "achievements": [],
      "technologies": []
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string or null",
      "field_of_study": "string or null",
      "start_date": "string or null",
      "end_date": "string or null",
      "gpa": "string or null",
      "achievements": []
    }
  ],
  "skills": [],
  "certifications": [],
  "projects": [],
  "languages": []
}

Viktigt:
- Extrahera ALL information som finns i CV:t
- Om information saknas, använd null eller tom array []
- För datum, använd format som finns i CV:t (t.ex. "2020-01", "Jan 2020", etc.)
- Svara ENDAST med JSON, ingen extra text"""

            user_prompt = f"Här är CV-texten att strukturera:\n\n{cv_text}"
            
            logger.info("Calling OpenAI API with gpt-3.5-turbo...")
            
            # ÄNDRAT: Använd gpt-3.5-turbo istället (fungerar för alla konton)
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",  # Billigare och mer tillgänglig
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            logger.info("Received response from OpenAI")
            
            # Parse JSON response
            response_text = response.choices[0].message.content
            logger.debug(f"Response length: {len(response_text)} characters")
            logger.debug(f"First 200 chars of response: {response_text[:200]}")
            
            cv_data = json.loads(response_text)
            logger.info("Successfully parsed JSON response")
            
            # Validate and create CVStructure
            cv_structure = CVStructure(**cv_data)
            logger.info("Successfully created CVStructure object")
            
            return cv_structure
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {str(e)}")
            logger.error(f"Response was: {response_text[:500] if 'response_text' in locals() else 'N/A'}")
            return None
        except Exception as e:
            logger.error(f"Error structuring CV with AI: {str(e)}", exc_info=True)
            if 'response' in locals():
                logger.error(f"Full response object: {response}")
            return None
    
    def generate_embeddings(self, text: str) -> Optional[list[float]]:
        """
        Generate vector embeddings for text using OpenAI
        
        Args:
            text: Text to generate embeddings for
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            logger.debug(f"Generating embeddings for text of length: {len(text)}")
            
            response = self.client.embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=text
            )
            
            embedding = response.data[0].embedding
            logger.info(f"Generated embedding with {len(embedding)} dimensions")
            
            return embedding
            
        except Exception as e:
            logger.error(f"Error generating embeddings: {str(e)}", exc_info=True)
            return None
    
    def optimize_cv_for_job(
        self, 
        cv_data: CVStructure, 
        job_title: str, 
        job_description: str
    ) -> Optional[CVStructure]:
        """
        Optimize CV content to match a specific job posting
        
        Args:
            cv_data: Original CV structure
            job_title: Title of the job
            job_description: Full job description
            
        Returns:
            Optimized CVStructure
        """
        try:
            logger.info(f"Optimizing CV for job: {job_title}")
            
            system_prompt = """Du är en expert på CV-optimering och rekrytering.
Din uppgift är att ta ett befintligt CV och anpassa det för en specifik jobannons.

Regler:
1. Behåll ALL sann information från originalet - ljug ALDRIG
2. Omformulera achievements och beskrivningar för att matcha jobbannonsens språk och nyckelord
3. Prioritera relevant arbetslivserfarenhet och skills högre upp
4. Framhäv erfarenheter som matchar jobkraven
5. Anpassa summary för att matcha jobbet
6. Lägg till relevanta teknologier/verktyg om de nämns i både CV och jobbannons

Svara ENDAST med det optimerade CV:t i samma JSON-format som input."""

            cv_json = cv_data.model_dump_json(indent=2)
            
            user_prompt = f"""Original CV:
{cv_json}

Jobbtitel: {job_title}

Jobbeskrivning:
{job_description}

Optimera CV:t för denna jobbannons."""

            logger.info("Calling OpenAI API for optimization with gpt-3.5-turbo...")
            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",  # Billigare modell
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            
            logger.info("Received optimization response from OpenAI")
            
            optimized_data = json.loads(response.choices[0].message.content)
            optimized_cv = CVStructure(**optimized_data)
            
            logger.info("Successfully optimized CV")
            return optimized_cv
            
        except Exception as e:
            logger.error(f"Error optimizing CV: {str(e)}", exc_info=True)
            return None
