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
  firstlaunch:   $('firstlaunch-panel'),
  promptPanel:   $('prompt-panel'),
  session:       $('session-panel'),
  progress:      $('progress-panel'),
  upgradeCta:    $('upgrade-cta'),
  upgrade:       $('upgrade-panel'),
  proOnboard:    $('pro-onboarding'),
  history:       $('history-panel'),
  settings:      $('settings-panel'),
  feedback:      $('feedback-panel'),

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
  memoryCard:   $('memory-card'),
  memoryPromptCopy:$('memory-prompt-copy'),
  memoryStatus: $('memory-status'),
  memoryActions:$('memory-actions'),
  memorySave:   $('memory-save'),
  memoryDontSave:$('memory-dont-save'),
  memoryAlwaysSave:$('memory-always-save'),
  streakChip:   $('streak-chip'),
  streakText:   $('streak-text'),
  openProgress: $('open-progress'),
  progressBack: $('progress-back'),
  progStreak:   $('progress-streak'),
  progStreakText: $('progress-streak-text'),
  progTabs:     $('progress-tabs'),
  progPrimary:  $('prog-primary'),
  progPrimarySub:$('prog-primary-sub'),
  progSessions: $('prog-sessions'),
  progProgress: $('prog-progress'),
  progChartCard:$('prog-chart-card'),
  progChart:    $('prog-chart'),
  progChartEmpty:$('prog-chart-empty'),
  progPaywall:  $('prog-paywall'),
  progUpgrade:  $('prog-upgrade'),
  progHistory:  $('prog-history'),

  // prompt
  promptEyebrow:$('prompt-eyebrow'),
  promptText:   $('prompt-text'),
  promptGoal:   $('prompt-goal'),
  promptEmpty:  $('prompt-empty'),
  promptAnother:$('prompt-another'),
  promptEditThemes: $('prompt-edit-themes'),
  promptAiCard: $('prompt-ai-card'),
  promptAiTitle:$('prompt-ai-title'),
  promptAiSuggestion:$('prompt-ai-suggestion'),
  promptAiReason:$('prompt-ai-reason'),
  promptAiWhy:  $('prompt-ai-why'),
  promptAiTopics:$('prompt-ai-topics'),
  promptAiStatus:$('prompt-ai-status'),
  promptAiFeedback:$('prompt-ai-feedback'),
  promptAiUp:   $('prompt-ai-up'),
  promptAiDown: $('prompt-ai-down'),
  promptAiReasons:$('prompt-ai-reasons'),
  promptAiThanks:$('prompt-ai-thanks'),

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
  stepAI:          $('pro-step-ai'),
  stepDone:        $('pro-step-done'),
  onboardAIGoal:   $('onboard-ai-goal'),
  onboardAIAudience:$('onboard-ai-audience'),
  onboardAIProjects:$('onboard-ai-projects'),
  onboardAIAvoid:  $('onboard-ai-avoid'),
  onboardAISkip:   $('onboard-ai-skip'),

  // history
  historyList:   $('history-list'),
  historyEmpty:  $('history-empty'),
  historyActions:$('history-actions'),
  historyLimit:  $('history-limit'),
  historyUpgrade:$('history-upgrade'),
  historyExport: $('history-export'),
  historyImport: $('history-import'),
  historyFile:   $('history-file'),
  historySummary:$('history-summary'),
  historyBack:   $('history-back'),
  historyClear:  $('history-clear'),

  // feedback
  feedbackBack:  $('feedback-back'),
  feedbackTypes: $('feedback-types'),
  feedbackMessage:$('feedback-message'),
  feedbackError: $('feedback-error'),
  feedbackSend:  $('feedback-send'),

  // dialogs
  dialogBackdrop:$('dialog-backdrop'),
  dialogImport:  $('dialog-import'),
  importSummary: $('import-summary'),
  importError:   $('import-error'),
  importCancel:  $('import-cancel'),
  importContinue:$('import-continue'),
  dialogConfirm: $('dialog-confirm'),
  confirmTitle:  $('confirm-title'),
  confirmBody:   $('confirm-body'),
  confirmCancel: $('confirm-cancel'),
  confirmOk:     $('confirm-ok'),

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
  historyMeta:   $('history-meta'),
  historyProBadge:$('history-pro-badge'),
  settingsOpenHistory: $('settings-open-history'),
  openFeedback:  $('open-feedback'),
  languageMeta:  $('language-meta'),
  editLanguage:  $('edit-language'),
  languageEditor:$('language-editor'),
  planMeta:      $('plan-meta'),
  planAction:    $('plan-action'),
  accountMeta:   $('account-meta'),
  accountAction: $('account-action'),
  accountEditor: $('account-editor'),
  accountEmail:  $('account-email'),
  accountPassword:$('account-password'),
  accountError:  $('account-error'),
  accountSignIn: $('account-sign-in'),
  accountCreate: $('account-create'),
  aiSettingsGroup:$('ai-settings-group'),
  aiProfileMeta:$('ai-profile-meta'),
  aiProfileAction:$('ai-profile-action'),
  aiMemoryMeta:$('ai-memory-meta'),
  aiMemoryManage:$('ai-memory-manage'),
  aiMemoryEditor:$('ai-memory-editor'),
  memoryAlwaysToggle:$('memory-always-toggle'),
  memoryClaimQueue:$('memory-claim-queue'),
  memorySyncQueue:$('memory-sync-queue'),
  memoryDeleteSynced:$('memory-delete-synced'),
  memoryManagerNote:$('memory-manager-note'),
  aiDocumentsMeta:$('ai-documents-meta'),
  aiDocumentsManage:$('ai-documents-manage'),
  aiDocumentsEditor:$('ai-documents-editor'),
  documentFile:$('document-file'),
  documentTitle:$('document-title'),
  documentType:$('document-type'),
  documentUpload:$('document-upload'),
  documentError:$('document-error'),
  documentUploadStatus:$('document-upload-status'),
  documentList:$('document-list'),
  documentEmpty:$('document-empty'),
  settingsPrivacy:$('settings-privacy'),
};

