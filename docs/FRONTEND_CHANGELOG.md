# Frontend change log

## 2026-11-23 — Mindle initial reference implementation

### Commit: add reference-based Mindle learning workspace

- Introduced the isolated `frontend/mindle/` app with the supplied charcoal,
  violet and mint brand system, Inter typography and custom SVG branding.
- Implemented dashboard, deck library in two layouts, deck details, flashcard
  editor, create-deck dialog and review screens. All visible app naming uses
  **Mindle**, rather than the reference's “Midle”.
- Added functional search/filter controls, rich text, card preview, create/save,
  review ratings, confirmed deletion, sign out, themes and mobile navigation.
- Added local-voice speech without storing audio or introducing an upload route.
- Split formatting, icons, page templates, API access, preview fixtures and
  orchestration into separate modules.
- Connected existing APIs; kept unsupported backend capabilities out of live
  metrics and forms. Preview content is explicitly labeled and isolated.
- Added unit/service tests and reproducible browser verification. The browser
  smoke flow passed with no uncaught exceptions and zero backend API requests.
- Documented every new module, supported route, endpoint, limitation and check
  in [FRONTEND.md](FRONTEND.md).

### Commit: route the app to Mindle and document the rollout

- Replaced the root frontend HTML with a lightweight entry page. Its entry
  module retains query/hash parameters and opens the new workspace.
- Preserved the pre-redesign working dashboard as `legacy-dashboard.html`.
- Updated visible product names in the existing login, registration, homepage,
  add-card and statistics pages; retained their layouts and behavior.
- Kept earlier standalone speech UI dependencies available for legacy pages.
- Recorded prior legacy frontend speech wiring and the corrected card-list and
  statistics URLs, rather than leaving the preserved pages with missing assets.
- Recorded earlier unused-file cleanup: root `index.css`, `studyflow.css`,
  `login_page.css`, commented-out `index.js`, and duplicate/unused
  `assets/js/index.js`, `auth.js`, `homepage.js` and `charts.js` were removed.
- Adjusted frontend asset checks to validate legacy speech in its new location.
- Retained all pre-existing backend changes as working-tree changes, outside
  this task's frontend commits. No backend code, migrations or data changed.

### Deliberately deferred

Video learning/library/player, transcript vocabulary selection, profile editing,
a redesigned statistics screen, mastery/retention analytics, per-card language,
phonetic transcriptions and tags. The first release is intended for visual review
of a few connected screens before expanding the product.
