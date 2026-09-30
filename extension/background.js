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

importScripts('shared/wordcount.js');
importScripts('shared/history.js');
importScripts('shared/prompts.js');
importScripts('shared/ai-profile.js');
importScripts('shared/api-client.js');
importScripts('shared/memory-queue.js');

const STATE_KEY    = 'wc_state';
const SETTINGS_KEY = 'wc_settings';
const HISTORY_KEY  = 'wc_history';
const PROMPT_KEY   = 'wc_prompt';
const ACCOUNT_KEY  = 'wc_account';

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
  langChosen: false,          // first-launch language screen completed
  proOnboarded: false,        // pro walkthrough completed at least once
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
  // Optional AI onboarding draft. Local-only until the user explicitly syncs
  // after Supabase Auth is connected in a later phase.
  aiProfileDraft: self.WCAIProfile.createDraft(),
  aiMemoryPreference: 'ask',  // 'ask' | 'always'
  aiMemoryLastHandledSession: null,
};

const DEFAULT_PROMPT = {
  dateKey: null,   // 'YYYY-MM-DD' local
  language: null,
  promptId: null,
  text: null,
  theme: null,
  history: [],     // recent prompt ids to avoid repetition
};

const DEFAULT_ACCOUNT = {
  authenticated: false,
  userId: null,
  email: null,
  plan: null,
  aiAccess: false,
  online: true,
  profileSyncEnabled: false,
  profileSyncedAt: null,
};

// ---------- storage helpers ----------

async function getState()   { const { [STATE_KEY]: s }    = await chrome.storage.local.get(STATE_KEY);    return { ...DEFAULT_STATE, ...(s || {}) }; }
async function getSettings(){
  const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY);
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(s || {}),
    profile: { ...DEFAULT_SETTINGS.profile, ...((s && s.profile) || {}) },
    aiProfileDraft: self.WCAIProfile.sanitizeDraft((s && s.aiProfileDraft) || {}),
  };
  // Purge the removed "copied/pasted text" setting so no obsolete value lingers.
  delete merged.pasteMode;
  delete merged.onboarded;
  return merged;
}
async function getHistory() { const { [HISTORY_KEY]: h }  = await chrome.storage.local.get(HISTORY_KEY);  return Array.isArray(h) ? h : []; }
async function getPrompt()  { const { [PROMPT_KEY]: p }   = await chrome.storage.local.get(PROMPT_KEY);   return { ...DEFAULT_PROMPT, ...(p || {}) }; }
async function getAccount() { const { [ACCOUNT_KEY]: a } = await chrome.storage.local.get(ACCOUNT_KEY); return { ...DEFAULT_ACCOUNT, ...(a || {}) }; }

async function setState(next) {
  // typedWords / pastedWords are the authoritative session counters. They are
  // reconciled against the real editor text by the content script (see
  // classifyDelta) and accumulated here, so we simply persist clamped ints.
  const withDerived = {
    ...next,
    typedWords: Math.max(0, Math.floor(Number(next.typedWords) || 0)),
    pastedWords: Math.max(0, Math.floor(Number(next.pastedWords) || 0)),
  };
  await chrome.storage.local.set({ [STATE_KEY]: withDerived });
  broadcastState(withDerived).catch(() => {});
}
async function setSettings(next) { await chrome.storage.local.set({ [SETTINGS_KEY]: next }); }
async function setPrompt(next)   { await chrome.storage.local.set({ [PROMPT_KEY]: next });   }
async function setAccount(next)  { await chrome.storage.local.set({ [ACCOUNT_KEY]: next }); }

// ---------- Supabase account + explicit profile sync ----------

function apiErrorCode(error) {
  if (!error || !error.body) return 'offline';
  const detail = error.body.detail;
  if (error.status === 401 || error.status === 400) return 'invalid_credentials';
  if (detail === 'offline' || error.status === 0) return 'offline';
  return 'request_failed';
}