let state = null;      // popup payload
let settings = null;   // full settings from background
let account = { authenticated: false, aiAccess: false, profileSyncEnabled: false, online: true };
let memoryQueue = { total: 0, unclaimed: 0, pending: 0, synced: 0, full: false };
let memoryDisplayStatus = null;
let documents = [];
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
  els.firstlaunch.hidden = name !== 'firstlaunch';
  els.promptPanel.hidden = !(name === 'session' && isPro() && !state?.active);
  els.session.hidden    = name !== 'session';
  els.progress.hidden   = name !== 'progress';
  els.upgradeCta.hidden = !(name === 'session' && !isPro());
  els.upgrade.hidden    = name !== 'upgrade';
  els.proOnboard.hidden = name !== 'proOnboard';
  els.history.hidden    = name !== 'history';
  els.settings.hidden   = name !== 'settings';
  els.feedback.hidden   = name !== 'feedback';
  // The Progress view needs more room — widen the popup only for it.
  document.body.classList.toggle('wc--wide', name === 'progress');
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
  renderStreak();

  const { active, startedAt, typedWords, sessionGoal, lastResult } = state;

  if (active) {
    setStatus('active');
    renderCount(typedWords);
    renderGoal(typedWords, sessionGoal);
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(Date.now() - (startedAt || Date.now()));
    els.primaryBtn.textContent = t('session.stop');
    els.primaryBtn.dataset.variant = 'danger';
    els.helperText.textContent = t('session.helperActive');
    startDurationTicker();
  } else if (lastResult) {
    setStatus('done');
    renderCount(lastResult.typedWords);
    renderGoal(lastResult.typedWords, lastResult.sessionGoal || 0);
    els.durationRow.hidden = false;
    els.durationValue.textContent = fmtDuration(Math.max(0, (lastResult.endedAt || 0) - (lastResult.startedAt || 0)));
    els.primaryBtn.textContent = t('session.new');
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = t('session.helperDone');
    stopDurationTicker();
  } else {
    setStatus('idle');
    renderCount(0);
    renderGoal(0, isPro() ? (settings?.wordGoal || 0) : 0);
    els.durationRow.hidden = true;
    els.primaryBtn.textContent = t('session.start');
    els.primaryBtn.dataset.variant = '';
    els.helperText.textContent = t('session.helperIdle');
    stopDurationTicker();
  }
  renderMemoryPrompt();
}

function renderMemoryPrompt() {
  const last = state && state.lastResult;
  const handled = last && settings.aiMemoryLastHandledSession === last.startedAt;
  const shouldShow = !!last && !state.active && (!handled || memoryDisplayStatus);
  els.memoryCard.hidden = !shouldShow;
  if (!shouldShow) return;
  const canSync = account.authenticated && account.aiAccess && account.online;
  els.memoryPromptCopy.textContent = canSync ? t('memory.prompt.bodySignedIn') : t('memory.prompt.bodyLater');
  els.memoryActions.hidden = !!memoryDisplayStatus;
  els.memoryStatus.hidden = !memoryDisplayStatus;
  if (memoryDisplayStatus) els.memoryStatus.textContent = t(memoryDisplayStatus);
}

function memoryErrorKey(error) {
  const known = ['no_editor', 'empty_writing', 'queue_full', 'writing_too_large'];
  return known.includes(error) ? `memory.error.${error}` : 'memory.error.generic';
}

async function saveSessionMemory(always = false) {
  els.memorySave.disabled = true;
  els.memoryAlwaysSave.disabled = true;
  els.memoryStatus.hidden = false;
  els.memoryStatus.textContent = t('memory.prompt.saving');
  const result = await sendMessage({ type: 'SAVE_SESSION_TO_AI_MEMORY', always });
  els.memorySave.disabled = false;
  els.memoryAlwaysSave.disabled = false;
  if (!result.ok) {
    els.memoryStatus.textContent = t(memoryErrorKey(result.error));
    return;
  }
  settings = result.settings || settings;
  memoryQueue = result.queue || memoryQueue;
  memoryDisplayStatus = result.saveStatus === 'synced' ? 'memory.prompt.savedSynced' : 'memory.prompt.savedQueued';
  renderSession();
}

async function dismissSessionMemory() {
  const result = await sendMessage({ type: 'DISMISS_AI_MEMORY' });
  if (result.ok) settings = result.settings;
  memoryDisplayStatus = null;
  renderSession();
}

function confirmAlwaysSave() {
  showConfirm(
    t('memory.always.confirmTitle'),
    t('memory.always.confirmBody'),
    t('memory.always.confirmAction'),
    async () => { closeDialogs(); await saveSessionMemory(true); },
    'primary',
  );
}

// Only typed words are ever shown; pasted text never counts.
function renderCount(typed) {
  els.countNumber.textContent = fmtNumber(typed);
  els.countLabel.textContent = typed === 1 ? t('session.wordTyped') : t('session.wordsTyped');
  els.countSub.hidden = true;
}

let streakValue = 0;
function renderStreak() {
  if (!els.streakChip) return;
  if (streakValue > 0) {
    els.streakChip.hidden = false;
    els.streakText.textContent = t(streakValue === 1 ? 'streak.day' : 'streak.days', { n: fmtNumber(streakValue) });
  } else {
    els.streakChip.hidden = true;
  }
}
async function refreshStreak() {
  const r = await sendMessage({ type: 'GET_STREAK' });
  streakValue = r.ok ? (r.streak || 0) : 0;
  renderStreak();
}

// ---------- progress (in-popup) ----------

const PROG_DOW = ['day.mon','day.tue','day.wed','day.thu','day.fri','day.sat','day.sun'];
const PROG_MON = ['month.jan','month.feb','month.mar','month.apr','month.may','month.jun','month.jul','month.aug','month.sep','month.oct','month.nov','month.dec'];
let progRange = 'today';

function markProgTab() {
  els.progTabs.querySelectorAll('.wc__range-tab').forEach((b) =>
    b.setAttribute('aria-selected', b.dataset.range === progRange ? 'true' : 'false'));
}

function renderProgChart(buckets, range) {
  els.progChart.innerHTML = '';
  const hasAny = buckets.some((b) => b.words > 0);
  els.progChartEmpty.hidden = hasAny || range === 'today';
  els.progChart.setAttribute('data-cols', range === 'week' ? '7' : range === 'year' ? '12' : range === 'today' ? '1' : String(buckets.length));
  const max = Math.max(1, ...buckets.map((b) => b.words));
  buckets.forEach((b) => {
    const wrap = document.createElement('div'); wrap.className = 'wc__prog-bar';
    const bar = document.createElement('div'); bar.className = 'wc__prog-bar-fill';
    const pct = Math.max(0, Math.min(100, (b.words / max) * 100));
    bar.style.height = b.words === 0 ? '3px' : `${Math.max(6, pct)}%`;
    bar.setAttribute('title', `${fmtNumber(b.words)} — ${b.label}`);
    wrap.appendChild(bar);
    const label = document.createElement('span'); label.className = 'wc__prog-bar-label';
    if (range === 'week') label.textContent = t(PROG_DOW[b.dow || 0]);
    else if (range === 'year') label.textContent = t(PROG_MON[b.month || 0]);
    else if (range === 'month') label.textContent = String(b.dayOfMonth);
    else label.textContent = '';
    wrap.appendChild(label);
    els.progChart.appendChild(wrap);
  });
}

