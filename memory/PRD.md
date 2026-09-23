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
- **On-screen floating counter** (previous iteration): Shadow-DOM overlay
  injected by `content.js`, showing `● N words` in the bottom-right of
  every supported page while a session is active. Draggable with position
  persisted in `wc_settings.counterPos`. Click-to-expand reveals a
  Stop Session button. Fully synchronized with the popup via
  `chrome.storage.onChanged`. Auto light/dark, keyboard accessible,
  cross-tab consistent.
- **Session history** (previous iteration): On stop, the completed session is
  appended to `wc_history` in `chrome.storage.local` (cap 500, newest
  first). A History panel in the popup (clock icon in header) shows
  sessions grouped by day (Today / Yesterday / weekday) with start time,
  duration, and word count, plus a "words today" summary. Empty state and
  a "Clear history" action included. Zero-word sub-second ghost sessions
  are dropped.
- **Paid features Phase 1** (this iteration):
  - Free vs Pro subscription state (demo toggle in Account settings).
  - Local **profile** (timezone, createdAt) — no cloud.
  - 4-step pro onboarding: Language → Goal → Themes → Done.
  - **Session word goal** with strict validation (positive integer,
    multiple of 25). Inline error suggests neighbours.
  - Floating counter shows `X / goal words` for Pro, dot turns blue on
    goal reached, session never stops automatically.
  - **Daily prompt** system: static library of ~29 themes × 4 prompts ×
    2 languages, deterministic per day, "Another prompt" cycles through
    respecting history. Prompt regenerates automatically when language
    changes.
  - **English / Spanish** localization across popup, floating counter,
    and dashboard. Auto-detected from `navigator.language` on first run;
    stored preference wins after that.
  - **Full-page Dashboard** opened in a new tab: Today / This week /
    This month / This year / All time views with hero total, bar chart,
    avg per day / best day / longest session stats, and recent-sessions
    list. Free users see a paywall banner above; Pro users see a PRO
    badge and full stats.
  - **Upgrade screen** with $4.99 / month placeholder pricing and demo
    note. Free-user popup shows a tasteful Upgrade CTA under the session.
  - New tests: goal validation, prompt picker (25 total passing).

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
