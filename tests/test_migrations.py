import os
import sqlite3
import pytest
from api.db.migrations.runner import run_migrations

@pytest.fixture
def migrations_dir(tmp_path):
    mdir = tmp_path / "migrations"
    mdir.mkdir()
    (mdir / "001_create_users.sql").write_text(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"
    )
    (mdir / "002_create_posts.sql").write_text(
        "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);\n"
        "CREATE INDEX idx_posts_user ON posts(user_id);"
    )
    return str(mdir)

@pytest.fixture
def db_path(tmp_path):
    return str(tmp_path / "test.db")

def test_run_migrations_creates_tables(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
    table_names = [t[0] for t in tables]
    conn.close()
    assert "users" in table_names
    assert "posts" in table_names
    assert "_migrations" in table_names

def test_run_migrations_records_applied(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    conn.close()
    assert [r[0] for r in applied] == ["001_create_users.sql", "002_create_posts.sql"]

def test_run_migrations_idempotent(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    conn.close()
    assert len(applied) == 2

def test_run_migrations_applies_new_only(db_path, migrations_dir):
    run_migrations(db_path, migrations_dir)
    with open(os.path.join(migrations_dir, "003_add_email.sql"), "w") as f:
        f.write("ALTER TABLE users ADD COLUMN email TEXT;")
    run_migrations(db_path, migrations_dir)
    conn = sqlite3.connect(db_path)
    applied = conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()
    cols = conn.execute("PRAGMA table_info(users)").fetchall()
    conn.close()
    assert len(applied) == 3
    assert any(c[1] == "email" for c in cols)


def test_run_migrations_concurrent_workers(db_path, migrations_dir):
    """Two threads racing run_migrations must both succeed and apply each migration once."""
    import threading

    errors: list[BaseException] = []

    def worker():
        try:
            run_migrations(db_path, migrations_dir)
        except BaseException as e:  # pragma: no cover - failure path
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"unexpected errors: {errors}"
    conn = sqlite3.connect(db_path)
    applied = [r[0] for r in conn.execute(
        "SELECT filename FROM _migrations ORDER BY filename"
    ).fetchall()]
    conn.close()
    assert applied == ["001_create_users.sql", "002_create_posts.sql"]
