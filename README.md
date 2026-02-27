# CVMatch — AI-driven karriärverktyg

En AI-driven webbapplikation som hjälper användare att **ladda upp, strukturera, sammanställa och matcha CV:n mot jobbannonser**. Applikationen kombinerar PDF-parsning, AI-driven innehållsextraktion och smart matchning mot jobbannonser.

## Teknikstack

**Backend:**
- Python 3.11+ / FastAPI
- PostgreSQL med pgvector
- SQLAlchemy 2.0
- OpenAI API (GPT-4o för strukturering och matchning)
- JWT-autentisering (python-jose + passlib)

**Frontend:**
- Vanilla JavaScript (SPA)
- HTML5 / CSS3

## Funktionalitet

### Huvudflöde

1. **Registrering & inloggning** — Konto per användare med JWT-cookies. All data är isolerad per användare.

2. **CV-uppladdning & strukturering** — Ladda upp PDF-CV:n via drag-and-drop. AI (GPT-4o) strukturerar texten till JSON med personuppgifter, erfarenheter, utbildning, skills m.m.

3. **Kompetensbank** — Behandla enskilda CV:n eller alla på en gång för att bygga upp en central kompetensbank med dedupliserade färdigheter och erfarenheter, grupperade per kategori (t.ex. "Mjukvaruutveckling", "Databases", "Cloud & DevOps"). Kan redigeras manuellt med CRUD.

4. **Matchning mot jobbannons** — Klistra in en jobbannons. AI matchar hela kompetensbanken mot jobbet och tar hänsyn till användarens sökprofil (önskade roller, ort, anställningsform m.m.).

5. **Sökprofil** — Ange vilka roller, orter och anställningsformer du söker. Används som komplement vid AI-matchningen.

### Frontend-vyer

| Vy | Funktion |
|---|---|
| **Dashboard** | Statistik, snabbåtgärder, senaste CV:n |
| **Mina CV:n** | Ladda upp PDF (drag-and-drop), lista, visa, redigera titel, ta bort, behandla till kompetensbank |
| **Kompetensbank** | Samlade färdigheter och erfarenheter från alla CV:n, full CRUD |
| **Matcha jobb** | Klistra in jobbannons — AI matchar kompetensbank och sökprofil mot jobbet |
| **Sökprofil** | Önskade roller, ort, anställningsform, arbetsplats, pendling, sökbarhet |
| **Mitt konto** | Namn, e-post, telefon, adress, byt lösenord |

## API-endpoints

### Autentisering (`/api/v1/auth`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/auth/register` | Skapa nytt konto |
| `POST` | `/auth/login` | Logga in, sätter httpOnly JWT-cookie |
| `POST` | `/auth/logout` | Logga ut, rensar cookie |
| `GET` | `/auth/me` | Hämta inloggad användares profil |

### CV-hantering (`/api/v1/cv`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/cv/upload` | Ladda upp och strukturera PDF-CV |
| `GET` | `/cv/` | Lista alla CV:n |
| `GET` | `/cv/{id}` | Hämta specifikt CV |
| `PATCH` | `/cv/{id}/title` | Uppdatera CV-titel |
| `DELETE` | `/cv/{id}` | Ta bort CV |

### Kompetensbank (`/api/v1/competence`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `POST` | `/competence/merge-all` | Behandla alla CV:n till kompetensbanken |
| `POST` | `/competence/merge/{cv_id}` | Behandla enskilt CV |
| `GET` | `/competence/stats` | Statistik (skills, erfarenheter, källor) |
| `GET` | `/competence/skills` | Lista alla färdigheter med kategorier |
| `GET` | `/competence/experiences` | Lista alla erfarenheter |
| `POST` | `/competence/skills` | Lägg till skill manuellt |
| `DELETE` | `/competence/skills/{id}` | Ta bort skill |
| `DELETE` | `/competence/experiences/{id}` | Ta bort erfarenhet |
| `POST` | `/competence/experiences/{id}/achievements` | Lägg till prestation |
| `PUT` | `/competence/experiences/{id}/achievements/{index}` | Redigera prestation |
| `DELETE` | `/competence/experiences/{id}/achievements/{index}` | Ta bort prestation |
| `POST` | `/competence/match-job` | Matcha kompetensbank mot jobbannons |
| `DELETE` | `/competence/reset` | Rensa hela kompetensbanken |

