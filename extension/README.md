# Word Count — Chrome Extension (Phase 2)

A minimal, private Chrome extension that tracks your writing sessions.
Free users get a live word counter, on-screen floating pill, and local
session history. Pro users add a **daily writing prompt**, a
**words-per-session goal**, a full **progress dashboard**, and
**English / Spanish** localization — all still stored locally on the
device.

> Phase 2 — Paid features (goals · prompts · dashboard · i18n). Payment
> is a **demo toggle**: "Try Pro" flips the switch locally. Nothing is
> billed. Wire Stripe later without changing the UI.

---

## Features

**Free** (works out of the box)

- **One-click session** — Start / Stop with a single button.
- **On-screen floating counter** — Draggable pill shows `● N words` on
  every supported page. Click for Stop button.
- **Session history** — Local log of your last 500 completed sessions,
  grouped by day.
- **Auto light/dark**, keyboard accessible, private (nothing leaves
  your device).

**Pro** (demo toggle — click Upgrade → Try Pro)

- **Session word goal** — Any positive integer, must be a multiple of
  25. Inline validation suggests the closest valid neighbours.
- **Goal on the floating counter** — `● 127 / 250 words`, with the dot
  turning blue when the goal is reached.
- **Daily writing prompt** — Curated static library across ~29 themes,
  one prompt per day (with an "Another prompt" escape hatch). Prompt
  history prevents immediate repetition.
- **Full-page dashboard** — Today / This week / This month / This year
  / All time. Hero total, chart, avg per day, best day, longest
  session, recent sessions list.
- **English / Spanish** — Auto-detected from the browser on first run,
  fully switchable in Settings, applied everywhere including the
  floating counter and prompts.

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
│ · classifies via   │ ◀─────────── STATE_UPDATE ── │   state            │
│   InputEvent.      │  (via chrome.storage sync)   │ · persists to      │
│   inputType        │                              │   chrome.storage   │
│ · renders floating │                              │ · word counting    │
│   overlay (shadow  │                              │   engine           │
│   DOM)             │                              └──────────┬─────────┘
└────────────────────┘                                         │
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

Both the popup and the on-screen floating counter read from the **same
`chrome.storage.local` state**, so a Stop from either surface updates the
other immediately. There is one source of truth: `wc_state`.

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
├── manifest.json          ← MV3 manifest (v0.2.0)
├── background.js          ← service worker (state · aggregation · prompts)
├── content.js             ← typing pipeline + floating overlay (shadow DOM)
├── shared/
│   ├── i18n.js            ← English / Spanish dictionary + apply helper
│   └── prompts.js         ← static prompt library (~29 themes × 2 langs)
├── popup/
│   ├── popup.html         ← paste onboarding · session · prompt card ·
│   │                         upgrade · pro onboarding · history · settings
│   ├── popup.css          ← premium minimal styles, auto light/dark
│   └── popup.js           ← controller, talks to background via messages
├── dashboard/
│   ├── dashboard.html     ← full-page dashboard opened in a new tab
│   ├── dashboard.css
│   └── dashboard.js
├── icons/
│   ├── icon16.png · 32 · 48 · 128
│   └── generate_icons.py
├── tests/
│   ├── engine.test.js     ← 25 unit tests
│   └── preview.html       ← standalone visual preview of the floating counter
└── README.md
```

Nothing is a "kitchen-sink" file: each module has one clear job. The word
counter is a pure function, easy to reuse in future phases.

---

## The floating on-screen counter

While a session is active, `content.js` injects a small overlay into every
supported page:

```
● 1,247 words  ⋮⋮
```

- **Isolated** — Rendered inside a Shadow DOM so no host-page CSS can leak
  in and it can never affect the page's layout. Uses `position: fixed`
  with a `z-index` at the top of the stacking context. It does **not**
  push page content, resize text fields, or interfere with scroll,
  selection, copy/paste, or typing.
- **Draggable** — Click and drag anywhere on the pill to move it. The
  position is stored in `chrome.storage.local` under
  `wc_settings.counterPos` and restored on every page.
- **Click to expand** — A single click reveals a **Stop Session** button.
  Click again (or press Escape) to collapse.
- **Auto light/dark** — Follows `prefers-color-scheme`, matching the popup.
- **Only when active** — Mounts on session start, unmounts immediately on
  stop. Never appears on Chrome-restricted pages (`chrome://…`, Web
  Store), which simply lose the overlay until the user returns to a
  supported page.
