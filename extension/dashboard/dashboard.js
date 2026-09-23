/**
 * Word Count — Dashboard controller
 *
 * Renders progress for Today / Week / Month / Year / All time from the
 * background service worker's aggregated stats. Reactive to language
 * changes and the current plan (free users get a paywall banner and
 * still can view the current tab, but with obvious upgrade nudge).
 */

const { t, setLang, getLang, detectDefault, applyI18n } = window.WCi18n;

const els = {
  planBadge:    document.getElementById('plan-badge'),
  paywall:      document.getElementById('paywall'),
  paywallCta:   document.getElementById('paywall-cta'),
  main:         document.getElementById('main'),
  tabs:         Array.from(document.querySelectorAll('.wd-tab')),
  heroPrimary:  document.getElementById('hero-primary'),
  heroSub:      document.getElementById('hero-sub'),
  heroSessions: document.getElementById('hero-sessions'),
  heroProgress: document.getElementById('hero-progress'),
  chart:        document.getElementById('chart'),
  chartEmpty:   document.getElementById('chart-empty'),
  statAvg:      document.getElementById('stat-avg'),
  statBest:     document.getElementById('stat-best'),
  statLongest:  document.getElementById('stat-longest'),
  recentList:   document.getElementById('recent-list'),
};

let currentRange = 'today';
let settings = null;

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

function fmt(n) { return Number(n || 0).toLocaleString(getLang() === 'es' ? 'es-ES' : 'en-US'); }
function pad2(n) { return String(n).padStart(2, '0'); }

const DOW_KEYS = ['day.mon','day.tue','day.wed','day.thu','day.fri','day.sat','day.sun'];
const MONTH_KEYS = ['month.jan','month.feb','month.mar','month.apr','month.may','month.jun','month.jul','month.aug','month.sep','month.oct','month.nov','month.dec'];

function markActiveTab() {
  els.tabs.forEach((btn) => btn.setAttribute('aria-selected', btn.dataset.range === currentRange ? 'true' : 'false'));
}

function renderChart(buckets, range) {
  els.chart.innerHTML = '';
  const hasAny = buckets.some((b) => b.words > 0);
  els.chartEmpty.hidden = hasAny || range === 'today';
  if (range === 'today') {
    els.chart.setAttribute('data-cols', '1');
  } else if (range === 'week') {
    els.chart.setAttribute('data-cols', '7');
  } else if (range === 'month') {
    els.chart.setAttribute('data-cols', String(buckets.length));
  } else if (range === 'year') {
    els.chart.setAttribute('data-cols', '12');
  } else {
    els.chart.setAttribute('data-cols', 'all');
  }
  const max = Math.max(1, ...buckets.map((b) => b.words));
  buckets.forEach((b) => {
    const wrap = document.createElement('div'); wrap.className = 'wd-bar';
    const bar  = document.createElement('div'); bar.className = 'wd-bar-fill';
    const pct  = Math.max(0, Math.min(100, (b.words / max) * 100));
    // Use height-in-parent approach via flex + inline height
    bar.style.height = b.words === 0 ? '4px' : `${Math.max(6, pct)}%`;
    if (b.words === 0) bar.setAttribute('data-empty', 'true');
    bar.setAttribute('title', `${fmt(b.words)} — ${b.label}`);
    wrap.appendChild(bar);
    const label = document.createElement('span'); label.className = 'wd-bar-label';
    if (range === 'week')      label.textContent = t(DOW_KEYS[b.dow || 0]);
    else if (range === 'year') label.textContent = t(MONTH_KEYS[b.month || 0]);
    else if (range === 'month')label.textContent = String(b.dayOfMonth);
    else                       label.textContent = '';
    wrap.appendChild(label);
    els.chart.appendChild(wrap);
  });
}

