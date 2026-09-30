/**
 * Word Count — History, Streak & CSV engine (pure functions).
 *
 * Centralizes everything that reasons about completed sessions so the popup,
 * dashboard, service worker and tests share one implementation:
 *   - sessionWords()      only TYPED words count (pasted never counts)
 *   - computeStreak()     consecutive writing days, in the user's timezone
 *   - visibleHistory()    Free = last 24h, Pro = everything (access rule)
 *   - toCSV / parseCSV    export/import session metadata (never content)
 *   - mergeHistory        de-duplicated merge for CSV import
 *
 * Loaded by background.js (importScripts), popup.html / dashboard.html
 * (script tag before their controllers) and tests (require).
 */

(function (root) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Local (or timezone-aware) YYYY-MM-DD key for a timestamp.
  function dayKeyOf(ts, tz) {
    const d = new Date(ts);
    try {
      if (tz) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(d);
      }
    } catch (_) { /* fall through to local */ }
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Only typed words count toward totals, streaks and stats. Pasted text is
  // tracked for paste-protection but is never counted.
  function sessionWords(s) {
    return Math.max(0, Math.floor(Number(s && s.typedWords) || 0));
  }

  /**
   * Consecutive calendar days (in the user's timezone) with at least one
   * counted word. The streak is "current" only if the most recent writing day
   * is today or yesterday; a missed day breaks it.
   */
  function computeStreak(history, tz, now) {
    const nowTs = now || Date.now();
    const active = new Set();
    (history || []).forEach((s) => {
      if (sessionWords(s) > 0 && s.startedAt) active.add(dayKeyOf(s.startedAt, tz));
    });
    if (active.size === 0) return 0;

    const todayK = dayKeyOf(nowTs, tz);
    const yestK = dayKeyOf(nowTs - DAY_MS, tz);
    let cursor;
    if (active.has(todayK)) cursor = nowTs;
    else if (active.has(yestK)) cursor = nowTs - DAY_MS;
    else return 0;

    let streak = 0;
    while (active.has(dayKeyOf(cursor, tz))) {
      streak++;
      cursor -= DAY_MS;
    }
    return streak;
  }

  /**
   * Centralized history-access rule.
   *   Pro  → all sessions
   *   Free → only sessions started within the last 24 hours
   * Older records are NOT deleted — this is a visibility rule only, so an
   * upgrade instantly restores full access.
   */
  function visibleHistory(history, plan, now) {
    const list = Array.isArray(history) ? history : [];
    if (plan === 'pro') return list.slice();
    const cutoff = (now || Date.now()) - DAY_MS;
    return list.filter((s) => (s.startedAt || 0) >= cutoff);
  }

  // ---------- CSV ----------

  const CSV_COLUMNS = [
    'session_id', 'date', 'start_time', 'end_time',
    'words_written', 'session_goal', 'goal_reached', 'timezone',
  ];

  function csvEscape(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(sessions) {
    const rows = [CSV_COLUMNS.join(',')];
    (sessions || []).forEach((s) => {
      const words = sessionWords(s);
      const goal = Math.max(0, Math.floor(Number(s.sessionGoal) || 0));
      const reached = goal > 0 ? (words >= goal ? 'true' : 'false') : '';
      const start = new Date(s.startedAt);
      const end = s.endedAt ? new Date(s.endedAt) : null;
      rows.push([
        s.id != null ? s.id : s.startedAt,
        dayKeyOf(s.startedAt, s.timezone),
        start.toISOString(),
        end ? end.toISOString() : '',
        words,
        goal,
        reached,
        s.timezone || '',
      ].map(csvEscape).join(','));
    });
    return rows.join('\r\n');
  }

  // Minimal RFC-4180-ish CSV line splitter (handles quotes and commas).
  function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += c;
      } else if (c === '"') {
        inQ = true;
      } else if (c === ',') {
        out.push(cur); cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function toTs(v) {
    if (v == null || v === '') return null;
    if (/^\d+$/.test(String(v).trim())) return Number(v); // epoch ms
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }

  /**
   * Parse a UnoWord CSV export.
   * @returns {{ok, records, validCount, invalidCount, total, error?}}
   *   ok=false with `error` when the file is not a valid UnoWord CSV at all.
   *   Otherwise `records` holds the valid session objects; invalid rows are
   *   counted but never partially applied by the caller.
   */
  function parseCSV(text) {
    if (!text || typeof text !== 'string') {
      return { ok: false, error: 'empty', records: [], validCount: 0, invalidCount: 0, total: 0 };
    }
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { ok: false, error: 'empty', records: [], validCount: 0, invalidCount: 0, total: 0 };
    }
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const required = ['start_time', 'words_written'];
    if (!required.every((c) => header.includes(c))) {
      return { ok: false, error: 'format', records: [], validCount: 0, invalidCount: 0, total: 0 };
    }
    const idx = (name) => header.indexOf(name);
    const records = [];
    let invalid = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const startedAt = toTs(cells[idx('start_time')]);
      const wordsRaw = cells[idx('words_written')];
      const words = Number(wordsRaw);
      if (startedAt == null || !Number.isFinite(words) || !Number.isInteger(words) || words < 0) {
        invalid++;
        continue;
      }
      const endedAt = idx('end_time') >= 0 ? toTs(cells[idx('end_time')]) : null;
      const goal = idx('session_goal') >= 0 ? Math.max(0, Math.floor(Number(cells[idx('session_goal')]) || 0)) : 0;
      const idCell = idx('session_id') >= 0 ? cells[idx('session_id')] : '';
      const id = idCell && /^\d+$/.test(idCell.trim()) ? Number(idCell) : (idCell || startedAt);
      records.push({
        id,
        startedAt,
        endedAt: endedAt != null ? endedAt : startedAt,
        typedWords: words,
        pastedWords: 0,
        sessionGoal: goal,
        goalReached: goal > 0 ? words >= goal : false,
        timezone: idx('timezone') >= 0 ? (cells[idx('timezone')] || '') : '',
        mode: 'separate',
        imported: true,
      });
    }
    const total = lines.length - 1;
    return { ok: records.length > 0 || invalid === 0, records, validCount: records.length, invalidCount: invalid, total };
  }

  // Stable identity for de-duplication: session id, else a composite.
  function sessionKey(s) {
    if (s.id != null) return `id:${s.id}`;
    return `c:${s.startedAt}|${s.endedAt}|${sessionWords(s)}|${s.sessionGoal || 0}`;
  }

  function mergeHistory(existing, incoming) {
    const seen = new Set((existing || []).map(sessionKey));
    const out = (existing || []).slice();
    (incoming || []).forEach((s) => {
      const k = sessionKey(s);
      if (!seen.has(k)) { seen.add(k); out.push(s); }
    });
    out.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return out;
  }

  const api = {
    DAY_MS, dayKeyOf, sessionWords, computeStreak, visibleHistory,
    CSV_COLUMNS, toCSV, parseCSV, parseCsvLine, mergeHistory, sessionKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WCHistory = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
