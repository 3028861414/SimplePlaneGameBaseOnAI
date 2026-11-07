import { showToast } from '../core/ui.js';
import { icon } from '../util/icons.js';
import { normalizeAircraft } from '../core/model.js';
import { FlightWorldScene } from './world-scene.js';
import { FlightSocket } from './flight-socket.js';
import { FlightHud } from './flight-hud.js';

const SERVER_CONTROL_ACTIONS = new Set([
  'throttleUp', 'throttleDown', 'pitchUp', 'pitchDown', 'yawLeft', 'yawRight',
  'rollLeft', 'rollRight', 'boost', 'brake'
]);
const CHUNK_RADIUS_KEY = 'aerolab.flight.chunk-radius.v1';
const AIRFLOW_KEY = 'aerolab.flight.airflow.v1';
const WEATHER_KEY = 'aerolab.flight.weather.v1';
const FIRST_PERSON_HUD_KEY = 'aerolab.flight.first-person-hud.v1';
const DEFAULT_CHUNK_RADIUS = 3;

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
    this.chunkRadius = loadChunkRadius();
    this.airflowEnabled = loadBoolean(AIRFLOW_KEY, true);
    this.weatherEnabled = loadBoolean(WEATHER_KEY, false);
    this.firstPersonHudEnabled = loadBoolean(FIRST_PERSON_HUD_KEY, true);

    this.scene = new FlightWorldScene(container, this.model);
    this.scene.setAirflowVisible(this.airflowEnabled);
    this.scene.setWeatherVisible(this.weatherEnabled);
    this.hud = new FlightHud(overlay, {
      model: this.model,
      onToggleCamera: () => this._toggleCamera(),
      onRestart: () => this._restart(),
      onExit: () => this.onExit?.(),
      onRetry: () => this._connect(),
      onChunkRadiusChange: value => this._setChunkRadius(value),
      onAirflowChange: value => this._setAirflow(value),
      onWeatherChange: value => this._setWeather(value),
      onFirstPersonHudChange: value => this._setFirstPersonHud(value),
      onEngineThrottle: (engineId, value) => this.socket?.setEngineThrottle(engineId, value),
      initialAirflow: this.airflowEnabled,
      initialWeather: this.weatherEnabled,
      initialFirstPersonHud: this.firstPersonHudEnabled
    });
    this.hud.setCameraMode('third');
    this.hud.setWeatherEnabled(this.weatherEnabled);
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
      onChunks: message => this._onChunks(message),
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
      bindings: this.model.bindings,
      chunkRadius: this.chunkRadius
    });
  }

  _onReady(world, state) {
    if (this._disposed) return;
    this._ready = true;
    this.chunkRadius = world.chunkRadius ?? this.chunkRadius;
    if (!this._worldBuilt) {
      this.scene.setWorld(world);
      this._worldBuilt = true;
    } else {
      this.scene.setChunkRadius(this.chunkRadius);
      this.scene.replaceChunks(world.chunks);
    }
    this.scene.setInitialState(state);
    this.hud.setChunkSettings({
      radius: this.chunkRadius,
      min: world.minChunkRadius,
      max: world.maxChunkRadius,
      chunkSize: world.chunkSize
    });
    this.hud.hideLoading();
    if (this.weatherEnabled) this.socket?.setWeather(true);
    this.hud.update(state, this.scene.getMapData());
    this._setLinkState('实时飞行 · 60 Hz', 'live');
    this.hud.setNotice('滑行起飞：增加油门，达到起飞速度后抬头', { duration: 4200 });
    this.scene.viewport.resize();
  }

  _onState(state) {
    if (this._disposed || !this._ready) return;
    this.scene.pushState(state);
    const now = performance.now();
    if (now - (this._hudUpdatedAt ?? 0) < 50) return;
    this._hudUpdatedAt = now;
    this.hud.update(state, this.scene.getMapData());
  }

  _onChunks(message) {
    if (this._disposed) return;
    this.scene.applyChunkUpdate(message.added, message.removed);
  }

  _setChunkRadius(value) {
    const radius = Math.max(2, Math.min(6, Number(value) || DEFAULT_CHUNK_RADIUS));
    this.chunkRadius = radius;
    try {
      localStorage.setItem(CHUNK_RADIUS_KEY, String(radius));
    } catch {
      // Storage can be unavailable in private browsing; the runtime value still applies.
    }
    this.scene.setChunkRadius(radius);
    this.socket?.setChunkRadius(radius);
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

  _setAirflow(enabled) {
    this.airflowEnabled = Boolean(enabled);
    this.scene.setAirflowVisible(this.airflowEnabled);
    saveBoolean(AIRFLOW_KEY, this.airflowEnabled);
    this.hud.setNotice(this.airflowEnabled ? '空气粒子已开启' : '空气粒子已关闭', { duration: 1600 });
  }

  _setWeather(enabled) {
    this.weatherEnabled = Boolean(enabled);
    this.scene.setWeatherVisible(this.weatherEnabled);
    this.socket?.setWeather(this.weatherEnabled);
    saveBoolean(WEATHER_KEY, this.weatherEnabled);
    this.hud.setNotice(
      this.weatherEnabled ? '天气系统已开启：阵风与湍流作用于飞机' : '天气系统已关闭：空气保持静止',
      { duration: 2200 }
    );
  }

  _setFirstPersonHud(enabled) {
    this.firstPersonHudEnabled = Boolean(enabled);
    saveBoolean(FIRST_PERSON_HUD_KEY, this.firstPersonHudEnabled);
    if (this.scene.cameraMode !== 'first') {
      this.hud.setNotice('第一人称 HUD 开关将在座舱视角生效', { duration: 2000 });
    } else {
      this.hud.setNotice(this.firstPersonHudEnabled ? '座舱 HUD 已开启' : '座舱 HUD 已关闭', { duration: 1600 });
    }
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

function loadChunkRadius() {
  try {
    const raw = localStorage.getItem(CHUNK_RADIUS_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_CHUNK_RADIUS;
    const stored = Number(raw);
    return Number.isFinite(stored) ? Math.max(2, Math.min(6, Math.round(stored))) : DEFAULT_CHUNK_RADIUS;
  } catch {
    return DEFAULT_CHUNK_RADIUS;
  }
}


function loadBoolean(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
}

function saveBoolean(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage is optional; the current session still uses the value.
  }
}
