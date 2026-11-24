# Mindle frontend

## First design increment

This is a local implementation of the supplied PNG references, with the name
**Mindle**. No Figma write, backend edit, database migration or deployment is
part of this work.

Implemented scope: dashboard, deck library (grid/list), deck detail, flashcard
editor, create-deck dialog and a review flow connecting these pages. Video
learning, editable profiles and a redesigned statistics page are deferred.

The design implementation introduces `frontend/mindle/index.html` and
`styles/tokens.css` / `styles/app.css`. These files own the shared navigation,
dialogs, color themes, typography, spacing, responsive layouts and components.
The supplied brand-system image defines the dark canvas, violet and mint colors.
The logo is a small inline SVG, not a raster asset or external icon dependency.

## Run and inspect

Run the existing app as usual (`uvicorn app.main:app --reload`). The root URL
opens the new Mindle workspace. Sign in through the existing authentication
pages to use your own cards.

To inspect without signing in, open:

```text
http://127.0.0.1:8000/mindle/index.html?preview=1#dashboard
http://127.0.0.1:8000/mindle/index.html?preview=1#decks
http://127.0.0.1:8000/mindle/index.html?preview=1#create/1
```

Preview mode is explicitly labeled. It uses sample collections and example
cards, makes **no backend requests**, and stores changes only in JavaScript
memory. Reloading resets those changes. Sample collection totals represent the
reference layout; deck detail lists a limited set of example cards rather than
pretending to load the whole sample collection.

Open `/legacy-dashboard.html` to compare the previous dashboard. The existing
`add_card.html`, statistics and authentication pages remain available. Their
branding says Mindle; their previous layout and backend behavior are retained.

## Architecture and file inventory

| File | Responsibility and changes |
| --- | --- |
| `frontend/index.html` | Small frontend entry page; forwards existing root URLs to Mindle. |
| `frontend/mindle/js/entry.js` | Preserves query parameters and hash routes during that forward. |
| `frontend/legacy-dashboard.html` | Snapshot of the previous working dashboard before this redesign. |
| `frontend/mindle/index.html` | Accessible app shell, sidebar, search, profile summary, three native dialogs and toast region. |
| `frontend/mindle/styles/tokens.css` | Theme variables, reference colors, shared font, spacing primitives and sidebar width. |
| `frontend/mindle/styles/app.css` | Shell, reusable controls, panels, charts, tables, editor, review, dialogs, focus states, responsive rules and reduced-motion support. |
| `frontend/mindle/js/icons.js` | Small inline SVG icon set, including a custom brand mark. |
| `frontend/mindle/js/format.js` | HTML escaping/sanitization, plain text, local calendar dates, counts and percentages. |
| `frontend/mindle/js/service.js` | One boundary for existing API contracts or the isolated preview store. API errors preserve status codes. |
| `frontend/mindle/js/preview-data.js` | Sample user, decks, cards and relative activity dates for explicit preview mode. |
| `frontend/mindle/js/views.js` | Page templates; contains no fetching, persistence or event registration. |
| `frontend/mindle/js/app.js` | Hash routing, view state, form submission, shared dialogs, keyboard controls, appearance and speech lifecycle. |
| `frontend/assets/js/speech.js` | Reused local-only speech controller from the earlier speech feature. Added as an explicit dependency of Mindle; no audio file generation. |
| `frontend/assets/js/speech-init.js`, `frontend/assets/css/speech.css` | Earlier standalone speech UI dependencies retained for the legacy screens. |
| `frontend/login_page.html`, `register_page.html`, `homepage.html`, `add_card.html`, `pages/statistics.html` | Visible product-name replacements. Retained speech controls in add-card and corrected relative statistics assets. |
| `frontend/assets/js/studyflow.js`, `frontend/assets/js/api.js` | Carry forward the earlier legacy speech wiring, corrected statistics navigation, and corrected card-list URL so the preserved screens keep working. |
| `tests/mindle.test.mjs` | Preview isolation, create/review/delete behavior, existing API contracts, authentication refresh, escaping and activity date tests. |
| `tests/test_frontend.py` | Existing asset/link checks; legacy speech assertions now target the preserved dashboard instead of the new entry page. |
| `scripts/check-mindle-browser.mjs` | Dependency-free real-browser smoke check with an ephemeral server/profile and desktop/mobile screenshots in the OS temporary directory. |
| `docs/FRONTEND.md` | This architecture, scope, usage and validation guide. |
| `docs/FRONTEND_CHANGELOG.md` | Explicit change record grouped by the two frontend commits. |

The new workspace does not import the legacy CSS, dashboard controller, chart
library or API helper. These remain isolated to the preserved legacy pages.
Keep new views within `mindle/`; add a service method rather than issuing fetches
from page templates. Edit theme values in `tokens.css` instead of hardcoding
colors throughout views.

