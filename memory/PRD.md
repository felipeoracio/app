# Word Count — Writing Session Chrome Extension

## Original problem statement

Build a modern, minimalistic Chrome extension that lets a user click **Start
Session**, type anywhere in Chrome, click **Stop Session**, and see exactly
how many words they wrote. Phase 1 is strictly the session word counter —
no accounts, no cloud, no analytics dashboard, no writing feedback. Code
must be modular so future phases plug in cleanly.

## User personas

- **Writer** (primary) — journalists, authors, bloggers, students who want
  a distraction-free way to know how much they wrote in a sitting.
- **Future paid subscriber** — same writer, later, who wants historical
  stats (daily / weekly / monthly / lifetime).

## Core requirements (locked)

1. Chrome Manifest V3.
2. Single popup with idle / active / done states.
3. Session survives popup close and page navigation.
4. Word count is based on **typing activity**, not the current contents of
   a text field.
5. On first run, ask the user whether pasted text should be counted as
   typed or tracked separately; store the preference.
6. When "separate" mode: big number = words typed, smaller line = pasted
   count.
7. Auto light/dark theme (follows OS preference).
8. Zero network calls. Writing content never leaves the device.
9. Only `storage` permission requested.
10. Graceful failure on Chrome-restricted pages.

## Architecture

- `manifest.json` — MV3 config.
- `background.js` — session state, `chrome.storage.local` persistence, pure
  word-counting engine (`countWords`, `applyDelta`), message router.
- `content.js` — injected on every allowed page, classifies `InputEvent`s
  via `inputType` and reports `{ kind, added|removed }` deltas.
- `popup/` — HTML + CSS + JS controller; renders idle / active / done /
  onboarding / settings panels.
- `icons/` — brand mark (rounded blue square, white W).
- `tests/engine.test.js` — 13 unit tests for pure functions.

## What's been implemented — 2026-01

- MV3 extension scaffold with manifest, background service worker, content
  script, and popup UI.
- Session lifecycle: start → track → stop → show result → start new.
- Typed / pasted / deleted delta pipeline with best-effort deletion accounting.
- First-run onboarding (Keep separate / Count pasted as typed) and Settings
  panel to change it later.
- Premium minimal UI with auto light/dark, tabular numerals, pulse dot for
  active state, duration timer.
- Data-testid attributes on every interactive element.
- 13 unit tests passing (`node tests/engine.test.js`).
- README with install steps, architecture diagram, privacy notes, known
  limitations, and manual test checklist.

## Known limitations (documented in README)

- Deletion source (typed vs pasted) is best-effort.
- Chrome-restricted pages (`chrome://…`, Web Store) can't be observed.
- Cross-origin iframes are excluded (`all_frames: false`).
- Rich editors with non-standard input handling (Monaco, CodeMirror) may
  behave inconsistently.
- IME intermediates ignored; committed composition is counted.

## Prioritized backlog (future phases — DO NOT build until requested)

**P1 — Free tier polish**

- Persist last N completed sessions locally so users can see recent counts
  even after starting a new session.
- Keyboard shortcut to start/stop sessions.
- Options page with data-clear button.

**P2 — Paid tier foundations**

- Authentication (playbook driven — call `integration_playbook_expert_v2`
  before writing any auth code).
- Cloud sync adapter (statistics only, never raw text unless explicitly
  opted in).
- Dashboard page: daily / weekly / monthly / yearly / all-time totals,
  longest session, streaks, WPM.

**P3 — Writing coach**

- Writing evaluator that surfaces clarity / repetition / structure
  observations without rewriting the user's prose. Explicit opt-in per
  session.

## Next tasks (recommended)

1. Manual QA using the checklist in `extension/README.md`.
2. Ship Phase 1 to the Chrome Web Store (optional).
3. Ask the user which P1 item to prioritize next.
