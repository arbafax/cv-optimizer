# Snabbstart

## Förutsättningar

- Python 3.11 eller högre
- Docker och Docker Compose (för PostgreSQL-databasen)
- En OpenAI API-nyckel (krävs för AI-funktioner)

## 1. Klona projektet

```bash
git clone <repo-url>
cd cv-optimizer
```

## 2. Starta databasen med Docker

```bash
docker compose up -d
```

Detta startar PostgreSQL 15 med pgvector-tillägget installerat. Databasen är tillgänglig på port 5432.

## 3. Skapa Python virtual environment

```bash
python3 -m venv venv

# Aktivera (macOS/Linux)
source venv/bin/activate

# Aktivera (Windows)
venv\Scripts\activate

# Installera dependencies
pip install -r requirements.txt
```

## 4. Konfigurera miljövariabler

```bash
cp backend/.env.example backend/.env
```

Öppna `backend/.env` och fyll i minst dessa värden:

```env
OPENAI_API_KEY=sk-din-nyckel-här
SECRET_KEY=<generera med: openssl rand -hex 32>
```

Övriga värden (databas, portar m.m.) fungerar som de är med Docker-uppsättningen ovan.

## 5. Starta backend

```bash
./start-backend.sh
```

Skriptet:
- Kontrollerar att venv och `backend/.env` finns
- Startar Docker-databasen automatiskt om den inte redan körs
- Aktiverar venv och startar FastAPI-servern

Backend körs på: `http://localhost:8001`
API-dokumentation: `http://localhost:8001/docs`

## 6. Öppna frontend

```bash
cd frontend
python3 serve.py
```

Öppna sedan `http://localhost:5501` i webbläsaren.

## Verifiera att allt fungerar

1. `http://localhost:8001/health` — ska svara `{"status": "healthy"}`
2. `http://localhost:8001/docs` — ska visa Swagger UI med alla API-endpoints
3. `http://localhost:5501` — ska visa inloggningssidan

## Felsökning

**Backend startar inte — "venv hittades inte":**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Backend startar inte — "backend/.env saknas":**
```bash
cp backend/.env.example backend/.env
# Redigera och fyll i OPENAI_API_KEY och SECRET_KEY
```

**Databasfel — PostgreSQL svarar inte:**
```bash
docker ps                        # Kontrollera att cv_optimizer_db körs
docker logs cv_optimizer_db      # Läs loggar för mer info
docker compose up -d             # Starta om om den inte körs
```

**Port 8001 redan i bruk:**
```bash
lsof -ti :8001 | xargs kill -9
./start-backend.sh
```

**Paket saknas:**
```bash
source venv/bin/activate
pip install -r requirements.txt
```