### Sökprofil (`/api/v1/sokprofil`)

| Metod | Endpoint | Beskrivning |
|---|---|---|
| `GET` | `/sokprofil/` | Hämta sökprofil |
| `PUT` | `/sokprofil/` | Spara/uppdatera sökprofil |

Fullständig API-dokumentation (Swagger): `http://localhost:8001/docs`

## Installation

Se [QUICKSTART.md](QUICKSTART.md) för steg-för-steg-instruktioner.

### Förutsättningar

- Python 3.11+
- Docker & Docker Compose
- OpenAI API-nyckel

### Snabbversion

```bash
git clone <repo-url>
cd cv-optimizer
docker compose up -d
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp backend/.env.example backend/.env
# Redigera backend/.env — fyll i OPENAI_API_KEY och SECRET_KEY
./start-backend.sh
```

Frontend: öppna `frontend/index.html` direkt, eller starta med `python3 serve.py` från `frontend/`-mappen.

## Projektstruktur

```
cv-optimizer/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth.py               # Registrering, inloggning, JWT
│   │   │   ├── cv.py                 # CV-uppladdning och hantering
│   │   │   ├── competence.py         # Kompetensbank + matchning
│   │   │   ├── optimize.py           # CV-optimering (legacy)
│   │   │   └── job_seeker_profile.py # Sökprofil
│   │   ├── core/
│   │   │   ├── auth.py               # JWT-hjälpfunktioner
│   │   │   ├── config.py             # Miljövariabler & inställningar
│   │   │   └── database.py           # Databasanslutning (SQLAlchemy)
│   │   ├── models/
│   │   │   ├── cv.py                 # CV & OptimizedCV
│   │   │   ├── competence.py         # SkillEntry & ExperienceEntry
│   │   │   ├── user.py               # User
│   │   │   └── job_seeker_profile.py # JobSeekerProfile
│   │   ├── schemas/
│   │   │   └── cv.py                 # Pydantic-valideringsscheman
│   │   ├── services/
│   │   │   ├── ai_service.py         # OpenAI-integration (GPT-4o)
│   │   │   ├── pdf_parser.py         # PDF-textextraktion (pdfplumber)
│   │   │   └── competence_service.py # Sammanslagning & deduplicering
│   │   └── main.py                   # FastAPI-applikation
│   ├── .env.example                  # Mallkonfiguration
│   └── .env                          # (ignoreras av git)
├── frontend/
│   ├── index.html                    # SPA (single page application)
│   ├── js/
│   │   ├── app.js                    # All frontend-logik
│   │   └── cv-template.js            # CV-renderingsmallar
│   └── css/
│       └── style.css                 # Design system
├── database/
│   └── init.sql                      # Initialt SQL-schema
├── docker-compose.yml                # PostgreSQL 15 med pgvector
├── start-backend.sh                  # Startskript för backend
├── requirements.txt                  # Python-dependencies
├── QUICKSTART.md                     # Snabbstart-guide
└── README.md
```

## Databasmodeller

- **users** — Användarkonton med namn, e-post och hashat lösenord
- **cvs** — Uppladdade CV:n med originaltext och strukturerad JSON-data
- **skill_entries** — Kompetensbanken: unika färdigheter med kategori, typ och källhänvisning (source_cv_ids)
- **experience_entries** — Kompetensbanken: erfarenheter med prestationer och källhänvisning
- **job_seeker_profiles** — Sökprofil per användare (roller, ort, anställningsform m.m.)

## Licens

MIT