async function loadProgress(range) {
  progRange = range;
  markProgTab();
  const r = await sendMessage({ type: 'GET_STATS', range });
  if (!r.ok) return;
  const s = r.stats;
  els.progPrimary.textContent = fmtNumber(s.totalWords);
  els.progPrimarySub.textContent = t(`dash.primarySub.${range}`);
  els.progSessions.textContent = fmtNumber(s.sessionCount);
  if (range === 'today' && isPro() && (settings?.wordGoal || 0) > 0) {
    const goal = settings.wordGoal;
    const pct = Math.min(999, Math.round((s.totalWords / goal) * 100));
    els.progProgress.textContent = `${t('dash.goal')} ${fmtNumber(goal)} · ${pct}%`;
  } else {
    els.progProgress.textContent = '';
  }
  if (isPro()) renderProgChart(s.buckets, range);
}

async function openProgress() {
  const pro = isPro();
  // Free users: keep it to today's own activity + a tasteful upgrade nudge.
  els.progTabs.hidden = !pro;
  els.progChartCard.hidden = !pro;
  els.progPaywall.hidden = pro;
  streakValue = streakValue; // keep
  const sr = await sendMessage({ type: 'GET_STREAK' });
  const streak = sr.ok ? (sr.streak || 0) : 0;
  if (streak > 0) {
    els.progStreak.hidden = false;
    els.progStreakText.textContent = t(streak === 1 ? 'streak.day' : 'streak.days', { n: fmtNumber(streak) });
  } else {
    els.progStreak.hidden = true;
  }
  showPanel('progress');
  await loadProgress('today');
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

let aiSuggestion = null;
let aiMode = false;

/**
 * Single Phase-13 seam: decide whether to fetch a personalized AI suggestion
 * or fall back to the static prompt library, based on auth + entitlement +
 * connectivity. Returns { mode, suggestion?, prompt?, statusKey? }.
 *  - mode="ai"     → suggestion object from /api/ai/suggestion
 *  - mode="static" → prompt object from GET_PROMPT (statusKey optional; only
 *                    set when the fall-through is unexpected — e.g. 5xx,
 *                    timeout, rate-limit — so authenticated free users and
 *                    signed-out users see the plain static path silently)
 */
async function getNextPrompt({ draft = '', project = '' } = {}) {
  const staticPromise = sendMessage({ type: 'GET_PROMPT' });
  const canUseAI = !!account.authenticated && !!account.aiAccess && account.online !== false;
  if (!canUseAI) {
    const staticResp = await staticPromise;
    return { mode: 'static', prompt: staticResp.ok ? staticResp.prompt : null };
  }
  const aiResp = await sendMessage({ type: 'GET_AI_SUGGESTION', currentWriting: draft, currentProject: project });
  if (aiResp.ok && aiResp.suggestion) {
    return { mode: 'ai', suggestion: aiResp.suggestion };
  }
  const staticResp = await staticPromise;
  // Silent fallback for expected states; visible only when something actually broke.
  const noisy = new Set(['offline', 'rate_limited', 'request_failed']);
  const statusKey = noisy.has(aiResp.reason) ? 'prompt.ai.error' : null;
  return { mode: 'static', prompt: staticResp.ok ? staticResp.prompt : null, statusKey };
}

function resetFeedbackUI() {
  els.promptAiUp.setAttribute('aria-pressed', 'false');
  els.promptAiDown.setAttribute('aria-pressed', 'false');
  els.promptAiUp.disabled = false;
  els.promptAiDown.disabled = false;
  els.promptAiReasons.hidden = true;
  els.promptAiThanks.hidden = true;
  els.promptAiThanks.textContent = '';
  els.promptAiReasons.querySelectorAll('.wc__chip').forEach((chip) => {
    chip.disabled = false;
    chip.setAttribute('aria-pressed', 'false');
  });
}

function renderAISuggestion(sug) {
  aiSuggestion = sug;
  aiMode = true;
  els.promptEyebrow.setAttribute('data-i18n', 'prompt.ai.eyebrow');
  els.promptEyebrow.textContent = t('prompt.ai.eyebrow');
  els.promptText.hidden = true;
  els.promptAiCard.hidden = false;
  els.promptAiTitle.textContent = sug.title || '';
  els.promptAiSuggestion.textContent = sug.suggestion || '';
  els.promptAiReason.textContent = sug.reason || '';
  els.promptAiWhy.hidden = !sug.reason;
  els.promptAiTopics.innerHTML = '';
  (sug.related_topics || []).slice(0, 6).forEach((topic) => {
    const chip = document.createElement('span');
    chip.className = 'wc__prompt-ai-topic';
    chip.setAttribute('data-testid', 'prompt-ai-topic');
    chip.textContent = topic;
    els.promptAiTopics.appendChild(chip);
  });
  els.promptAnother.textContent = t('prompt.ai.another');
  els.promptGoal.hidden = false;
  els.promptGoal.textContent = t('prompt.yourGoal', { n: fmtNumber(settings?.wordGoal || 250) });
  els.promptEmpty.hidden = true;
  els.promptAiStatus.hidden = true;
  resetFeedbackUI();
}

async function submitAiFeedback({ helpful, reason = null }) {
  if (!aiSuggestion || !aiSuggestion.id) return;
  els.promptAiUp.disabled = true;
  els.promptAiDown.disabled = true;
  els.promptAiReasons.querySelectorAll('.wc__chip').forEach((c) => { c.disabled = true; });
  const result = await sendMessage({
    type: 'SEND_AI_FEEDBACK',
    suggestionId: aiSuggestion.id,
    helpful,
    reason,
  });
  if (!result.ok) {
    els.promptAiThanks.hidden = false;
    els.promptAiThanks.textContent = t('prompt.ai.thanks.error');
    els.promptAiUp.disabled = false;
    els.promptAiDown.disabled = false;
    els.promptAiReasons.querySelectorAll('.wc__chip').forEach((c) => { c.disabled = false; });
    return;
  }
  els.promptAiReasons.hidden = true;
  els.promptAiThanks.hidden = false;
  els.promptAiThanks.textContent = t(helpful ? 'prompt.ai.thanks.up' : 'prompt.ai.thanks.down');
}

function onAiThumbUp() {
  if (!aiSuggestion) return;
  els.promptAiUp.setAttribute('aria-pressed', 'true');
  els.promptAiDown.setAttribute('aria-pressed', 'false');
  els.promptAiReasons.hidden = true;
  submitAiFeedback({ helpful: true });
}

function onAiThumbDown() {
  if (!aiSuggestion) return;
  els.promptAiDown.setAttribute('aria-pressed', 'true');
  els.promptAiUp.setAttribute('aria-pressed', 'false');
  els.promptAiReasons.hidden = false;
  els.promptAiThanks.hidden = true;
}

function onAiReasonPick(reason, button) {
  els.promptAiReasons.querySelectorAll('.wc__chip').forEach((c) => c.setAttribute('aria-pressed', c === button ? 'true' : 'false'));
  submitAiFeedback({ helpful: false, reason });
}

function renderStaticPrompt(prompt, statusKey = null) {
  aiMode = false;
  aiSuggestion = null;
  promptState = prompt || promptState;
  els.promptEyebrow.setAttribute('data-i18n', 'prompt.today');
  els.promptEyebrow.textContent = t('prompt.today');
  const hasPrompt = promptState && promptState.text;
  els.promptText.hidden = !hasPrompt;
  els.promptGoal.hidden = !hasPrompt;
  els.promptEmpty.hidden = hasPrompt;
  els.promptAiCard.hidden = true;
  els.promptAnother.textContent = t('prompt.another');
  if (hasPrompt) {
    els.promptText.textContent = promptState.text;
    els.promptGoal.textContent = t('prompt.yourGoal', { n: fmtNumber(settings?.wordGoal || 250) });
  }
  if (statusKey) {
    els.promptAiStatus.hidden = false;
    els.promptAiStatus.textContent = t(statusKey);
  } else {
    els.promptAiStatus.hidden = true;
  }
}

async function renderPrompt() {
  if (!isPro()) return;
  const canUseAI = !!account.authenticated && !!account.aiAccess && account.online !== false;
  if (canUseAI) {
    els.promptAiStatus.hidden = false;
    els.promptAiStatus.textContent = t('prompt.ai.loading');
  }
  const result = await getNextPrompt();
  if (result.mode === 'ai') {
    renderAISuggestion(result.suggestion);
  } else {
    renderStaticPrompt(result.prompt, result.statusKey);
  }
}

// ---------- primary action ----------

async function primaryClick() {
  if (!state) return;
  const r = state.active
    ? await sendMessage({ type: 'STOP_SESSION' })
    : await sendMessage({ type: 'START_SESSION' });
  if (r.ok) {
    state = r.payload;
    if (r.settings) settings = r.settings;
    memoryDisplayStatus = r.memory?.saveStatus === 'synced'
      ? 'memory.prompt.savedSynced'
      : (r.memory?.saveStatus === 'queued' ? 'memory.prompt.savedQueued' : null);
    renderSession();
    refreshStreak();
  }
}

// ---------- upgrade / pro onboarding ----------

let onboardStep = 0; // 0=lang, 1=goal, 2=themes, 3=AI context, 4=done
let onboardDraft = { language: 'en', wordGoal: 250, themes: [], aiProfile: window.WCAIProfile.createDraft() };

function openUpgrade() { showPanel('upgrade'); }

function startProOnboarding() {
  onboardStep = 0;
  onboardDraft = {
    language: settings?.language || getLang(),
    wordGoal: settings?.wordGoal || 250,
    themes: (settings?.themes && settings.themes.length) ? [...settings.themes] : ['personal-experiences','memories','gratitude','ideas','everyday-life'],
    aiProfile: window.WCAIProfile.sanitizeDraft(settings?.aiProfileDraft || {}),
  };
  els.onboardGoal.value = onboardDraft.wordGoal;
  markLangChoice(document.querySelectorAll('#lang-choices .wc__choice'), onboardDraft.language);
  renderOnboardThemes();
  populateAIOnboarding();
  updateOnboardStepView();
  showPanel('proOnboard');
}

function updateOnboardStepView() {
  const aiAvailable = !!account.authenticated && !!account.aiAccess;
  const total = aiAvailable ? 5 : 4;
  const displayStep = !aiAvailable && onboardStep === 4 ? 4 : onboardStep + 1;
  els.stepLanguage.hidden = onboardStep !== 0;
  els.stepGoal.hidden     = onboardStep !== 1;
  els.stepThemes.hidden   = onboardStep !== 2;
  els.stepAI.hidden       = onboardStep !== 3 || !aiAvailable;
  els.stepDone.hidden     = onboardStep !== 4;
  els.proOnboardStep.textContent = t('onboard.step', { n: displayStep, total });
  els.proOnboardNext.textContent = onboardStep === 4 ? t('onboard.finish') : t('onboard.continue');
}

function populateAIOnboarding() {
  const draft = window.WCAIProfile.sanitizeDraft(onboardDraft.aiProfile || {});
  els.onboardAIGoal.value = draft.writingGoal;
  els.onboardAIAudience.value = draft.audience;
  els.onboardAIProjects.value = draft.currentProjects;
  els.onboardAIAvoid.value = draft.avoidTopics;
}

function captureAIOnboarding() {
  onboardDraft.aiProfile = window.WCAIProfile.sanitizeDraft({
    ...onboardDraft.aiProfile,
    writingGoal: els.onboardAIGoal.value,
    audience: els.onboardAIAudience.value,
    currentProjects: els.onboardAIProjects.value,
    avoidTopics: els.onboardAIAvoid.value,
    onboardingCompleted: true,
  }, Date.now());
}

function skipAIOnboarding() {
  // Keep a previous draft if one exists; skipping never erases user context.
  onboardDraft.aiProfile = window.WCAIProfile.sanitizeDraft({
    ...(settings?.aiProfileDraft || {}),
    onboardingCompleted: true,
  }, Date.now());
  onboardStep = 4;
  updateOnboardStepView();
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
    const aiAvailable = !!account.authenticated && !!account.aiAccess;
    onboardStep = aiAvailable ? 3 : 4;
    updateOnboardStepView();
    if (aiAvailable) els.onboardAIGoal.focus();
    return;
  }
  if (onboardStep === 3) {
    captureAIOnboarding();
    onboardStep = 4;
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
      aiProfileDraft: onboardDraft.aiProfile,
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
function totalWords(s) { return window.WCHistory.sessionWords(s); }

let historyPlan = 'free';
let historyHasMore = false;

function renderHistory(history) {
  els.historyList.innerHTML = '';
  const hasAny = Array.isArray(history) && history.length > 0;
  els.historyEmpty.hidden = hasAny;
  els.historyActions.hidden = !(hasAny && historyPlan === 'pro');
  // Free users who have older (hidden) sessions see the 24h notice + upgrade.
  els.historyLimit.hidden = !(historyPlan !== 'pro' && historyHasMore);

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
    if (s.sessionGoal) {
      const reached = totalWords(s) >= s.sessionGoal;
      bits.push(`${t('dash.goal')} ${fmtNumber(s.sessionGoal)}${reached ? ' ✓' : ''}`);
    }
    meta.textContent = bits.join(' · ');
    const count = document.createElement('div'); count.className = 'wc__history-count';
    const w = totalWords(s);
    count.innerHTML = `${fmtNumber(w)}<span class="wc__history-count-unit">${w === 1 ? t('session.word') : t('session.words')}</span>`;
    item.appendChild(time); item.appendChild(count); item.appendChild(meta);
    els.historyList.appendChild(item);
  });
}

