/**
 * Word Count — Popup Controller
 *
 * Renders the correct panel and keeps everything in sync with the
 * background service worker. All strings flow through WCi18n so the UI
 * switches to Spanish instantly.
 */

const { t, setLang, getLang, detectDefault, applyI18n } = window.WCi18n;
const { ALL_THEMES } = window.WCPrompts;

const $ = (id) => document.getElementById(id);

const els = {
  // header
  proBadge:    $('pro-badge'),
  dashboardBtn:$('dashboard-btn'),
  historyBtn:  $('history-btn'),
  settingsBtn: $('settings-btn'),

  // panels
  onboarding:    $('onboarding-panel'),
  promptPanel:   $('prompt-panel'),
  session:       $('session-panel'),
  upgradeCta:    $('upgrade-cta'),
  upgrade:       $('upgrade-panel'),
  proOnboard:    $('pro-onboarding'),
  history:       $('history-panel'),
  settings:      $('settings-panel'),

  // session
  statusIdle:   $('status-idle'),
  statusActive: $('status-active'),
  statusDone:   $('status-done'),
  countNumber:  $('count-number'),
  countLabel:   $('count-label'),
  countSub:     $('count-sub'),
  countGoal:    $('count-goal'),
  durationRow:  $('duration-row'),
  durationValue:$('duration-value'),
  primaryBtn:   $('primary-btn'),
  helperText:   $('helper-text'),

  // prompt
  promptText:   $('prompt-text'),
  promptGoal:   $('prompt-goal'),
  promptEmpty:  $('prompt-empty'),
  promptAnother:$('prompt-another'),
  promptEditThemes: $('prompt-edit-themes'),

  // upgrade CTA & screen
  openUpgrade:  $('open-upgrade'),
  upgradeBack:  $('upgrade-back'),
  tryPro:       $('try-pro'),

  // pro onboarding
  proOnboardStep:  $('pro-onboard-step'),
  proOnboardNext:  $('pro-onboard-next'),
  onboardGoal:     $('onboard-goal'),
  onboardGoalError:$('onboard-goal-error'),
  onboardThemes:   $('onboard-themes'),
  onboardThemesError:$('onboard-themes-error'),
  stepLanguage:    $('pro-step-language'),
  stepGoal:        $('pro-step-goal'),
  stepThemes:      $('pro-step-themes'),
  stepDone:        $('pro-step-done'),

  // history
  historyList:   $('history-list'),
  historyEmpty:  $('history-empty'),
  historyActions:$('history-actions'),
  historySummary:$('history-summary'),
  historyBack:   $('history-back'),
  historyClear:  $('history-clear'),

  // settings
  settingsBack:  $('settings-back'),
  goalMeta:      $('goal-meta'),
  editGoal:      $('edit-goal'),
  goalEditor:    $('goal-editor'),
  goalInput:     $('goal-input'),
  goalError:     $('goal-error'),
  saveGoal:      $('save-goal'),
  themesMeta:    $('themes-meta'),
  editThemes:    $('edit-themes'),
  themesEditor:  $('themes-editor'),
  settingsThemes:$('settings-themes'),
  themesError:   $('themes-error'),
  saveThemes:    $('save-themes'),
  pasteMeta:     $('paste-meta'),
  togglePaste:   $('toggle-paste'),
  pasteEditor:   $('paste-editor'),
  languageMeta:  $('language-meta'),
  editLanguage:  $('edit-language'),
  languageEditor:$('language-editor'),
  planMeta:      $('plan-meta'),
  planAction:    $('plan-action'),
};

let state = null;      // popup payload
let settings = null;   // full settings from background
let promptState = null;
let durationTicker = 0;

// ---------- messaging ----------

function sendMessage(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(resp || { ok: false });
      });
    } catch (e) { resolve({ ok: false, error: String(e) }); }
  });
}

// ---------- formatting ----------

function fmtNumber(n) { return Number(n || 0).toLocaleString(getLang() === 'es' ? 'es-ES' : 'en-US'); }
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

// ---------- panels ----------

function showPanel(name) {
  els.onboarding.hidden = name !== 'onboarding';
  els.promptPanel.hidden = !(name === 'session' && isPro() && !state?.active);
  els.session.hidden    = name !== 'session';
  els.upgradeCta.hidden = !(name === 'session' && !isPro());
  els.upgrade.hidden    = name !== 'upgrade';
  els.proOnboard.hidden = name !== 'proOnboard';
  els.history.hidden    = name !== 'history';
  els.settings.hidden   = name !== 'settings';
}

