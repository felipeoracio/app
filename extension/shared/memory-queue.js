/**
 * Encrypted local queue for writing explicitly saved to AI Memory.
 *
 * A non-extractable AES-GCM CryptoKey lives in IndexedDB. chrome.storage.local
 * receives only ciphertext plus minimal queue state; plaintext writing is never
 * persisted locally by this module.
 */
(function attach(scope) {
  const QUEUE_KEY = 'wc_ai_memory_queue';
  const DB_NAME = 'unoword-private-keys';
  const STORE_NAME = 'keys';
  const KEY_ID = 'ai-memory-queue-v1';
  const MAX_ITEMS = 100;
  const MAX_CHARS = 100000;

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function openKeyDatabase() {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) { reject(new Error('indexeddb_unavailable')); return; }
      const request = globalThis.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('key_store_unavailable'));
    });
  }

  async function getOrCreateKey() {
    const db = await openKeyDatabase();
    const existing = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (existing) { db.close(); return existing; }
    const key = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(key, KEY_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
    return key;
  }

  async function encryptWithKey(payload, key) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(encrypted)) };
  }

  async function decryptWithKey(encrypted, key) {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(encrypted.iv) },
      key,
      base64ToBytes(encrypted.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }

  async function getQueue() {
    const stored = await chrome.storage.local.get(QUEUE_KEY);
    return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
  }

  async function setQueue(queue) {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(0, MAX_ITEMS) });
  }

  async function enqueue(payload, ownerUserId = null) {
    const content = String(payload && payload.content || '');
    if (!content.trim()) throw new Error('empty_writing');
    if (content.length > MAX_CHARS) throw new Error('writing_too_large');
    const queue = await getQueue();
    if (queue.length >= MAX_ITEMS) throw new Error('queue_full');
    const encrypted = await encryptWithKey(payload, await getOrCreateKey());
    const entry = {
      id: globalThis.crypto.randomUUID(),
      version: 1,
      ownerUserId: ownerUserId || null,
      state: 'queued',
      syncedAt: null,
      cloudId: null,
      ...encrypted,
    };
    await setQueue([...queue, entry]);
    return entry;
  }

  async function readPayload(entry) {
    return decryptWithKey(entry, await getOrCreateKey());
  }

  async function status(ownerUserId = null) {
    const queue = await getQueue();
    const owned = ownerUserId ? queue.filter((entry) => entry.ownerUserId === ownerUserId) : [];
    const unclaimed = queue.filter((entry) => !entry.ownerUserId && entry.state === 'queued');
    return {
      total: owned.length + unclaimed.length,
      unclaimed: unclaimed.length,
      pending: owned.filter((entry) => entry.state === 'queued').length,
      synced: owned.filter((entry) => entry.state === 'synced').length,
      full: queue.length >= MAX_ITEMS,
    };
  }

  async function claimUnowned(ownerUserId) {
    const queue = await getQueue();
    let claimed = 0;
    const next = queue.map((entry) => {
      if (!entry.ownerUserId && entry.state === 'queued') { claimed++; return { ...entry, ownerUserId }; }
      return entry;
    });
    await setQueue(next);
    return claimed;
  }

  async function pendingForOwner(ownerUserId) {
    return (await getQueue()).filter((entry) => entry.ownerUserId === ownerUserId && entry.state === 'queued');
  }

  async function markSynced(entryId, cloudId) {
    const queue = await getQueue();
    const next = queue.map((entry) => entry.id === entryId
      ? { ...entry, state: 'synced', syncedAt: Date.now(), cloudId: cloudId || null }
      : entry);
    await setQueue(next);
  }

  async function removeSynced(ownerUserId) {
    const queue = await getQueue();
    const next = queue.filter((entry) => !(entry.ownerUserId === ownerUserId && entry.state === 'synced'));
    const removed = queue.length - next.length;
    await setQueue(next);
    return removed;
  }

  const api = {
    QUEUE_KEY, MAX_ITEMS, MAX_CHARS, getOrCreateKey, encryptWithKey, decryptWithKey,
    enqueue, readPayload, status, claimUnowned, pendingForOwner, markSynced, removeSynced,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.WCMemoryQueue = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));