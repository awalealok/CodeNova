# INKLOOM AI — Round 2 Build

INKLOOM AI is an advisory brand-consistency review workflow. It combines deterministic checks with optional LLM review grounded in approved workspace rules and facts. Human reviewers make the final decisions.

## Round 2 demo workflow

1. Register a workspace at `/register` or `/demo`.
2. Upload a selectable-text PDF, DOCX, TXT, or Markdown guideline.
3. Add approved rules, approved facts, and terminology.
4. Submit marketing text or a supported document.
5. Run deterministic checks; if PostgreSQL pgvector, an embedding provider, and an LLM provider are configured, run vector-grounded AI review.
6. Inspect exact text highlights, evidence references, and minimal suggested edits.
7. Accept, reject, or override findings. High-severity overrides require a reason.
8. Inspect decision history and workspace audit events.

All findings are advisory. Unsupported claims are reported as unverified, not false. AI findings are persisted only when their quoted spans match the source text and their evidence IDs belong to the retrieved workspace evidence.

## Requirements

- Python 3.11 or newer.
- Node.js 20.9 or newer.
- PostgreSQL 17 with pgvector for vector retrieval and AI review.
- An OpenAI-compatible chat-completions provider for AI review.
- An OpenAI-compatible embedding provider that emits 1536-dimensional embeddings for vector retrieval.

SQLite is available for local deterministic workflow development and tests. It is not a substitute for PostgreSQL and does not enable vector RAG.

## Windows / PowerShell setup

### Configure environment

From the project root:

```powershell
Copy-Item .env.example .env
```

Set a unique `POSTGRES_PASSWORD` and a long random `INKLOOM_SECRET_KEY`. Configure `LLM_API_KEY` and `EMBEDDING_API_KEY` independently. Set `SMTP_HOST`, `SMTP_FROM`, and `FRONTEND_BASE_URL` to enable password recovery. Do not commit `.env` or paste credentials into logs/issues.

For the isolated Round 2 demo only, set `DEMO_AUTH_MODE=true` in the backend `.env` and `NEXT_PUBLIC_DEMO_AUTH_MODE=true` in `frontend/.env.local`, then restart both services. Demo mode reuses a database-backed demo user/workspace, keeps real database-backed sessions and APIs, and accepts any non-empty auth credentials. The backend refuses to start unless `APP_ENV` is `development`, `dev`, `local`, or `test`; do not use demo auth on a public deployment. Set both values to `false` and restart to restore normal authentication.

When AI review is enabled, submitted text claims and retrieved approved evidence are sent to the configured LLM provider; claim text is also sent to the embedding provider. Use synthetic/public content for demos and review provider data terms.

### Start PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

Wait for the PostgreSQL 17 service health check to pass. The named Docker volume is persistent; do not remove it to reset the app.

### Install, migrate, and start the backend

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
python -m alembic -c backend\alembic.ini upgrade head
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The Alembic bootstrap creates missing tables, adds the vector/reset/offset fields, enables pgvector, and creates missing indexes. It is designed to preserve existing rows. Do not use `alembic stamp` to skip this migration. For existing data, take and verify a database backup before migration; the migration stops rather than guessing if a legacy finding quote cannot be located in its linked revision.

### Start the frontend (second terminal)

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The local API URL also uses `localhost` so the HttpOnly SameSite cookie is sent consistently. If frontend and API are deployed on different origins, set `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, and `FRONTEND_BASE_URL` consistently. Production requires HTTPS and explicit CORS origins. Production auth uses secure, HttpOnly, SameSite cookies; browser code does not persist bearer tokens.

## AI and vector RAG behavior

- The application stores rule/fact embeddings in PostgreSQL `vector(1536)` columns and uses cosine-distance similarity search, HNSW indexes, a configurable minimum similarity (`RAG_MIN_SIMILARITY`), top-k limits, valid-fact date filters, and workspace predicates.
- New approved rules and facts are embedded when `EMBEDDING_API_KEY` is configured. Existing unembedded records can be populated with `python -m backend.scripts.reindex_embeddings --dry-run` followed by `python -m backend.scripts.reindex_embeddings`.
- AI review is skipped explicitly if embeddings are not configured. There is no lexical retrieval fallback represented as RAG.
- Claim extraction and evidence-grounded review use structured JSON. Findings with fabricated evidence IDs, non-verbatim spans, invalid offsets, or unsupported claims are rejected or marked unverified.
- Provider setup/status does not prove live provider connectivity. Run a synthetic-content demo against the configured provider before submission.

## File and security behavior

- Selectable PDF text, DOCX, TXT, and Markdown are supported. Scanned PDFs requiring OCR are not supported.
- Uploads are size/type/content validated. Brand assets accept verified PNG, JPEG, and WebP files and are workspace-scoped.
- Password reset uses single-use, hashed, expiring tokens and configured SMTP delivery. The endpoint remains unavailable until mail settings are supplied.
- Login, registration, and password-reset endpoints have IP-based rate limits. Production additionally requires explicit CORS origins, HTTPS, and trusted frontend/API origins.
- The app does not log provider credentials. Rotate database, LLM, embedding, SMTP, and signing credentials via the deployment secret manager; update the service environment and restart, then revoke the old credentials at their providers.

## API overview

- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH /api/auth/me`, and password-reset request/confirm endpoints.
- Knowledge: guideline upload/list; approved rules, facts, and lexicon create/list endpoints.
- Assets: upload/list, authenticated file retrieval, and archive.
- Content: submit/upload/list, review, findings, decisions, and decision history.
- Workspace audit and insights: `GET /api/audit`, `GET /api/insights/summary`.
- AI readiness: `GET /api/ai/status` reports configuration and vector-extension availability, not provider connectivity.

## Validation and known external blockers

Run backend tests from the project root:

```powershell
python -m compileall -q backend tests
python -m pytest -q
```

For PostgreSQL 17/pgvector integration tests, provision a separate database whose name ends with `_test` (for example `inkloom_test`), set its URL only in the current PowerShell session, then run:

```powershell
$env:POSTGRES_TEST_DATABASE_URL = "postgresql+psycopg://<user>:<password>@<host>:5432/inkloom_test"
python -m pytest -q tests\test_postgres_integration.py
Remove-Item Env:POSTGRES_TEST_DATABASE_URL
```

The integration test applies Alembic migrations and writes synthetic workspace data; it does not drop tables, truncate records, or delete the test database. Do not point it at a development or production database.

Run frontend checks from `frontend`:

```powershell
npm test
npm run lint
npm run build
```

Unit tests use isolated SQLite, mocked providers, and a compiled PostgreSQL query check. PostgreSQL 17/pgvector startup, live similarity retrieval, a real LLM response, and SMTP delivery must be separately tested in the deployment environment. Do not describe those external integration checks as verified until they have run successfully.
