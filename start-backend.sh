#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Fel: venv hittades inte i $VENV_DIR"
    exit 1
fi

# Starta Docker-databasen om den inte redan körs
if command -v docker &>/dev/null; then
    if ! docker ps --format '{{.Names}}' | grep -q "^cv_optimizer_db$"; then
        echo "Startar databas (Docker)..."
        docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d
        sleep 3
    fi
fi

source "$VENV_DIR/bin/activate"

cd "$BACKEND_DIR"
python -m app.main
