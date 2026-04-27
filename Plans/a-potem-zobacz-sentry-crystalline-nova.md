# Sentry triage + fix race w runner migracji

## Context

Sprint 2 #13 wystawił Sentry/Glitchtip. Po deployu Sprint 2 #1 (`d62be2b feat(perf): Sprint 2 #1+#19 — Redis + multi-worker (chat-safe)`) backend startuje z `WEB_CONCURRENCY=2` (gunicorn pre-fork, dwa uvicorn workery). Każdy worker w `api.main:lifespan` instancjuje `KeyStore("data/keys.db")` oraz `AnalyticsStore("data/analytics.db")`, a oba w `__init__` wołają `run_migrations(...)` (`api/db/__init__.py:16`, `api/analytics.py:15`).

`api/db/migrations/runner.py:8` nie ma zabezpieczenia przed równoległym wywołaniem na tym samym pliku DB. Kiedy oba workery zobaczą tę samą nową migrację (`042_user_pinned_navs.sql`) jako nieaplikowaną, oba wykonają `executescript(...)` (idempotentne — same `CREATE TABLE/INDEX IF NOT EXISTS`), a następnie ścigają się o `INSERT INTO _migrations (filename) VALUES (...)`. Loser dostaje `IntegrityError: UNIQUE constraint failed: _migrations.filename`, runner re-raise'uje, lifespan crash, gunicorn worker exit, Sentry łapie eventy. Symptom w produkcji 2026-04-27 14:22.

**Note**: `34f6e0e fix(ci): force-load api.main in conftest to stop xdist import race` to inny race (xdist + import order); ten plan dotyczy startup race między workerami w produkcji.

## Aktualny stan w Sentry (org `tm-hub`, last 14d)

Zapytane via API (`sntryu_…` token z `~/.config/sentry/credentials.json`).

| ID | Issue | Diagnoza | Akcja |
|---|---|---|---|
| `PYTHON-FASTAPI-3` | `Migration 042_user_pinned_navs.sql failed: UNIQUE constraint failed: _migrations.filename` (`2026-04-27T14:22:11Z`) | **Root cause** — race w `run_migrations` | Fix kodu + Resolve in next release |
| `PYTHON-FASTAPI-2` | `Application startup failed. Exiting.` (`14:22:11`) | Skutek `#3` (uvicorn loguje to po crashu lifespan) | Resolve in next release |
| `PYTHON-FASTAPI-1` | `Traceback (most recent call last):` (`14:22:11`) | Skutek `#3` (gołe stderr od asyncio) | Resolve in next release |
| `PYTHON-FASTAPI-4` | `RuntimeError: Sprint 2 #13 verification: Sentry receives this from local test client at 2026-04-27 14:35` | Test event z weryfikacji Sentry | Resolve manualnie (test) |
| `JAVASCRIPT-1` | `Error: Sprint 2 #13 BROWSER verify 1777300573070` | Test event z weryfikacji browser SDK | Resolve manualnie (test) |

Sentry permalinks:
- `https://tm-hub.sentry.io/issues/115633035/` (PYTHON-FASTAPI-3)
- `https://tm-hub.sentry.io/issues/115633033/` (PYTHON-FASTAPI-2)
- `https://tm-hub.sentry.io/issues/115633026/` (PYTHON-FASTAPI-1)
- `https://tm-hub.sentry.io/issues/115637189/` (PYTHON-FASTAPI-4)
- `https://tm-hub.sentry.io/issues/115637535/` (JAVASCRIPT-1)

## Fix kodu

### Cel

Migracje muszą być bezpieczne, gdy `run_migrations(db_path, ...)` jest wywołane równolegle (≥2 procesy) na tym samym pliku DB. Bez tej gwarancji każda przyszła migracja wystawia nas na powtórny crash startupu produkcji.

### Wybrane podejście — `fcntl.flock` na pliku-locku obok DB

