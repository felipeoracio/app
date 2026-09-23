/**
 * Word Count Extension — Background Service Worker
 *
 * Single source of truth for session, settings, history and prompt state.
 * Everything lives in chrome.storage.local so:
 *   - the popup can close and reopen without losing anything
 *   - the on-screen counter (content script) reads the same data
 *   - the dashboard tab reads the same data
 *
 * STORAGE KEYS
 *   wc_state     — active session buffers + last completed result
 *   wc_settings  — user preferences (paste mode, plan, language, goal…)
 *   wc_history   — completed sessions, newest first, capped at HISTORY_MAX
 *   wc_prompt    — today's prompt state so it stays consistent for a day
 */

importScripts('shared/prompts.js');

const STATE_KEY    = 'wc_state';
const SETTINGS_KEY = 'wc_settings';
const HISTORY_KEY  = 'wc_history';
const PROMPT_KEY   = 'wc_prompt';

const HISTORY_MAX        = 500;   // rich enough to power yearly aggregates
const PROMPT_HISTORY_MAX = 12;    // avoid immediate repetition

const DEFAULT_STATE = {
  active: false,
  startedAt: null,
  endedAt: null,
  typedText: '',
  pastedText: '',
  typedWords: 0,
  pastedWords: 0,
  sessionGoal: 0,     // snapshotted at start for pro users; 0 = no goal
  lastResult: null,
};

const DEFAULT_SETTINGS = {
  // First-run
  onboarded: false,           // paste-mode picked
  proOnboarded: false,        // pro walkthrough completed at least once
  pasteMode: 'separate',
  // Floating counter
  counterPos: null,
  counterHidden: false,
  // Localization
  language: null,             // null → auto-detect from navigator
  // Subscription (demo)
  plan: 'free',               // 'free' | 'pro'
  // Pro profile
  profile: {
    name: '',
    email: '',
    timezone: null,           // set on onboarding, kept in profile
    createdAt: null,
  },
  wordGoal: 250,
  themes: ['personal-experiences', 'memories', 'gratitude', 'ideas', 'everyday-life'],
};

const DEFAULT_PROMPT = {
  dateKey: null,   // 'YYYY-MM-DD' local
  language: null,
  promptId: null,
  text: null,
  theme: null,
  history: [],     // recent prompt ids to avoid repetition
};

// ---------- storage helpers ----------

async function getState()   { const { [STATE_KEY]: s }    = await chrome.storage.local.get(STATE_KEY);    return { ...DEFAULT_STATE, ...(s || {}) }; }
async function getSettings(){ const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY); return { ...DEFAULT_SETTINGS, ...(s || {}), profile: { ...DEFAULT_SETTINGS.profile, ...((s && s.profile) || {}) } }; }
async function getHistory() { const { [HISTORY_KEY]: h }  = await chrome.storage.local.get(HISTORY_KEY);  return Array.isArray(h) ? h : []; }
async function getPrompt()  { const { [PROMPT_KEY]: p }   = await chrome.storage.local.get(PROMPT_KEY);   return { ...DEFAULT_PROMPT, ...(p || {}) }; }

async function setState(next) {
  const withDerived = {
    ...next,
    typedWords: countWords(next.typedText || ''),
    pastedWords: countWords(next.pastedText || ''),
  };
  await chrome.storage.local.set({ [STATE_KEY]: withDerived });
  broadcastState(withDerived).catch(() => {});
}
async function setSettings(next) { await chrome.storage.local.set({ [SETTINGS_KEY]: next }); }
async function setPrompt(next)   { await chrome.storage.local.set({ [PROMPT_KEY]: next });   }

// ---------- word counting ----------

function countWords(text) {
  if (!text) return 0;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 0;
  return trimmed.split(' ').length;
}

// ---------- date helpers (respect user timezone if provided, else local) ----------

