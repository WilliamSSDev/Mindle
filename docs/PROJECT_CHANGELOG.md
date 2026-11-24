# Project change log

## 2026-11-23 — README and GitHub synchronization

- Replaced the old Study cards README with the current Mindle product scope,
  real GitHub repository URL, isolated design-preview instructions, full-app
  setup, environment variables, current-model database bootstrap, speech
  behavior, architecture, tests, limitations and links to the frontend guides.
- Documented the actual legacy migration gap rather than claiming that the
  historical Alembic chain can bootstrap the current model schema.
- Updated the frontend guide to distinguish its original frontend-only commit
  boundaries from this later project-wide synchronization.
- Added `.env.example` containing placeholders only, and allowed this single
  template through `.gitignore`; actual `.env` files remain ignored.
- Normalized `requirements.txt` from UTF-16 to UTF-8 and added the missing
  `slowapi==0.1.9` runtime dependency, matching the installed version used by
  `app/utils.py` and the current application.
- Removed the already-tracked `venv/` and Python bytecode/cache files from the
  Git index. This does not delete the local virtual environment or its files.
  Existing ignore rules keep generated files out of future commits.
- Committed the previously completed route cleanup and regression tests so
  GitHub contains the working project state, rather than only the frontend.
  This synchronization does not introduce additional backend behavior changes.

### Previously completed route cleanup now recorded in Git

- `app/main.py`: organized imports, consistent router registration and CORS
  formatting.
- `app/routes/auth.py`: consistent English names, shared token-cookie handling,
  clearer login/refresh flows and validation of refresh-token subjects/users.
- `app/routes/user.py`: separated current user from deletion target and removed
  unused imports/stub code.
- `app/routes/cards.py`: clearer names and helpers, shared deck ownership checks,
  sanitized import content, preserved validation errors, raised empty-queue 404s,
  corrected list route, typed identifiers and structured error logging.
- `app/routes/decks.py`: consistent naming and reused ownership lookups.
- `app/services/deck_service.py`: shared owned-deck lookup.
- `app/schemas.py`: retained text-only card input and optional deck ID.
- `app/database.py`, `app/core/config.py`, `app/core/security.py`: removed empty,
  unreferenced modules.
- `tests/test_routes.py`: in-memory database coverage for routes, ownership,
  import/review behavior, authentication responses and OpenAPI contracts.

The two Mindle frontend commits are preserved. The repository is pushed through
its existing `origin` remote; no force push or history rewrite is used to sync
with GitHub.
