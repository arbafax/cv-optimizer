#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
VENV_DIR="$SCRIPT_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Fel: venv hittades inte i $VENV_DIR"
    exit 1
fi

source "$VENV_DIR/bin/activate"

cd "$BACKEND_DIR"
python -m app.main