async function refreshAccount() {
  const current = await getAccount();
  try {
    const user = await self.WCApi.get('/auth/me');
    const next = {
      ...current,
      authenticated: true,
      userId: user.id,
      email: user.email,
      plan: user.plan || null,
      aiAccess: user.ai_access === true,
      online: true,
    };
    await setAccount(next);
    return next;
  } catch (error) {
    if (error.status === 401) {
      const next = { ...DEFAULT_ACCOUNT, online: true };
      await setAccount(next);
      return next;
    }
    return { ...current, online: false };
  }
}

async function authenticateAccount(mode, email, password) {
  const path = mode === 'signup' ? '/auth/signup' : '/auth/login';
  const result = await self.WCApi.post(path, { email, password });
  if (!result.authenticated) {
    const pending = { ...DEFAULT_ACCOUNT, email: result.user && result.user.email, online: true };
    await setAccount(pending);
    return { account: pending, message: result.message };
  }
  const account = {
    ...DEFAULT_ACCOUNT,
    authenticated: true,
    userId: result.user.id,
    email: result.user.email,
    plan: result.user.plan || null,
    aiAccess: result.user.ai_access === true,
    online: true,
  };
  await setAccount(account);
  return { account, message: result.message };
}

async function syncAIProfileDraft(enableAutoSync = false) {
  const [settings, account] = await Promise.all([getSettings(), refreshAccount()]);
  if (!account.authenticated) throw new Error('auth_required');
  const cloud = await self.WCApi.get('/ai/profile');
  const merged = self.WCAIProfile.mergeWithCloud(settings.aiProfileDraft, cloud);
  const saved = await self.WCApi.put('/ai/profile', merged);
  const syncedDraft = self.WCAIProfile.fromApiProfile(saved, settings.aiProfileDraft);
  const nextSettings = { ...settings, aiProfileDraft: syncedDraft };
  const nextAccount = {
    ...account,
    online: true,
    profileSyncEnabled: enableAutoSync || account.profileSyncEnabled,
    profileSyncedAt: Date.now(),
  };
  await Promise.all([setSettings(nextSettings), setAccount(nextAccount)]);
  return { profile: syncedDraft, account: nextAccount };
}

async function maybeAutoSyncProfile(profile) {
  const account = await getAccount();
  if (!account.authenticated || !account.profileSyncEnabled) return profile;
  try {
    const result = await syncAIProfileDraft(false);
    return result.profile;
  } catch (_error) {
    const settings = await getSettings();
    const pending = self.WCAIProfile.sanitizeDraft({ ...settings.aiProfileDraft, syncStatus: 'pending' }, Date.now());
    await setSettings({ ...settings, aiProfileDraft: pending });
    return pending;
  }
}

async function captureActiveEditor(preferredTabId = null) {
  let tabId = preferredTabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs && tabs[0] && tabs[0].id;
  }
  if (!tabId) throw new Error('no_editor');
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_ACTIVE_EDITOR' }, (response) => {
      if (chrome.runtime.lastError) { reject(new Error('no_editor')); return; }
      if (!response || !response.ok) { reject(new Error(response?.error || 'no_editor')); return; }
      resolve(response.text);
    });
  });
}

async function syncQueueEntry(entry) {
  const payload = await self.WCMemoryQueue.readPayload(entry);
  const saved = await self.WCApi.post('/ai/writing-sessions', payload);
  await self.WCMemoryQueue.markSynced(entry.id, saved.id);
  return saved;
}

async function syncOwnedMemoryQueue(account) {
  if (!account.authenticated || !account.aiAccess) throw new Error('ai_access_required');
  const pending = await self.WCMemoryQueue.pendingForOwner(account.userId);
  let synced = 0;
  for (const entry of pending) {
    try { await syncQueueEntry(entry); synced++; }
    catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      break; // Preserve this and later ciphertext entries for a future retry.
    }
  }
  return { synced, status: await self.WCMemoryQueue.status(account.userId) };
}