Najprostsze poprawne rozwiązanie. SQLite ma swoje locki, ale `executescript()` robi implicit COMMIT, co zwalnia transakcyjny lock w środku pętli — więc transakcja nie wystarczy. `fcntl.flock` (POSIX) blokuje proces-do-procesu na deskryptorze zewnętrznego pliku-locku. Działa na macOS + Linux (produkcja Coolify Linux, dev/CI macOS+Linux), proces-czyszczone (flock automatycznie zwalniany przy `close()`/exit), zero zmian schemy DB.

Przepływ:

1. Otwieramy `<db_path>.migrations.lock` (tworzony jeśli nie istnieje).
2. `fcntl.flock(fd, LOCK_EX)` — drugi worker blokuje się tu do czasu zwolnienia.
3. Pierwszy worker robi pełen run: czyta `_migrations`, aplikuje brakujące pliki, INSERT-uje wpisy, commit, close.
4. Zwalnia lock (przez `with`/`close`).
5. Drugi worker zdobywa lock, czyta `_migrations` — wszystkie nowe migracje są już zarejestrowane, więc `migration_files` jest pusty, no-op.

### Plik do zmiany

**`api/db/migrations/runner.py`** — owijamy całą funkcję w blok `with _migration_lock(db_path):`. Reszta logiki bez zmian.

```python
from __future__ import annotations
import fcntl
import logging
import os
import sqlite3
from contextlib import contextmanager

logger = logging.getLogger("tm-hub.migrations")


@contextmanager
def _migration_lock(db_path: str):
    """Cross-process exclusive lock keyed by db file. Linux + macOS (POSIX flock)."""
    lock_path = f"{db_path}.migrations.lock"
    # ensure parent dir exists (mirrors prior `os.makedirs("data", ...)` callers do)
    os.makedirs(os.path.dirname(lock_path) or ".", exist_ok=True)
    fd = open(lock_path, "w")
    try:
        fcntl.flock(fd.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            fcntl.flock(fd.fileno(), fcntl.LOCK_UN)
        finally:
            fd.close()


def run_migrations(db_path: str, migrations_dir: str) -> list[str]:
    """Apply unapplied SQL migrations in filename order.

    Concurrency-safe: an exclusive POSIX file lock keyed by db_path serializes
    multiple processes (e.g. gunicorn workers) so only one runs migrations at a
    time. Other callers block until the first finishes, then see all new
    migrations in `_migrations` and no-op.
    """
    with _migration_lock(db_path):
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS _migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        applied = {row[0] for row in conn.execute("SELECT filename FROM _migrations").fetchall()}
        migration_files = sorted(
            f for f in os.listdir(migrations_dir)
            if f.endswith(".sql") and f not in applied
        )
        newly_applied: list[str] = []
        for filename in migration_files:
            filepath = os.path.join(migrations_dir, filename)
            sql = open(filepath).read()
            try:
                conn.executescript(sql)
                conn.execute("INSERT INTO _migrations (filename) VALUES (?)", (filename,))
                conn.commit()
                logger.info("Applied migration: %s", filename)
                newly_applied.append(filename)
            except Exception as e:
                logger.error("Migration %s failed: %s", filename, e)
                raise
        conn.close()
        return newly_applied
```

Zmiany vs obecny `runner.py`:
- Dodajemy `_migration_lock(db_path)` (kontekstowy POSIX flock).
- Owijamy istniejącą logikę w `with` — żadnych zmian w semantyce dla single-worker.
- Lock-file ma postać `<db_path>.migrations.lock` (np. `data/keys.db.migrations.lock`, `data/analytics.db.migrations.lock`). `data/` jest gitignore'owane, więc lock-file nie wycieka do repo.

### Dlaczego nie alternatywy

- **`INSERT OR IGNORE` + sprawdzenie `rowcount`** — wymaga ręcznego rollbacku schemy gdy zgubimy wyścig. Nie działa dla `ALTER TABLE ADD COLUMN`.
- **`BEGIN EXCLUSIVE`** — `executescript()` robi implicit COMMIT i zwalnia lock w środku pętli; wymagałoby ręcznego splitowania SQL na statementy.
- **Migracje przed forkiem (gunicorn `--preload`)** — większa zmiana operacyjna, wpływa na `lifespan` semantykę, multi-DB (`keys.db` i `analytics.db`) i tak by tego potrzebowała oddzielnie.
- **Tylko leader (Redis lock)** — tworzy zależność migracji od bootu Redis i fail-open w razie outage'u Redis. fcntl działa zawsze.

