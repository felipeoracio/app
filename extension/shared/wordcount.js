/**
 * Word Count Extension — Centralized word-counting engine.
 *
 * Single source of truth for tokenization and session word-count math.
 * Loaded by:
 *   - background.js       (service worker, via importScripts)
 *   - content.js          (content script, listed in manifest before content.js)
 *   - tests/engine.test.js (node, via require)
 *
 * Design goals (see word-counting spec):
 *   1. A token counts as a word only if it contains at least one Unicode
 *      letter or number. Standalone punctuation ("!!!", "...", "-") never
 *      counts. This is Unicode-aware and needs no special cases.
 *   2. One-character words such as "I" and "a" always count.
 *   3. Contractions ("don't", "I'm") and hyphenated words ("well-known")
 *      stay as a single token because we only split on whitespace.
 *   4. Numbers count as words.
 *   5. The session distinguishes typed vs pasted words, and reconciles the
 *      count against the *actual* editor text on every content change
 *      (typing, delete, cut, undo, redo) — never by re-counting the whole
 *      document as typed (which would defeat paste protection).
 */

(function (root) {
  // A token is a "word" iff it contains at least one Unicode letter or digit.
  // Whitespace-only or punctuation-only tokens are ignored.
  const WORD_CHAR = /[\p{L}\p{N}]/u;

  /**
   * Count words in a string.
   * Splits on Unicode whitespace and keeps only tokens that contain a
   * letter or number. Punctuation attached to a word ("world!", "Hello,",
   * "(a)") stays part of that single word.
   */
  function countWords(text) {
    if (!text) return 0;
    const tokens = String(text).split(/\s+/);
    let n = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok && WORD_CHAR.test(tok)) n++;
    }
    return n;
  }

  // inputType values that represent content arriving from outside the user's
  // own typing. Words added by these must NOT be counted as typed words.
  const PASTE_TYPES = new Set([
    'insertFromPaste',
    'insertFromPasteAsQuotation',
    'insertFromDrop',
  ]);

  /**
   * Given the previous and current text of an editor plus the `inputType`
   * from the `input` event, classify the change into a session delta.
   *
   * Reconciliation is done at the word level against the real text, so it
   * works for typing, deletion, cut (deleteByCut), undo (historyUndo) and
   * redo (historyRedo) alike — whatever the resulting text is, the count
   * follows it. Paste/drop additions are tagged `pasted` so they never
   * inflate the typed count.
   *
   * @returns {{kind:'typed'|'pasted'|'deleted', words:number}|null}
   */
  function classifyDelta(prevText, currText, inputType) {
    const prevWords = countWords(prevText);
    const currWords = countWords(currText);
    const wordDelta = currWords - prevWords;
    if (wordDelta === 0) return null;

    if (wordDelta > 0) {
      if (PASTE_TYPES.has(inputType)) {
        return { kind: 'pasted', words: wordDelta };
      }
      return { kind: 'typed', words: wordDelta };
    }
    return { kind: 'deleted', words: -wordDelta };
  }

  /**
   * Pure reducer: apply a session delta to { typedWords, pastedWords }.
   * Deletions consume typed words first, then pasted words.
   */
  function applyDelta(state, delta) {
    let typedWords = Math.max(0, Math.floor(Number(state && state.typedWords) || 0));
    let pastedWords = Math.max(0, Math.floor(Number(state && state.pastedWords) || 0));
    if (!delta) return { typedWords, pastedWords };

    if (delta.kind === 'typed' && typeof delta.words === 'number') {
      typedWords += Math.max(0, Math.floor(delta.words));
    } else if (delta.kind === 'pasted' && typeof delta.words === 'number') {
      pastedWords += Math.max(0, Math.floor(delta.words));
    } else if (delta.kind === 'deleted' && typeof delta.words === 'number') {
      let n = Math.max(0, Math.floor(delta.words));
      const fromTyped = Math.min(n, typedWords);
      typedWords -= fromTyped;
      n -= fromTyped;
      if (n > 0) pastedWords = Math.max(0, pastedWords - n);
    }
    return { typedWords, pastedWords };
  }

  const api = { countWords, classifyDelta, applyDelta, PASTE_TYPES };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.WCWordCount = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
