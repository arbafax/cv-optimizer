import sqlite3
import json
import uuid as uuid_lib
from datetime import datetime, timezone
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any

# ── Setup ─────────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "cv_optimizer.db"

app = FastAPI(title="CV Optimizer API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5501", "http://127.0.0.1:5501"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Database ──────────────────────────────────────────────────────────────────

def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

@contextmanager
def db():
    conn = _get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def _migrate():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                uuid        TEXT PRIMARY KEY,
                data        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)

_migrate()

# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _row_to_profile(row) -> dict:
    d = dict(row)
    d["data"] = json.loads(d["data"])
    return d

# ── Models ────────────────────────────────────────────────────────────────────

class ProfileBody(BaseModel):
    data: dict[str, Any]

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/api/v1/profiles", status_code=201)
def create_profile(body: ProfileBody):
    new_uuid = str(uuid_lib.uuid4())
    now = _now()
    with db() as conn:
        conn.execute(
            "INSERT INTO profiles (uuid, data, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (new_uuid, json.dumps(body.data), now, now),
        )
    return {"uuid": new_uuid, "data": body.data, "created_at": now, "updated_at": now}


@app.put("/api/v1/profiles/{profile_uuid}")
def update_profile(profile_uuid: str, body: ProfileBody):
    now = _now()
    with db() as conn:
        conn.execute(
            """INSERT INTO profiles (uuid, data, created_at, updated_at) VALUES (?, ?, ?, ?)
               ON CONFLICT(uuid) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at""",
            (profile_uuid, json.dumps(body.data), now, now),
        )
        row = conn.execute("SELECT * FROM profiles WHERE uuid = ?", (profile_uuid,)).fetchone()
    return _row_to_profile(row)


@app.delete("/api/v1/profiles/{profile_uuid}", status_code=204)
def delete_profile(profile_uuid: str):
    with db() as conn:
        cur = conn.execute("DELETE FROM profiles WHERE uuid = ?", (profile_uuid,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Profile not found")
