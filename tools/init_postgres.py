import os
import psycopg
from pathlib import Path

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "newage")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")


def connection_kwargs(database_name=None):
    kwargs = {"host": DB_HOST, "port": DB_PORT, "user": DB_USER, "password": DB_PASSWORD}
    if database_name:
        kwargs["dbname"] = database_name
    return kwargs


with psycopg.connect(**connection_kwargs("postgres"), autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
        exists = cur.fetchone()
        if not exists:
            cur.execute(f'CREATE DATABASE "{DB_NAME}"')

with psycopg.connect(**connection_kwargs(DB_NAME), autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS app_data (
                collection TEXT NOT NULL,
                item_id TEXT NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (collection, item_id)
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS idx_app_data_collection ON app_data (collection)")

print(f"PostgreSQL ready: {DB_NAME}")