## Testy

Plik **`tests/test_migrations.py`** — nowy test obok istniejących:

```python
def test_run_migrations_concurrent_workers(db_path, migrations_dir):
    """Two threads racing run_migrations must both succeed and apply each migration once."""
    import threading

    errors: list[Exception] = []
    def worker():
        try:
            run_migrations(db_path, migrations_dir)
        except Exception as e:  # pragma: no cover
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join()

    assert errors == [], f"unexpected errors: {errors}"
    conn = sqlite3.connect(db_path)
    applied = [r[0] for r in conn.execute("SELECT filename FROM _migrations ORDER BY filename").fetchall()]
    conn.close()
    assert applied == ["001_create_users.sql", "002_create_posts.sql"]
```

Przed fixem ten test failuje deterministycznie (lub flaky) z `IntegrityError`. Po fixie — zielony.

## Sentry: zamknięcie issues

Po deploy + przejściu testu w produkcji (`gh run list --branch master --limit 1` zielony, `/dashboard` ładuje się):

1. **PYTHON-FASTAPI-1/2/3** — Sentry UI: każdy → "Resolve in next release". Gdy następna wersja (z fixem) wyemituje pierwszy event, te issues nie wrócą — pozostaną resolved. (Alternatywnie API: `PUT /api/0/issues/<id>/` z `{"status":"resolved", "statusDetails":{"inNextRelease": true}}`).
2. **PYTHON-FASTAPI-4 + JAVASCRIPT-1** — test eventy z weryfikacji. Resolve "permanently" (po prostu `{"status":"resolved"}`).

Mogę to zrobić batch'em przez API z `~/.config/sentry/credentials.json` po Twojej zgodzie (to jest external action — modyfikuje Sentry).

## Versioning + changelog

Per CLAUDE.md "Versioning":
- Bump `CURRENT_VERSION` w `frontend/src/data/changelog.ts` (patch — bugfix).
- Wpis `fix` na górze CHANGELOG: `"Migration runner is now safe under multi-worker boot — no more startup crashes when a new migration ships."` (English, per memory `feedback_changelog_english.md`).

## Verification (post-deploy)

1. `cd /Users/pawelorzech/Programowanie/tm-war-room && uv run pytest tests/test_migrations.py -v` — wszystkie 5 testów (4 istniejące + 1 nowy concurrent) zielone.
2. `git push` → GitHub Actions zielone → Coolify deploy.
3. `gh run list --branch master --limit 1 --json status,conclusion,headSha` → success.
4. Browser sanity check (CLAUDE.md): `https://hub.tri.ovh/dashboard`, `/team`, `/chain`, `/awards`, `/market`, `/loot`, `/stocks`, `/bounties` — wszystkie ładują dane bez errorów w konsoli.
5. Sentry: brak nowych eventów PYTHON-FASTAPI-1/2/3 z timestampem po deployu.
6. Po ~1h cisza w Sentry → zamknij 3 backendowe issues "Resolve in next release", 2 test eventy "Resolve permanently".

## Memory housekeeping (po wykonaniu)

- `memory/reference_glitchtip_coolify.md` jest stale — Glitchtip service (`vbd6amv23cacjbywwov1td39`) nie istnieje już w Coolify (zniknął z `/api/v1/services`). Realny stack to **Sentry SaaS** (`tm-hub.sentry.io`, org `tm-hub`, projekty `python-fastapi` + `javascript`). Po fixie zaktualizuję ten plik (lub usunę i zastąpię nowym `reference_sentry_tm_hub.md` z DSN-id, project slugami i ścieżką do credentials).

## Pliki dotknięte zmianą

- `api/db/migrations/runner.py` — dodanie `_migration_lock` + opakowanie funkcji.
- `tests/test_migrations.py` — nowy test concurrent.
- `frontend/src/data/changelog.ts` — patch bump + wpis fix.
- (post-deploy, opt) `memory/reference_glitchtip_coolify.md` — refresh / replace.
