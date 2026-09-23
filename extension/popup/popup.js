/**
 * Word Count Extension — Popup Controller
 *
 * Reads state from the background service worker and renders one of three
 * views inside the session panel: idle, active, done. Also handles
 * first-run onboarding and the settings panel.
 */

const $ = (id) => document.getElementById(id);

const els = {
  // panels
  onboarding: $('onboarding-panel'),
  settings:   $('settings-panel'),
  session:    $('session-panel'),
  // header
  settingsBtn: $('settings-btn'),
  settingsBack: $('settings-back'),
  // session view
  statusIdle:   $('status-idle'),
  statusActive: $('status-active'),
  statusDone:   $('status-done'),
  countNumber:  $('count-number'),
  countLabel:   $('count-label'),
  countSub:     $('count-sub'),
  durationRow:  $('duration-row'),
  durationValue:$('duration-value'),
  primaryBtn:   $('primary-btn'),
  helperText:   $('helper-text'),
};

let latest = null;      // last payload from background
let durationTicker = 0; // interval id

// ---------- messaging helpers ----------

function sendMessage(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: false });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

// ---------- formatting ----------

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ---------- rendering ----------

function showPanel(name) {
  els.onboarding.hidden = name !== 'onboarding';
  els.settings.hidden   = name !== 'settings';
  els.session.hidden    = name !== 'session';
}

function setStatus(kind) {
  els.statusIdle.hidden   = kind !== 'idle';
  els.statusActive.hidden = kind !== 'active';
  els.statusDone.hidden   = kind !== 'done';
}

function render(payload) {
  latest = payload;

  // Onboarding gate
  if (!payload.onboarded) {
    showPanel('onboarding');
    stopDurationTicker();
    return;
  }
  showPanel('session');

  const { active, startedAt, endedAt, typedWords, pastedWords, totalWords, pasteMode, lastResult } = payload;

  // Decide which state to show inside the session panel
  if (active) {
    setStatus('active');
    renderCount(active, pasteMode, typedWords, pastedWords, totalWords);
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(Date.now() - (startedAt || Date.now()));
    els.primaryBtn.textContent = 'Stop Session';
    els.primaryBtn.dataset.variant = 'danger';
    els.helperText.textContent = 'Keep writing anywhere in Chrome — your session runs in the background.';
    startDurationTicker();
  } else if (lastResult) {
    setStatus('done');
    renderCount(false, lastResult.mode, lastResult.typedWords, lastResult.pastedWords, lastResult.typedWords + lastResult.pastedWords);
    const dur = Math.max(0, (lastResult.endedAt || 0) - (lastResult.startedAt || 0));
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(dur);
    els.primaryBtn.textContent = 'Start New Session';
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = 'Your session is saved locally. Start a new one whenever you like.';
    stopDurationTicker();
  } else {
    setStatus('idle');
    renderCount(false, pasteMode, 0, 0, 0);
    els.durationRow.hidden = true;
    els.primaryBtn.textContent = 'Start Session';
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = 'Start a session and your words will be counted as you write.';
    stopDurationTicker();
  }
}

function renderCount(_active, mode, typed, pasted, total) {
  if (mode === 'as_typed') {
    els.countNumber.textContent = fmtNumber(total);
    els.countLabel.textContent = total === 1 ? 'word' : 'words';
    els.countSub.hidden = true;
    els.countSub.textContent = '';
  } else {
    // separate: big = typed, small = pasted breakdown
    els.countNumber.textContent = fmtNumber(typed);
    els.countLabel.textContent = typed === 1 ? 'word typed' : 'words typed';
    if (pasted > 0) {
      els.countSub.hidden = false;
      els.countSub.textContent = `+ ${fmtNumber(pasted)} pasted`;
    } else {
      els.countSub.hidden = true;
      els.countSub.textContent = '';
    }
  }
}

function startDurationTicker() {
  if (durationTicker) return;
  durationTicker = setInterval(() => {
    if (!latest || !latest.active || !latest.startedAt) return;
    els.durationValue.textContent = fmtDuration(Date.now() - latest.startedAt);
  }, 1000);
}

function stopDurationTicker() {
  if (durationTicker) {
    clearInterval(durationTicker);
    durationTicker = 0;
  }
}

// ---------- interactions ----------

async function primaryClick() {
  if (!latest) return;
  if (latest.active) {
    const r = await sendMessage({ type: 'STOP_SESSION' });
    if (r.ok) render(r.payload);
  } else {
    const r = await sendMessage({ type: 'START_SESSION' });
    if (r.ok) render(r.payload);
  }
}

function markChoiceSelected(container, value) {
  container.querySelectorAll('.wc__choice').forEach((btn) => {
    btn.setAttribute('aria-checked', btn.dataset.value === value ? 'true' : 'false');
  });
}

async function onOnboardingChoice(value) {
  const r = await sendMessage({
    type: 'SET_SETTINGS',
    settings: { onboarded: true, pasteMode: value },
  });
  if (r.ok) {
    // fetch fresh state now that we're onboarded
    const s = await sendMessage({ type: 'GET_STATE' });
    if (s.ok) render(s.payload);
  }
}

async function onSettingsChoice(value) {
  const r = await sendMessage({
    type: 'SET_SETTINGS',
    settings: { pasteMode: value },
  });
  if (r.ok) {
    markChoiceSelected(els.settings, value);
    const s = await sendMessage({ type: 'GET_STATE' });
    if (s.ok) latest = s.payload;
  }
}

function openSettings() {
  markChoiceSelected(els.settings, latest?.pasteMode || 'separate');
  showPanel('settings');
}

function closeSettings() {
  render(latest);
}

// ---------- bootstrap ----------

function wire() {
  els.primaryBtn.addEventListener('click', primaryClick);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsBack.addEventListener('click', closeSettings);

  els.onboarding.querySelectorAll('.wc__choice').forEach((btn) => {
    btn.addEventListener('click', () => onOnboardingChoice(btn.dataset.value));
  });
  els.settings.querySelectorAll('.wc__choice').forEach((btn) => {
    btn.addEventListener('click', () => onSettingsChoice(btn.dataset.value));
  });

  // Live updates pushed from background
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'STATE_UPDATE' && msg.payload) {
        // Don't clobber settings panel — just cache latest.
        if (!els.settings.hidden) {
          latest = msg.payload;
        } else {
          render(msg.payload);
        }
      }
    });
  } catch (_e) { /* no chrome.runtime in preview */ }
}

async function boot() {
  wire();
  const r = await sendMessage({ type: 'GET_STATE' });
  if (r.ok && r.payload) {
    render(r.payload);
  } else {
    // Graceful fallback UI
    render({
      active: false, startedAt: null, endedAt: null,
      typedWords: 0, pastedWords: 0, totalWords: 0,
      pasteMode: 'separate', onboarded: true, lastResult: null,
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('unload', stopDurationTicker);
