/**
 * Tests for the history / streak / CSV engine (shared/history.js).
 * Run with:  node tests/history.test.js
 */
const assert = require('node:assert/strict');
const H = require('../shared/history.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const DAY = 24 * 3600 * 1000;
const TZ = 'America/New_York';
// A fixed "now": 2026-06-15 12:00 local-ish.
const NOW = Date.parse('2026-06-15T16:00:00Z');
function daysAgo(n, hour = 12) { return NOW - n * DAY; }
function session(startedAt, typedWords, extra = {}) {
  return { id: startedAt, startedAt, endedAt: startedAt + 5 * 60000, typedWords, pastedWords: 0, sessionGoal: 250, ...extra };
}

// ===== sessionWords: pasted never counts =====
test('sessionWords: only typed words count', () => {
  assert.equal(H.sessionWords({ typedWords: 40, pastedWords: 1000 }), 40);
  assert.equal(H.sessionWords({ typedWords: 0, pastedWords: 999 }), 0);
});

// ===== computeStreak =====
test('streak: single day today = 1', () => {
  const h = [session(daysAgo(0), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 1);
});

test('streak: 3 consecutive days = 3', () => {
  const h = [session(daysAgo(0), 100), session(daysAgo(1), 100), session(daysAgo(2), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 3);
});

test('streak: 7 consecutive days = 7', () => {
  const h = [];
  for (let i = 0; i < 7; i++) h.push(session(daysAgo(i), 50));
  assert.equal(H.computeStreak(h, TZ, NOW), 7);
});

test('streak: multiple sessions same day count once', () => {
  const h = [session(daysAgo(0, 9), 100), session(daysAgo(0, 14), 100), session(daysAgo(1), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 2);
});

test('streak: missed day breaks it (only counts recent run)', () => {
  // wrote today and 2 days ago (missed yesterday) → streak = 1 (today only)
  const h = [session(daysAgo(0), 100), session(daysAgo(2), 100), session(daysAgo(3), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 1);
});

test('streak: 0-word sessions do not count', () => {
  const h = [session(daysAgo(0), 0), session(daysAgo(1), 0)];
  assert.equal(H.computeStreak(h, TZ, NOW), 0);
});

test('streak: still current if last write was yesterday', () => {
  const h = [session(daysAgo(1), 100), session(daysAgo(2), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 2);
});

test('streak: broken if last write was 2+ days ago', () => {
  const h = [session(daysAgo(2), 100), session(daysAgo(3), 100)];
  assert.equal(H.computeStreak(h, TZ, NOW), 0);
});

// ===== visibleHistory (Free 24h vs Pro all) =====
test('visibleHistory: free sees only last 24h', () => {
  const h = [session(daysAgo(0), 10), session(NOW - 2 * 3600 * 1000, 10), session(daysAgo(3), 10)];
  const free = H.visibleHistory(h, 'free', NOW);
  assert.equal(free.length, 2);
  assert.ok(free.every((s) => s.startedAt >= NOW - DAY));
});

test('visibleHistory: pro sees everything', () => {
  const h = [session(daysAgo(0), 10), session(daysAgo(400), 10)];
  assert.equal(H.visibleHistory(h, 'pro', NOW).length, 2);
});

test('visibleHistory: does not mutate/delete records', () => {
  const h = [session(daysAgo(400), 10)];
  H.visibleHistory(h, 'free', NOW);
  assert.equal(h.length, 1); // still present — access rule, not deletion
});

// ===== CSV round-trip =====
test('CSV: export then parse round-trips valid records', () => {
  const h = [session(daysAgo(0), 120, { timezone: TZ }), session(daysAgo(1), 300, { timezone: TZ })];
  const csv = H.toCSV(h);
  assert.ok(csv.split('\r\n')[0].includes('session_id'));
  const parsed = H.parseCSV(csv);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.validCount, 2);
  assert.equal(parsed.invalidCount, 0);
  assert.equal(parsed.records[0].typedWords, 120);
  assert.equal(parsed.records[0].id, h[0].id);
});

test('CSV: pasted words are never exported', () => {
  const csv = H.toCSV([session(daysAgo(0), 10, { pastedWords: 500 })]);
  assert.equal(csv.includes('500'), false);
});

test('CSV: invalid file rejected', () => {
  assert.equal(H.parseCSV('name,age\nfoo,3').ok, false);
  assert.equal(H.parseCSV('').ok, false);
  assert.equal(H.parseCSV('name,age\nfoo,3').error, 'format');
});

test('CSV: counts invalid rows without importing them', () => {
  const csv = [
    'session_id,date,start_time,end_time,words_written,session_goal,goal_reached,timezone',
    `1,2026-06-15,${new Date(daysAgo(0)).toISOString()},,120,250,false,${TZ}`,
    `2,bad,not-a-date,,50,250,false,${TZ}`,        // invalid date
    `3,2026-06-14,${new Date(daysAgo(1)).toISOString()},,-5,250,false,${TZ}`, // negative words
  ].join('\r\n');
  const parsed = H.parseCSV(csv);
  assert.equal(parsed.validCount, 1);
  assert.equal(parsed.invalidCount, 2);
});

// ===== merge / replace =====
test('merge: adds only non-duplicate records (A,B,C + B,C,D,E = A..E)', () => {
  const A = session(daysAgo(0), 10), B = session(daysAgo(1), 10), C = session(daysAgo(2), 10);
  const D = session(daysAgo(3), 10), E = session(daysAgo(4), 10);
  const merged = H.mergeHistory([A, B, C], [B, C, D, E]);
  assert.equal(merged.length, 5);
  const ids = merged.map((s) => s.id).sort((a, b) => a - b);
  assert.deepEqual(ids, [A, B, C, D, E].map((s) => s.id).sort((a, b) => a - b));
});

test('merge: composite dedupe when ids missing', () => {
  const a = { startedAt: 1000, endedAt: 2000, typedWords: 5, sessionGoal: 250 };
  const dupe = { startedAt: 1000, endedAt: 2000, typedWords: 5, sessionGoal: 250 };
  const merged = H.mergeHistory([a], [dupe]);
  assert.equal(merged.length, 1);
});

// ---- runner ----
(async () => {
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  \u2713', name); passed++; }
    catch (e) { console.log('  \u2717', name); console.log('     ', e.message); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
