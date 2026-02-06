# Snabbstart-guide

## 1. Förutsättningar
- Python 3.11 eller högre
- Docker och Docker Compose (för databas)
- Git

## 2. Klona och navigera till projektet

```bash
git clone <your-repo-url>
cd cv-optimizer
```

## 3. Starta PostgreSQL med Docker

```bash
docker-compose up -d
```

Detta startar PostgreSQL med pgvector-extension redan installerad.

## 4. Sätt upp Python-miljön

```bash
# Skapa virtual environment
python -m venv venv

# Aktivera (Linux/Mac)
source venv/bin/activate

# Aktivera (Windows)
venv\Scripts\activate

# Installera dependencies
pip install -r requirements.txt
```

## 5. Konfigurera miljövariabler

```bash
# Kopiera exempel-filen
cp .env.example .env

# Redigera .env och lägg till dina API-nycklar
# Minst behöver du:
# - OPENAI_API_KEY
# - SECRET_KEY (generera en: openssl rand -hex 32)
```

Med Docker-setup är databasen redan konfigurerad:
- DATABASE_URL=postgresql://cv_user:cv_password@localhost:5432/cv_optimizer

## 6. Starta backend

```bash
cd backend
python -m app.main
```

Backend körs nu på: http://localhost:8000
API-dokumentation: http://localhost:8000/docs

## 7. Öppna frontend

Öppna `frontend/index.html` direkt i webbläsaren, eller starta en lokal server:

```bash
cd frontend
python -m http.server 3000
```

Frontend: http://localhost:3000

## Testa att det fungerar

1. Öppna http://localhost:8000/health - ska svara `{"status": "healthy"}`
2. Öppna http://localhost:8000/docs - ska visa API-dokumentationen
3. Öppna frontend och testa att ladda upp ett CV

## Felsökning

**Databas-anslutning misslyckades:**
```bash
# Kontrollera att PostgreSQL körs
docker ps

# Kolla loggar
docker logs cv_optimizer_db
```

**Python-paket saknas:**
```bash
pip install -r requirements.txt --upgrade
```

**Port redan i bruk:**
```bash
# Ändra port i docker-compose.yml eller main.py
```

## Nästa steg

Se README.md för fullständig dokumentation och utvecklingsguide.
