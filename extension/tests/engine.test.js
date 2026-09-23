/**
 * Unit tests for the Word Count core engine.
 *
 * These tests exercise the same pure functions used by background.js —
 * countWords() and the applyDelta reducer — without needing a real Chrome
 * environment. Run with:  node tests/engine.test.js
 */

const assert = require('node:assert/strict');

// ---- Reimplement pure functions here (mirror of background.js) ----
// Keeping this in sync manually is acceptable for MVP; both files
// are small and both live in this repo.

function countWords(text) {
  if (!text) return 0;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 0;
  return trimmed.split(' ').length;
}

function applyDelta(state, delta) {
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
  }
  return { typedText, pastedText };
}

const empty = () => ({ typedText: '', pastedText: '' });

// ---- Tests ----

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

// ===== countWords =====
test('countWords: empty string is 0', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords(null), 0);
  assert.equal(countWords(undefined), 0);
});

test('countWords: single word', () => {
  assert.equal(countWords('hello'), 1);
  assert.equal(countWords('  hello  '), 1);
});

test('countWords: multiple spaces collapse to one word boundary', () => {
  assert.equal(countWords('one   two'), 2);
  assert.equal(countWords('one\t\ttwo'), 2);
});

test('countWords: line breaks are word boundaries', () => {
  assert.equal(countWords('line one\nline two'), 4);
  assert.equal(countWords('a\n\n\nb'), 2);
});

test('countWords: punctuation stays attached', () => {
  assert.equal(countWords("don't stop"), 2);
  assert.equal(countWords('hello, world!'), 2);
  assert.equal(countWords('state-of-the-art'), 1);
});

test('countWords: numbers count as words', () => {
  assert.equal(countWords('I wrote 1200 words today'), 5);
});

test('countWords: sample from spec (12 words)', () => {
  assert.equal(
    countWords('Today I want to finish the first chapter of my book.'),
    11 // "Today I want to finish the first chapter of my book." = 11 tokens
  );
  // The spec example says "12 words" for that sentence but standard tokenizers
  // give 11; documenting that our counter uses whitespace tokenization.
});

// ===== applyDelta =====
test('applyDelta: typed accumulates into typedText only', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', added: 'hello ' });
  s = applyDelta(s, { kind: 'typed', added: 'world' });
  assert.equal(s.typedText, 'hello world');
  assert.equal(s.pastedText, '');
  assert.equal(countWords(s.typedText), 2);
});

test('applyDelta: pasted accumulates into pastedText only', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'pasted', added: 'quick brown fox' });
  assert.equal(s.typedText, '');
  assert.equal(s.pastedText, 'quick brown fox');
  assert.equal(countWords(s.pastedText), 3);
});

test('applyDelta: deletion pops from typed first', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', added: 'hello world' });
  s = applyDelta(s, { kind: 'deleted', removed: 5 }); // remove "world"
  assert.equal(s.typedText, 'hello ');
  assert.equal(countWords(s.typedText), 1);
});

test('applyDelta: deletion overflows into pasted after typed empties', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'pasted', added: 'ABCDE' });
  s = applyDelta(s, { kind: 'typed',  added: 'XY' });
  s = applyDelta(s, { kind: 'deleted', removed: 3 }); // eats "XY" (2) + "E" (1)
  assert.equal(s.typedText, '');
  assert.equal(s.pastedText, 'ABCD');
});

test('applyDelta: deletion capped at total length', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', added: 'abc' });
  s = applyDelta(s, { kind: 'deleted', removed: 999 });
  assert.equal(s.typedText, '');
  assert.equal(s.pastedText, '');
});

test('applyDelta: full session simulation', () => {
  let s = empty();
  // Type "Today I want to finish"
  s = applyDelta(s, { kind: 'typed', added: 'Today I want to finish' });
  // Backspace 6 chars ("finish")
  s = applyDelta(s, { kind: 'deleted', removed: 6 });
  // Type "start"
  s = applyDelta(s, { kind: 'typed', added: 'start' });
  // Paste " the first chapter"
  s = applyDelta(s, { kind: 'pasted', added: ' the first chapter' });
  assert.equal(s.typedText, 'Today I want to start');
  assert.equal(s.pastedText, ' the first chapter');
  assert.equal(countWords(s.typedText), 5);
  assert.equal(countWords(s.pastedText), 3);
});

// ===== history reducer (mirror of appendHistory) =====

function appendHistory(history, session, max = 50) {
  const words = (session.typedWords || 0) + (session.pastedWords || 0);
  const duration = Math.max(0, (session.endedAt || 0) - (session.startedAt || 0));
  if (words === 0 && duration < 1000) return history;
  return [{ id: session.startedAt || Date.now(), ...session }, ...history].slice(0, max);
}