async function openHistory() {
  const r = await sendMessage({ type: 'GET_HISTORY' });
  if (r.ok) { historyPlan = r.plan || 'free'; historyHasMore = !!r.hasMore; }
  renderHistory(r.ok ? r.history : []);
  showPanel('history');
}

// ---- dialogs ----
function openBackdrop(which) {
  els.dialogBackdrop.hidden = false;
  els.dialogImport.hidden = which !== 'import';
  els.dialogConfirm.hidden = which !== 'confirm';
}
function closeDialogs() {
  els.dialogBackdrop.hidden = true;
  els.dialogImport.hidden = true;
  els.dialogConfirm.hidden = true;
}
let confirmHandler = null;
function showConfirm(title, body, okLabel, onOk, variant = 'danger') {
  els.confirmTitle.textContent = title;
  els.confirmBody.textContent = body;
  els.confirmOk.textContent = okLabel;
  els.confirmCancel.style.display = '';
  els.confirmOk.classList.toggle('wc__btn--danger', variant === 'danger');
  els.confirmOk.classList.toggle('wc__btn--primary', variant === 'primary');
  confirmHandler = onOk;
  openBackdrop('confirm');
}

function clearHistoryAction() {
  showConfirm(t('clear.title'), t('clear.body'), t('clear.ok'), async () => {
    const r = await sendMessage({ type: 'CLEAR_HISTORY' });
    closeDialogs();
    if (r.ok) { historyHasMore = false; renderHistory(r.history || []); refreshStreak(); }
  });
}

