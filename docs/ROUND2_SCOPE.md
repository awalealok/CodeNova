# Round 2 Scope and Demo Checklist

## Demonstrated
- Workspace registration and JWT login.
- Guideline file upload and selectable-text extraction.
- Administrator-entered approved rules, facts and lexicon entries.
- Content submission.
- Deterministic terminology and expired-fact checks.
- Optional OpenAI-compatible LLM review using workspace-scoped lexical retrieval.
- Exact quote and retrieved evidence-ID citation gate.
- Human accept/reject/override decisions; high-severity override requires a reason.
- Audit events and reviewer API.

## Demo preparation
1. Configure a working LLM provider key and verify `/api/ai/status` says `enabled: true`.
2. Create a fresh workspace.
3. Upload a public/synthetic brand guideline.
4. Add 2–4 short, clear approved rules, 2–3 sourced facts and 1–2 avoided terms.
5. Submit a sample campaign containing a banned term, one approved fact and one claim that conflicts with the fact register.
6. Run review and show the evidence citation and exact quoted span for every accepted finding.
7. Demonstrate accept/reject and a high-severity override with a written reason.
8. Open `/docs` and show audit events.

## Known scope boundaries
- Retrieval is lexical keyword ranking, not vector similarity yet.
- Scanned PDF OCR, image/logo checks, export, integrations and enterprise SSO are out of Round 2 scope.
- If the LLM provider is unavailable, deterministic checks continue and AI errors are surfaced in the response.
