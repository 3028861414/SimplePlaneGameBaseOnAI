/**
 * Thin transport adapter around the flight WebSocket. It deliberately knows
 * nothing about rendering or flight physics; a replacement transport can
 * implement the same small surface.
 */
export class FlightSocket {
  constructor({ onReady, onState, onChunks, onError, onClose } = {}) {
    this.onReady = onReady;
    this.onState = onState;
    this.onChunks = onChunks;
    this.onError = onError;
    this.onClose = onClose;
    this.ws = null;
    this._manualClose = false;
    this._readyTimer = null;
    this._ready = false;
  }

  connect(payload) {
    this.disconnect();
    this._manualClose = false;
    this._ready = false;
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${scheme}//${window.location.host}/ws/flight`);
    this.ws = socket;
    this._readyTimer = setTimeout(() => {
      if (socket === this.ws && !this._ready) {
        this.onError?.('飞行核心响应超时，请确认服务器仍在运行。');
        socket.close();
      }
    }, 15000);

    socket.addEventListener('open', () => {
      if (socket !== this.ws) return;
      socket.send(JSON.stringify({ type: 'start', ...payload }));
    });

    socket.addEventListener('message', event => {
      if (socket !== this.ws) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        this.onError?.('收到无法解析的飞行数据。');
        return;
      }
      if (message.type === 'ready') {
        clearTimeout(this._readyTimer);
        this._ready = true;
        this.onReady?.(message.world, message.state);
      } else if (message.type === 'state') {
        this.onState?.(message.state);
      } else if (message.type === 'chunks') {
        this.onChunks?.(message);
      } else if (message.type === 'error') {
        this.onError?.(message.message || '飞行核心返回错误。');
      }
    });

    socket.addEventListener('error', () => {
      if (socket !== this.ws) return;
      this.onError?.('无法连接飞行核心，请确认 WebSocket 服务可用。');
    });

    socket.addEventListener('close', event => {
      if (socket !== this.ws) return;
      clearTimeout(this._readyTimer);
      this.ws = null;
      if (!this._manualClose) this.onClose?.(event.code, event.reason);
    });
  }

  sendKey(code, pressed) {
    this._send({ type: 'key', code, pressed });
  }

  reset() {
    this._send({ type: 'reset' });
  }

  setChunkRadius(value) {
    this._send({ type: 'chunkRadius', value });
  }

  disconnect() {
    clearTimeout(this._readyTimer);
    if (!this.ws) return;
    this._manualClose = true;
    const socket = this.ws;
    this.ws = null;
    try {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'close' }));
      socket.close(1000, 'leaving-flight');
    } catch {
      // The socket may already be closing; there is nothing left to release.
    }
  }

  _send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}