// ---- CSV export ----
async function exportHistory() {
  const r = await sendMessage({ type: 'EXPORT_HISTORY' });
  if (!r.ok) return;
  const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `unoword-writing-history-${day}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- CSV import (merge / replace) ----
let importParsed = null;
let importMode = 'merge';

function triggerImport() { els.historyFile.value = ''; els.historyFile.click(); }

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const parsed = window.WCHistory.parseCSV(text);
  if (!parsed.ok && parsed.validCount === 0) {
    showConfirm(t('import.errTitle'), t('import.errBody'), t('dialog.ok'), () => closeDialogs());
    els.confirmCancel.style.display = 'none';
    return;
  }
  els.confirmCancel.style.display = '';
  importParsed = parsed;
  importMode = 'merge';
  els.importSummary.textContent = t('import.summary', {
    valid: fmtNumber(parsed.validCount),
    total: fmtNumber(parsed.total),
  }) + (parsed.invalidCount > 0 ? ' · ' + t('import.invalid', { n: fmtNumber(parsed.invalidCount) }) : '');
  els.importError.hidden = true;
  els.dialogImport.querySelectorAll('.wc__choice').forEach((b) => {
    b.setAttribute('aria-checked', b.dataset.mode === 'merge' ? 'true' : 'false');
  });
  openBackdrop('import');
}

async function doImport() {
  if (!importParsed) return;
  const records = importParsed.records;
  const finish = async (mode) => {
    const r = await sendMessage({ type: 'IMPORT_HISTORY', mode, records });
    closeDialogs();
    if (r.ok) { historyPlan = 'pro'; historyHasMore = false; renderHistory(r.history || []); refreshStreak(); }
  };
  if (importMode === 'replace') {
    showConfirm(t('replace.title'), t('replace.body'), t('replace.ok'), () => finish('replace'));
  } else {
    await finish('merge');
  }
}

// ---- feedback (mailto) ----
let feedbackType = '';
function openFeedback() {
  feedbackType = '';
  els.feedbackMessage.value = '';
  els.feedbackError.hidden = true;
  els.feedbackTypes.querySelectorAll('.wc__chip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  showPanel('feedback');
}
function sendFeedback() {
  const msg = (els.feedbackMessage.value || '').trim();
  if (!msg) { els.feedbackError.hidden = false; els.feedbackError.textContent = t('feedback.empty'); return; }
  const typeLabel = feedbackType ? t(`feedback.${feedbackType}`) : t('feedback.other');
  const subject = `UnoWord Feedback — ${typeLabel}`;
  let version = '';
  try { version = chrome.runtime.getManifest().version; } catch (_e) { /* preview */ }
  const bodyLines = [
    msg, '', '---',
    `Type: ${typeLabel}`,
    `Version: ${version}`,
    `Language: ${getLang()}`,
    `Plan: ${isPro() ? 'Pro' : 'Free'}`,
    `Browser: ${navigator.userAgent}`,
  ];
  const url = `mailto:unowordapp@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
  try { chrome.tabs.create({ url }); } catch (_e) { window.open(url, '_blank'); }
}

// ---------- settings ----------

async function openSettings() {
  renderSettings();
  showPanel('settings');
  const response = await sendMessage({ type: 'GET_ACCOUNT' });
  if (response.ok) account = response.account;
  await refreshMemoryQueueStatus();
  if (account.authenticated && account.aiAccess) await loadDocuments();
  renderSettings();
}

