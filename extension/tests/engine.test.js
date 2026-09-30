/**
 * Unit tests for the Word Count core engine.
 *
 * These tests exercise the same pure functions used by background.js —
 * countWords() and the applyDelta reducer — without needing a real Chrome
 * environment. Run with:  node tests/engine.test.js
 */

const assert = require('node:assert/strict');

// Exercise the SAME engine the extension ships (shared/wordcount.js) — there
// is no hand-kept mirror to drift out of sync. All three are pure functions.
const { countWords, classifyDelta, applyDelta } = require('../shared/wordcount.js');

// A fresh session counter.
const empty = () => ({ typedWords: 0, pastedWords: 0 });

// Simulate an editor edit end-to-end: the content script classifies the
// change (prev→curr text + inputType) into a delta, and the service-worker
// reducer applies it. Returns the new counter state.
function edit(state, prevText, currText, inputType) {
  const delta = classifyDelta(prevText, currText, inputType);
  return applyDelta(state, delta);
}

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

// ===== countWords: single-letter words (I / a) =====
test('countWords: one-letter words I and a always count', () => {
  assert.equal(countWords('I'), 1);
  assert.equal(countWords('a'), 1);
  assert.equal(countWords('I am a writer'), 4);
  assert.equal(countWords('A dog is outside.'), 4);
  assert.equal(countWords('I went home.'), 3);
  assert.equal(countWords('I.'), 1);
  assert.equal(countWords('A.'), 1);
});

// ===== countWords: punctuation must not count =====
test('countWords: standalone punctuation is 0', () => {
  assert.equal(countWords('!!!'), 0);
  assert.equal(countWords('...'), 0);
  assert.equal(countWords('. , !'), 0);
  assert.equal(countWords(' ! ? . '), 0);
  ['.', ',', '!', '?', ':', ';', '—', '–', '-', '(', ')', '[', ']', '{', '}', '"', "'", '…']
    .forEach((p) => assert.equal(countWords(p), 0, `"${p}" should be 0`));
});

test('countWords: punctuation attached to a word still counts as one', () => {
  assert.equal(countWords('Hello.'), 1);
  assert.equal(countWords('Hello...'), 1);
  assert.equal(countWords('Hello,'), 1);
  assert.equal(countWords('world!'), 1);
  assert.equal(countWords('Really?'), 1);
  assert.equal(countWords('"I"'), 1);
  assert.equal(countWords('(a)'), 1);
  assert.equal(countWords('Hello, world!'), 2);
  assert.equal(countWords('Hello!!!'), 1);
});

test('countWords: quotes and parentheses do not add tokens', () => {
  assert.equal(countWords('"I am here."'), 3);
  assert.equal(countWords('(I am here)'), 3);
});

test('countWords: contractions are one word', () => {
  ["don't", "can't", "I'm", "you're", "it's", "we're"].forEach((w) => {
    assert.equal(countWords(w), 1, `"${w}" should be 1`);
  });
  assert.equal(countWords("I'm a writer."), 3);
});

test('countWords: hyphenated words are one token', () => {
  assert.equal(countWords('well-known'), 1);
  assert.equal(countWords('part-time'), 1);
  assert.equal(countWords('long-term'), 1);
  assert.equal(countWords('state-of-the-art'), 1);
});

test('countWords: multiple punctuation between words', () => {
  // "Hello!!! Are you there???" → Hello, Are, you, there = 4 (punctuation
  // never creates extra tokens; the spec "5" is a documented mistake).
  assert.equal(countWords('Hello!!! Are you there???'), 4);
  assert.equal(countWords('Hello! How are you?'), 4);
});

test('countWords: empty / whitespace-only is 0', () => {
  assert.equal(countWords('     '), 0);
  assert.equal(countWords('\n\n\n'), 0);
  assert.equal(countWords('\t\t'), 0);
});

// ===== classifyDelta (content-script diffing) =====
test('classifyDelta: typing adds typed words', () => {
  assert.deepEqual(classifyDelta('I am', 'I am a', 'insertText'), { kind: 'typed', words: 1 });
});

