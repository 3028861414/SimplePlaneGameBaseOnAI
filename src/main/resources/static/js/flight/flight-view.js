import { showToast } from '../core/ui.js';
import { icon } from '../util/icons.js';
import { normalizeAircraft } from '../core/model.js';
import { FlightWorldScene } from './world-scene.js';
import { FlightSocket } from './flight-socket.js';
import { FlightHud } from './flight-hud.js';

const SERVER_CONTROL_ACTIONS = new Set([
  'throttleUp', 'throttleDown', 'pitchUp', 'pitchDown', 'yawLeft', 'yawRight', 'boost', 'brake'
]);

export class FlightView {
  constructor({ container, overlay, headerActions, store, onExit }) {
    this.headerActions = headerActions;
    this.onExit = onExit;
    this.model = normalizeAircraft(store.snapshot());
    this._disposed = false;
    this._ready = false;
    this._worldBuilt = false;
    this._pressedKeys = new Set();
    this._events = new AbortController();

    this.scene = new FlightWorldScene(container, this.model);
    this.hud = new FlightHud(overlay, {
      model: this.model,
      onToggleCamera: () => this._toggleCamera(),
      onRestart: () => this._restart(),
      onExit: () => this.onExit?.(),
      onRetry: () => this._connect()
    });
    this.hud.setCameraMode('third');
    this._renderHeader();
    this._bindKeyboard();
    this._connect();
  }

  _renderHeader() {
    this.headerActions.innerHTML = `
      <div class="header-status flight-link-status" data-flight-link>
        <span class="status-dot"></span>
        <span data-flight-link-text>连接飞行核心</span>
      </div>
      <button class="btn btn--ghost" type="button" data-action="reset">${icon('reset', 14)} 重新起飞</button>
      <button class="btn btn--primary" type="button" data-action="back">${icon('back', 14)} 返回建模</button>
    `;
    this.ui = {
      link: this.headerActions.querySelector('[data-flight-link]'),
      linkText: this.headerActions.querySelector('[data-flight-link-text]')
    };
    this.headerActions.onclick = event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'back') this.onExit?.();
      if (action === 'reset') this._restart();
    };
  }

  _setLinkState(text, state) {
    this.ui.linkText.textContent = text;
    this.ui.link.dataset.state = state;
  }

  _connect() {
    if (this._disposed) return;
    this._ready = false;
    this._releaseKeys();
    this.hud.resetCrashed();
    this.hud.setLoading('正在生成虚拟世界', '连接飞行核心、铺设跑道并构建柏林噪声地形…');
    this._setLinkState('连接飞行核心', 'connecting');
    this.socket = new FlightSocket({
      onReady: (world, state) => this._onReady(world, state),
      onState: state => this._onState(state),
      onError: message => this._onSocketError(message),
      onClose: (code, reason) => this._onSocketClose(code, reason)
    });
    this.socket.connect({
      model: {
        name: this.model.name,
        parts: this.model.parts,
        cockpit: this.model.cockpit
      },
      flightSystems: this.model.flightSystems,
      bindings: this.model.bindings
    });
  }

  _onReady(world, state) {
    if (this._disposed) return;
    this._ready = true;
    if (!this._worldBuilt) {
      this.scene.setWorld(world);
      this._worldBuilt = true;
    }
    this.scene.setInitialState(state);
    this.hud.hideLoading();
    this.hud.update(state);
    this._setLinkState('实时飞行 · 30 Hz', 'live');
    this.hud.setNotice('滑行起飞：增加油门，达到起飞速度后抬头', { duration: 4200 });
    this.scene.viewport.resize();
  }

  _onState(state) {
    if (this._disposed || !this._ready) return;
    this.scene.pushState(state);
    this.hud.update(state);
  }

  _onSocketError(message) {
    if (this._disposed) return;
    if (this._ready) {
      showToast(message, { type: 'error', title: '飞行核心', duration: 5000 });
      return;
    }
    this._setLinkState('启动失败', 'offline');
    this.hud.setLoading('无法开始飞行', message, { retry: true });
  }

  _onSocketClose(code, reason) {
    if (this._disposed) return;
    this._ready = false;
    this._releaseKeys();
    this._setLinkState('连接已断开', 'offline');
    this.hud.setLoading(
      '飞行连接已断开',
      reason || `计算核心已停止（代码 ${code || 'unknown'}）。世界仍可环视，点击重新连接继续飞行。`,
      { retry: true }
    );
  }

  _toggleCamera() {
    const mode = this.scene.toggleCamera();
    this.hud.setCameraMode(mode);
    if (mode === 'first') this.hud.setNotice('第一人称驾驶舱视角', { duration: 1800 });
    else this.hud.setNotice('第三人称跟随视角', { duration: 1800 });
  }

  _restart() {
    if (this._disposed || !this._ready) return;
    this._releaseKeys();
    this.hud.resetCrashed();
    this.socket?.reset();
    this.hud.setNotice('已重置到跑道起点', { type: 'info', duration: 2200 });
  }

  _bindKeyboard() {
    const signal = this._events.signal;
    const inverse = new Map();
    for (const [action, code] of Object.entries(this.model.bindings)) {
      if (code && !inverse.has(code)) inverse.set(code, action);
    }
    this._actionByCode = inverse;

    document.addEventListener('keydown', event => {
      if (this._disposed) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        this.onExit?.();
        return;
      }
      const action = this._actionByCode.get(event.code);
      if (!action) return;
      event.preventDefault();
      if (event.repeat) return;

      if (action === 'toggleCamera') {
        this._toggleCamera();
        return;
      }
      if (action === 'resetFlight') {
        this._restart();
        return;
      }
      if (action === 'fireGuns') {
        this.hud.setNotice('机炮装配点已记录，武器系统为预留功能', { type: 'info', duration: 2200 });
        return;
      }
      if (!SERVER_CONTROL_ACTIONS.has(action)) return;
      this._pressedKeys.add(event.code);
      this.socket?.sendKey(event.code, true);
    }, { signal });

    document.addEventListener('keyup', event => {
      if (!this._pressedKeys.has(event.code)) return;
      this._pressedKeys.delete(event.code);
      this.socket?.sendKey(event.code, false);
    }, { signal });

    window.addEventListener('blur', () => this._releaseKeys(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._releaseKeys();
    }, { signal });
  }

  _releaseKeys() {
    for (const code of this._pressedKeys) this.socket?.sendKey(code, false);
    this._pressedKeys.clear();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._ready = false;
    this._releaseKeys();
    this.socket?.disconnect();
    this._events.abort();
    this.hud.dispose?.();
    this.scene.dispose();
    this.headerActions.replaceChildren();
    this.headerActions.onclick = null;
  }
}