async function refreshMemoryQueueStatus() {
  const response = await sendMessage({ type: 'GET_MEMORY_QUEUE_STATUS' });
  if (response.ok) memoryQueue = response.queue;
}
function renderSettings() {
  // Writing group
  els.goalMeta.textContent = t('settings.goalMeta', { n: fmtNumber(settings.wordGoal || 250) });
  els.themesMeta.textContent = (settings.themes && settings.themes.length)
    ? settings.themes.map((s) => t(`theme.${s}`)).join(' · ')
    : t('settings.themesMetaEmpty');
  els.historyMeta.textContent = isPro() ? t('settings.historyMetaPro') : t('settings.historyMetaFree');
  els.settingsOpenHistory.textContent = isPro() ? t('settings.manage') : t('upgrade.cta.btn');
  els.languageMeta.textContent = (settings.language || getLang()) === 'es' ? 'Español' : 'English';
  els.planMeta.textContent = isPro() ? t('settings.planPro') : t('settings.planFree');
  els.planAction.textContent = isPro() ? t('settings.cancelPro') : t('settings.upgradeRow');
  els.planAction.dataset.action = isPro() ? 'cancel' : 'upgrade';

  const signedIn = !!account.authenticated;
  const aiAccess = signedIn && !!account.aiAccess;
  if (!signedIn) {
    els.accountMeta.textContent = t('account.signedOut');
    els.accountAction.textContent = t('account.signIn');
    els.accountAction.dataset.action = 'signin';
  } else {
    els.accountMeta.textContent = aiAccess
      ? t('account.signedIn', { email: account.email || '' })
      : t('account.planRequired', { email: account.email || '' });
    els.accountAction.textContent = t('account.signOut');
    els.accountAction.dataset.action = 'signout';
  }
  els.aiSettingsGroup.hidden = !aiAccess;
  if (aiAccess) {
    const statusKey = settings.aiProfileDraft?.syncStatus === 'synced'
      ? 'aiSettings.synced'
      : (settings.aiProfileDraft?.syncStatus === 'pending' ? 'aiSettings.pending' : 'aiSettings.local');
    els.aiProfileMeta.textContent = t(statusKey);
    els.aiProfileAction.textContent = account.profileSyncEnabled ? t('aiSettings.syncNow') : t('aiSettings.sync');
    els.aiMemoryMeta.textContent = t('memory.settings.summary', {
      pending: memoryQueue.pending,
      synced: memoryQueue.synced,
    }) + (memoryQueue.unclaimed ? ` · ${t('memory.settings.unclaimed', { n: memoryQueue.unclaimed })}` : '');
    els.memoryAlwaysToggle.textContent = settings.aiMemoryPreference === 'always'
      ? t('memory.settings.alwaysOff')
      : t('memory.settings.alwaysOn');
    els.memoryClaimQueue.hidden = memoryQueue.unclaimed === 0;
    els.memorySyncQueue.hidden = memoryQueue.pending === 0;
    els.memoryDeleteSynced.hidden = memoryQueue.synced === 0;
    els.memoryManagerNote.textContent = memoryQueue.full
      ? t('memory.settings.full')
      : t('memory.settings.encrypted', { n: memoryQueue.total });
    els.aiDocumentsMeta.textContent = t('documents.summary', { n: documents.length });
    renderDocuments();
  }
  els.settingsPrivacy.textContent = signedIn
    ? t('settings.privacySignedIn')
    : t('settings.privacy');

  // Pro badges visibility
  [els.historyProBadge, $('goal-pro-badge'), $('themes-pro-badge')].forEach((b) => { if (b) b.hidden = isPro(); });

  // Reset editors closed
  els.goalEditor.hidden = true;
  els.themesEditor.hidden = true;
  els.languageEditor.hidden = true;
  if (!aiAccess) els.aiMemoryEditor.hidden = true;
  if (!aiAccess) els.aiDocumentsEditor.hidden = true;
}

async function loadDocuments() {
  try {
    documents = await window.WCApi.get('/documents');
    els.documentError.hidden = true;
  } catch (error) {
    documents = [];
    els.documentError.hidden = false;
    els.documentError.textContent = documentErrorMessage(error);
  }
}

function documentErrorMessage(error) {
  const detail = error && error.body && error.body.detail;
  if (typeof detail === 'string' && detail !== 'offline') return detail;
  return detail === 'offline' ? t('documents.error.offline') : t('documents.error.generic');
}

function renderDocuments() {
  if (!els.documentList) return;
  els.documentList.innerHTML = '';
  els.documentEmpty.hidden = documents.length > 0;
  documents.forEach((doc) => {
    const item = window.document.createElement('article');
    item.className = 'wc__document-item';
    item.setAttribute('data-testid', `document-item-${doc.id}`);
    const main = window.document.createElement('div');
    main.className = 'wc__document-main';
    const title = window.document.createElement('p');
    title.className = 'wc__document-title';
    title.textContent = doc.document_title;
    title.setAttribute('data-testid', `document-title-${doc.id}`);
    const meta = window.document.createElement('p');
    meta.className = 'wc__document-meta';
    const statusLabel = t(`documents.status.${doc.processing_status}`);
    meta.textContent = `${statusLabel} · ${t('documents.words', { n: fmtNumber(doc.word_count) })}`;
    meta.setAttribute('data-testid', `document-meta-${doc.id}`);
    main.appendChild(title);
    main.appendChild(meta);
    if (doc.processing_error) {
      const error = window.document.createElement('p');
      error.className = 'wc__error';
      error.textContent = doc.processing_error;
      error.setAttribute('data-testid', `document-processing-error-${doc.id}`);
      main.appendChild(error);
    }
    const remove = window.document.createElement('button');
    remove.className = 'wc__link-btn wc__link-btn--danger';
    remove.type = 'button';
    remove.textContent = t('documents.delete');
    remove.setAttribute('data-testid', `document-delete-${doc.id}`);
    remove.addEventListener('click', () => confirmDeleteDocument(doc));
    item.appendChild(main);
    item.appendChild(remove);
    els.documentList.appendChild(item);
  });
}

function toggleDocumentsManager() {
  els.aiDocumentsEditor.hidden = !els.aiDocumentsEditor.hidden;
  if (!els.aiDocumentsEditor.hidden) renderDocuments();
}

function onDocumentFileSelected() {
  const file = els.documentFile.files && els.documentFile.files[0];
  if (!file) return;
  if (!els.documentTitle.value.trim()) els.documentTitle.value = file.name.replace(/\.[^.]+$/, '');
  els.documentError.hidden = true;
}

async function uploadDocument() {
  const file = els.documentFile.files && els.documentFile.files[0];
  const title = els.documentTitle.value.trim();
  if (!file || !title) {
    els.documentError.hidden = false;
    els.documentError.textContent = t('documents.error.required');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    els.documentError.hidden = false;
    els.documentError.textContent = t('documents.error.tooLarge');
    return;
  }
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['txt', 'md', 'markdown', 'pdf', 'docx'].includes(extension)) {
    els.documentError.hidden = false;
    els.documentError.textContent = t('documents.error.format');
    return;
  }
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('document_title', title);
  form.append('document_type', els.documentType.value);
  els.documentUpload.disabled = true;
  els.documentError.hidden = true;
  els.documentUploadStatus.hidden = false;
  els.documentUploadStatus.textContent = t('documents.processing');
  try {
    const saved = await window.WCApi.upload('/documents/upload', form);
    documents = [saved, ...documents.filter((document) => document.id !== saved.id)];
    els.documentFile.value = '';
    els.documentTitle.value = '';
    els.documentType.value = 'other';
    els.documentUploadStatus.textContent = t('documents.uploaded');
    renderSettings();
    els.aiDocumentsEditor.hidden = false;
  } catch (error) {
    els.documentUploadStatus.hidden = true;
    els.documentError.hidden = false;
    els.documentError.textContent = documentErrorMessage(error);
  } finally {
    els.documentUpload.disabled = false;
  }
}