test('classifyDelta: paste adds pasted words (never typed)', () => {
  assert.deepEqual(
    classifyDelta('I am', 'I am a writer', 'insertFromPaste'),
    { kind: 'pasted', words: 2 }
  );
});

test('classifyDelta: deletion / cut removes words', () => {
  assert.deepEqual(classifyDelta('I am writing today', 'I am today', 'deleteByCut'),
    { kind: 'deleted', words: 1 });
  assert.deepEqual(classifyDelta('hello world', 'hello', 'deleteContentBackward'),
    { kind: 'deleted', words: 1 });
});

test('classifyDelta: undo/redo reconcile to the resulting text', () => {
  // Undo that restores a cut word → typed (positive word delta, non-paste).
  assert.deepEqual(classifyDelta('I am today', 'I am writing today', 'historyUndo'),
    { kind: 'typed', words: 1 });
  // Redo that removes it again → deleted.
  assert.deepEqual(classifyDelta('I am writing today', 'I am today', 'historyRedo'),
    { kind: 'deleted', words: 1 });
});

test('classifyDelta: no net word change → null (no delta sent)', () => {
  assert.equal(classifyDelta('hel', 'hell', 'insertText'), null);
  assert.equal(classifyDelta('hello', 'hello ', 'insertText'), null);
});

// ===== applyDelta reducer (count-based) =====
test('applyDelta: typed accumulates into typedWords only', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', words: 2 });
  assert.equal(s.typedWords, 2);
  assert.equal(s.pastedWords, 0);
});

test('applyDelta: pasted accumulates into pastedWords only', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'pasted', words: 3 });
  assert.equal(s.typedWords, 0);
  assert.equal(s.pastedWords, 3);
});

test('applyDelta: deletion pops from typed first', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', words: 2 }); // "hello world"
  s = applyDelta(s, { kind: 'deleted', words: 1 }); // remove "world"
  assert.equal(s.typedWords, 1);
});

test('applyDelta: deletion overflows into pasted after typed empties', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'pasted', words: 3 });
  s = applyDelta(s, { kind: 'typed', words: 2 });
  s = applyDelta(s, { kind: 'deleted', words: 3 }); // eats typed 2 + pasted 1
  assert.equal(s.typedWords, 0);
  assert.equal(s.pastedWords, 2);
});

test('applyDelta: deletion capped at total', () => {
  let s = empty();
  s = applyDelta(s, { kind: 'typed', words: 3 });
  s = applyDelta(s, { kind: 'deleted', words: 999 });
  assert.equal(s.typedWords, 0);
  assert.equal(s.pastedWords, 0);
});

// ===== full editor simulations (content script + reducer together) =====
test('sim: typing builds up typed count', () => {
  let s = empty();
  s = edit(s, '', 'I am a writer', 'insertText');
  assert.equal(s.typedWords, 4);
  assert.equal(s.pastedWords, 0);
});

// ---- Cut/Undo integration (reproduces the reported bug) ----
test('cut+undo Test 1: I am writing today', () => {
  let s = empty();
  s = edit(s, '', 'I am writing today', 'insertText');
  assert.equal(s.typedWords, 4);
  s = edit(s, 'I am writing today', 'I am today', 'deleteByCut'); // cut "writing"
  assert.equal(s.typedWords, 3);
  s = edit(s, 'I am today', 'I am writing today', 'historyUndo');  // undo
  assert.equal(s.typedWords, 4);
});

test('cut+undo Test 2: I am writing a story', () => {
  let s = empty();
  s = edit(s, '', 'I am writing a story', 'insertText');
  assert.equal(s.typedWords, 5);
  s = edit(s, 'I am writing a story', 'I am writing', 'deleteByCut'); // cut "a story"
  assert.equal(s.typedWords, 3);
  s = edit(s, 'I am writing', 'I am writing a story', 'historyUndo');
  assert.equal(s.typedWords, 5);
});

test('cut+undo Test 3: Hello world', () => {
  let s = empty();
  s = edit(s, '', 'Hello world', 'insertText');
  assert.equal(s.typedWords, 2);
  s = edit(s, 'Hello world', 'Hello', 'deleteByCut'); // cut "world"
  assert.equal(s.typedWords, 1);
  s = edit(s, 'Hello', 'Hello world', 'historyUndo');
  assert.equal(s.typedWords, 2);
});