- **Cross-tab sync** — All tabs see the same session because they all read
  from the same `chrome.storage.local` and listen to `storage.onChanged`.
- **Accessible** — `role="button"`, keyboard-focusable, Enter/Space
  toggles expand, Escape collapses, sufficient contrast in both themes.

### Sizing / responsiveness

Default position is bottom-right with 20px viewport padding. Padding and
type-size compress slightly on viewports narrower than 480px. If the
window is resized so the counter would fall off-screen, it snaps back
inside the viewport.

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
- [ ] Type a sentence in a textarea on any page (e.g. Google, GitHub
      issue box, Gmail compose). Reopen popup — count reflects what you
      typed.
- [ ] Paste a sentence — the small line "+ N pasted" appears.
- [ ] Delete a word — count decreases.
- [ ] Click **Stop Session** — pill flips to "Session complete", final
      count and duration are shown, button becomes **Start New Session**.

**On-screen floating counter**

- [ ] After **Start Session**, a small `● N words` pill appears in the
      bottom-right of the page.
- [ ] Number updates as you type.
- [ ] Click the pill — a **Stop Session** button appears below the count.
- [ ] Click the pill again (or press Escape) — the button collapses.
- [ ] Drag the pill anywhere on the page — it stays where you dropped it.
- [ ] Navigate to another supported page — the pill re-appears in the
      same position you dragged it to.
- [ ] Click the pill's **Stop Session** — the pill disappears everywhere
      and the popup shows "Session complete".
- [ ] Alternatively, click **Stop Session** in the popup — the on-screen
      pill disappears immediately.

**Persistence**

- [ ] Close the popup mid-session, keep typing, reopen — count is up to
      date.
- [ ] Navigate to another page mid-session — session stays active.
- [ ] Reload the tab mid-session — session stays active, pill reappears.

**Settings**

- [ ] Click the gear icon. Change to "Count pasted as typed" — big
      number in popup and pill both switch to combined total.

**Pro (demo)**

- [ ] Click the extension icon → **Upgrade** → **Try Pro** →
      walk through the 4-step onboarding (Language → Goal → Themes → Done).
- [ ] The popup shows a PRO badge, a Dashboard icon, a **Today's writing
      prompt** card, and a `X / 250 words` pill in the session.
- [ ] Enter `260` in Settings → Writing goal → shows red error
      "Please enter a goal in increments of 25 words. Try 250 or 275 words."
- [ ] Save `500` — the pill on the floating counter updates to
      `● N / 500 words` next session.
- [ ] Reach the goal — the dot turns blue and the pill reads
      **Goal reached** (popup) / stays counting past 500 (never stops).
- [ ] Click **Another prompt** — a different prompt appears and stays
      through the day.
- [ ] Change language to Español in Settings — everything (popup,
      prompt, floating counter, dashboard) switches immediately.
- [ ] Open the Dashboard — Today / Week / Month / Year / All time show
      correct totals and the chart uses the current data.
- [ ] Settings → Plan → **Turn off Pro (demo)** — dashboard button
      disappears, prompt card hides, goal pill hides, upgrade CTA returns.

**Session history**

- [ ] Complete two or three short sessions with different word counts.
- [ ] Click the clock icon in the popup — a "Recent sessions" panel
      opens with each session grouped under **Today**.
- [ ] Summary reads e.g. "1,247 words today · 3 sessions".
- [ ] Each row shows the start time, duration, and word count. When paste
      mode is "separate" and the session included pasted content, the
      row also shows `N typed · M pasted`.
- [ ] Click **Clear history** — the list empties.
- [ ] Zero-word sessions shorter than 1 second are not saved.

**Unsupported pages**

- [ ] Open `chrome://extensions` — no pill (expected, Chrome forbids
      content scripts there). Session remains active.
- [ ] Switch back to a supported tab — pill reappears.

**Multi-tab**

- [ ] Open two tabs on supported pages during a session — both show the
      same pill, same count. Typing in either tab updates both.

---

## Automated tests

Unit tests for the pure word-count engine and delta reducer live in
`tests/engine.test.js`.

```bash
cd extension
node tests/engine.test.js
```

Should print `25 passed, 0 failed`.

For a live visual test of the floating on-screen counter without loading
the full extension, serve the folder and open the preview page:

```bash
cd extension
python3 -m http.server 7777
# then visit http://127.0.0.1:7777/tests/preview.html
```

The preview shims `chrome.*` APIs so `content.js` runs in a normal tab.
Click **Start session** and type in the textarea to see the counter
appear, update, drag, and expand.

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
