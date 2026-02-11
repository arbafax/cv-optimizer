# Steg 5 - PDF-parsing med AI - Färdig! ✅

## Vad som har skapats:

### 1. **PDF Parser Service** (`services/pdf_parser.py`)
- Extraherar text från PDF-filer
- Validerar PDF:er
- Använder pdfplumber

### 2. **AI Service** (`services/ai_service.py`)
- Strukturerar CV-text till JSON med OpenAI
- Genererar embeddings för semantisk sökning
- Optimerar CV:n för specifika jobbannonser

### 3. **CV API** (`api/cv.py`)
- `POST /api/v1/cv/upload` - Ladda upp PDF och strukturera
- `GET /api/v1/cv/` - Lista alla CV:n
- `GET /api/v1/cv/{id}` - Hämta specifikt CV
- `DELETE /api/v1/cv/{id}` - Ta bort CV

### 4. **Optimize API** (`api/optimize.py`)
- `POST /api/v1/optimize` - Optimera CV för jobbannons
- `GET /api/v1/optimize/{id}` - Hämta optimerat CV
- `GET /api/v1/optimize/by-cv/{cv_id}` - Lista alla optimeringar av ett CV

## Installation av nya filer:

Kopiera dessa filer till ditt projekt:

```bash
# Från cv-optimizer root
cd backend/app

# Skapa services-mappen om den inte finns
mkdir -p services api

# Kopiera filerna (från downloads):
# pdf_parser.py → backend/app/services/
# ai_service.py → backend/app/services/
# cv.py → backend/app/api/
# optimize.py → backend/app/api/
# main.py → backend/app/  (ersätt befintlig)
```

## Starta servern:

```bash
# Från cv-optimizer/backend
python -m app.main
```

## Testa API:et:

### 1. Öppna API-dokumentationen:
http://localhost:8000/docs

### 2. Testa CV-uppladdning:

**Via Swagger UI (http://localhost:8000/docs):**
- Hitta `POST /api/v1/cv/upload`
- Klicka "Try it out"
- Välj en PDF-fil med ditt CV
- Klicka "Execute"

**Via curl:**
```bash
curl -X POST "http://localhost:8000/api/v1/cv/upload" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/cv.pdf"
```

### 3. Lista CV:n:
```bash
curl http://localhost:8000/api/v1/cv/
```

### 4. Optimera CV för jobbannons:

**Via Swagger UI:**
- Hitta `POST /api/v1/optimize`
- Klicka "Try it out"
- Fyll i JSON:
```json
{
  "cv_id": 1,
  "job_posting": {
    "title": "Senior Backend Developer",
    "description": "We are looking for an experienced backend developer with Python and FastAPI experience...",
    "company": "Tech Company AB"
  }
}
```

**Via curl:**
```bash
curl -X POST "http://localhost:8000/api/v1/optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "cv_id": 1,
    "job_posting": {
      "title": "Senior Backend Developer",
      "description": "Looking for Python developer with FastAPI...",
      "company": "Tech AB"
    }
  }'
```

## Vad händer under huven:

1. **Upload:**
   - PDF laddas upp → sparas temporärt
   - Text extraheras från PDF:en
   - OpenAI strukturerar texten till JSON
   - Embeddings genereras för semantisk sökning
   - Allt sparas i PostgreSQL med pgvector

2. **Optimize:**
   - Hämtar original-CV från databasen
   - Skickar CV + jobbannons till OpenAI
   - AI omformulerar och prioriterar innehåll
   - Sparar optimerad version
   - Beräknar match-score

## Nästa steg (Steg 6):

- Semantic search (hitta relevanta CV:n baserat på jobbeskrivningar)
- PDF/Word-generering av optimerade CV:n
- Förbättra frontend för bättre UX

## Felsökning:

**"Module not found" error:**
```bash
pip install -r requirements.txt
```

**"Database error":**
```bash
# Kontrollera att PostgreSQL körs
docker ps

# Kontrollera .env-filen
cat backend/.env
```

**"OpenAI API error":**
- Verifiera att OPENAI_API_KEY är korrekt i .env
- Kontrollera att du har credits på ditt OpenAI-konto

## Kostnad:

För utveckling/testning:
- Text strukturering (GPT-4o-mini): ~$0.0002 per CV
- Embeddings: ~$0.00002 per CV
- CV-optimering (GPT-4o): ~$0.01 per optimering

**Totalt för 20 test-CV:n + 10 optimeringar: ~$0.10**