function confirmDeleteDocument(document) {
  showConfirm(
    t('documents.deleteTitle'),
    t('documents.deleteBody', { title: document.document_title }),
    t('documents.deleteAction'),
    () => deleteDocument(document.id),
  );
}

async function deleteDocument(documentId) {
  els.confirmOk.disabled = true;
  try {
    await window.WCApi.delete(`/documents/${documentId}`);
    documents = documents.filter((document) => document.id !== documentId);
    closeDialogs();
    renderSettings();
    els.aiDocumentsEditor.hidden = false;
  } catch (error) {
    closeDialogs();
    els.documentError.hidden = false;
    els.documentError.textContent = documentErrorMessage(error);
  } finally {
    els.confirmOk.disabled = false;
  }
}

function toggleAccountEditor() {
  els.accountEditor.hidden = !els.accountEditor.hidden;
  if (!els.accountEditor.hidden) {
    els.accountError.hidden = true;
    els.accountEmail.focus();
  }
}

async function submitAccount(mode) {
  const email = (els.accountEmail.value || '').trim();
  const password = els.accountPassword.value || '';
  if (!email || password.length < 8) {
    els.accountError.hidden = false;
    els.accountError.textContent = t('account.invalidForm');
    return;
  }
  els.accountError.hidden = true;
  els.accountSignIn.disabled = true;
  els.accountCreate.disabled = true;
  const result = await sendMessage({ type: 'AUTH_ACCOUNT', mode, email, password });
  els.accountSignIn.disabled = false;
  els.accountCreate.disabled = false;
  if (!result.ok) {
    els.accountError.hidden = false;
    els.accountError.textContent = t(`account.error.${result.error || 'request_failed'}`);
    return;
  }
  account = result.account;
  els.accountPassword.value = '';
  if (!account.authenticated) {
    els.accountError.hidden = false;
    els.accountError.textContent = t('account.checkEmail');
    renderSettings();
    return;
  }
  els.accountEditor.hidden = true;
  const refreshed = await sendMessage({ type: 'GET_ACCOUNT' });
  if (refreshed.ok) account = refreshed.account;
  await refreshMemoryQueueStatus();
  renderSettings();
  if (account.aiAccess && memoryQueue.unclaimed > 0) {
    requestMemoryClaim();
  } else if (account.aiAccess && window.WCAIProfile.hasPersonalization(settings.aiProfileDraft) && !account.profileSyncEnabled) {
    requestProfileSync();
  }
}

function requestMemoryClaim() {
  showConfirm(
    t('memory.claim.title'),
    t('memory.claim.body', { n: memoryQueue.unclaimed }),
    t('memory.claim.action'),
    claimMemoryQueue,
    'primary',
  );
}

async function claimMemoryQueue() {
  els.confirmOk.disabled = true;
  const result = await sendMessage({ type: 'CLAIM_MEMORY_QUEUE' });
  els.confirmOk.disabled = false;
  closeDialogs();
  if (result.ok) { memoryQueue = result.status; renderSettings(); }
}

function toggleMemoryManager() {
  els.aiMemoryEditor.hidden = !els.aiMemoryEditor.hidden;
}

async function setAlwaysMemoryPreference(preference) {
  const result = await sendMessage({ type: 'SET_AI_MEMORY_PREFERENCE', preference });
  if (result.ok) { settings = result.settings; renderSettings(); els.aiMemoryEditor.hidden = false; }
}

function toggleAlwaysMemory() {
  if (settings.aiMemoryPreference === 'always') { setAlwaysMemoryPreference('ask'); return; }
  showConfirm(
    t('memory.always.confirmTitle'),
    t('memory.always.confirmBody'),
    t('memory.always.confirmAction'),
    async () => { closeDialogs(); await setAlwaysMemoryPreference('always'); },
    'primary',
  );
}

async function syncMemoryQueue() {
  els.memoryManagerNote.textContent = t('memory.settings.syncing');
  const result = await sendMessage({ type: 'SYNC_MEMORY_QUEUE' });
  if (result.ok) memoryQueue = result.status;
  else els.memoryManagerNote.textContent = t('memory.error.generic');
  renderSettings();
  els.aiMemoryEditor.hidden = false;
}

function confirmDeleteSyncedMemory() {
  showConfirm(
    t('memory.delete.title'),
    t('memory.delete.body'),
    t('memory.delete.action'),
    deleteSyncedMemory,
  );
}

async function deleteSyncedMemory() {
  const result = await sendMessage({ type: 'DELETE_SYNCED_MEMORY_QUEUE' });
  closeDialogs();
  if (result.ok) { memoryQueue = result.queue; renderSettings(); els.aiMemoryEditor.hidden = false; }
}

async function accountAction() {
  if (els.accountAction.dataset.action === 'signin') { toggleAccountEditor(); return; }
  const result = await sendMessage({ type: 'LOGOUT_ACCOUNT' });
  if (result.ok) {
    account = result.account;
    els.accountEditor.hidden = true;
    renderSettings();
  }
}

function requestProfileSync() {
  showConfirm(
    t('aiSettings.confirmTitle'),
    t('aiSettings.confirmBody'),
    t('aiSettings.confirmAction'),
    syncAIProfile,
    'primary',
  );
}

async function syncAIProfile() {
  els.confirmOk.disabled = true;
  const result = await sendMessage({ type: 'SYNC_AI_PROFILE', enableAutoSync: true });
  els.confirmOk.disabled = false;
  closeDialogs();
  if (!result.ok) {
    els.accountError.hidden = false;
    els.accountError.textContent = t(`account.error.${result.error || 'request_failed'}`);
    els.accountEditor.hidden = false;
    return;
  }
  account = result.account;
  settings.aiProfileDraft = result.profile;
  renderSettings();
}