function dayKey(ts, tz) {
  const d = new Date(ts);
  try {
    if (tz) {
      // en-CA formats as YYYY-MM-DD reliably.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(d);
    }
  } catch (_) { /* fall through */ }
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- session lifecycle ----------

async function startSession() {
  const settings = await getSettings();
  const next = {
    ...DEFAULT_STATE,
    active: true,
    startedAt: Date.now(),
    sessionGoal: settings.plan === 'pro' ? Math.max(0, Number(settings.wordGoal) || 0) : 0,
  };
  await setState(next);
  return next;
}

async function stopSession() {
  const state = await getState();
  if (!state.active) return state;
  const endedAt = Date.now();
  const settings = await getSettings();
  const typedWords  = countWords(state.typedText);
  const pastedWords = countWords(state.pastedText);
  const lastResult = {
    startedAt: state.startedAt,
    endedAt,
    typedWords,
    pastedWords,
    sessionGoal: state.sessionGoal || 0,   // historical goal snapshot
    mode: settings.pasteMode,
  };
  const next = { ...state, active: false, endedAt, lastResult };
  await setState(next);
  await appendHistory(lastResult);
  return next;
}

async function appendHistory(session) {
  const history = await getHistory();
  const words = (session.typedWords || 0) + (session.pastedWords || 0);
  const duration = Math.max(0, (session.endedAt || 0) - (session.startedAt || 0));
  if (words === 0 && duration < 1000) return history;
  const next = [{ id: session.startedAt || Date.now(), ...session }, ...history].slice(0, HISTORY_MAX);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

async function clearHistory() { await chrome.storage.local.set({ [HISTORY_KEY]: [] }); }

async function applyDelta(delta) {
  const state = await getState();
  if (!state.active) return;
  let { typedText, pastedText } = state;

  if (delta.kind === 'typed' && typeof delta.added === 'string') {
    typedText += delta.added;
  } else if (delta.kind === 'pasted' && typeof delta.added === 'string') {
    pastedText += delta.added;
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

// ---------- prompt ----------

async function getOrCreateTodaysPrompt() {
  const settings = await getSettings();
  const stored = await getPrompt();
  const tz = settings.profile.timezone;
  const today = dayKey(Date.now(), tz);
  const lang = settings.language === 'es' ? 'es' : 'en';

  if (
    stored.dateKey === today &&
    stored.language === lang &&
    stored.promptId
  ) {
    return stored;
  }

  const pick = self.WCPrompts.pickPrompt(settings.themes, lang, stored.history || []);
  if (!pick) return stored;
  const nextHistory = [pick.id, ...(stored.history || [])].slice(0, PROMPT_HISTORY_MAX);
  const next = {
    dateKey: today,
    language: lang,
    promptId: pick.id,
    text: pick.text,
    theme: pick.theme,
    history: nextHistory,
  };
  await setPrompt(next);
  return next;
}

async function requestAnotherPrompt() {
  const settings = await getSettings();
  const stored = await getPrompt();
  const tz = settings.profile.timezone;
  const today = dayKey(Date.now(), tz);
  const lang = settings.language === 'es' ? 'es' : 'en';

  // Exclude the current prompt id, then the recent history.
  const skip = [stored.promptId, ...(stored.history || [])].filter(Boolean);
  const pick = self.WCPrompts.pickPrompt(settings.themes, lang, skip);
  if (!pick) return stored;
  const nextHistory = [pick.id, ...(stored.history || [])].slice(0, PROMPT_HISTORY_MAX);
  const next = {
    dateKey: today,
    language: lang,
    promptId: pick.id,
    text: pick.text,
    theme: pick.theme,
    history: nextHistory,
  };
  await setPrompt(next);
  return next;
}

// ---------- aggregation for dashboard ----------

/**
 * Return aggregated stats for the given range.
 * range: 'today' | 'week' | 'month' | 'year' | 'all'
 * Returns:
 *   {
 *     range,
 *     totalWords, sessionCount, longestSessionWords,
 *     buckets: [ { key, label, words, sessions } ]  // for chart display
 *     sessions: [ ... recent for this range ... ]
 *   }
 */
async function getStats(range) {
  const history = await getHistory();
  const settings = await getSettings();
  const tz = settings.profile.timezone;
  const now = Date.now();

  const withWords = history.map((s) => ({
    ...s,
    _words: (s.typedWords || 0) + (s.pastedWords || 0),
    _duration: Math.max(0, (s.endedAt || 0) - (s.startedAt || 0)),
    _dayKey: dayKey(s.startedAt, tz),
  }));

  const { start, end } = rangeBounds(range, now, tz);
  const inRange = withWords.filter((s) => s.startedAt >= start && s.startedAt < end);

  const totalWords    = inRange.reduce((sum, s) => sum + s._words, 0);
  const sessionCount  = inRange.length;
  const longestSessionWords = inRange.reduce((m, s) => Math.max(m, s._words), 0);

  const buckets = buildBuckets(range, start, end, inRange, tz);

  return {
    range,
    start, end,
    totalWords,
    sessionCount,
    longestSessionWords,
    buckets,
    sessions: inRange.slice(0, 100),
  };
}

function rangeBounds(range, now, tz) {
  const nowDate = new Date(now);
  const todayKey = dayKey(now, tz);
  // Rebuild start/end using local (or tz) day boundaries.
  const startOfDay = new Date(`${todayKey}T00:00:00`);
  if (range === 'today') {
    const end = new Date(startOfDay); end.setDate(end.getDate() + 1);
    return { start: startOfDay.getTime(), end: end.getTime() };
  }
  if (range === 'week') {
    // Start on Monday
    const d = new Date(startOfDay);
    const dow = (d.getDay() + 6) % 7; // 0 = Mon
    d.setDate(d.getDate() - dow);
    const end = new Date(d); end.setDate(end.getDate() + 7);
    return { start: d.getTime(), end: end.getTime() };
  }
  if (range === 'month') {
    const d = new Date(startOfDay); d.setDate(1);
    const end = new Date(d); end.setMonth(end.getMonth() + 1);
    return { start: d.getTime(), end: end.getTime() };
  }
  if (range === 'year') {
    const d = new Date(startOfDay); d.setMonth(0, 1);
    const end = new Date(d); end.setFullYear(end.getFullYear() + 1);
    return { start: d.getTime(), end: end.getTime() };
  }
  // all
  return { start: 0, end: nowDate.getTime() + 1 };
}

function buildBuckets(range, start, end, sessions, tz) {
  const pad = (n) => String(n).padStart(2, '0');
  const perDay = (ts) => dayKey(ts, tz);

  if (range === 'today') {
    // Single bucket
    const words = sessions.reduce((s, x) => s + x._words, 0);
    return [{ key: perDay(start), label: perDay(start), words, sessions: sessions.length }];
  }
  if (range === 'week') {
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = perDay(d.getTime());
      const list = sessions.filter((s) => s._dayKey === k);
      buckets.push({
        key: k,
        label: k,
        dow: (d.getDay() + 6) % 7, // 0=Mon
        words: list.reduce((sum, s) => sum + s._words, 0),
        sessions: list.length,
      });
    }
    return buckets;
  }
  if (range === 'month') {
    const buckets = [];
    const d0 = new Date(start);
    const monthEnd = new Date(end);
    for (let d = new Date(d0); d < monthEnd; d.setDate(d.getDate() + 1)) {
      const k = perDay(d.getTime());
      const list = sessions.filter((s) => s._dayKey === k);
      buckets.push({
        key: k,
        label: `${pad(d.getDate())}`,
        dayOfMonth: d.getDate(),
        words: list.reduce((sum, s) => sum + s._words, 0),
        sessions: list.length,
      });
    }
    return buckets;
  }
  if (range === 'year') {
    const buckets = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(start); d.setMonth(m);
      const monthKey = `${d.getFullYear()}-${pad(m + 1)}`;
      const list = sessions.filter((s) => new Date(s.startedAt).getFullYear() === d.getFullYear() && new Date(s.startedAt).getMonth() === m);
      buckets.push({
        key: monthKey,
        label: monthKey,
        month: m,
        words: list.reduce((sum, s) => sum + s._words, 0),
        sessions: list.length,
      });
    }
    return buckets;
  }
  // all — bucket by month for chart
  const monthSet = new Map();
  sessions.forEach((s) => {
    const d = new Date(s.startedAt);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (!monthSet.has(key)) monthSet.set(key, { key, label: key, words: 0, sessions: 0 });
    const b = monthSet.get(key);
    b.words += s._words;
    b.sessions += 1;
  });
  return Array.from(monthSet.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// ---------- broadcast ----------

async function broadcastState(state) {
  const settings = await getSettings();
  const payload = buildPopupPayload(state, settings);
  try { await chrome.runtime.sendMessage({ type: 'STATE_UPDATE', payload }); }
  catch (_e) { /* no listener */ }
}

function buildPopupPayload(state, settings) {
  const typedWords  = countWords(state.typedText);
  const pastedWords = countWords(state.pastedText);
  return {
    active: state.active,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    typedWords,
    pastedWords,
    totalWords: typedWords + pastedWords,
    sessionGoal: state.sessionGoal || 0,
    pasteMode: settings.pasteMode,
    onboarded: settings.onboarded,
    proOnboarded: settings.proOnboarded,
    plan: settings.plan || 'free',
    language: settings.language,
    lastResult: state.lastResult,
  };
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
        case 'GET_ALL': {
          const [state, settings, history, prompt] = await Promise.all([
            getState(), getSettings(), getHistory(), getPrompt(),
          ]);
          sendResponse({ ok: true,
            payload: buildPopupPayload(state, settings),
            settings, history, prompt,
          });
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
          sendResponse({ ok: true, settings: await getSettings() });
          return;
        }
        case 'SET_SETTINGS': {
          const current = await getSettings();
          // Deep-merge only for `profile`; the rest is a shallow overlay.
          const patch = msg.settings || {};
          const nextProfile = patch.profile
            ? { ...current.profile, ...patch.profile }
            : current.profile;
          const next = { ...current, ...patch, profile: nextProfile };
          await setSettings(next);
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
        case 'GET_HISTORY': {
          sendResponse({ ok: true, history: await getHistory() });
          return;
        }
        case 'CLEAR_HISTORY': {
          await clearHistory();
          sendResponse({ ok: true, history: [] });
          return;
        }
        case 'GET_PROMPT': {
          const prompt = await getOrCreateTodaysPrompt();
          sendResponse({ ok: true, prompt });
          return;
        }
        case 'ANOTHER_PROMPT': {
          const prompt = await requestAnotherPrompt();
          sendResponse({ ok: true, prompt });
          return;
        }
        case 'GET_STATS': {
          const stats = await getStats(msg.range || 'today');
          sendResponse({ ok: true, stats });
          return;
        }
        case 'OPEN_DASHBOARD': {
          try {
            await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: String(e) });
          }
          return;
        }
        default:
          sendResponse({ ok: false, error: 'unknown_message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const state    = await getState();
  const settings = await getSettings();
  await chrome.storage.local.set({
    [STATE_KEY]: state,
    [SETTINGS_KEY]: settings,
  });
});