function isPro() { return (settings?.plan || 'free') === 'pro'; }

// ---------- session view ----------

function setStatus(kind) {
  els.statusIdle.hidden   = kind !== 'idle';
  els.statusActive.hidden = kind !== 'active';
  els.statusDone.hidden   = kind !== 'done';
}

function renderSession() {
  if (!state) return;

  els.proBadge.hidden = !isPro();
  els.dashboardBtn.hidden = !isPro();

  const { active, startedAt, typedWords, pastedWords, totalWords, pasteMode, sessionGoal, lastResult } = state;

  if (active) {
    setStatus('active');
    renderCount(pasteMode, typedWords, pastedWords, totalWords);
    renderGoal(pasteMode === 'as_typed' ? totalWords : typedWords, sessionGoal);
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(Date.now() - (startedAt || Date.now()));
    els.primaryBtn.textContent = t('session.stop');
    els.primaryBtn.dataset.variant = 'danger';
    els.helperText.textContent = t('session.helperActive');
    startDurationTicker();
  } else if (lastResult) {
    setStatus('done');
    renderCount(lastResult.mode, lastResult.typedWords, lastResult.pastedWords, lastResult.typedWords + lastResult.pastedWords);
    renderGoal(
      lastResult.mode === 'as_typed' ? lastResult.typedWords + lastResult.pastedWords : lastResult.typedWords,
      lastResult.sessionGoal || 0
    );
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(Math.max(0, (lastResult.endedAt || 0) - (lastResult.startedAt || 0)));
    els.primaryBtn.textContent = t('session.new');
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = t('session.helperDone');
    stopDurationTicker();
  } else {
    setStatus('idle');
    renderCount(pasteMode, 0, 0, 0);
    renderGoal(0, isPro() ? (settings?.wordGoal || 0) : 0);
    els.durationRow.hidden = true;
    els.primaryBtn.textContent = t('session.start');
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = t('session.helperIdle');
    stopDurationTicker();
  }
}

function renderCount(mode, typed, pasted, total) {
  if (mode === 'as_typed') {
    els.countNumber.textContent = fmtNumber(total);
    els.countLabel.textContent = total === 1 ? t('session.word') : t('session.words');
    els.countSub.hidden = true;
  } else {
    els.countNumber.textContent = fmtNumber(typed);
    els.countLabel.textContent = typed === 1 ? t('session.wordTyped') : t('session.wordsTyped');
    if (pasted > 0) {
      els.countSub.hidden = false;
      els.countSub.textContent = t('session.pastedSuffix', { n: fmtNumber(pasted) });
    } else {
      els.countSub.hidden = true;
    }
  }
}

function renderGoal(current, goal) {
  if (!isPro() || !goal || goal <= 0) {
    els.countGoal.hidden = true;
    return;
  }
  els.countGoal.hidden = false;
  els.countGoal.classList.toggle('wc__count-goal--reached', current >= goal);
  els.countGoal.textContent = current >= goal
    ? t('session.goalReached')
    : `${fmtNumber(current)} / ${fmtNumber(goal)} · ${t('session.words')}`;
}

function startDurationTicker() {
  if (durationTicker) return;
  durationTicker = setInterval(() => {
    if (!state || !state.active || !state.startedAt) return;
    els.durationValue.textContent = fmtDuration(Date.now() - state.startedAt);
  }, 1000);
}
function stopDurationTicker() { if (durationTicker) { clearInterval(durationTicker); durationTicker = 0; } }

// ---------- prompt ----------

async function renderPrompt() {
  if (!isPro()) return;
  const r = await sendMessage({ type: 'GET_PROMPT' });
  if (!r.ok) return;
  promptState = r.prompt;
  const hasPrompt = promptState && promptState.text;
  els.promptText.hidden = !hasPrompt;
  els.promptGoal.hidden = !hasPrompt;
  els.promptEmpty.hidden = hasPrompt;
  if (hasPrompt) {
    els.promptText.textContent = promptState.text;
    els.promptGoal.textContent = t('prompt.yourGoal', { n: fmtNumber(settings?.wordGoal || 250) });
  }
}

// ---------- primary action ----------

async function primaryClick() {
  if (!state) return;
  const r = state.active
    ? await sendMessage({ type: 'STOP_SESSION' })
    : await sendMessage({ type: 'START_SESSION' });
  if (r.ok) { state = r.payload; renderSession(); }
}

