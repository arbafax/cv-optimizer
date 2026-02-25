# Arkitektur & systemöversikt

En genomgång av hur applikationens olika delar hänger ihop, var logiken finns och hur dataflödet ser ut.

## Översikt

```
Webbläsare (frontend/index.html)
        │  HTTP + JWT-cookie
        ▼
FastAPI (backend/app/main.py) — port 8000
        │
        ├── auth.py          JWT-utfärdning & validering
        ├── cv.py            CV-uppladdning & hantering
        ├── competence.py    Kompetensbank & AI-matchning
        ├── optimize.py      (Legacy CV-optimering)
        └── job_seeker_profile.py  Sökprofil
        │
        ├── OpenAI API       GPT-4o — strukturering & matchning
        └── PostgreSQL       Persistent lagring (Docker)
```

## Autentisering

**Fil:** `backend/app/core/auth.py` + `backend/app/api/auth.py`

- JWT-token skickas som httpOnly-cookie (`access_token`) vid inloggning
- Alla skyddade endpoints använder `Depends(get_current_user)` som hämtar token ur cookien
- Lösenord hashas med bcrypt via passlib
- Varje användares data är helt isolerad — queries filtreras alltid på `user_id`

```
POST /auth/register  →  skapar User i DB, returnerar token
POST /auth/login     →  verifierar lösenord, sätter cookie
POST /auth/logout    →  rensar cookie
GET  /auth/me        →  hämtar inloggad användare
```

## CV-uppladdning och strukturering

**Fil:** `backend/app/api/cv.py`

Flöde vid `POST /cv/upload`:
1. PDF valideras och sparas temporärt
2. `pdf_parser.py` extraherar text med pdfplumber/pypdfium2
3. `ai_service.structure_cv_text()` skickar texten till GPT-4o
4. GPT-4o returnerar strukturerad JSON (`CVStructure`-schema)
5. CV sparas i `cvs`-tabellen med `structured_data` som JSONB
6. Temporär PDF-fil raderas

**Fil:** `backend/app/services/pdf_parser.py`
- `extract_text()` — extraherar råtext från PDF
- `validate_pdf()` — kontrollerar att filen är giltig PDF

**Fil:** `backend/app/services/ai_service.py`
- `structure_cv_text(text)` — strukturerar CV-text till `CVStructure`
- `match_competences_to_job(skills, experiences, job_desc, seeker_profile)` — matchar kompetensbank mot jobbannons

## Kompetensbank

**Fil:** `backend/app/api/competence.py`
**Fil:** `backend/app/services/competence_service.py`

Kompetensbanken byggs upp när användaren "behandlar" ett eller flera CV:n:

```
POST /competence/merge/{cv_id}
  → competence_service.merge_cv_to_bank()
    → Extraherar skills ur structured_data
    → Kategoriserar via CATEGORY_RULES (nyckelord → kategori)
    → Dedupliserar mot befintliga skills (fuzzy match)
    → Sparar/uppdaterar SkillEntry och ExperienceEntry i DB
    → source_cv_ids (JSONB) håller koll på vilka CV:n som bidragit
```

### Datamodeller i kompetensbanken

**`SkillEntry`** (tabell: `skill_entries`):
- `name` — skillens namn
- `category` — t.ex. "Mjukvaruutveckling", "Databases", "Cloud & DevOps"
- `skill_type` — "technical" | "soft" | "domain" | "language" | "tool"
- `source_cv_ids` — JSONB-array med CV-ID:n som bidragit

**`ExperienceEntry`** (tabell: `experience_entries`):
- `company`, `position`, `start_date`, `end_date`
- `achievements` — JSONB-array med prestationer (strängar)
- `source_cv_ids` — JSONB-array med CV-ID:n som bidragit

### CRUD i kompetensbanken

Alla skrivoperationer använder `flag_modified()` för JSONB-fält för att SQLAlchemy ska detektera ändringar:

```python
from sqlalchemy.orm.attributes import flag_modified
entry.achievements = new_list
flag_modified(entry, "achievements")
db.commit()
```

## Matchning mot jobbannons

**Endpoint:** `POST /competence/match-job`

Flöde:
1. Hämtar alla `SkillEntry` och `ExperienceEntry` för användaren
2. Hämtar användarens `JobSeekerProfile` (sökprofil)
3. Bygger en strukturerad prompt med skills, erfarenheter och sökpreferenser
4. GPT-4o returnerar JSON med `summary`, `matching_skills`, `missing_skills`, `overall_score`, `recommendation`
5. Resultatet visas direkt i frontend (sparas inte i DB)

## Frontend

**Fil:** `frontend/js/app.js` — all logik, ~2000 rader

Inga externa ramverk används. Applikationen är en SPA med manuell vyhantering:

```javascript
function showView(viewId, navEl) {
    // Döljer alla .view, visar #view-{viewId}
}
```

Viktiga tillstånd:
- `currentUser` — inloggad användare
- `allCVs` — cachat CV-array
- `selectedCV` — valt CV (för merge-knappen i kompetensbanken)
- `bankSkills` / `bankExperiences` — kompetensbanksdata

API-anrop sker via `apiFetch()` som alltid skickar `credentials: 'include'` och hanterar 401-svar genom att automatiskt visa inloggningsskärmen.

## Databas

Tabeller skapas automatiskt vid uppstart via `Base.metadata.create_all()` i `main.py` — ingen manuell migration behövs.

Docker-containern (`cv_optimizer_db`) monterar `database/init.sql` vid första start, vilket aktiverar pgvector-extensionen.

## Miljövariabler

Se `backend/.env.example` för komplett lista. De viktigaste:

| Variabel | Beskrivning |
|---|---|
| `OPENAI_API_KEY` | Krävs för AI-funktioner |
| `SECRET_KEY` | JWT-signeringsnyckel — generera med `openssl rand -hex 32` |
| `DATABASE_URL` | Automatiskt korrekt med Docker-uppsättningen |
| `DEBUG` | `True` under utveckling (aktiverar auto-reload) |

## Vanliga felscenarion

**"Address already in use" (port 8000):**
```bash
lsof -ti :8000 | xargs kill -9
./start-backend.sh
```

**SkillEntry visas med gammalt kategorinamn:**
Befintlig data i DB behåller det namn som användes vid merge. Frontend har en `CATEGORY_ALIASES`-mappning i `app.js` som normaliserar gamla namn till nya vid rendering. För att uppdatera DB-data direkt:
```sql
UPDATE skill_entries SET category = 'Mjukvaruutveckling' WHERE category = 'Programming Languages';
```

**CORS-fel i webbläsaren:**
Kontrollera att `ALLOWED_ORIGINS` i `backend/.env` inkluderar den origin där frontend serveras (t.ex. `http://localhost:3000`).
