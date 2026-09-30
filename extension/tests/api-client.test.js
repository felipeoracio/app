/** Tests for the extension backend client cookie and error behavior. */
const assert = require('node:assert/strict');
const API = require('../shared/api-client.js');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('requests include browser-managed credentials without auth headers', async () => {
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 200, json: async () => ({ authenticated: true }) };
  };
  await API.post('/auth/login', { email: 'writer@example.com', password: 'password' });
  assert.equal(captured.url, `${API.API_BASE}/auth/login`);
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.headers.Authorization, undefined);
});

test('API errors preserve the response status', async () => {
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ detail: 'Authentication required' }) });
  await assert.rejects(() => API.get('/auth/me'), (error) => error instanceof API.ApiError && error.status === 401);
});

test('multipart uploads keep browser-generated content headers', async () => {
  let captured;
  global.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, status: 201, json: async () => ({ id: 'document-id' }) };
  };
  const form = new FormData();
  form.append('document_title', 'Notes');
  await API.upload('/documents/upload', form);
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.headers, undefined);
  assert.equal(captured.options.body, form);
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