// ---------- upgrade / pro onboarding ----------

let onboardStep = 0; // 0=lang, 1=goal, 2=themes, 3=done
let onboardDraft = { language: 'en', wordGoal: 250, themes: [] };

function openUpgrade() { showPanel('upgrade'); }

function startProOnboarding() {
  onboardStep = 0;
  onboardDraft = {
    language: settings?.language || getLang(),
    wordGoal: settings?.wordGoal || 250,
    themes: (settings?.themes && settings.themes.length) ? [...settings.themes] : ['personal-experiences','memories','gratitude','ideas','everyday-life'],
  };
  els.onboardGoal.value = onboardDraft.wordGoal;
  markLangChoice(document.querySelectorAll('#lang-choices .wc__choice'), onboardDraft.language);
  renderOnboardThemes();
  updateOnboardStepView();
  showPanel('proOnboard');
}

function updateOnboardStepView() {
  els.stepLanguage.hidden = onboardStep !== 0;
  els.stepGoal.hidden     = onboardStep !== 1;
  els.stepThemes.hidden   = onboardStep !== 2;
  els.stepDone.hidden     = onboardStep !== 3;
  els.proOnboardStep.textContent = t('onboard.step', { n: onboardStep + 1 });
  els.proOnboardNext.textContent = onboardStep === 3 ? t('onboard.finish') : t('onboard.continue');
}

function markLangChoice(nodes, value) {
  nodes.forEach((n) => n.setAttribute('aria-checked', n.dataset.lang === value ? 'true' : 'false'));
}

function renderOnboardThemes() {
  els.onboardThemes.innerHTML = '';
  ALL_THEMES.forEach((slug) => {
    const b = document.createElement('button');
    b.className = 'wc__theme-chip';
    b.type = 'button';
    b.textContent = t(`theme.${slug}`);
    b.setAttribute('data-theme', slug);
    b.setAttribute('data-testid', `onboard-theme-${slug}`);
    b.setAttribute('aria-pressed', onboardDraft.themes.includes(slug) ? 'true' : 'false');
    b.addEventListener('click', () => {
      const has = onboardDraft.themes.includes(slug);
      if (slug === 'surprise-me') {
        onboardDraft.themes = has ? [] : ['surprise-me'];
      } else {
        onboardDraft.themes = onboardDraft.themes.filter((x) => x !== 'surprise-me');
        onboardDraft.themes = has ? onboardDraft.themes.filter((x) => x !== slug) : [...onboardDraft.themes, slug];
      }
      renderOnboardThemes();
    });
    els.onboardThemes.appendChild(b);
  });
}

/** Validate a word-goal input. Returns { ok, value, suggest? }. */
function validateGoal(raw) {
  if (raw === '' || raw == null) return { ok: false, reason: 'empty' };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, reason: 'notint' };
  if (n <= 0) return { ok: false, reason: 'nonpos' };
  if (n % 25 !== 0) {
    const lo = Math.floor(n / 25) * 25;
    const hi = lo + 25;
    return { ok: false, reason: 'not25', suggestLo: Math.max(25, lo), suggestHi: hi };
  }
  return { ok: true, value: n };
}

function goalErrorMessage(v) {
  const msg = t('onboard.goal.invalid');
  if (v.reason === 'not25') return `${msg} ${t('onboard.goal.suggest', { a: fmtNumber(v.suggestLo), b: fmtNumber(v.suggestHi) })}`;
  return msg;
}

async function proOnboardNext() {
  if (onboardStep === 0) {
    onboardStep = 1;
    updateOnboardStepView();
    els.onboardGoal.focus(); els.onboardGoal.select();
    return;
  }
  if (onboardStep === 1) {
    const v = validateGoal(els.onboardGoal.value);
    if (!v.ok) {
      els.onboardGoalError.hidden = false;
      els.onboardGoalError.textContent = goalErrorMessage(v);
      return;
    }
    els.onboardGoalError.hidden = true;
    onboardDraft.wordGoal = v.value;
    onboardStep = 2;
    updateOnboardStepView();
    return;
  }
  if (onboardStep === 2) {
    if (onboardDraft.themes.length === 0) {
      els.onboardThemesError.hidden = false;
      els.onboardThemesError.textContent = t('onboard.themes.min');
      return;
    }
    els.onboardThemesError.hidden = true;
    onboardStep = 3;
    updateOnboardStepView();
    return;
  }
  // Finalize
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = await sendMessage({
    type: 'SET_SETTINGS',
    settings: {
      plan: 'pro',
      proOnboarded: true,
      language: onboardDraft.language,
      wordGoal: onboardDraft.wordGoal,
      themes: onboardDraft.themes,
      profile: {
        timezone: tz,
        createdAt: settings?.profile?.createdAt || Date.now(),
      },
    },
  });
  if (r.ok) {
    settings = r.settings;
    setLang(settings.language || 'en');
    applyI18n(document);
    await renderPrompt();
    showPanel('session');
    renderSession();
  }
}

