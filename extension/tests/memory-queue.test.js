/** Cryptographic invariants for the encrypted AI Memory queue. */
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');

const Q = require('../shared/memory-queue.js');
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('encrypts and decrypts a writing payload with a non-extractable key', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  assert.equal(key.extractable, false);
  const payload = { content: 'Private unfinished chapter', word_count: 3, save_to_memory: true };
  const encrypted = await Q.encryptWithKey(payload, key);
  assert.equal(encrypted.ciphertext.includes(payload.content), false);
  assert.deepEqual(await Q.decryptWithKey(encrypted, key), payload);
});

test('rejects decryption with a different device key', async () => {
  const first = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const second = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const encrypted = await Q.encryptWithKey({ content: 'Private writing' }, first);
  await assert.rejects(() => Q.decryptWithKey(encrypted, second));
});

test('publishes the selected queue and writing limits', () => {
  assert.equal(Q.MAX_ITEMS, 100);
  assert.equal(Q.MAX_CHARS, 100000);
});

(async () => {
  let passed = 0, failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  \u2713', name); passed++; }
    catch (error) { console.log('  \u2717', name); console.log('     ', error.message); failed++; }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();