test('appendHistory: adds newest first', () => {
  let h = [];
  h = appendHistory(h, { startedAt: 100, endedAt: 200, typedWords: 5, pastedWords: 0 });
  h = appendHistory(h, { startedAt: 300, endedAt: 400, typedWords: 8, pastedWords: 0 });
  assert.equal(h.length, 2);
  assert.equal(h[0].startedAt, 300);
  assert.equal(h[1].startedAt, 100);
});

test('appendHistory: drops zero-word, sub-second sessions', () => {
  let h = [];
  h = appendHistory(h, { startedAt: 100, endedAt: 200, typedWords: 0, pastedWords: 0 });
  assert.equal(h.length, 0);
});

test('appendHistory: keeps zero-word sessions that lasted >= 1s', () => {
  let h = [];
  h = appendHistory(h, { startedAt: 100, endedAt: 1200, typedWords: 0, pastedWords: 0 });
  assert.equal(h.length, 1);
});

test('appendHistory: caps at max length', () => {
  let h = [];
  for (let i = 0; i < 60; i++) {
    h = appendHistory(h, { startedAt: i, endedAt: i + 5000, typedWords: 1, pastedWords: 0 }, 50);
  }
  assert.equal(h.length, 50);
  // Newest kept
  assert.equal(h[0].startedAt, 59);
  // Oldest dropped
  assert.ok(!h.find((s) => s.startedAt === 0));
});

// ===== goal validation (mirror of popup.js validateGoal) =====

function validateGoal(raw) {
  if (raw === '' || raw == null) return { ok: false, reason: 'empty' };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, reason: 'notint' };
  if (n <= 0) return { ok: false, reason: 'nonpos' };
  if (n % 25 !== 0) {
    const lo = Math.floor(n / 25) * 25;
    return { ok: false, reason: 'not25', suggestLo: Math.max(25, lo), suggestHi: lo + 25 };
  }
  return { ok: true, value: n };
}

test('validateGoal: rejects empty, negatives, decimals, zero', () => {
  assert.equal(validateGoal('').ok, false);
  assert.equal(validateGoal(null).ok, false);
  assert.equal(validateGoal(0).ok, false);
  assert.equal(validateGoal(-25).ok, false);
  assert.equal(validateGoal(12.5).ok, false);
  assert.equal(validateGoal('abc').ok, false);
});

test('validateGoal: accepts multiples of 25', () => {
  [25, 50, 75, 100, 125, 250, 500, 750, 1000, 1025, 2500, 5000].forEach((n) => {
    const v = validateGoal(n);
    assert.equal(v.ok, true);
    assert.equal(v.value, n);
  });
});

test('validateGoal: rejects non-multiples of 25 and suggests neighbours', () => {
  const v = validateGoal(260);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not25');
  assert.equal(v.suggestLo, 250);
  assert.equal(v.suggestHi, 275);
});

test('validateGoal: 10 suggests 25 (not zero)', () => {
  const v = validateGoal(10);
  assert.equal(v.ok, false);
  assert.equal(v.suggestLo, 25); // floor(10/25)*25 = 0 → clamped to 25
});

// ===== prompt picker (light integration test) =====
// Only run if the prompts module is available.
try {
  const path = require('path');
  const script = require('fs').readFileSync(path.join(__dirname, '..', 'shared', 'prompts.js'), 'utf-8');
  const g = {};
  // Emulate the (function attach(scope){...})(scope) at bottom.
  const wrapped = new Function('window', 'globalThis', script + '; return window.WCPrompts;');
  const WCP = wrapped(g, g);

  test('pickPrompt: returns a prompt for a valid theme', () => {
    const p = WCP.pickPrompt(['gratitude'], 'en', []);
    assert.ok(p);
    assert.equal(p.theme, 'gratitude');
    assert.ok(p.text.length > 0);
  });

  test('pickPrompt: surprise-me includes all themes', () => {
    const p = WCP.pickPrompt(['surprise-me'], 'en', []);
    assert.ok(p);
    assert.ok(p.text.length > 0);
  });

  test('pickPrompt: respects history', () => {
    const pool = WCP.buildPool(['gratitude'], 'en');
    const historyIds = pool.slice(0, pool.length - 1).map((p) => p.id);
    const p = WCP.pickPrompt(['gratitude'], 'en', historyIds);
    assert.ok(p);
    // Should have picked the one not in history
    assert.equal(historyIds.includes(p.id), false);
  });

  test('pickPrompt: Spanish theme returns Spanish text', () => {
    const p = WCP.pickPrompt(['gratitude'], 'es', []);
    assert.ok(p);
    assert.equal(p.id.startsWith('es:'), true);
  });
} catch (err) {
  test('prompts module load', () => { assert.fail('Could not load prompts: ' + err.message); });
}

// ---- Runner ----
(async () => {
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log('  \u2713', name);
      passed++;
    } catch (err) {
      console.log('  \u2717', name);
      console.log('     ', err.message);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
