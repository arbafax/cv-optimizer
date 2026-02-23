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
      "current": boolean,
      "location": "string or null",
      "description": "string or null",
      "achievements": ["string"],
      "technologies": ["string"]
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
      "achievements": ["string"]
    }
  ],
  "skills": ["string"],
  "certifications": [
    {
      "name": "string",
      "issuing_organization": "string or null",
      "issue_date": "string or null",
      "expiry_date": "string or null",
      "credential_id": "string or null"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string or null",
      "role": "string or null",
      "technologies": ["string"],
      "url": "string or null",
      "start_date": "string or null",
      "end_date": "string or null"
    }
  ],
  "languages": [
    {
      "language": "string",
      "proficiency": "string or null"
    }
  ]
}

Viktigt:
- Extrahera ALL information som finns i CV:t
- Om information saknas, använd null eller tom array
- För datum, använd format som finns i CV:t (t.ex. "2020-01", "Jan 2020", etc.)
- Gruppera achievements och teknologier korrekt
- Identifiera och separera olika sektioner noggrant
- Svara ENDAST med JSON, ingen extra text"""

            user_prompt = f"Här är CV-texten att strukturera:\n\n{cv_text}"
            
            logger.info("Calling OpenAI API...")
            response = self.client.chat.completions.create(
                model="gpt-4o",  # Använd GPT-4o istället för gpt-4o-mini
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,  # Låg temperatur för konsistens
                response_format={"type": "json_object"}
            )
            
            logger.info("Received response from OpenAI")
            
            # Parse JSON response
            response_text = response.choices[0].message.content
            logger.debug(f"Response length: {len(response_text)} characters")
            
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

            logger.info("Calling OpenAI API for optimization...")
            response = self.client.chat.completions.create(
                model="gpt-4o",  # Använd GPT-4o
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

    def match_competences_to_job(
        self,
        skills: list[dict],
        experiences: list[dict],
        job_title: str,
        job_description: str,
    ) -> dict:
        """
        Matcha kompetensbanken (skills + erfarenheter) mot en jobbannons.
        Returnerar matchningspoäng och förklaring per skill/erfarenhet.
        """
        skills_list = "\n".join(
            f"- {s['skill_name']} ({s['category']})" for s in skills
        ) or "(inga skills)"

        exp_list = "\n".join(
            f"- [ID:{e['id']}] {e['title']}"
            + (f" på {e['organization']}" if e.get('organization') else "")
            + (f" ({e['start_date']}–{e.get('end_date') or 'nu'})" if e.get('start_date') else "")
            for e in experiences
        ) or "(inga erfarenheter)"

        system_prompt = """Du är en expert på rekrytering och kompetensanalys.
Du får en lista med skills och erfarenheter från en persons kompetensbank, samt en jobbannons.
Din uppgift är att analysera hur väl kompetenserna matchar jobbet.

Svara ENDAST med JSON i exakt detta format:
{
  "overall_score": <0-100>,
  "summary": "<2-3 meningar om matchningen totalt sett>",
  "skills": [
    {"skill_name": "<namn>", "score": <1-100>, "reason": "<kort förklaring>"},
    ...
  ],
  "experiences": [
    {"id": <id>, "score": <1-100>, "reason": "<kort förklaring varför erfarenheten är relevant>"},
    ...
  ],
  "missing_skills": ["<skill som nämns i annonsen men saknas i kompetensbanken>", ...]
}

Regler:
- Inkludera ENDAST skills och erfarenheter som är relevanta för jobbet (score >= 1). Utelämna sådant som inte alls berörs av annonsen.
- Lägg till i missing_skills alla tekniker, verktyg, språk och kompetenser som annonsen efterfrågar men som INTE finns i personens kompetensbank.
- Sortera skills och experiences med högst poäng först."""

        user_prompt = f"""Jobbannons:
Titel: {job_title}

{job_description}

---
Personens skills:
{skills_list}

Personens erfarenheter:
{exp_list}
"""

        logger.info(f"Matchar kompetensbank mot jobb: {job_title}")
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    def generate_cv_for_job(
        self,
        job_description: str,
        experiences_data: list[dict],
        skills: list[str],
    ) -> dict:
        """
        Genererar ett anpassat CV-utkast (pitch + highlighted achievements per erfarenhet)
        för en specifik jobbannons.
        """
        exp_text = "\n\n".join(
            f"[ID:{e['id']}] {e['title']}"
            + (f" på {e['organization']}" if e.get("organization") else "")
            + (f" ({e.get('start_date', '')}–{e.get('end_date') or 'nu'})" if e.get("start_date") else "")
            + (f"\nBeskrivning: {e['description']}" if e.get("description") else "")
            + (
                "\nPrestationer:\n" + "\n".join(f"- {a}" for a in e["achievements"])
                if e.get("achievements")
                else ""
            )
            for e in experiences_data
        ) or "(inga erfarenheter)"

        skills_text = ", ".join(skills) or "(inga)"

        system_prompt = """Du är en expert på CV-skrivning och rekrytering.