function aiProfileAction() {
  if (account.profileSyncEnabled) syncAIProfile();
  else requestProfileSync();
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

// ---------- first-launch language ----------

async function onFirstLangChoice(lang) {
  const r = await sendMessage({ type: 'SET_SETTINGS', settings: { langChosen: true, language: lang } });
  if (r.ok) {
    settings = r.settings;
    setLang(lang);
    applyI18n(document);
    const s = await sendMessage({ type: 'GET_STATE' });
    if (s.ok) state = s.payload;
    await proBadgeUpdate();
    await renderPrompt();
    await refreshStreak();
    showPanel('session');
    renderSession();
  }
}

// ---------- wire ----------

function wire() {
  els.primaryBtn.addEventListener('click', primaryClick);
  els.memorySave.addEventListener('click', () => saveSessionMemory(false));
  els.memoryDontSave.addEventListener('click', dismissSessionMemory);
  els.memoryAlwaysSave.addEventListener('click', confirmAlwaysSave);
  els.settingsBtn.addEventListener('click', openSettings);
  els.settingsBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.historyBtn.addEventListener('click', openHistory);
  els.historyBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.historyClear.addEventListener('click', clearHistoryAction);
  els.historyExport.addEventListener('click', exportHistory);
  els.historyImport.addEventListener('click', triggerImport);
  els.historyFile.addEventListener('change', onImportFile);
  els.historyUpgrade.addEventListener('click', openUpgrade);

  // Progress (in-popup)
  els.openProgress.addEventListener('click', openProgress);
  els.dashboardBtn.addEventListener('click', openProgress);
  els.progressBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.progUpgrade.addEventListener('click', openUpgrade);
  els.progHistory.addEventListener('click', openHistory);
  els.progTabs.querySelectorAll('.wc__range-tab').forEach((b) => {
    b.addEventListener('click', () => loadProgress(b.dataset.range));
  });

  els.openUpgrade.addEventListener('click', openUpgrade);
  els.upgradeBack.addEventListener('click', () => { showPanel('session'); renderSession(); });
  els.tryPro.addEventListener('click', startProOnboarding);
  els.proOnboardNext.addEventListener('click', proOnboardNext);
  els.onboardAISkip.addEventListener('click', skipAIOnboarding);

  // First-launch language selection
  document.querySelectorAll('#first-lang-choices .wc__choice').forEach((btn) => {
    btn.addEventListener('click', () => onFirstLangChoice(btn.dataset.lang));
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
  els.editLanguage.addEventListener('click', toggleLanguageEditor);
  els.planAction.addEventListener('click', planAction);
  els.accountAction.addEventListener('click', accountAction);
  els.accountSignIn.addEventListener('click', () => submitAccount('login'));
  els.accountCreate.addEventListener('click', () => submitAccount('signup'));
  els.aiProfileAction.addEventListener('click', aiProfileAction);
  els.aiMemoryManage.addEventListener('click', toggleMemoryManager);
  els.memoryAlwaysToggle.addEventListener('click', toggleAlwaysMemory);
  els.memoryClaimQueue.addEventListener('click', requestMemoryClaim);
  els.memorySyncQueue.addEventListener('click', syncMemoryQueue);
  els.memoryDeleteSynced.addEventListener('click', confirmDeleteSyncedMemory);
  els.aiDocumentsManage.addEventListener('click', toggleDocumentsManager);
  els.documentFile.addEventListener('change', onDocumentFileSelected);
  els.documentUpload.addEventListener('click', uploadDocument);
  els.promptEditThemes.addEventListener('click', () => { openSettings(); toggleThemesEditor(); });
  els.settingsOpenHistory.addEventListener('click', () => { if (isPro()) openHistory(); else openUpgrade(); });
  els.openFeedback.addEventListener('click', openFeedback);

  // Feedback
  els.feedbackBack.addEventListener('click', () => { openSettings(); });
  els.feedbackSend.addEventListener('click', sendFeedback);
  els.feedbackTypes.querySelectorAll('.wc__chip').forEach((b) => {
    b.addEventListener('click', () => {
      feedbackType = b.dataset.type;
      els.feedbackTypes.querySelectorAll('.wc__chip').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    });
  });

  // Dialogs
  els.importCancel.addEventListener('click', closeDialogs);
  els.confirmCancel.addEventListener('click', closeDialogs);
  els.importContinue.addEventListener('click', doImport);
  els.confirmOk.addEventListener('click', () => { if (confirmHandler) confirmHandler(); });
  els.dialogImport.querySelectorAll('.wc__choice').forEach((b) => {
    b.addEventListener('click', () => {
      importMode = b.dataset.mode;
      els.dialogImport.querySelectorAll('.wc__choice').forEach((x) => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
    });
  });

  // Dashboard header icon opens Progress inside the popup (see wire()).
  // (kept for back-compat; no external tab is opened anymore)

  // Prompt "Another" — routed through the same Phase-13 seam so a broken AI call quietly falls back to the static library.
  els.promptAnother.addEventListener('click', async () => {
    if (aiMode) {
      els.promptAiStatus.hidden = false;
      els.promptAiStatus.textContent = t('prompt.ai.loading');
      const result = await getNextPrompt();
      if (result.mode === 'ai') { renderAISuggestion(result.suggestion); return; }
      renderStaticPrompt(result.prompt, result.statusKey);
      return;
    }
    const r = await sendMessage({ type: 'ANOTHER_PROMPT' });
    if (r.ok) { promptState = r.prompt; if (promptState?.text) els.promptText.textContent = promptState.text; }
  });

  // AI suggestion feedback → /api/ai/feedback (thumbs + optional reason).
  els.promptAiUp.addEventListener('click', onAiThumbUp);
  els.promptAiDown.addEventListener('click', onAiThumbDown);
  els.promptAiReasons.querySelectorAll('.wc__chip').forEach((chip) => {
    chip.addEventListener('click', () => onAiReasonPick(chip.dataset.reason, chip));
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
    account = r.account || account;
  } else {
    // Preview fallback
    state = { active: false, typedWords: 0, pastedWords: 0, totalWords: 0, sessionGoal: 0, langChosen: true, plan: 'free', language: null, lastResult: null };
    settings = { langChosen: true, plan: 'free', wordGoal: 250, themes: [], language: null, profile: {}, aiProfileDraft: window.WCAIProfile.createDraft() };
    account = { authenticated: false, aiAccess: false, profileSyncEnabled: false, online: false };
  }

  // Language: chosen/profile override → auto-detect
  const activeLang = settings.language || detectDefault();
  setLang(activeLang);
  applyI18n(document);

  // First-run: language selection screen (before anything else)
  if (!settings.langChosen) { showPanel('firstlaunch'); return; }

  await proBadgeUpdate();
  await renderPrompt();
  await refreshStreak();
  showPanel('session');
  renderSession();
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('unload', stopDurationTicker);