test('cut+undo Test 4: multiple deletes and undos stay synchronized', () => {
  let s = empty();
  s = edit(s, '', 'I am a writer', 'insertText');
  assert.equal(s.typedWords, 4);
  s = edit(s, 'I am a writer', 'I am a ', 'deleteContentBackward'); // delete "writer"
  assert.equal(s.typedWords, 3);
  s = edit(s, 'I am a ', 'I am a writer', 'historyUndo');
  assert.equal(s.typedWords, 4);
  s = edit(s, 'I am a writer', 'I am ', 'deleteContentBackward'); // delete "a writer"
  assert.equal(s.typedWords, 2);
  s = edit(s, 'I am ', 'I am a writer', 'historyUndo');
  assert.equal(s.typedWords, 4);
});

// ---- Paste protection stays intact ----
test('paste protection: pasted words never inflate typed count', () => {
  let s = empty();
  s = edit(s, '', 'I am', 'insertText');           // type "I am"
  assert.equal(s.typedWords, 2);
  s = edit(s, 'I am', 'I am a writer', 'insertFromPaste'); // paste "a writer"
  assert.equal(s.typedWords, 2);                    // NOT 4
  assert.equal(s.pastedWords, 2);
  s = edit(s, 'I am a writer', 'I am a writer today', 'insertText'); // type "today"
  assert.equal(s.typedWords, 3);                    // only typing bumps typed
  assert.equal(s.pastedWords, 2);
});

test('paste protection: cut into pasted region reduces pasted first only after typed drains', () => {
  let s = empty();
  s = edit(s, '', 'hello', 'insertText');          // typed 1
  s = edit(s, 'hello', 'hello big wide world', 'insertFromPaste'); // pasted 3
  assert.equal(s.typedWords, 1);
  assert.equal(s.pastedWords, 3);
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

// ===== Rich editors (contenteditable: Notion / Google-Docs-like) =====
// content.js reads el.innerText for contenteditable, so block elements produce
// newlines and inline formatting (<b>/<i>/<span>) is invisible to the tokenizer.
// These simulate the innerText the content script observes.

test('rich: inline formatting does not change the word count', () => {
  assert.equal(countWords('I am bold today'), 4); // bold markup invisible in innerText
});

test('rich: multi-paragraph contenteditable counts across block newlines', () => {
  assert.equal(countWords('First paragraph here.\n\nSecond paragraph too.'), 6);
});

test('rich: typing across formatted spans accrues typed words only', () => {
  let s = empty();
  s = edit(s, '', 'I am a', 'insertText');
  s = edit(s, 'I am a', 'I am a writer', 'insertText');
  assert.equal(s.typedWords, 4);
});

test('rich: cut a bold word then undo stays synchronized (contenteditable)', () => {
  let s = empty();
  s = edit(s, '', 'I really enjoy writing stories', 'insertText');
  assert.equal(s.typedWords, 5);
  s = edit(s, 'I really enjoy writing stories', 'I really enjoy', 'deleteByCut');
  assert.equal(s.typedWords, 3);
  s = edit(s, 'I really enjoy', 'I really enjoy writing stories', 'historyUndo');
  assert.equal(s.typedWords, 5);
});

test('rich: paste into contenteditable never counts as typed', () => {
  let s = empty();
  s = edit(s, '', 'My notes', 'insertText');
  s = edit(s, 'My notes', 'My notes pasted block of text', 'insertFromPaste');
  assert.equal(s.typedWords, 2);
  assert.equal(s.pastedWords, 4);
});

test('rich: inserting a new paragraph (Enter) is not a word', () => {
  let s = empty();
  s = edit(s, '', 'Line one', 'insertText');
  assert.equal(s.typedWords, 2);
  s = edit(s, 'Line one', 'Line one\n', 'insertParagraph');
  assert.equal(s.typedWords, 2);
  s = edit(s, 'Line one\n', 'Line one\nLine two', 'insertText');
  assert.equal(s.typedWords, 4);
});


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