The rollout also records the earlier frontend cleanup: removed unused root
`index.css`, `studyflow.css`, `login_page.css`, the commented-out root `index.js`,
and unused `assets/js/index.js`, `auth.js`, `homepage.js`, `charts.js` duplicates.
Their active equivalents remain referenced by the retained HTML pages. The
three empty backend-module removals from the earlier task remain uncommitted.

## Routes and supported interactions

| Hash route | Behavior |
| --- | --- |
| `#dashboard` | Real overview counts, seven-day review bars, 35-day consistency heatmap and recent decks. |
| `#decks` | Search names/descriptions, all/due filters, grid/list views, open or review a collection, create-deck dialog. |
| `#deck/ID` | Collection summary and sanitized card table; add, review or delete cards. Deletion requires confirmation. |
| `#create` or `#create/ID` | Front/back rich text, deck choice, formatting controls, native preview dialog, local speech and save/create-another. |
| `#review/ID` | Front-only question, answer reveal, four ratings and a completed-session state. |

The sidebar appearance action toggles light/dark themes, stored under
`mindle-theme` in localStorage. The mobile sidebar has a scrim and an accessible
toggle. Account opens a read-only identity summary and sign-out action. No
unsupported profile edits, video imports, language tags, IPA generation or
analytics are simulated as live features.

Keyboard controls: `/` focuses deck search; `Ctrl/Cmd+Enter` saves from the
editor; Space reveals an answer; 1–4 rate a revealed card; Escape stops speech
and closes native dialogs. Typing in controls does not trigger review shortcuts.
Unsaved editor content stays in memory across internal navigation, with a
navigation/reload warning; it is not silently labeled as saved or persisted.

## Backend contracts retained

| Purpose | Existing request |
| --- | --- |
| Session check / refresh | `POST /auth/protected`, `POST /auth/refresh` |
| Identity | `GET /user/me` (`nome` remains supported) |
| Dashboard | `GET /cards/me`, `GET /cards/reviews_period?days_period=35` |
| Collections | `GET /decks`, `GET /decks/ID/cards`, `POST /decks/create` |
| Create card | `POST /cards/add_card` with `front_content`, `back_content`, `deck_id` JSON |
| Review queue | `GET /cards/pick_card?deck_id=ID` |
| Rate card | `POST /cards/update_card?difficulty=VALUE&card_id=ID` |
| Delete card | `DELETE /cards/delete_card/ID` |
| Sign out | `POST /auth/logout` |

Requests include credentials for the existing cookie authentication. Serving via
FastAPI uses the current origin; the existing Live Server port 5500 convention
targets `http://localhost:8000`. No new database fields or endpoints are required.

The reference's “Mastered” measure is replaced with the available **Reviewed
today** count/percentage. “Retention” is replaced with **Today's accuracy**,
calculated from today's correct/total reviews; no reviews displays a dash. The
sidebar daily goal of 20 is a presentation default, not a persisted preference.
Rating values remain `hard`, `medium`, `good`, `easy`. Their displayed intervals
match the current scheduler: immediate, 10 seconds, one day and four days.

## Validation

```powershell
node --test tests/mindle.test.mjs tests/speech.test.mjs
.\venv\Scripts\python.exe -m unittest discover -s tests -v
node scripts/check-mindle-browser.mjs
```

The browser check requires an installed Chrome/Chromium or Edge executable. Set
`MINDLE_CHROME` to its path if automatic discovery does not find it. Some Windows
sandboxes prevent Chrome's debugging connection; running this check outside that
sandbox may require approval. It launches a hidden headless browser, closes its
own browser/server on completion and prints the temporary screenshot directory.
It never uses the user's normal browser profile or contacts the application API.

Browser coverage: dashboard, deck grid/list, create-deck dialog, populated card
editor, preview dialog, saving with an empty next draft, review reveal/rating,
mobile navigation and horizontal overflow. Runtime exceptions and backend
requests in preview fail the check. Service tests verify live request contracts
with mocked responses; authenticated writes to the real database are not used
for QA. Actual speech output depends on installed local voices.

## Commit boundaries

1. `feat(frontend): add reference-based Mindle learning workspace` — new isolated
   frontend, speech dependency, service/unit/browser checks and this guide.
2. `feat(frontend): route the app to Mindle and document the rollout` — root
   entry, preserved dashboard, visible legacy branding, asset-check update and
   the explicit change log, and the earlier frontend cleanup required to leave
   the retained pages and asset graph consistent.

Only selected frontend, documentation and verification paths belong to these
commits. Pre-existing changes under `app/`, migrations, dependency files and
unrelated working-tree edits are neither modified nor committed by this task.
