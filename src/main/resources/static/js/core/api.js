export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class AerolabApi {
  constructor({ baseUrl = '' } = {}) {
    this.baseUrl = baseUrl;
  }

  async simulate({ model, conditions, signal }) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException('求解请求超时', 'TimeoutError')), 30000);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    try {
      const response = await fetch(`${this.baseUrl}/api/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, conditions }),
        signal: combined
      });
      const payload = await this.#parseBody(response);
      if (!response.ok) {
        const message = payload?.detail || payload?.title || `求解失败 (HTTP ${response.status})`;
        throw new ApiError(message, response.status, payload);
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        throw new ApiError('求解请求已取消或超时，请重试。', 0, null);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async #parseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { detail: text };
    }
  }
}