function renderRecent(sessions) {
  els.recentList.innerHTML = '';
  if (!sessions || sessions.length === 0) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-subtle)';
    empty.style.fontSize = '13px';
    empty.textContent = t('dash.noData');
    els.recentList.appendChild(empty);
    return;
  }
  sessions.slice(0, 12).forEach((s) => {
    const item = document.createElement('div'); item.className = 'wd-recent-item';
    item.setAttribute('data-testid', 'recent-item');
    const d = new Date(s.startedAt);
    let hh = d.getHours(); const mm = pad2(d.getMinutes()); const ampm = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
    const dur = Math.max(0, (s.endedAt || 0) - (s.startedAt || 0));
    const durS = Math.floor(dur / 1000);
    const durTxt = durS < 60 ? `${durS}s` :
                   durS < 3600 ? `${Math.floor(durS/60)}m ${pad2(durS%60)}s` :
                   `${Math.floor(durS/3600)}h ${pad2(Math.floor((durS%3600)/60))}m`;

    const words = (s.typedWords || 0) + (s.pastedWords || 0);

    const time = document.createElement('div'); time.className = 'wd-recent-time';
    time.textContent = `${d.toLocaleDateString(getLang() === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' })} · ${hh}:${mm} ${ampm}`;
    const meta = document.createElement('div'); meta.className = 'wd-recent-meta';
    const parts = [durTxt];
    if (s.sessionGoal) parts.push(`${t('dash.goal')} ${fmt(s.sessionGoal)}`);
    meta.textContent = parts.join(' · ');
    const count = document.createElement('div'); count.className = 'wd-recent-count';
    count.innerHTML = `${fmt(words)} <span>${words === 1 ? t('session.word') : t('session.words')}</span>`;
    item.appendChild(time); item.appendChild(meta); item.appendChild(count);
    els.recentList.appendChild(item);
  });
}

async function load(range) {
  currentRange = range;
  markActiveTab();
  const r = await sendMessage({ type: 'GET_STATS', range });
  if (!r.ok) return;
  const s = r.stats;

  // Hero
  els.heroPrimary.textContent = fmt(s.totalWords);
  els.heroSub.textContent = t(`dash.primarySub.${range}`);
  els.heroSessions.textContent = t(s.sessionCount === 1 ? 'dash.sessions' : 'dash.sessionsPlural', { n: fmt(s.sessionCount) });

  // Progress vs current wordGoal for today only
  if (range === 'today' && settings && (settings.plan === 'pro')) {
    const goal = settings.wordGoal || 0;
    const pct = goal > 0 ? Math.min(999, Math.round((s.totalWords / goal) * 100)) : null;
    els.heroProgress.textContent = pct != null ? `${t('dash.goal')}: ${fmt(goal)} · ${pct}%` : '';
  } else {
    els.heroProgress.textContent = '';
  }

  // Stats
  const days = Math.max(1, s.buckets.length);
  const avg = Math.round(s.totalWords / days);
  const bestDay = Math.max(0, ...s.buckets.map((b) => b.words));
  els.statAvg.textContent = fmt(avg);
  els.statBest.textContent = fmt(bestDay);
  els.statLongest.textContent = fmt(s.longestSessionWords || 0);

  renderChart(s.buckets, range);
  renderRecent(s.sessions);
}

function wireTabs() {
  els.tabs.forEach((btn) => {
    btn.addEventListener('click', () => load(btn.dataset.range));
  });
}

async function boot() {
  wireTabs();
  const r = await sendMessage({ type: 'GET_SETTINGS' });
  if (r.ok) settings = r.settings;
  const lang = (settings && settings.language) || detectDefault();
  setLang(lang);
  applyI18n(document);

  const isPro = settings && settings.plan === 'pro';
  els.planBadge.textContent = isPro ? 'PRO' : (getLang() === 'es' ? 'GRATIS' : 'FREE');
  els.planBadge.setAttribute('data-plan', isPro ? 'pro' : 'free');
  els.paywall.hidden = isPro;
  els.paywallCta.addEventListener('click', () => {
    // Send user to the popup route; open the extension popup by focusing action.
    // We simply close and rely on user opening the popup for demo.
    window.close();
  });

  await load(currentRange);
}

document.addEventListener('DOMContentLoaded', boot);
