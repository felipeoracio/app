/**
 * Word Count Extension — Background Service Worker
 *
 * Responsibilities:
 *   - Owns the single source of truth for session state.
 *   - Persists state in chrome.storage.local so the popup can close freely
 *     and sessions survive service-worker restarts.
 *   - Receives typing/paste/deletion deltas from content scripts and
 *     updates the running word counts.
 *   - Broadcasts state to any open popup on changes.
 *
 * State shape (stored under key `wc_state`):
 *   {
 *     active:        boolean,
 *     startedAt:     number | null,  // epoch ms
 *     endedAt:       number | null,  // epoch ms (last completed session)
 *     typedText:     string,         // running buffer of typed characters
 *     pastedText:    string,         // running buffer of pasted characters
 *     lastResult: {                  // last completed session snapshot (or null)
 *       startedAt, endedAt, typedWords, pastedWords, mode
 *     } | null
 *   }
 *
 * Settings shape (stored under key `wc_settings`):
 *   {
 *     onboarded:  boolean,
 *     pasteMode:  'separate' | 'as_typed'   // decided on first run
 *   }
 */

const STATE_KEY = 'wc_state';
const SETTINGS_KEY = 'wc_settings';

const DEFAULT_STATE = {
  active: false,
  startedAt: null,
  endedAt: null,
  typedText: '',
  pastedText: '',
  typedWords: 0,   // derived; persisted so content scripts can read without recomputing
  pastedWords: 0,  // derived
  lastResult: null,
};

const DEFAULT_SETTINGS = {
  onboarded: false,
  pasteMode: 'separate',
  counterPos: null,     // { x, y } px from top-left; null → default bottom-right
  counterHidden: false, // reserved: future manual hide toggle
};

// ---------- storage helpers ----------

async function getState() {
  const { [STATE_KEY]: state } = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(state || {}) };
}

async function setState(next) {
  // Derive word counts once at write time so content scripts (and any other
  // consumers) can read them straight from chrome.storage without needing
  // access to the word-counting function.
  const withDerived = {
    ...next,
    typedWords: countWords(next.typedText || ''),
    pastedWords: countWords(next.pastedText || ''),
  };
  await chrome.storage.local.set({ [STATE_KEY]: withDerived });
  broadcastState(withDerived).catch(() => {});
}

async function getSettings() {
  const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

async function setSettings(next) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
}

// ---------- word counting ----------

/**
 * Count words in an arbitrary string.
 * A "word" is any run of non-whitespace characters. Punctuation attached to
 * a word is part of that word ("don't", "state-of-the-art", "hello!" == 1 word).
 */
function countWords(text) {
  if (!text) return 0;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 0;
  return trimmed.split(' ').length;
}

// ---------- messaging ----------

async function broadcastState(state) {
  const settings = await getSettings();
  const payload = buildPopupPayload(state, settings);
  // popup may or may not be open; ignore errors
  try {
    await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', payload });
  } catch (_e) {
    /* no popup listening — fine */
  }
}

function buildPopupPayload(state, settings) {
  const typedWords = countWords(state.typedText);
  const pastedWords = countWords(state.pastedText);
  return {
    active: state.active,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    typedWords,
    pastedWords,
    totalWords: typedWords + pastedWords,
    pasteMode: settings.pasteMode,
    onboarded: settings.onboarded,
    lastResult: state.lastResult,
  };
}

// ---------- session actions ----------

async function startSession() {
  const next = {
    ...DEFAULT_STATE,
    active: true,
    startedAt: Date.now(),
  };
  await setState(next);
  return next;
}

async function stopSession() {
  const state = await getState();
  if (!state.active) return state;
  const endedAt = Date.now();
  const settings = await getSettings();
  const typedWords = countWords(state.typedText);
  const pastedWords = countWords(state.pastedText);
  const lastResult = {
    startedAt: state.startedAt,
    endedAt,
    typedWords,
    pastedWords,
    mode: settings.pasteMode,
  };
  const next = {
    ...state,
    active: false,
    endedAt,
    lastResult,
  };
  await setState(next);
  return next;
}

/**
 * Apply a delta reported by a content script.
 *
 * Delta shape:
 *   { kind: 'typed'   | 'pasted', added:   string }
 *   { kind: 'deleted',           removed: number }  // number of chars removed
 *
 * Deletions are applied greedily to the typed buffer first, then to the
 * pasted buffer. This is a best-effort approximation because we can't
 * always tell which buffer a deleted character originally came from.
 */
async function applyDelta(delta) {
  const state = await getState();
  if (!state.active) return; // ignore stray events

  let { typedText, pastedText } = state;

  if (delta.kind === 'typed' && typeof delta.added === 'string') {
    typedText = typedText + delta.added;
  } else if (delta.kind === 'pasted' && typeof delta.added === 'string') {
    pastedText = pastedText + delta.added;
  } else if (delta.kind === 'deleted' && typeof delta.removed === 'number') {
    let n = Math.max(0, Math.floor(delta.removed));
    if (n > 0) {
      const fromTyped = Math.min(n, typedText.length);
      typedText = typedText.slice(0, typedText.length - fromTyped);
      n -= fromTyped;
      if (n > 0) {
        const fromPasted = Math.min(n, pastedText.length);
        pastedText = pastedText.slice(0, pastedText.length - fromPasted);
      }
    }
  } else {
    return;
  }

  await setState({ ...state, typedText, pastedText });
}

// ---------- message router ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case 'GET_STATE': {
          const state = await getState();
          const settings = await getSettings();
          sendResponse({ ok: true, payload: buildPopupPayload(state, settings) });
          return;
        }
        case 'START_SESSION': {
          const state = await startSession();
          const settings = await getSettings();
          sendResponse({ ok: true, payload: buildPopupPayload(state, settings) });
          return;
        }
        case 'STOP_SESSION': {
          const state = await stopSession();
          const settings = await getSettings();
          sendResponse({ ok: true, payload: buildPopupPayload(state, settings) });
          return;
        }
        case 'DELTA': {
          await applyDelta(msg.delta || {});
          sendResponse({ ok: true });
          return;
        }
        case 'GET_SETTINGS': {
          const settings = await getSettings();
          sendResponse({ ok: true, settings });
          return;
        }
        case 'SET_SETTINGS': {
          const current = await getSettings();
          const next = { ...current, ...(msg.settings || {}) };
          await setSettings(next);
          // Rebroadcast so popup UI can react (e.g. after onboarding)
          const state = await getState();
          broadcastState(state).catch(() => {});
          sendResponse({ ok: true, settings: next });
          return;
        }
        case 'IS_ACTIVE': {
          const state = await getState();
          sendResponse({ ok: true, active: state.active });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true; // keep sendResponse alive for async
});

// Initialize storage on install so consumers always see a valid shape.
chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  const settings = await getSettings();
  await chrome.storage.local.set({
    [STATE_KEY]: state,
    [SETTINGS_KEY]: settings,
  });
});
