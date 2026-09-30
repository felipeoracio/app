"""Apply UnoWord's checked-in Supabase migration through the transaction pooler."""

import os
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

db_url = os.environ.get("SUPABASE_DB_URL", "")
parsed = urlparse(db_url)
if parsed.port != 6543 or not (parsed.hostname or "").endswith(".pooler.supabase.com"):
    raise RuntimeError("SUPABASE_DB_URL must be a Supabase Transaction Pooler URI on port 6543")

migrations_dir = ROOT_DIR / "supabase" / "migrations"
migrations = sorted(migrations_dir.glob("*.sql"))

with psycopg2.connect(db_url, connect_timeout=20) as connection:
    with connection.cursor() as cursor:
        cursor.execute("""
            create table if not exists public.unoword_schema_migrations (
              version text primary key,
              applied_at timestamptz not null default now()
            )
        """)
        cursor.execute("select to_regclass('public.ai_profiles')")
        foundation_exists = cursor.fetchone()[0] is not None
        if foundation_exists:
            cursor.execute(
                "insert into public.unoword_schema_migrations(version) values (%s) on conflict do nothing",
                ("20260929010000_ai_writing_coach_foundation",),
            )
        for migration in migrations:
            version = migration.stem
            cursor.execute("select 1 from public.unoword_schema_migrations where version = %s", (version,))
            if cursor.fetchone():
                continue
            cursor.execute(migration.read_text(encoding="utf-8"))
            cursor.execute("insert into public.unoword_schema_migrations(version) values (%s)", (version,))
            print(f"applied {version}")

print("Supabase migrations current")