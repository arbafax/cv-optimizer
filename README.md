# CV Optimizer (CVMatch)

En AI-driven webbapplikation som hjälper användare att **ladda upp, strukturera, sammanställa och optimera CV:n** för specifika jobbannonser. Applikationen kombinerar PDF-parsning, AI-driven innehållsextraktion, semantisk sökning och smart matchning.

## Teknikstack

**Backend:**
- Python 3.11+ / FastAPI
- PostgreSQL med pgvector (vektorembeddings)
- SQLAlchemy 2.0
- OpenAI API (GPT-4o för strukturering/optimering, text-embedding-3-small för embeddings)

**Frontend:**
- Vanilla JavaScript (SPA)
- HTML5 / CSS3

## Funktionalitet

### Huvudflöde

1. **CV-uppladdning & strukturering** — Ladda upp PDF-CV:n som parsas med pdfplumber. GPT-4o strukturerar texten till JSON och vektorembeddings genereras automatiskt.

2. **Kompetensbank** — Alla uppladdade CV:n kan slås samman till en central kompetensbank med dedupliserade färdigheter och erfarenheter, grupperade per kategori (t.ex. "Programming Languages", "Databases", "Cloud & DevOps").

3. **CV-optimering mot jobbannons** — Välj ett CV och klistra in en jobbeskrivning. GPT-4o omformulerar och prioriterar om CV-innehållet för att matcha jobbet, utan att hitta på eller ljuga.

### Frontend-vyer

| Vy | Funktion |
|---|---|
| **Dashboard** | Statistik, snabbåtgärder, senaste CV:n |
| **Ladda upp** | Drag-and-drop PDF-uppladdning |
| **Mina CV:n** | Lista, visa, redigera titel, ta bort |
| **Kompetensbank** | Samlade färdigheter & erfarenheter från alla CV:n |
| **Matcha jobb** | Optimera valt CV mot en jobbannons |

## API-endpoints

### CV-hantering (`/api/v1/cv`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/cv/upload` | Ladda upp och strukturera PDF-CV |
| `GET` | `/cv/` | Lista alla CV:n (stödjer paginering) |
| `GET` | `/cv/{cv_id}` | Hämta specifikt CV |
| `PATCH` | `/cv/{cv_id}/title` | Uppdatera CV-titel |
| `DELETE` | `/cv/{cv_id}` | Ta bort CV (kompetensbanken byggs om automatiskt) |

### Kompetensbank (`/api/v1/competence`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/competence/merge-all` | Slå samman alla CV:n till kompetensbanken |
| `POST` | `/competence/merge/{cv_id}` | Slå samman enskilt CV |
| `GET` | `/competence/stats` | Statistik (antal färdigheter, erfarenheter, källor) |
| `GET` | `/competence/skills` | Lista alla färdigheter med kategorier |
| `GET` | `/competence/experiences` | Lista alla erfarenheter |
| `DELETE` | `/competence/reset` | Rensa hela kompetensbanken |

### CV-optimering (`/api/v1/optimize`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/optimize` | Optimera CV för jobbannons (kräver cv_id + job_posting) |
| `GET` | `/optimize/{id}` | Hämta optimerat CV |
| `GET` | `/optimize/by-cv/{cv_id}` | Lista alla optimeringar för ett CV |

Fullständig API-dokumentation (Swagger): `http://localhost:8000/docs`

## Installation

### Förutsättningar

- Python 3.11+
- Docker & Docker Compose (för PostgreSQL)
- En OpenAI API-nyckel

### 1. Klona projektet

```bash
git clone <your-repo-url>
cd cv-optimizer
```

### 2. Starta databasen med Docker

Projektet inkluderar en `docker-compose.yml` som startar PostgreSQL 15 med pgvector-tillägget:

```bash
docker compose up -d
```

Detta startar en PostgreSQL-instans med:
- Användare: `cv_user`
- Lösenord: `cv_password`
- Databas: `cv_optimizer`
- Port: `5432`

### 3. Sätt upp Python virtual environment

```bash
python -m venv venv
source venv/bin/activate  # På Windows: venv\Scripts\activate
```

### 4. Installera dependencies

```bash
pip install -r requirements.txt
```

### 5. Konfigurera miljövariabler

Kopiera exempelfilen och fyll i din OpenAI API-nyckel:

```bash
cp backend/.env.example backend/.env
```

Redigera `backend/.env` — det viktigaste är att sätta `OPENAI_API_KEY`:

```env
OPENAI_API_KEY=sk-din-nyckel-här
```

Övriga värden fungerar som de är om du använder Docker-uppsättningen ovan.

### 6. Starta applikationen

**Backend** (från projektets rot):

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Databastabeller skapas automatiskt vid första körning.

**Frontend** (i ett nytt terminalfönster):

```bash
cd frontend
python -m http.server 3000
```

Öppna sedan `http://localhost:3000` i webbläsaren.

## Projektstruktur

```
cv-optimizer/
├── backend/
│   ├── app/
│   │   ├── api/                # API-endpoints
│   │   │   ├── cv.py           #   CV-hantering
│   │   │   ├── competence.py   #   Kompetensbank
│   │   │   └── optimize.py     #   CV-optimering
│   │   ├── core/
│   │   │   ├── config.py       #   Miljövariabler & inställningar
│   │   │   └── database.py     #   Databasanslutning
│   │   ├── models/
│   │   │   ├── cv.py           #   CV & OptimizedCV (SQLAlchemy)
│   │   │   └── competence.py   #   SkillEntry & ExperienceEntry
│   │   ├── schemas/
│   │   │   └── cv.py           #   Pydantic-valideringsscheman
│   │   ├── services/
│   │   │   ├── ai_service.py   #   OpenAI-integration (GPT-4o + embeddings)
│   │   │   ├── pdf_parser.py   #   PDF-textextraktion (pdfplumber)
│   │   │   └── competence_service.py  # Sammanslagning & deduplicering
│   │   └── main.py             # FastAPI-applikation
│   ├── tests/
│   ├── .env.example
│   └── .env                    # (ignoreras av git)
├── frontend/
│   ├── index.html              # SPA (single page application)
│   ├── js/app.js               # All frontend-logik
│   └── css/style.css           # Design system
├── docker-compose.yml          # PostgreSQL med pgvector
├── requirements.txt
└── README.md
```

## Databasmodeller

- **CVs** — Uppladdade CV:n med originaltext, strukturerad JSON-data och vektorembeddings
- **OptimizedCVs** — Optimerade versioner kopplade till original-CV + jobbannons
- **SkillsCollection** — Kompetensbanken: unika färdigheter med kategori, typ och källhänvisning
- **ExperiencesPool** — Kompetensbanken: erfarenheter (arbete, utbildning, certifiering, projekt) med källhänvisning

## Kända begränsningar

- Match-score vid optimering är hårdkodad till 85 (placeholder)
- Ingen autentisering/användarkonton (enkel-användare)
- PDF-export av optimerade CV:n är ej implementerad
- Semantisk sökning (vektorinfrastrukturen finns men används inte aktivt ännu)

## Licens

MIT