async function captureAndQueueMemory(lastResult, preferredTabId = null) {
  if (!lastResult || !lastResult.startedAt) throw new Error('no_session');
  const text = await captureActiveEditor(preferredTabId);
  if (text.length > self.WCMemoryQueue.MAX_CHARS) throw new Error('writing_too_large');
  const account = await getAccount();
  const payload = {
    existing_session_ref: String(lastResult.startedAt),
    word_count: (lastResult.typedWords || 0) + (lastResult.pastedWords || 0),
    writing_duration_seconds: Math.max(0, Math.floor(((lastResult.endedAt || 0) - (lastResult.startedAt || 0)) / 1000)),
    content: text,
    save_to_memory: true,
  };
  const entry = await self.WCMemoryQueue.enqueue(payload, account.authenticated ? account.userId : null);
  const settings = await getSettings();
  await setSettings({ ...settings, aiMemoryLastHandledSession: lastResult.startedAt });
  let saveStatus = 'queued';
  if (account.authenticated && account.aiAccess && account.online) {
    try { await syncQueueEntry(entry); saveStatus = 'synced'; }
    catch (_error) { saveStatus = 'queued'; }
  }
  return {
    saveStatus,
    queue: await self.WCMemoryQueue.status(account.authenticated ? account.userId : null),
    settings: await getSettings(),
  };
}

// ---------- word counting ----------
// Tokenization + session math live in shared/wordcount.js (imported above),
// so the content script, service worker and tests share identical rules.
// Counting happens in the content script (which sees the real editor text);
// the service worker only accumulates the resulting typed/pasted deltas.

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