Skapa ett anpassat CV-utkast för en specifik jobbannons baserat på personens erfarenheter.

Svara ENDAST med JSON i exakt detta format:
{
  "pitch": "<3-5 meningar som profil/sammanfattning. Förklara varför kandidaten passar jobbet. Skriv utan personliga pronomen, som en CV-profil.>",
  "experiences": [
    {
      "id": <id>,
      "highlighted_achievements": ["<prestation 1>", "<prestation 2>", ...]
    }
  ]
}

Regler:
- Inkludera bara erfarenheter som är relevanta för jobbet
- Max 4 prestationer per erfarenhet – välj de mest relevanta och jobbspecifika
- Du får omformulera prestationer för att bättre matcha jobbannonsens nyckelord, men ljug aldrig
- Sortera erfarenheterna med mest relevanta först"""

        user_prompt = f"""Jobbannons:
{job_description}

---
Personens erfarenheter:
{exp_text}

Personens skills: {skills_text}"""

        logger.info("Genererar CV-utkast med AI")
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    def generate_improvement_tips(
        self,
        job_description: str,
        overall_score: int,
        current_skills: list[str],
        missing_skills: list[str],
        experiences_data: list[dict],
    ) -> dict:
        """
        Genererar förbättringsförslag: skills att lägga till och konkreta tips
        för att öka matchningsprocenten mot en jobbannons.
        """
        skills_text  = ", ".join(current_skills) or "(inga)"
        missing_text = ", ".join(missing_skills) or "(inga)"

        exp_text = "\n\n".join(
            f"- {e['title']}"
            + (f" på {e['organization']}" if e.get("organization") else "")
            + (f"\n  Beskrivning: {e['description']}" if e.get("description") else "")
            + (
                "\n  Prestationer:\n" + "\n".join(f"  • {a}" for a in e["achievements"])
                if e.get("achievements")
                else ""
            )
            for e in experiences_data
        ) or "(inga erfarenheter)"

        system_prompt = f"""Du är en expert på rekrytering och CV-optimering.
En person har sökt ett jobb och fått matchningspoängen {overall_score}/100.
Din uppgift är att ge konkreta förslag på hur de kan höja sin matchningspoäng.

Svara EXAKT med JSON i detta format:
{{
  "suggested_skills": [
    {{"skill_name": "<namn>", "category": "<kategori>", "reason": "<varför detta ökar matchningen>"}}
  ],
  "tips": [
    {{"tip": "<konkret, handlingsorienterat förbättringstips>", "impact": "high|medium|low"}}
  ]
}}

Regler:
- suggested_skills: max 8 skills som saknas men som direkt ökar matchningen. Föreslå INTE skills som redan finns i kompetensbanken.
- tips: max 8 konkreta tips för erfarenheter eller formuleringar. Ge specifika exempel på omformuleringar när det är möjligt. Sortera med högst impact först.
- Svara på svenska."""

        user_prompt = f"""Jobbannons:
{job_description}

---
Personens nuvarande skills: {skills_text}
Skills som saknas (jobbet kräver): {missing_text}

Personens matchande erfarenheter:
{exp_text}"""

        logger.info("Genererar förbättringstips med AI")
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    def improve_achievements(
        self,
        achievements: list[str],
        title: str = "",
        organization: str = "",
    ) -> list[str]:
        """
        Rensar duplikat och förbättrar formuleringarna i en lista av prestationer.
        """
        context = f" för rollen {title}" if title else ""
        if organization:
            context += f" på {organization}"

        items = "\n".join(f"- {a}" for a in achievements)

        system_prompt = """Du är en expert på CV-skrivning.
Du får en lista med prestationer från en erfarenhet i ett CV.
Din uppgift är att:
1. Ta bort exakta och nära duplikat (behåll den bästa versionen)
2. Förbättra formuleringarna så att de är tydliga, konkreta och slagkraftiga
3. Behålla alla unika prestationer – lägg inte till nya

Svara EXAKT med JSON:
{"achievements": ["<prestation 1>", "<prestation 2>", ...]}

Svara på svenska."""

        user_prompt = f"Erfarenhet{context}:\n\n{items}"

        logger.info(f"Förbättrar prestationer för: {title}")
        response = self.client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        result = json.loads(response.choices[0].message.content)
        return result.get("achievements", achievements)
