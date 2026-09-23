# Word Count — Chrome Extension (MVP · Phase 1)

A minimal, private Chrome extension that tracks how many words you write
during a single writing session. Click **Start Session**, type anywhere in
Chrome, click **Stop Session** — see exactly how many words you wrote.

> Phase 1 only. No accounts, no cloud, no analytics dashboard, no AI. Just
> reliable session word counting, designed so future phases (history,
> subscriptions, writing feedback) can be added without a rewrite.

---

## Contents

- [Features](#features)
- [Install locally](#install-locally)
- [How it works](#how-it-works)
- [File layout](#file-layout)
- [Word-counting rules](#word-counting-rules)
- [Privacy](#privacy)
- [Permissions](#permissions)
- [Known limitations](#known-limitations)
- [Manual test checklist](#manual-test-checklist)
- [Automated tests](#automated-tests)
- [Roadmap / adding future features](#roadmap--adding-future-features)

---

## Features

- **One-click session** — Start / Stop with a single button.
- **Runs in the background** — Keep writing across tabs and pages; the popup
  can close and reopen without stopping the session.
- **Typed vs pasted, your choice** — On first run, decide whether pasted text
  should count as typed or be tracked separately. Change it any time in
  Settings.
- **Premium, minimal UI** — Auto light/dark (follows your OS), tabular
  numerals, subtle motion, no clutter.
- **Fully local** — Your writing never leaves your device.

---

## Install locally

1. Clone / download this folder.
2. Open **`chrome://extensions`** in Chrome.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `/extension` directory.
5. Pin the extension to your toolbar for quick access.

---

## How it works

### Architecture (Manifest V3)

```
┌────────────────────┐  chrome.runtime.sendMessage  ┌────────────────────┐
│ Content script     │ ───────────────────────────▶ │ Background service │
│ (content.js)       │  { kind: 'typed'|'pasted'|   │ worker             │
│ · listens for      │    'deleted', ... }          │ (background.js)    │
│   input events     │                              │ · owns session     │
│ · classifies via   │                              │   state            │
│   InputEvent.      │                              │ · persists to      │
│   inputType        │                              │   chrome.storage   │
│ · computes deltas  │                              │ · word counting    │
└────────────────────┘                              └──────────┬─────────┘
                                                               │
                                            STATE_UPDATE / GET_STATE
                                                               ▼
                                                    ┌────────────────────┐
                                                    │ Popup UI           │
                                                    │ (popup/…)          │
                                                    │ · renders idle /   │
                                                    │   active / done    │
                                                    │ · onboarding &     │
                                                    │   settings         │
                                                    └────────────────────┘
```

### Session lifecycle

1. User clicks **Start Session** in the popup.
2. Background creates a new session, resets `typedText` / `pastedText`
   buffers, timestamps `startedAt`, and stores state in
   `chrome.storage.local`.
3. Content scripts on every allowed page cache `sessionActive = true` (via
   `chrome.storage.onChanged`) and start reporting `input`-event deltas to
   the background.
4. Background updates buffers and rebroadcasts state — the popup renders
   live counts if it happens to be open.
5. User clicks **Stop Session**. Background timestamps `endedAt`, snapshots
   the final counts into `lastResult`, flips `active` to `false`. The next
   time the popup opens it shows the "Session complete" result.

### Delta classification

Content script inspects `InputEvent.inputType` on the `input` event:

| inputType                                      | Reported as |
| ---------------------------------------------- | ----------- |
| `insertText`, `insertLineBreak`, `insertParagraph`, `insertCompositionText*` | `typed`     |
| `insertFromPaste`, `insertFromDrop`, `insertReplacementText`, `insertFromPasteAsQuotation` | `pasted`    |
| any `delete*`                                  | `deleted`   |

For safety, the script also computes `curr.length - prev.length` to know
exactly how many characters were added or removed, so counts stay accurate
even when `event.data` is empty (line breaks, IME composition, etc).

### Word count

Words are computed by collapsing whitespace and splitting on spaces:

```js
text.replace(/\s+/g, ' ').trim().split(' ').length
```

This yields intuitive results: `"state-of-the-art"` is 1 word,
`"don't stop"` is 2, `"1200 words"` is 2. Multiple spaces, tabs, and line
breaks all collapse to a single word boundary.

---

## File layout

```
extension/
├── manifest.json          ← MV3 manifest
├── background.js          ← service worker (session state + word counting)
├── content.js             ← injected into pages, reports typing deltas
├── popup/
│   ├── popup.html         ← UI markup (idle / active / done / onboarding / settings)
│   ├── popup.css          ← premium minimal styles, auto light/dark
│   └── popup.js           ← controller — talks to background via messages
├── icons/
│   ├── icon16.png · 32 · 48 · 128
│   └── generate_icons.py  ← rebuilds icons if you tweak brand colors
├── tests/
│   └── engine.test.js     ← unit tests for countWords + applyDelta
└── README.md
```

Nothing is a "kitchen-sink" file: each module has one clear job. The word
counter is a pure function, easy to reuse in future phases.

---

## Word-counting rules

The counter is intentionally simple and predictable:

- Whitespace (space, tab, newline, multiple spaces) → word boundaries.
- Punctuation stays attached to its word.
  - `"hello!"` = 1 word.
- Hyphens and apostrophes do **not** split words.
  - `"state-of-the-art"` = 1 word · `"don't"` = 1 word.
- Numbers count as words: `"1,247"` (rendered) or `"1200"` (typed) = 1 word.
- Deletions decrement the count where technically possible (see
  [Known limitations](#known-limitations)).
- Line breaks (Enter / Shift+Enter) are word boundaries but don't inflate
  the count.

Full behavior is validated in `tests/engine.test.js`.

---

## Privacy

- The extension **never sends your writing anywhere**.
- No network requests are made from `background.js` or `content.js`.
- Storage is `chrome.storage.local` only.
- The typed/pasted text buffers stored during an active session are only
  kept to compute the word count accurately across deletions. They are
  cleared at the start of the next session.
- No analytics, no telemetry.

---

## Permissions

Only one Chrome permission is requested:

- **`storage`** — to persist session state locally so the popup can close and
  reopen without losing your count.

The extension uses `content_scripts` with `<all_urls>` so it can observe
`input` events on the page you're writing on. It does **not** request
`tabs`, `history`, `bookmarks`, or `activeTab`. It never reads the
existing content of a page — only responds to `input` events that fire
while a session is active.

---

## Known limitations

- **Deletions across sources** — When you delete characters, we can't
  always know whether they were originally typed or pasted. The extension
  removes from the typed buffer first, then the pasted buffer. This is a
  best-effort approximation.
- **Chrome-restricted pages** — Content scripts cannot run on
  `chrome://`, the Chrome Web Store, or the New Tab Page. Typing there
  won't be counted. The extension fails silently on these pages; no error
  is shown because no script runs.
- **Cross-origin iframes** — By design (`all_frames: false`) the script
  only runs in the top frame. Text inputs inside iframes (e.g. some
  embedded editors) are not counted yet.
- **Rich editors with custom key handling** — Some editors (e.g.
  CodeMirror, Monaco) don't dispatch standard `InputEvent`s; behavior may
  vary. Tested reliable on plain `<textarea>`, `<input type="text">`,
  and standard `contenteditable`.
- **IME composition** — Composed characters are counted when the
  composition is committed. Individual composition intermediates are
  ignored to avoid double-counting.
- **Undo / redo** — Undo is treated as a series of deletions/insertions
  by the browser and handled the same way as manual editing. If a page
  performs a custom undo without firing `input` events, changes won't be
  reflected.

---

## Manual test checklist

Suggested run-through before shipping any change:

**Basic**

- [ ] Load unpacked. Icon shows in toolbar.
- [ ] First open of popup shows onboarding with two choices.
- [ ] Pick "Keep separate" — session panel appears in idle state.
- [ ] Click **Start Session** — button flips to red "Stop Session", pill
      turns green with "Writing Session", duration begins ticking.
- [ ] Type a sentence in a textarea on any page (e.g.
      [https://example.com](https://example.com) has none — use
      Google, GitHub issue box, Gmail compose, etc). Reopen popup — count
      reflects what you typed.
- [ ] Paste a sentence — the small line "+ N pasted" appears.
- [ ] Delete a word — count decreases.
- [ ] Click **Stop Session** — pill flips to "Session complete", final
      count and duration are shown, button becomes **Start New Session**.

**Persistence**

- [ ] Close the popup mid-session, keep typing, reopen — count is up to
      date.
- [ ] Navigate to another page mid-session — session stays active.
- [ ] Reload the tab mid-session — session stays active.

**Settings**

- [ ] Click the gear icon. Change to "Count pasted as typed" — big
      number now shows the combined total.

**Unsupported pages**

- [ ] Open `chrome://extensions` — the extension can't inject there;
      typing does nothing (expected).

---

## Automated tests

Unit tests for the pure word-count engine and delta reducer live in
`tests/engine.test.js`.

```bash
cd extension
node tests/engine.test.js
```

Should print `13 passed, 0 failed`.

---

## Roadmap / adding future features

The Phase 1 code is deliberately structured so later phases plug in
cleanly:

- **Session history** — `background.js` already produces a fully-formed
  `lastResult` on every stop. Push it to a `sessions[]` array in
  `chrome.storage.local` to unlock daily/weekly/monthly aggregates.
- **User accounts & sync** — Wrap `getState` / `setState` with a storage
  adapter. `chrome.storage.local` today; add a cloud adapter (Firestore,
  Supabase, etc.) later without touching business logic.
- **Dashboard UI** — Add a new page under `dashboard/` and open it via
  `chrome.tabs.create` from a link in the popup.
- **Writing feedback** — Feed the `typedText` buffer (with explicit user
  consent) to an evaluator. The MVP already keeps writing content
  logically separate from writing statistics.
- **Subscription gate** — Add a `plan: 'free' | 'pro'` field to settings
  and gate advanced views on it.

No rewrite required — the popup, content script, and background are all
independent modules that talk over a well-defined message API.