async function requestAISuggestion({ currentWriting = '', currentProject = '' } = {}) {
  const account = await refreshAccount();
  if (!account.authenticated || !account.aiAccess || !account.online) {
    const reason = !account.authenticated
      ? 'auth_required'
      : (!account.aiAccess ? 'plan_required' : 'offline');
    return { ok: false, reason };
  }
  const payload = {};
  const draft = (currentWriting || '').trim().slice(0, 20000);
  if (draft) payload.current_writing = draft;
  const project = (currentProject || '').trim().slice(0, 2000);
  if (project) payload.current_project = project;
  try {
    const suggestion = await self.WCApi.post('/ai/suggestion', payload);
    return { ok: true, suggestion, account };
  } catch (error) {
    const status = error && error.status;
    if (status === 401) return { ok: false, reason: 'auth_required' };
    if (status === 403) return { ok: false, reason: 'plan_required' };
    if (status === 429) return { ok: false, reason: 'rate_limited' };
    return { ok: false, reason: 'offline' };
  }
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
  const typedWords  = state.typedWords || 0;
  const pastedWords = state.pastedWords || 0;
  const goal = state.sessionGoal || 0;
  const lastResult = {
    startedAt: state.startedAt,
    endedAt,
    typedWords,
    pastedWords,
    sessionGoal: goal,                       // historical goal snapshot
    goalReached: goal > 0 ? typedWords >= goal : false,
    timezone: settings.profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || null,
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
  const { typedWords, pastedWords } = self.WCWordCount.applyDelta(state, delta || {});
  await setState({ ...state, typedWords, pastedWords });
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
    _words: self.WCHistory.sessionWords(s),   // typed only; pasted never counts
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
  const typedWords  = state.typedWords || 0;
  const pastedWords = state.pastedWords || 0;
  return {
    active: state.active,
    startedAt: state.startedAt,
    endedAt: state.endedAt,
    typedWords,
    pastedWords,
    totalWords: typedWords + pastedWords,
    sessionGoal: state.sessionGoal || 0,
    langChosen: settings.langChosen,
    proOnboarded: settings.proOnboarded,
    plan: settings.plan || 'free',
    language: settings.language,
    lastResult: state.lastResult,
  };
}

// ---------- message router ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
          const [state, settings, history, prompt, account] = await Promise.all([
            getState(), getSettings(), getHistory(), getPrompt(), getAccount(),
          ]);
          sendResponse({ ok: true,
            payload: buildPopupPayload(state, settings),
            settings, history, prompt, account,
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
          let settings = await getSettings();
          let memory = null;
          const account = await getAccount();
          if (
            settings.aiMemoryPreference === 'always' &&
            account.authenticated && account.aiAccess &&
            state.lastResult?.startedAt !== settings.aiMemoryLastHandledSession
          ) {
            try { memory = await captureAndQueueMemory(state.lastResult, sender.tab && sender.tab.id); }
            catch (error) { memory = { saveStatus: 'error', error: error.message }; }
            settings = await getSettings();
          }
          sendResponse({ ok: true, payload: buildPopupPayload(state, settings), settings, memory });
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
          // Deep-merge nested profile records; the rest is a shallow overlay.
          const patch = msg.settings || {};
          const nextProfile = patch.profile
            ? { ...current.profile, ...patch.profile }
            : current.profile;
          const nextAIProfile = patch.aiProfileDraft
            ? self.WCAIProfile.sanitizeDraft({ ...current.aiProfileDraft, ...patch.aiProfileDraft }, Date.now())
            : current.aiProfileDraft;
          const next = { ...current, ...patch, profile: nextProfile, aiProfileDraft: nextAIProfile };
          await setSettings(next);
          if (patch.aiProfileDraft) next.aiProfileDraft = await maybeAutoSyncProfile(next.aiProfileDraft);
          const state = await getState();
          broadcastState(state).catch(() => {});
          sendResponse({ ok: true, settings: next });
          return;
        }
        case 'GET_AI_PROFILE_DRAFT': {
          const settings = await getSettings();
          sendResponse({ ok: true, profile: settings.aiProfileDraft });
          return;
        }
        case 'SET_AI_PROFILE_DRAFT': {
          const settings = await getSettings();
          const profile = self.WCAIProfile.sanitizeDraft(
            { ...settings.aiProfileDraft, ...(msg.profile || {}) },
            Date.now(),
          );
          const next = { ...settings, aiProfileDraft: profile };
          await setSettings(next);
          const synced = await maybeAutoSyncProfile(profile);
          sendResponse({ ok: true, profile: synced });
          return;
        }
        case 'GET_ACCOUNT': {
          const account = msg.refresh === false ? await getAccount() : await refreshAccount();
          sendResponse({ ok: true, account });
          return;
        }
        case 'AUTH_ACCOUNT': {
          try {
            const result = await authenticateAccount(msg.mode, msg.email, msg.password);
            sendResponse({ ok: true, ...result });
          } catch (error) {
            sendResponse({ ok: false, error: apiErrorCode(error) });
          }
          return;
        }
        case 'LOGOUT_ACCOUNT': {
          try { await self.WCApi.post('/auth/logout'); } catch (_error) { /* clear local metadata regardless */ }
          await setAccount({ ...DEFAULT_ACCOUNT, online: true });
          sendResponse({ ok: true, account: { ...DEFAULT_ACCOUNT, online: true } });
          return;
        }
        case 'SYNC_AI_PROFILE': {
          try {
            const result = await syncAIProfileDraft(msg.enableAutoSync !== false);
            sendResponse({ ok: true, ...result });
          } catch (error) {
            sendResponse({ ok: false, error: error.message === 'auth_required' ? 'auth_required' : apiErrorCode(error) });
          }
          return;
        }
        case 'SAVE_SESSION_TO_AI_MEMORY': {
          try {
            const state = await getState();
            if (msg.always === true) {
              const settings = await getSettings();
              await setSettings({ ...settings, aiMemoryPreference: 'always' });
            }
            const result = await captureAndQueueMemory(state.lastResult, sender.tab && sender.tab.id);
            sendResponse({ ok: true, ...result });
          } catch (error) {
            sendResponse({ ok: false, error: error.message || 'memory_save_failed' });
          }
          return;
        }
        case 'DISMISS_AI_MEMORY': {
          const state = await getState();
          const settings = await getSettings();
          const next = { ...settings, aiMemoryLastHandledSession: state.lastResult?.startedAt || null };
          await setSettings(next);
          sendResponse({ ok: true, settings: next });
          return;
        }
        case 'SET_AI_MEMORY_PREFERENCE': {
          const settings = await getSettings();
          const next = { ...settings, aiMemoryPreference: msg.preference === 'always' ? 'always' : 'ask' };
          await setSettings(next);
          sendResponse({ ok: true, settings: next });
          return;
        }
        case 'GET_MEMORY_QUEUE_STATUS': {
          const account = await getAccount();
          sendResponse({ ok: true, queue: await self.WCMemoryQueue.status(account.authenticated ? account.userId : null) });
          return;
        }
        case 'CLAIM_MEMORY_QUEUE': {
          try {
            const account = await refreshAccount();
            if (!account.authenticated || !account.aiAccess) throw new Error('ai_access_required');
            const claimed = await self.WCMemoryQueue.claimUnowned(account.userId);
            const result = await syncOwnedMemoryQueue(account);
            sendResponse({ ok: true, claimed, ...result });
          } catch (error) {
            sendResponse({ ok: false, error: error.message || apiErrorCode(error) });
          }
          return;
        }
        case 'SYNC_MEMORY_QUEUE': {
          try {
            const account = await refreshAccount();
            const result = await syncOwnedMemoryQueue(account);
            sendResponse({ ok: true, ...result });
          } catch (error) {
            sendResponse({ ok: false, error: error.message || apiErrorCode(error) });
          }
          return;
        }
        case 'DELETE_SYNCED_MEMORY_QUEUE': {
          const account = await getAccount();
          if (!account.authenticated) { sendResponse({ ok: false, error: 'auth_required' }); return; }
          const removed = await self.WCMemoryQueue.removeSynced(account.userId);
          sendResponse({ ok: true, removed, queue: await self.WCMemoryQueue.status(account.userId) });
          return;
        }
        case 'IS_ACTIVE': {
          const state = await getState();
          sendResponse({ ok: true, active: state.active });
          return;
        }
        case 'GET_HISTORY': {
          const [full, settings] = await Promise.all([getHistory(), getSettings()]);
          const plan = settings.plan || 'free';
          const now = Date.now();
          const visible = self.WCHistory.visibleHistory(full, plan, now);
          sendResponse({
            ok: true,
            history: visible,
            plan,
            totalCount: full.length,
            hasMore: visible.length < full.length,
          });
          return;
        }
        case 'GET_STREAK': {
          const [full, settings] = await Promise.all([getHistory(), getSettings()]);
          const streak = self.WCHistory.computeStreak(full, settings.profile.timezone, Date.now());
          sendResponse({ ok: true, streak });
          return;
        }
        case 'EXPORT_HISTORY': {
          const [full, settings] = await Promise.all([getHistory(), getSettings()]);
          if ((settings.plan || 'free') !== 'pro') { sendResponse({ ok: false, error: 'pro_only' }); return; }
          sendResponse({ ok: true, csv: self.WCHistory.toCSV(full), count: full.length });
          return;
        }
        case 'IMPORT_HISTORY': {
          const settings = await getSettings();
          if ((settings.plan || 'free') !== 'pro') { sendResponse({ ok: false, error: 'pro_only' }); return; }
          const records = Array.isArray(msg.records) ? msg.records : [];
          const mode = msg.mode === 'replace' ? 'replace' : 'merge';
          const existing = await getHistory();
          const next = mode === 'replace'
            ? records.slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
            : self.WCHistory.mergeHistory(existing, records);
          const capped = next.slice(0, HISTORY_MAX);
          await chrome.storage.local.set({ [HISTORY_KEY]: capped });
          sendResponse({ ok: true, history: capped, count: capped.length });
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
        case 'GET_AI_SUGGESTION': {
          const settings = await getSettings();
          const draft = settings.aiProfileDraft || {};
          const project = (draft.currentProjects || draft.writingGoal || '').toString();
          const result = await requestAISuggestion({
            currentWriting: msg.currentWriting || '',
            currentProject: msg.currentProject || project,
          });
          sendResponse(result);
          return;
        }
        case 'SEND_AI_FEEDBACK': {
          try {
            const body = { suggestion_id: msg.suggestionId, helpful: !!msg.helpful };
            if (msg.reason) body.reason = msg.reason;
            if (msg.note) body.note = String(msg.note).slice(0, 2000);
            const feedback = await self.WCApi.post('/ai/feedback', body);
            sendResponse({ ok: true, feedback });
          } catch (error) {
            sendResponse({ ok: false, error: apiErrorCode(error) });
          }
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
          // Deprecated: Progress now renders inside the popup. Never open a tab.
          sendResponse({ ok: false, error: 'deprecated_in_popup' });
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
    [ACCOUNT_KEY]: await getAccount(),
  });
});
