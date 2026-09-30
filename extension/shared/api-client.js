/** UnoWord backend client for the extension service worker. */
(function attach(scope) {
  const API_BASE = 'https://uno-ai-coach.preview.emergentagent.com/api';

  class ApiError extends Error {
    constructor(status, body) {
      super(`request failed with ${status}`);
      this.name = 'ApiError';
      this.status = status;
      this.body = body;
    }
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 8000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: options.method || 'GET',
        credentials: 'include',
        headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const body = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, body);
      return body;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new ApiError(0, { detail: 'offline' });
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, { detail: 'offline' });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function upload(path, formData) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new ApiError(response.status, body);
      return body;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new ApiError(0, { detail: 'offline' });
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, { detail: 'offline' });
    } finally {
      clearTimeout(timeout);
    }
  }

  const api = {
    API_BASE,
    ApiError,
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
    upload,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.WCApi = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));