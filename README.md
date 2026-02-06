# CV Optimizer

En webbaserad tjänst som tar emot CV:n i PDF-format, strukturerar dem med AI, och optimerar dem för specifika jobbannonser.

## Teknologier

**Backend:**
- Python 3.11+
- FastAPI
- PostgreSQL med pgvector
- SQLAlchemy
- OpenAI API (embeddings)

**Frontend:**
- Vanilla JavaScript
- HTML5/CSS3

## Funktionalitet

1. **CV-uppladdning**: Ladda upp PDF-CV
2. **AI-strukturering**: Konvertera PDF till strukturerad JSON
3. **Semantisk sökning**: Hitta relevanta CV:n med vektorsökning
4. **CV-optimering**: Skräddarsy CV för specifika jobbannonser

## Installation

### 1. Klona projektet

```bash
git clone <your-repo-url>
cd cv-optimizer
```

### 2. Sätt upp Python virtual environment

```bash
python -m venv venv
source venv/bin/activate  # På Windows: venv\Scripts\activate
```

### 3. Installera dependencies

```bash
pip install -r requirements.txt
```

### 4. Sätt upp PostgreSQL med pgvector

**Installera PostgreSQL:**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql
```

**Installera pgvector extension:**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-15-pgvector

# macOS
brew install pgvector
```

**Skapa databas:**
```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE cv_optimizer;
CREATE USER your_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE cv_optimizer TO your_user;

-- Anslut till databasen
\c cv_optimizer

-- Skapa pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verifiera installation
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### 5. Konfigurera miljövariabler

Kopiera `.env.example` till `.env` och fyll i dina värden:

```bash
cp .env.example .env
```

Redigera `.env` med dina API-nycklar och databasinställningar.

### 6. Kör migrationer (skapas automatiskt vid första körning)

```bash
cd backend
python -m app.main
```

## Körning

### Starta backend-servern

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API dokumentation finns på: `http://localhost:8000/docs`

### Öppna frontend

Öppna `frontend/index.html` i en webbläsare eller använd en lokal server:

```bash
cd frontend
python -m http.server 3000
```

Frontend finns på: `http://localhost:3000`

## Projektstruktur

```
cv-optimizer/
├── backend/
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   ├── core/         # Konfiguration, databas
│   │   ├── models/       # SQLAlchemy modeller
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── main.py       # FastAPI app
│   └── tests/
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── database/
│   └── migrations/
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## API Endpoints (kommer att byggas)

- `POST /api/v1/cv/upload` - Ladda upp PDF-CV
- `GET /api/v1/cv/` - Lista alla CV:n
- `GET /api/v1/cv/{id}` - Hämta specifikt CV
- `POST /api/v1/cv/search` - Semantisk sökning
- `POST /api/v1/optimize` - Optimera CV för jobbannons

## Nästa steg

1. ✅ Projektupplägg och miljö
2. Implementera PDF-uppladdning
3. Implementera AI-strukturering
4. Implementera vektorsökning
5. Implementera CV-optimering
6. Bygg frontend

## Licens

MIT
