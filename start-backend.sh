#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Fel: venv hittades inte i $VENV_DIR"
    echo ""
    echo "Skapa den med:"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo "Fel: backend/.env saknas"
    echo ""
    echo "Skapa den med:"
    echo "  cp backend/.env.example backend/.env"
    echo "  # Redigera backend/.env och fyll i OPENAI_API_KEY och SECRET_KEY"
    exit 1
fi

# Starta Docker-databasen om den inte redan körs
if command -v docker &>/dev/null; then
    if ! docker ps --format '{{.Names}}' | grep -q "^cv_optimizer_db$"; then
        echo "Startar databas (Docker)..."
        docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d
        sleep 3
    fi
else
    echo "Varning: docker hittades inte – förutsätter att PostgreSQL redan körs"
fi

source "$VENV_DIR/bin/activate"

echo "Startar backend på http://localhost:8001 ..."
cd "$BACKEND_DIR"
python -m app.main
