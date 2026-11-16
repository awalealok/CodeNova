# Implementation status against the Round 1 proposal

## Implemented in this build
- FastAPI service and PostgreSQL/SQLite development database configuration.
- All proposal core SQLAlchemy entities are imported into metadata.
- Workspace registration, password hashing, JWT login and current-user endpoint.
- Workspace-scoped guideline, rule, fact, lexicon, content, finding, decision, audit and insight APIs.
- PDF/DOCX/TXT/Markdown selectable-text extraction.
- Explicit deterministic lexicon matching, a documented `Banned term: ...` rule convention, and expiry checks for exact approved fact text.
- Citation gate validates quoted spans and that rule/fact IDs belong to the current workspace review set.
- Human decision endpoint; high-severity overrides require a written reason.
- Frontend demo-data module restored so existing UI imports resolve.

## Not yet implemented (proposal Phase 2 / Phase 3 / production hardening)
- LLM claim extraction, tone/messaging analysis, RAG retrieval, embeddings and pgvector query integration.
- Automatic natural-language guideline chunking/rule extraction and approval/version lifecycle for rules/facts.
- Scanned PDF OCR, graphic OCR, palette/contrast/logo geometry, alt-text inspection.
- S3 object storage, Redis queue/workers, async review jobs.
- Full frontend API wiring, user invitation/admin management, password reset and access-control UI.
- Comment API, export package, guideline ambiguity analytics, decision precedent retrieval.
- Alembic migrations, immutable/tamper-evident audit storage, production deployment hardening, complete automated integration/security suite.

The application deliberately does not make unsupported factual claims. Unsupported claim detection requires the planned claim-extraction and grounded retrieval component and is not simulated by keyword guesses.