// ---------- history ----------

function formatTime(ts) {
  const d = new Date(ts);
  let h = d.getHours(); const m = pad2(d.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}
function formatDurationShort(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const mm = Math.floor(s / 60);
  if (mm < 60) return `${mm}m ${pad2(s % 60)}s`;
  const h = Math.floor(mm / 60); return `${h}h ${pad2(mm % 60)}m`;
}
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function dayHeading(ts) {
  const t2 = new Date(), y = new Date(t2); y.setDate(t2.getDate() - 1);
  if (dayKey(ts) === dayKey(t2.getTime())) return t('history.today');
  if (dayKey(ts) === dayKey(y.getTime())) return t('history.yesterday');
  const lang = getLang() === 'es' ? 'es-ES' : 'en-US';
  return new Date(ts).toLocaleDateString(lang, { weekday: 'short', month: 'short', day: 'numeric' });
}
function totalWords(s) { return (s.typedWords || 0) + (s.pastedWords || 0); }

function renderHistory(history) {
  els.historyList.innerHTML = '';
  const hasAny = Array.isArray(history) && history.length > 0;
  els.historyEmpty.hidden = hasAny;
  els.historyActions.hidden = !hasAny;

  if (!hasAny) { els.historySummary.textContent = t('history.summary.none'); return; }
  const todayK = dayKey(Date.now());
  const todaySessions = history.filter((s) => dayKey(s.startedAt) === todayK);
  const todayW = todaySessions.reduce((a, s) => a + totalWords(s), 0);
  if (todaySessions.length === 0) {
    els.historySummary.textContent = t(history.length === 1 ? 'history.summary.saved' : 'history.summary.savedPlural', { n: fmtNumber(history.length) });
  } else {
    els.historySummary.textContent = t(todaySessions.length === 1 ? 'history.summary.today' : 'history.summary.todayPlural', { words: fmtNumber(todayW), sessions: todaySessions.length });
  }

  let cur = null;
  history.forEach((s) => {
    const k = dayKey(s.startedAt);
    if (k !== cur) {
      cur = k;
      const h = document.createElement('div'); h.className = 'wc__history-day'; h.textContent = dayHeading(s.startedAt);
      els.historyList.appendChild(h);
    }
    const item = document.createElement('div'); item.className = 'wc__history-item'; item.setAttribute('role','listitem');
    item.setAttribute('data-testid','history-item');
    const time = document.createElement('div'); time.className = 'wc__history-time'; time.textContent = formatTime(s.startedAt);
    const meta = document.createElement('div'); meta.className = 'wc__history-meta';
    const dur = Math.max(0, (s.endedAt || 0) - (s.startedAt || 0));
    const bits = [formatDurationShort(dur)];
    if (s.mode === 'separate' && (s.pastedWords || 0) > 0) bits.push(`${fmtNumber(s.typedWords)} typed · ${fmtNumber(s.pastedWords)} pasted`);
    if (s.sessionGoal) bits.push(`${t('dash.goal')} ${fmtNumber(s.sessionGoal)}`);
    meta.textContent = bits.join(' · ');
    const count = document.createElement('div'); count.className = 'wc__history-count';
    const w = totalWords(s);
    count.innerHTML = `${fmtNumber(w)}<span class="wc__history-count-unit">${w === 1 ? t('session.word') : t('session.words')}</span>`;
    item.appendChild(time); item.appendChild(count); item.appendChild(meta);
    els.historyList.appendChild(item);
  });
}

async function openHistory() { const r = await sendMessage({ type: 'GET_HISTORY' }); renderHistory(r.ok ? r.history : []); showPanel('history'); }
async function clearHistoryAction() { const r = await sendMessage({ type: 'CLEAR_HISTORY' }); if (r.ok) renderHistory(r.history || []); }

// ---------- settings ----------

function openSettings() { renderSettings(); showPanel('settings'); }
function renderSettings() {
  // Writing group
  els.goalMeta.textContent = t('settings.goalMeta', { n: fmtNumber(settings.wordGoal || 250) });
  els.themesMeta.textContent = (settings.themes && settings.themes.length)
    ? settings.themes.map((s) => t(`theme.${s}`)).join(' · ')
    : t('settings.themesMetaEmpty');
  els.pasteMeta.textContent = settings.pasteMode === 'as_typed'
    ? t('settings.pasteAsTyped') : t('settings.pasteSeparate');
  els.languageMeta.textContent = (settings.language || getLang()) === 'es' ? 'Español' : 'English';
  els.planMeta.textContent = isPro() ? t('settings.planPro') : t('settings.planFree');
  els.planAction.textContent = isPro() ? t('settings.cancelPro') : t('settings.upgradeRow');
  els.planAction.dataset.action = isPro() ? 'cancel' : 'upgrade';

  // Reset editors closed
  els.goalEditor.hidden = true;
  els.themesEditor.hidden = true;
  els.pasteEditor.hidden = true;
  els.languageEditor.hidden = true;
}

function toggleGoalEditor() {
  els.goalEditor.hidden = !els.goalEditor.hidden;
  if (!els.goalEditor.hidden) {
    els.goalInput.value = settings.wordGoal || 250;
    els.goalError.hidden = true;
    els.goalInput.focus(); els.goalInput.select();
  }
}
async function saveGoal() {
  const v = validateGoal(els.goalInput.value);
  if (!v.ok) { els.goalError.hidden = false; els.goalError.textContent = goalErrorMessage(v); return; }
  const r = await sendMessage({ type: 'SET_SETTINGS', settings: { wordGoal: v.value } });
  if (r.ok) { settings = r.settings; renderSettings(); }
}

function toggleThemesEditor() {
  els.themesEditor.hidden = !els.themesEditor.hidden;
  if (els.themesEditor.hidden) return;
  els.settingsThemes.innerHTML = '';
  const selected = new Set(settings.themes || []);
  ALL_THEMES.forEach((slug) => {
    const b = document.createElement('button');
    b.className = 'wc__theme-chip';
    b.type = 'button';
    b.textContent = t(`theme.${slug}`);
    b.setAttribute('data-theme', slug);
    b.setAttribute('data-testid', `settings-theme-${slug}`);
    b.setAttribute('aria-pressed', selected.has(slug) ? 'true' : 'false');
    b.addEventListener('click', () => {
      const has = selected.has(slug);
      if (slug === 'surprise-me') { selected.clear(); if (!has) selected.add('surprise-me'); }
      else { selected.delete('surprise-me'); has ? selected.delete(slug) : selected.add(slug); }
      b.setAttribute('aria-pressed', selected.has(slug) ? 'true' : 'false');
      els.settingsThemes.querySelectorAll('.wc__theme-chip').forEach((btn) => {
        const s = btn.getAttribute('data-theme');
        btn.setAttribute('aria-pressed', selected.has(s) ? 'true' : 'false');
      });
    });
    els.settingsThemes.appendChild(b);
  });
  els.saveThemes.onclick = async () => {
    if (selected.size === 0) { els.themesError.hidden = false; els.themesError.textContent = t('settings.themesSaveMin'); return; }
    els.themesError.hidden = true;
    const r = await sendMessage({ type: 'SET_SETTINGS', settings: { themes: Array.from(selected) } });
    if (r.ok) { settings = r.settings; renderSettings(); await renderPrompt(); }
  };
}

function togglePasteEditor() {
  els.pasteEditor.hidden = !els.pasteEditor.hidden;
  if (!els.pasteEditor.hidden) {
    els.pasteEditor.querySelectorAll('.wc__choice').forEach((btn) => {
      btn.setAttribute('aria-checked', btn.dataset.value === settings.pasteMode ? 'true' : 'false');
      btn.onclick = async () => {
        const r = await sendMessage({ type: 'SET_SETTINGS', settings: { pasteMode: btn.dataset.value } });
        if (r.ok) { settings = r.settings; renderSettings(); renderSession(); }
      };
    });
  }
}

function toggleLanguageEditor() {
  els.languageEditor.hidden = !els.languageEditor.hidden;
  if (!els.languageEditor.hidden) {
    const lang = settings.language || getLang();
    els.languageEditor.querySelectorAll('.wc__choice').forEach((btn) => {
      btn.setAttribute('aria-checked', btn.dataset.lang === lang ? 'true' : 'false');
      btn.onclick = async () => {
        const r = await sendMessage({ type: 'SET_SETTINGS', settings: { language: btn.dataset.lang } });
        if (r.ok) {
          settings = r.settings;
          setLang(settings.language);
          applyI18n(document);
          renderSettings(); renderSession(); await renderPrompt();
        }
      };
    });
  }
}

async function planAction() {
  if (els.planAction.dataset.action === 'upgrade') { openUpgrade(); return; }
  // cancel Pro (demo)
  const r = await sendMessage({ type: 'SET_SETTINGS', settings: { plan: 'free' } });
  if (r.ok) { settings = r.settings; renderSettings(); renderSession(); }
}

// ---------- upgrade / pro badge ----------

async function proBadgeUpdate() { els.proBadge.hidden = !isPro(); els.dashboardBtn.hidden = !isPro(); }

// ---------- paste onboarding ----------

async function onPasteChoice(value) {
  const r = await sendMessage({ type: 'SET_SETTINGS', settings: { onboarded: true, pasteMode: value } });
  if (r.ok) {
    settings = r.settings;
    const s = await sendMessage({ type: 'GET_STATE' });
    if (s.ok) { state = s.payload; showPanel('session'); renderSession(); }
  }
}

// ---------- wire ----------

function wire() {
  els.primaryBtn.addEventListener('click', primaryClick);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.historyBtn.addEventListener('click', openHistory);
  els.historyBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.historyClear.addEventListener('click', clearHistoryAction);

  els.openUpgrade.addEventListener('click', openUpgrade);
  els.upgradeBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.tryPro.addEventListener('click', startProOnboarding);
  els.proOnboardNext.addEventListener('click', proOnboardNext);

  document.querySelectorAll('#onboarding-panel .wc__choice').forEach((btn) => {
    btn.addEventListener('click', () => onPasteChoice(btn.dataset.value));
  });
  document.querySelectorAll('#lang-choices .wc__choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      onboardDraft.language = btn.dataset.lang;
      setLang(onboardDraft.language);
      applyI18n(document);
      markLangChoice(document.querySelectorAll('#lang-choices .wc__choice'), onboardDraft.language);
    });
  });

  els.onboardGoal.addEventListener('input', () => { els.onboardGoalError.hidden = true; });

  // Settings actions
  els.editGoal.addEventListener('click', toggleGoalEditor);
  els.saveGoal.addEventListener('click', saveGoal);
  els.goalInput.addEventListener('input', () => { els.goalError.hidden = true; });
  els.editThemes.addEventListener('click', toggleThemesEditor);
  els.togglePaste.addEventListener('click', togglePasteEditor);
  els.editLanguage.addEventListener('click', toggleLanguageEditor);
  els.planAction.addEventListener('click', planAction);
  els.promptEditThemes.addEventListener('click', () => { openSettings(); toggleThemesEditor(); });

  // Dashboard
  els.dashboardBtn.addEventListener('click', () => sendMessage({ type: 'OPEN_DASHBOARD' }));

  // Prompt "Another"
  els.promptAnother.addEventListener('click', async () => {
    const r = await sendMessage({ type: 'ANOTHER_PROMPT' });
    if (r.ok) { promptState = r.prompt; if (promptState?.text) els.promptText.textContent = promptState.text; }
  });

  // Live state updates
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'STATE_UPDATE' && msg.payload) {
        state = msg.payload;
        if (els.session.hidden === false) renderSession();
      }
    });
  } catch (_e) { /* preview */ }
}

async function boot() {
  wire();

  // Load everything in one round-trip
  const r = await sendMessage({ type: 'GET_ALL' });
  if (r.ok) {
    state = r.payload;
    settings = r.settings;
  } else {
    // Preview fallback
    state = { active: false, typedWords: 0, pastedWords: 0, totalWords: 0, sessionGoal: 0, pasteMode: 'separate', onboarded: true, plan: 'free', language: null, lastResult: null };
    settings = { onboarded: true, plan: 'free', pasteMode: 'separate', wordGoal: 250, themes: [], language: null, profile: {} };
  }

  // Language: profile override → auto-detect
  const activeLang = settings.language || detectDefault();
  setLang(activeLang);
  applyI18n(document);

  // First-run: paste-mode onboarding
  if (!settings.onboarded) { showPanel('onboarding'); return; }

  await proBadgeUpdate();
  await renderPrompt();
  showPanel('session');
  renderSession();
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('unload', stopDurationTicker);
