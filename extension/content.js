/**
 * Word Count Extension — Content Script
 *
 * Attached to every allowed page. Watches for `input` events on editable
 * targets (<textarea>, <input> text-like, and contenteditable) and reports
 * granular deltas to the background service worker.
 *
 * We rely on InputEvent.inputType to classify the change:
 *   - insertText / insertLineBreak / insertParagraph / insertCompositionText
 *       -> typed
 *   - insertFromPaste / insertFromDrop / insertReplacementText
 *       -> pasted
 *   - delete*   -> deleted (report number of chars removed)
 *
 * We also snapshot the previous value of each element so we can compute the
 * length delta reliably even when `event.data` is null (e.g. line breaks,
 * IME composition, some contenteditable operations).
 *
 * Only fires while a session is active — the script polls the background
 * for active state and caches it locally, refreshed on storage changes.
 */

(() => {
  if (window.__wcContentScriptLoaded) return;
  window.__wcContentScriptLoaded = true;

  const TEXT_INPUT_TYPES = new Set([
    'text', 'search', 'url', 'tel', 'email', 'password', 'number',
  ]);

  let sessionActive = false;

  // ---------- active state cache ----------

  function refreshActive() {
    try {
      chrome.runtime.sendMessage({ type: 'IS_ACTIVE' }, (resp) => {
        if (chrome.runtime.lastError) return; // extension reloaded, ignore
        if (resp && resp.ok) sessionActive = !!resp.active;
      });
    } catch (_e) { /* ignore */ }
  }
  refreshActive();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.wc_state) {
      const nv = changes.wc_state.newValue;
      if (nv && typeof nv.active === 'boolean') sessionActive = nv.active;
    }
  });

  // ---------- helpers ----------

  function isEditableTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (tag === 'INPUT') {
      if (el.disabled || el.readOnly) return false;
      const type = (el.type || 'text').toLowerCase();
      return TEXT_INPUT_TYPES.has(type);
    }
    return false;
  }

  function getElementText(el) {
    if (el.isContentEditable) return el.innerText || '';
    return el.value != null ? String(el.value) : '';
  }

  // Track the previous value per element so we can compute char-length delta.
  const prevValues = new WeakMap();

  function sendDelta(delta) {
    try {
      chrome.runtime.sendMessage({ type: 'DELTA', delta }, () => {
        // Swallow lastError (e.g. service worker asleep briefly)
        void chrome.runtime.lastError;
      });
    } catch (_e) { /* extension context invalidated */ }
  }

  // ---------- event handlers ----------

  function onFocusIn(e) {
    const t = e.target;
    if (!isEditableTarget(t)) return;
    if (!prevValues.has(t)) prevValues.set(t, getElementText(t));
  }

  function onInput(e) {
    const t = e.target;
    if (!sessionActive) {
      // still keep prev values fresh, cheap
      if (isEditableTarget(t)) prevValues.set(t, getElementText(t));
      return;
    }
    if (!isEditableTarget(t)) return;

    const prev = prevValues.has(t) ? prevValues.get(t) : '';
    const curr = getElementText(t);
    prevValues.set(t, curr);

    const inputType = e.inputType || '';
    const lenDelta = curr.length - prev.length;

    // Classify
    if (inputType.startsWith('delete')) {
      const removed = Math.max(0, -lenDelta);
      if (removed > 0) sendDelta({ kind: 'deleted', removed });
      return;
    }

    // Pasted / dropped / replacement text
    if (
      inputType === 'insertFromPaste' ||
      inputType === 'insertFromDrop' ||
      inputType === 'insertReplacementText' ||
      inputType === 'insertFromPasteAsQuotation'
    ) {
      // Prefer event.data when present; otherwise fall back to the diff.
      let added = typeof e.data === 'string' && e.data.length > 0
        ? e.data
        : (lenDelta > 0 ? curr.slice(prev.length ? findAddStart(prev, curr) : 0, findAddStart(prev, curr) + lenDelta) : '');
      // Guard against empty strings when the diff can't be computed
      if (!added && lenDelta > 0) added = ' '.repeat(lenDelta);
      if (added) sendDelta({ kind: 'pasted', added });
      return;
    }

    // Typed / line break / composition — treat as typed
    if (
      inputType === '' ||
      inputType.startsWith('insertText') ||
      inputType === 'insertLineBreak' ||
      inputType === 'insertParagraph' ||
      inputType.startsWith('insertComposition')
    ) {
      if (lenDelta > 0) {
        // Prefer event.data when it matches lenDelta, else synthesize
        let added;
        if (typeof e.data === 'string' && e.data.length === lenDelta) {
          added = e.data;
        } else if (
          inputType === 'insertLineBreak' ||
          inputType === 'insertParagraph'
        ) {
          added = '\n'.repeat(lenDelta);
        } else if (typeof e.data === 'string' && e.data.length > 0) {
          added = e.data;
        } else {
          added = ' '.repeat(lenDelta);
        }
        sendDelta({ kind: 'typed', added });
      } else if (lenDelta < 0) {
        // Rare: typing that resulted in a shrink (e.g., IME cleanup)
        sendDelta({ kind: 'deleted', removed: -lenDelta });
      }
      return;
    }

    // Fallback: unknown inputType — use length diff
    if (lenDelta > 0) {
      sendDelta({ kind: 'typed', added: ' '.repeat(lenDelta) });
    } else if (lenDelta < 0) {
      sendDelta({ kind: 'deleted', removed: -lenDelta });
    }
  }

  /**
   * Return the index in `curr` where the added chunk starts, given `prev`.
   * Compares common prefix; used only for paste fallback.
   */
  function findAddStart(prev, curr) {
    const max = Math.min(prev.length, curr.length);
    let i = 0;
    while (i < max && prev.charCodeAt(i) === curr.charCodeAt(i)) i++;
    return i;
  }

  // Use capture so we see the event even if the page stops propagation.
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('input', onInput, true);
})();
