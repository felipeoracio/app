/**
 * Word Count Extension — Content Script
 *
 * Two responsibilities on every allowed page:
 *
 *   1. Typing pipeline
 *      Watches for `input` events on editable targets (<textarea>,
 *      <input> text-like, contenteditable) and sends granular deltas
 *      { kind: 'typed' | 'pasted' | 'deleted', ... } to the background
 *      service worker while a session is active.
 *
 *   2. Floating on-screen counter
 *      Injects a Shadow-DOM overlay that mirrors the session state and
 *      updates live. Draggable, positioned bottom-right by default,
 *      supports click-to-expand with an in-page Stop Session button.
 *      Fully isolated from host-page CSS via Shadow DOM. Never
 *      inserted into the document flow — always position: fixed.
 */

(() => {
  if (window.__wcContentScriptLoaded) return;
  window.__wcContentScriptLoaded = true;

  // =====================================================================
  // Shared state (cached from chrome.storage; kept fresh via onChanged)
  // =====================================================================

  let sessionState = {
    active: false,
    typedWords: 0,
    pastedWords: 0,
    startedAt: null,
  };
  let settings = {
    pasteMode: 'separate',
    counterPos: null,
  };

  const STATE_KEY = 'wc_state';
  const SETTINGS_KEY = 'wc_settings';

  // ---------------------------------------------------------------------
  // Storage bootstrap + live sync
  // ---------------------------------------------------------------------

  function readInitial() {
    try {
      chrome.storage.local.get([STATE_KEY, SETTINGS_KEY], (data) => {
        if (chrome.runtime.lastError) return;
        if (data?.[STATE_KEY]) sessionState = { ...sessionState, ...data[STATE_KEY] };
        if (data?.[SETTINGS_KEY]) settings = { ...settings, ...data[SETTINGS_KEY] };
        Overlay.syncFromState();
      });
    } catch (_e) { /* extension context invalidated */ }
  }
  readInitial();

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STATE_KEY]?.newValue) {
        sessionState = { ...sessionState, ...changes[STATE_KEY].newValue };
      }
      if (changes[SETTINGS_KEY]?.newValue) {
        settings = { ...settings, ...changes[SETTINGS_KEY].newValue };
      }
      Overlay.syncFromState();
    });
  } catch (_e) { /* ignore */ }

  // =====================================================================
  // PART 1 · Typing pipeline
  // =====================================================================

  const TEXT_INPUT_TYPES = new Set([
    'text', 'search', 'url', 'tel', 'email', 'password', 'number',
  ]);

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

  const prevValues = new WeakMap();

  function sendDelta(delta) {
    try {
      chrome.runtime.sendMessage({ type: 'DELTA', delta }, () => {
        void chrome.runtime.lastError;
      });
    } catch (_e) { /* extension context invalidated */ }
  }

  function findAddStart(prev, curr) {
    const max = Math.min(prev.length, curr.length);
    let i = 0;
    while (i < max && prev.charCodeAt(i) === curr.charCodeAt(i)) i++;
    return i;
  }

  function onFocusIn(e) {
    const t = e.target;
    if (!isEditableTarget(t)) return;
    if (!prevValues.has(t)) prevValues.set(t, getElementText(t));
  }

  function onInput(e) {
    const t = e.target;
    if (!sessionState.active) {
      if (isEditableTarget(t)) prevValues.set(t, getElementText(t));
      return;
    }
    if (!isEditableTarget(t)) return;

    const prev = prevValues.has(t) ? prevValues.get(t) : '';
    const curr = getElementText(t);
    prevValues.set(t, curr);

    const inputType = e.inputType || '';
    const lenDelta = curr.length - prev.length;

    if (inputType.startsWith('delete')) {
      const removed = Math.max(0, -lenDelta);
      if (removed > 0) sendDelta({ kind: 'deleted', removed });
      return;
    }

    if (
      inputType === 'insertFromPaste' ||
      inputType === 'insertFromDrop' ||
      inputType === 'insertReplacementText' ||
      inputType === 'insertFromPasteAsQuotation'
    ) {
      let added = typeof e.data === 'string' && e.data.length > 0
        ? e.data
        : (lenDelta > 0
            ? curr.slice(findAddStart(prev, curr), findAddStart(prev, curr) + lenDelta)
            : '');
      if (!added && lenDelta > 0) added = ' '.repeat(lenDelta);
      if (added) sendDelta({ kind: 'pasted', added });
      return;
    }

    if (
      inputType === '' ||
      inputType.startsWith('insertText') ||
      inputType === 'insertLineBreak' ||
      inputType === 'insertParagraph' ||
      inputType.startsWith('insertComposition')
    ) {
      if (lenDelta > 0) {
        let added;
        if (typeof e.data === 'string' && e.data.length === lenDelta) {
          added = e.data;
        } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
          added = '\n'.repeat(lenDelta);
        } else if (typeof e.data === 'string' && e.data.length > 0) {
          added = e.data;
        } else {
          added = ' '.repeat(lenDelta);
        }
        sendDelta({ kind: 'typed', added });
      } else if (lenDelta < 0) {
        sendDelta({ kind: 'deleted', removed: -lenDelta });
      }
      return;
    }

    if (lenDelta > 0) sendDelta({ kind: 'typed', added: ' '.repeat(lenDelta) });
    else if (lenDelta < 0) sendDelta({ kind: 'deleted', removed: -lenDelta });
  }

  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('input', onInput, true);

  // =====================================================================
  // PART 2 · Floating on-screen counter
  // =====================================================================

  const Overlay = (() => {
    /** @type {HTMLDivElement|null} */ let host = null;
    /** @type {ShadowRoot|null}    */ let root = null;
    /** @type {HTMLElement|null}   */ let card = null;
    /** @type {HTMLElement|null}   */ let numEl = null;
    /** @type {HTMLElement|null}   */ let labelEl = null;
    /** @type {HTMLElement|null}   */ let expandEl = null;
    let expanded = false;
    let dragActive = false;
    let dragMoved = false;
    let dragStart = { x: 0, y: 0, left: 0, top: 0 };

    // margin from viewport edges when using default position
    const EDGE = 20;

    function mount() {
      if (host || !document.body) return;
      host = document.createElement('div');
      host.id = 'wc-floating-host';
      // The host itself has no visual — the shadow root does. We only need
      // it to sit at the very top of the stacking context.
      host.style.all = 'initial';
      host.style.position = 'fixed';
      host.style.zIndex = '2147483647';
      host.style.top = '0';
      host.style.left = '0';
      host.style.width = '0';
      host.style.height = '0';
      host.style.pointerEvents = 'none';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = STYLES + HTML;
      card = root.getElementById('card');
      numEl = root.getElementById('num');
      labelEl = root.getElementById('label');
      expandEl = root.getElementById('expand');
      wireEvents();
      document.documentElement.appendChild(host);
    }

    function unmount() {
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = null; root = null; card = null; numEl = null; labelEl = null;
      expandEl = null; expanded = false; dragActive = false;
    }

    function wireEvents() {
      // Drag on the card body itself. We only start a drag after a small
      // pointer movement so click-to-expand still works.
      card.addEventListener('pointerdown', onPointerDown);
      root.getElementById('stop-btn').addEventListener('click', onStopClicked);
      // Click (without drag) toggles expand
      card.addEventListener('click', (e) => {
        if (dragMoved) { dragMoved = false; return; }
        // Don't toggle when clicking the stop button (it stops propagation)
        toggleExpand();
        e.stopPropagation();
      });
      // Keyboard accessibility on the card
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Word count. Press Enter to expand or collapse.');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleExpand();
        } else if (e.key === 'Escape' && expanded) {
          e.preventDefault();
          toggleExpand();
        }
      });
    }

    function onStopClicked(e) {
      e.stopPropagation();
      try {
        chrome.runtime.sendMessage({ type: 'STOP_SESSION' }, () => {
          void chrome.runtime.lastError;
        });
      } catch (_e) { /* ignore */ }
    }

    function toggleExpand() {
      expanded = !expanded;
      if (!card) return;
      card.classList.toggle('is-expanded', expanded);
      expandEl.hidden = !expanded;
      card.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function onPointerDown(e) {
      // Ignore right-click and clicks on the stop button
      if (e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('#stop-btn')) return;
      dragActive = true;
      dragMoved = false;
      const rect = card.getBoundingClientRect();
      dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
      card.setPointerCapture?.(e.pointerId);
      card.addEventListener('pointermove', onPointerMove);
      card.addEventListener('pointerup', onPointerUp);
      card.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
      if (!dragActive) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (!dragMoved && Math.hypot(dx, dy) < 4) return; // small threshold
      dragMoved = true;
      const nextLeft = clamp(
        dragStart.left + dx, 4, window.innerWidth  - card.offsetWidth  - 4
      );
      const nextTop  = clamp(
        dragStart.top  + dy, 4, window.innerHeight - card.offsetHeight - 4
      );
      applyPosition({ x: nextLeft, y: nextTop });
    }

    function onPointerUp(e) {
      if (!dragActive) return;
      dragActive = false;
      card.releasePointerCapture?.(e?.pointerId);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
      card.removeEventListener('pointercancel', onPointerUp);
      if (dragMoved) {
        // Persist new position
        const rect = card.getBoundingClientRect();
        try {
          chrome.runtime.sendMessage({
            type: 'SET_SETTINGS',
            settings: { counterPos: { x: rect.left, y: rect.top } },
          }, () => { void chrome.runtime.lastError; });
        } catch (_e) { /* ignore */ }
      }
    }

    function clamp(v, min, max) {
      if (max < min) return min;
      return Math.max(min, Math.min(max, v));
    }

    function applyPosition(pos) {
      if (!card) return;
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        card.style.left = `${pos.x}px`;
        card.style.top  = `${pos.y}px`;
        card.style.right = 'auto';
        card.style.bottom = 'auto';
      } else {
        // Default: bottom-right
        card.style.left = 'auto';
        card.style.top  = 'auto';
        card.style.right  = `${EDGE}px`;
        card.style.bottom = `${EDGE}px`;
      }
    }

    function fmt(n) {
      const lang = (window.WCi18n && window.WCi18n.getLang && window.WCi18n.getLang()) === 'es' ? 'es-ES' : 'en-US';
      return Number(n || 0).toLocaleString(lang);
    }

    function tt(key, vars) {
      if (window.WCi18n && window.WCi18n.t) return window.WCi18n.t(key, vars);
      // Fallback English strings if i18n not attached
      const en = {
        'session.word': 'word', 'session.words': 'words',
        'session.wordTyped': 'word typed', 'session.wordsTyped': 'words typed',
        'session.pastedSuffix': `+ ${vars ? vars.n : ''} pasted`,
        'session.goalReached': 'Goal reached',
      };
      return en[key] || key;
    }

    function computeDisplay() {
      const typed = sessionState.typedWords || 0;
      const pasted = sessionState.pastedWords || 0;
      const combined = typed + pasted;
      const goal = sessionState.sessionGoal || 0;
      const isPro = (settings.plan || 'free') === 'pro';
      const primaryValue = settings.pasteMode === 'as_typed' ? combined : typed;
      const label = settings.pasteMode === 'as_typed'
        ? (primaryValue === 1 ? tt('session.word') : tt('session.words'))
        : (typed === 1 ? tt('session.word') : tt('session.words'));

      // Format primary. Pro users see "127 / 250" style.
      let text;
      if (isPro && goal > 0) {
        text = `${fmt(primaryValue)} / ${fmt(goal)}`;
      } else {
        text = fmt(primaryValue);
      }

      const parts = { text, label };
      // Secondary line for separate paste mode
      if (settings.pasteMode === 'separate' && pasted > 0) {
        parts.secondary = tt('session.pastedSuffix', { n: fmt(pasted) });
      } else {
        parts.secondary = '';
      }
      // Reached indicator
      parts.reached = isPro && goal > 0 && primaryValue >= goal;
      return parts;
    }

    function syncFromState() {
      if (sessionState.active) {
        if (!host) mount();
        if (!host) return;
        applyPosition(settings.counterPos);
        renderCount();
      } else {
        if (host) unmount();
      }
    }

    function renderCount() {
      if (!numEl) return;
      const d = computeDisplay();
      numEl.textContent = d.text;
      labelEl.textContent = d.label;
      const secEl = root.getElementById('secondary');
      if (d.secondary) { secEl.textContent = d.secondary; secEl.hidden = false; }
      else             { secEl.hidden = true; }
      const dotEl = root.getElementById('dot');
      if (dotEl) dotEl.classList.toggle('is-reached', !!d.reached);
      // Stop button label (localized)
      const stopEl = root.getElementById('stop-btn');
      if (stopEl) stopEl.textContent = tt('session.stop');
    }

    // Re-apply position if viewport shrinks such that the counter would
    // otherwise be off-screen.
    window.addEventListener('resize', () => {
      if (!host || !card) return;
      const rect = card.getBoundingClientRect();
      const maxLeft = window.innerWidth  - card.offsetWidth  - 4;
      const maxTop  = window.innerHeight - card.offsetHeight - 4;
      if (rect.left > maxLeft || rect.top > maxTop) {
        applyPosition(settings.counterPos ? {
          x: clamp(rect.left, 4, maxLeft),
          y: clamp(rect.top,  4, maxTop),
        } : null);
      }
    }, { passive: true });

    return { syncFromState };
  })();

  // =====================================================================
  // Overlay markup + styles (kept alongside logic for locality)
  // =====================================================================

  const HTML = `
    <div id="card" part="card" data-testid="wc-floating-counter">
      <div id="row">
        <span id="dot" aria-hidden="true"></span>
        <span id="num" data-testid="wc-floating-number">0</span>
        <span id="label" data-testid="wc-floating-label">words</span>
        <span id="grip" aria-hidden="true" title="Drag to move">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="2.5" cy="2.5" r="1" fill="currentColor"/>
            <circle cx="7.5" cy="2.5" r="1" fill="currentColor"/>
            <circle cx="2.5" cy="7.5" r="1" fill="currentColor"/>
            <circle cx="7.5" cy="7.5" r="1" fill="currentColor"/>
          </svg>
        </span>
      </div>
      <div id="secondary" hidden data-testid="wc-floating-secondary"></div>
      <div id="expand" hidden>
        <button id="stop-btn" type="button" data-testid="wc-floating-stop">Stop Session</button>
      </div>
    </div>
  `;

  const STYLES = `
    <style>
      :host, * { box-sizing: border-box; }
      [hidden] { display: none !important; }

      #card {
        position: fixed;
        right: 20px; bottom: 20px;
        pointer-events: auto;
        display: inline-flex;
        flex-direction: column;
        gap: 6px;
        padding: 9px 12px 9px 11px;
        min-width: 0;
        background: rgba(255,255,255,0.96);
        color: #0B0D12;
        border: 1px solid rgba(11,13,18,0.10);
        border-radius: 12px;
        box-shadow:
          0 1px 2px rgba(11,13,18,0.06),
          0 8px 24px rgba(11,13,18,0.10);
        backdrop-filter: saturate(140%) blur(10px);
        -webkit-backdrop-filter: saturate(140%) blur(10px);
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
                     "Helvetica Neue", Arial, sans-serif;
        font-size: 13px;
        line-height: 1.2;
        user-select: none;
        cursor: grab;
        transition: box-shadow 160ms ease, transform 140ms ease;
      }
      #card:hover  { box-shadow: 0 2px 4px rgba(11,13,18,0.08), 0 14px 32px rgba(11,13,18,0.14); }
      #card:active { cursor: grabbing; }
      #card:focus-visible { outline: 2px solid #1F5EFF; outline-offset: 2px; }

      #row {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }

      #dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #12B76A;
        box-shadow: 0 0 0 3px rgba(18,183,106,0.18);
        animation: wc-pulse 2.6s ease-in-out infinite;
        flex: 0 0 auto;
        transition: background-color 200ms ease, box-shadow 200ms ease;
      }
      #dot.is-reached {
        background: #1F5EFF;
        box-shadow: 0 0 0 3px rgba(31,94,255,0.18);
      }
      @keyframes wc-pulse {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.65; }
      }
      @media (prefers-reduced-motion: reduce) {
        #dot { animation: none; }
      }

      #num {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #0B0D12;
      }
      #label {
        color: #5B6172;
        font-weight: 500;
      }
      #grip {
        margin-left: 4px;
        color: rgba(11,13,18,0.28);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      #secondary {
        font-size: 11.5px;
        color: #8A90A2;
        font-variant-numeric: tabular-nums;
        padding-left: 15px; /* align under number, past the dot */
      }

      #expand { padding-top: 2px; }
      #stop-btn {
        appearance: none;
        border: 0;
        width: 100%;
        padding: 8px 12px;
        border-radius: 9px;
        background: #F04438;
        color: #fff;
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 600;
        letter-spacing: -0.005em;
        cursor: pointer;
        transition: background-color 140ms ease, transform 120ms ease;
      }
      #stop-btn:hover  { background: #D93B30; }
      #stop-btn:active { transform: translateY(1px); }
      #stop-btn:focus-visible { outline: 2px solid #1F5EFF; outline-offset: 2px; }

      /* Expanded state: subtle grow, keep it compact */
      #card.is-expanded { padding-bottom: 10px; }

      /* Dark mode via OS preference */
      @media (prefers-color-scheme: dark) {
        #card {
          background: rgba(18,21,28,0.92);
          color: #F5F6F8;
          border-color: rgba(255,255,255,0.08);
          box-shadow:
            0 1px 2px rgba(0,0,0,0.5),
            0 10px 28px rgba(0,0,0,0.45);
        }
        #num   { color: #F5F6F8; }
        #label { color: #A4AAB8; }
        #grip  { color: rgba(255,255,255,0.28); }
        #secondary { color: #8A90A2; }
        #dot   { background: #22C77B; box-shadow: 0 0 0 3px rgba(34,199,123,0.18); }
        #stop-btn { background: #F45B4F; }
        #stop-btn:hover { background: #E14A3E; }
      }

      /* Narrow viewport: tighten paddings */
      @media (max-width: 480px) {
        #card { padding: 8px 10px; font-size: 12.5px; border-radius: 10px; }
      }
    </style>
  `;

  // Expose for the storage listener (defined earlier by name, so the
  // closure sees the same reference).
  // (Overlay.syncFromState is already used above.)
})();
