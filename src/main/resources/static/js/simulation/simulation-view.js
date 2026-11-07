import * as THREE from 'three';
import { Viewport, disposeObject } from '../core/viewport.js';
import { AerolabApi } from '../core/api.js';
import { showToast, formatNumber } from '../core/ui.js';
import { icon } from '../util/icons.js';
import { pressureGradient, speedGradient } from '../util/color-map.js';
import { FlowFieldData } from './flow-field.js';
import { WindVectorGizmo } from './wind-vector-gizmo.js';
import { SectionPlane } from './section-plane.js';
import {
  FlowParticles,
  buildSurfaceMeshes,
  createFlowVolume,
  createStreamlines,
  createWindCage
} from './flow-visuals.js';

const SETTINGS_KEY = 'aerolab.sim-settings.v1';
const DEFAULT_SETTINGS = {
  windSpeedMps: 38,
  windDirection: { x: -1, y: 0, z: 0 },
  airDensity: 1.225,
  metric: 'pressure',
  sectionAxis: 'Z',
  sectionEnabled: true,
  display: { streamlines: true, particles: true, volume: true, cage: true }
};

export class SimulationView {
  constructor({ container, overlay, headerActions, store, onBack }) {
    this.container = container;
    this.overlayHost = overlay;
    this.headerActions = headerActions;
    this.store = store;
    this.onBack = onBack;
    this.model = store.snapshot();
    this.api = new AerolabApi();
    this.settings = loadSettings();
    this.metric = this.settings.metric;
    this.sectionAxis = this.settings.sectionAxis;
    this.sectionEnabled = this.settings.sectionEnabled;
    this.sectionCoordinate = null;
    this.display = { ...DEFAULT_SETTINGS.display, ...this.settings.display };
    this.dirty = false;
    this._hasResult = false;
    this._disposed = false;
    this._runId = 0;
    this._sectionFrame = null;
    this.cockpitActive = false;
    this._cockpitLook = { yaw: 0, pitch: 0 };
    this._lookDrag = null;
    this._events = new AbortController();

    this.viewport = new Viewport(container);
    this.scene = this.viewport.scene;
    this.grid = this.viewport.addGrid(120, 120, -4);
    this.dynamicRoot = new THREE.Group();
    this.scene.add(this.dynamicRoot);

    this._renderOverlay();
    this.windGizmo = new WindVectorGizmo(
      this.overlayHost.querySelector('[data-wind-gizmo]'),
      this.settings.windDirection,
      direction => this._onWindGizmoChange(direction)
    );
    this._bindHeader();
    this._bindUI();
    this._bindCanvas();
    this._updateControlReadouts();
    this.viewport.onFrame((delta) => {
      if (this.particles && this.display.particles) this.particles.update(delta);
    });

    setTimeout(() => {
      if (!this._disposed && !this._hasResult && !this._requestController) {
        this.runSimulation({ initial: true });
      }
    }, 0);
  }

  _renderOverlay() {
    this.overlayHost.innerHTML = `
      <div class="simulation-ui" data-simulation-ui>
        <aside class="floating-panel sim-panel sim-conditions">
          <div class="sim-panel-head">
            <div>
              <div class="panel-kicker">Freestream</div>
              <h2>来流条件</h2>
            </div>
            <span class="live-chip"><i></i>3D 风洞</span>
          </div>

          <div class="sim-field">
            <div class="sim-field__head">
              <label for="wind-speed">风速</label>
              <output data-readout="windSpeed">${formatNumber(this.settings.windSpeedMps, 1)} m/s</output>
            </div>
            <input id="wind-speed" class="range-input" type="range" min="1" max="120" step="1"
                   value="${this.settings.windSpeedMps}" data-control="windSpeed">
            <div class="sim-field__ticks"><span>1</span><span>120 m/s</span></div>
          </div>

          <div class="sim-field sim-field--vector">
            <div class="sim-field__head">
              <span class="sim-field-label">来流方向向量</span>
              <output data-readout="windDirection">${directionLabel(this.settings.windDirection)}</output>
            </div>
            <div class="wind-vector-gizmo">
              <canvas data-wind-gizmo width="320" height="170" aria-label="拖动箭头调整来流方向"></canvas>
              <span>拖动橙色箭头头部调整方向</span>
            </div>
            <div class="wind-vector-grid">
              <label title="沿机体纵轴：负值来自机头，正值来自尾部">
                <span>X</span>
                <input type="number" inputmode="decimal" step="0.05" value="${formatNumber(this.settings.windDirection.x, 2)}"
                       data-control="windX" aria-label="来流方向 X 分量">
              </label>
              <label title="垂直方向：负值自上而下，正值自下而上">
                <span>Y</span>
                <input type="number" inputmode="decimal" step="0.05" value="${formatNumber(this.settings.windDirection.y, 2)}"
                       data-control="windY" aria-label="来流方向 Y 分量">
              </label>
              <label title="横向：负值从右舷吹向左舷，正值反之">
                <span>Z</span>
                <input type="number" inputmode="decimal" step="0.05" value="${formatNumber(this.settings.windDirection.z, 2)}"
                       data-control="windZ" aria-label="来流方向 Z 分量">
              </label>
            </div>
            <div class="wind-presets" aria-label="方向预设">
              <button type="button" data-wind-preset="-1,0,0">机头来流</button>
              <button type="button" data-wind-preset="0,0,-1">右舷来流</button>
              <button type="button" data-wind-preset="0,0,1">左舷来流</button>
              <button type="button" data-wind-preset="1,0,0">尾部来流</button>
              <button type="button" data-wind-preset="0,-1,0">顶部来流</button>
              <button type="button" data-wind-preset="-0.7,-0.25,-0.65">斜向复合</button>
            </div>
            <p class="wind-vector-note">输入空气流动方向，求解器自动归一化；向量不可为零。</p>
          </div>

          <div class="sim-field sim-field--compact">
            <div class="sim-field__head">
              <label for="air-density">空气密度</label>
              <output data-readout="airDensity">${formatNumber(this.settings.airDensity, 3)} kg/m³</output>
            </div>
            <input id="air-density" class="range-input" type="range" min="0.8" max="1.5" step="0.005"
                   value="${this.settings.airDensity}" data-control="airDensity">
          </div>

          <div class="sim-divider"></div>

          <div class="sim-control-label">场着色</div>
          <div class="segmented segmented--wide">
            <button type="button" class="${this.metric === 'pressure' ? 'is-active' : ''}" data-metric="pressure">
              压力场
            </button>
            <button type="button" class="${this.metric === 'speed' ? 'is-active' : ''}" data-metric="speed">
              风速场
            </button>
          </div>

          <div class="sim-control-label">显示图层</div>
          <div class="display-chips">
            <button class="display-chip ${this.display.streamlines ? 'is-active' : ''}" type="button"
                    data-display-toggle="streamlines" aria-pressed="${this.display.streamlines}">
              <i class="chip-line"></i>流线
            </button>
            <button class="display-chip ${this.display.particles ? 'is-active' : ''}" type="button"
                    data-display-toggle="particles" aria-pressed="${this.display.particles}">
              <i class="chip-dot"></i>粒子
            </button>
            <button class="display-chip ${this.display.volume ? 'is-active' : ''}" type="button"
                    data-display-toggle="volume" aria-pressed="${this.display.volume}">
              <i class="chip-volume"></i>场雾
            </button>
            <button class="display-chip ${this.display.cage ? 'is-active' : ''}" type="button"
                    data-display-toggle="cage" aria-pressed="${this.display.cage}">
              <i class="chip-cage"></i>边界
            </button>
          </div>

          <p class="sim-hint">方向向量支持任意三维来流；调整条件后使用右上角“重新求解”。</p>
        </aside>

        <aside class="floating-panel sim-panel sim-section-panel">
          <div class="sim-panel-head">
            <div>
              <div class="panel-kicker">Section Analysis</div>
              <h2>剖面分析</h2>
            </div>
            <label class="switch">
              <input type="checkbox" data-section-enabled ${this.sectionEnabled ? 'checked' : ''}>
              <span class="switch__track"><span></span></span>
            </label>
          </div>

          <div class="section-metric-line">
            <span>当前标量</span>
            <strong data-section-metric>${this.metric === 'pressure' ? '压力系数 Cp' : '风速'}</strong>
          </div>

          <div class="segmented segmented--three">
            ${['X', 'Y', 'Z'].map(axis => `
              <button type="button" class="${this.sectionAxis === axis ? 'is-active' : ''}"
                      data-section-axis="${axis}" disabled>${axis} 截面</button>
            `).join('')}
          </div>

          <div class="sim-field section-location">
            <div class="sim-field__head">
              <label for="section-position">截面位置</label>
              <output data-readout="sectionPosition">—</output>
            </div>
            <input id="section-position" class="range-input" type="range" min="0" max="1" step="0.01"
                   value="0" data-section-slider disabled>
            <div class="sim-field__ticks"><span data-section-min>—</span><span data-section-max>—</span></div>
          </div>

          <p class="section-caption">彩色切片为场数据，橙色轮廓为模型与剖面的交线，灰色斜纹为实体截面。</p>
          <button class="cockpit-launch" type="button" data-action="cockpit" disabled>
            <span class="cockpit-launch__icon">${icon('camera', 19)}</span>
            <span><strong>进入驾驶舱视角</strong><small>使用建模阶段定义的相机</small></span>
            ${icon('chevron', 15)}
          </button>
        </aside>

        <section class="floating-panel sim-panel sim-results">
          <div class="sim-panel-head">
            <div>
              <div class="panel-kicker">Solver Output</div>
              <h2>求解摘要</h2>
            </div>
            <span class="solver-time" data-solver-time>待求解</span>
          </div>
          <div class="result-grid">
            <div class="result-stat"><span>动压 q</span><strong data-stat="dynamicPressure">—</strong></div>
            <div class="result-stat"><span>压力阻力</span><strong data-stat="drag">—</strong></div>
            <div class="result-stat"><span>压力升力</span><strong data-stat="lift">—</strong></div>
            <div class="result-stat"><span>最大风速</span><strong data-stat="maxSpeed">—</strong></div>
          </div>
          <div class="result-meta">
            <span data-solver-label>简化势流 + 经验尾迹</span>
            <span data-surface-area>—</span>
          </div>
          <p class="result-disclaimer" data-solver-note>等待流场求解。该模型用于交互式工程可视化，不替代高保真 CFD。</p>
        </section>

        <div class="legends">
          <article class="legend-card ${this.metric === 'pressure' ? 'is-primary' : ''}" data-legend="pressure">
            <header><span>表面 / 剖面压力</span><b>Cp</b></header>
            <div class="legend-bar" style="background:${pressureGradient()}"></div>
            <div class="legend-scale"><span>−1.2</span><span>0</span><span>+1.0</span></div>
            <p data-pressure-detail>等待求解</p>
          </article>
          <article class="legend-card ${this.metric === 'speed' ? 'is-primary' : ''}" data-legend="speed">
            <header><span>风洞局部风速</span><b data-speed-max-label>—</b></header>
            <div class="legend-bar" style="background:${speedGradient()}"></div>
            <div class="legend-scale"><span>0</span><span data-speed-mid>—</span><span data-speed-max>—</span></div>
            <p>流线与粒子按局部风速着色</p>
          </article>
        </div>

        <div class="sim-footer-hint">
          <span><b>左键</b> 环绕</span><span><b>滚轮</b> 缩放</span><span><b>右键</b> 平移</span>
        </div>

        <div class="sim-busy" data-busy hidden>
          <div class="solver-orb">
            <span class="solver-orb__ring"></span>
            <span class="solver-orb__ring solver-orb__ring--two"></span>
            <span class="solver-orb__core"></span>
            <span class="solver-orb__scan"></span>
          </div>
          <div class="busy-copy">
            <div class="panel-kicker">Aerodynamic Solver</div>
            <h3 data-busy-title>正在求解流场</h3>
            <p data-busy-detail>压缩网格采样并计算压力与速度场…</p>
          </div>
          <button class="btn btn--primary btn--small" type="button" data-action="retry" hidden>重新求解</button>
        </div>

        <div class="cockpit-view" data-cockpit-view hidden>
          <div class="cockpit-topline">
            <span class="live-chip"><i></i>驾驶舱视角 · COCKPIT</span>
            <span data-cockpit-live>—</span>
          </div>
          <div class="cockpit-reticle">
            <span class="reticle-ring"></span>
            <span class="reticle-line reticle-line--x"></span>
            <span class="reticle-line reticle-line--y"></span>
          </div>
          <div class="cockpit-bottomline">
            <span>拖动环视 · 滚轮缩放 · Esc 返回</span>
            <button class="btn btn--small btn--ghost" type="button" data-action="exit-cockpit">退出驾驶舱 ${icon('back', 14)}</button>
          </div>
        </div>
      </div>
    `;

    this.ui = {
      simulationUI: this.overlayHost.querySelector('[data-simulation-ui]'),
      busy: this.overlayHost.querySelector('[data-busy]'),
      busyTitle: this.overlayHost.querySelector('[data-busy-title]'),
      busyDetail: this.overlayHost.querySelector('[data-busy-detail]'),
      retry: this.overlayHost.querySelector('[data-action="retry"]'),
      sectionMetric: this.overlayHost.querySelector('[data-section-metric]'),
      sectionSlider: this.overlayHost.querySelector('[data-section-slider]'),
      sectionMin: this.overlayHost.querySelector('[data-section-min]'),
      sectionMax: this.overlayHost.querySelector('[data-section-max]'),
      sectionCoordinate: this.overlayHost.querySelector('[data-readout="sectionPosition"]'),
      cockpitLaunch: this.overlayHost.querySelector('[data-action="cockpit"]'),
      cockpitView: this.overlayHost.querySelector('[data-cockpit-view]'),
      cockpitLive: this.overlayHost.querySelector('[data-cockpit-live]'),
      solverTime: this.overlayHost.querySelector('[data-solver-time]'),
      solverLabel: this.overlayHost.querySelector('[data-solver-label]'),
      solverNote: this.overlayHost.querySelector('[data-solver-note]'),
      surfaceArea: this.overlayHost.querySelector('[data-surface-area]'),
      pressureDetail: this.overlayHost.querySelector('[data-pressure-detail]'),
      speedMaxLabel: this.overlayHost.querySelector('[data-speed-max-label]'),
      speedMid: this.overlayHost.querySelector('[data-speed-mid]'),
      speedMax: this.overlayHost.querySelector('[data-speed-max]')
    };
  }

  _bindHeader() {
    this.headerActions.innerHTML = `
      <div class="header-status">
        <span class="status-dot" data-status-dot></span>
        <span data-sim-status>正在初始化</span>
      </div>
      <button class="btn btn--ghost" type="button" data-action="back">${icon('back', 15)} 返回建模</button>
      <button class="btn btn--primary" type="button" data-action="run">
        ${icon('play', 15)}<span data-run-label>开始求解</span>
      </button>
    `;
    this.ui.runButton = this.headerActions.querySelector('[data-action="run"]');
    this.ui.runLabel = this.headerActions.querySelector('[data-run-label]');
    this.ui.status = this.headerActions.querySelector('[data-sim-status]');
    this.ui.statusDot = this.headerActions.querySelector('[data-status-dot]');
    this.headerActions.onclick = event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'back') {
        this._exitCockpit();
        this.onBack?.();
      }
      if (action === 'run') this.runSimulation();
    };
  }

  _bindUI() {
    const signal = this._events.signal;
    this.overlayHost.addEventListener('click', event => {
      const metric = event.target.closest('[data-metric]')?.dataset.metric;
      if (metric) {
        this.setMetric(metric);
        return;
      }
      const axis = event.target.closest('[data-section-axis]')?.dataset.sectionAxis;
      if (axis) {
        this.setSectionAxis(axis);
        return;
      }
      const preset = event.target.closest('[data-wind-preset]')?.dataset.windPreset;
      if (preset) {
        const [x, y, z] = preset.split(',').map(Number);
        this.settings.windDirection = { x, y, z };
        this._syncWindDirectionInputs();
        this.dirty = true;
        this._updateControlReadouts();
        this._markDirty();
        return;
      }
      const toggle = event.target.closest('[data-display-toggle]')?.dataset.displayToggle;
      if (toggle) {
        this.display[toggle] = !this.display[toggle];
        this._applyDisplayVisibility();
        this._updateToggleButtons();
        this._persistSettings();
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'cockpit') this._enterCockpit();
      if (action === 'exit-cockpit') this._exitCockpit();
      if (action === 'retry') this.runSimulation();
    }, { signal });

    this.overlayHost.addEventListener('input', event => {
      const control = event.target.dataset.control;
      if (control) {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        if (control === 'windSpeed') this.settings.windSpeedMps = value;
        if (control === 'windX') this.settings.windDirection.x = clampNumber(value, -10, 10, 0);
        if (control === 'windY') this.settings.windDirection.y = clampNumber(value, -10, 10, 0);
        if (control === 'windZ') this.settings.windDirection.z = clampNumber(value, -10, 10, 0);
        if (control === 'airDensity') this.settings.airDensity = value;
        this.dirty = true;
        this._updateControlReadouts();
        this._markDirty();
        return;
      }
      if (event.target.matches('[data-section-slider]')) {
        this.sectionCoordinate = Number(event.target.value);
        this._updateSectionReadout();
        this._scheduleSectionUpdate();
      }
    }, { signal });

    this.overlayHost.addEventListener('change', event => {
      if (event.target.matches('[data-section-enabled]')) {
        this.sectionEnabled = event.target.checked;
        this._applyDisplayVisibility();
        this._persistSettings();
      }
    }, { signal });
  }

  _bindCanvas() {
    const canvas = this.viewport.renderer.domElement;
    const signal = this._events.signal;

    canvas.addEventListener('pointerdown', event => {
      if (!this.cockpitActive || event.button !== 0) return;
      this._lookDrag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-looking');
    }, { signal });

    canvas.addEventListener('pointermove', event => {
      if (!this.cockpitActive || !this._lookDrag) return;
      const dx = event.clientX - this._lookDrag.x;
      const dy = event.clientY - this._lookDrag.y;
      this._lookDrag = { x: event.clientX, y: event.clientY };
      this._cockpitLook.yaw -= dx * 0.15;
      this._cockpitLook.pitch = THREE.MathUtils.clamp(this._cockpitLook.pitch - dy * 0.12, -72, 72);
      this._applyCockpitCamera();
    }, { signal });

    const endLook = event => {
      if (!this._lookDrag) return;
      this._lookDrag = null;
      canvas.classList.remove('is-looking');
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    };
    canvas.addEventListener('pointerup', endLook, { signal });
    canvas.addEventListener('pointercancel', endLook, { signal });

    canvas.addEventListener('wheel', event => {
      if (!this.cockpitActive) return;
      event.preventDefault();
      this.viewport.camera.fov = THREE.MathUtils.clamp(this.viewport.camera.fov + event.deltaY * 0.025, 35, 80);
      this.viewport.camera.updateProjectionMatrix();
    }, { passive: false, signal });

    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.cockpitActive) {
        this._exitCockpit();
      }
    }, { signal });
  }

  _onWindGizmoChange(direction) {
    this.settings.windDirection = { ...direction };
    this._syncWindDirectionInputs();
    this.dirty = true;
    this._updateControlReadouts();
    this._markDirty();
  }

  _updateControlReadouts() {
    const windOutput = this.overlayHost.querySelector('[data-readout="windSpeed"]');
    const directionOutput = this.overlayHost.querySelector('[data-readout="windDirection"]');
    const densityOutput = this.overlayHost.querySelector('[data-readout="airDensity"]');
    if (!windOutput) return;
    windOutput.textContent = `${formatNumber(this.settings.windSpeedMps, 1)} m/s`;
    directionOutput.textContent = directionLabel(this.settings.windDirection);
    directionOutput.dataset.state = isNonZeroVector(this.settings.windDirection) ? 'valid' : 'error';
    densityOutput.textContent = `${formatNumber(this.settings.airDensity, 3)} kg/m³`;
    this.windGizmo?.setDirection(this.settings.windDirection);
    this.overlayHost.querySelectorAll('.range-input[data-control]').forEach(input => {
      const min = Number(input.min);
      const max = Number(input.max);
      const value = Number(input.value);
      const progress = ((value - min) / Math.max(max - min, 1e-6)) * 100;
      input.style.setProperty('--range-progress', `${progress}%`);
    });
  }

  _syncWindDirectionInputs() {
    for (const [axis, control] of [['x', 'windX'], ['y', 'windY'], ['z', 'windZ']]) {
      const input = this.overlayHost.querySelector(`[data-control="${control}"]`);
      if (input) input.value = formatNumber(this.settings.windDirection[axis], 2);
    }
  }

  _markDirty() {
    if (!this._hasResult) return;
    this.dirty = true;
    this.ui.status.textContent = '参数已更改，等待重新求解';
    this.ui.statusDot.dataset.state = 'dirty';
    this.ui.runButton.classList.add('is-attention');
  }

  async runSimulation({ initial = false } = {}) {
    if (this.model.parts.length === 0) {
      this._showError('模型为空', '请返回建模界面添加至少一个几何部件。');
      this._setStatus('模型为空', 'error');
      this.ui.runLabel.textContent = '返回建模添加部件';
      this._setRunDisabled(true);
      return;
    }
    if (!isNonZeroVector(this.settings.windDirection)) {
      this._showError('来流方向无效', '方向向量的 X、Y、Z 分量不能同时为零。请指定空气流动方向后重新求解。');
      this._setStatus('来流方向无效', 'error');
      this._updateControlReadouts();
      return;
    }
    this._exitCockpit();
    this._requestController?.abort();
    const controller = new AbortController();
    this._requestController = controller;
    const runId = ++this._runId;
    this._showBusy('正在构建流场', '离散化模型、计算表面压力并生成三维风速场…');
    this._setRunDisabled(true);
    this._setStatus('求解中 · 势流 / 尾迹模型', 'running');
    this.ui.runLabel.textContent = '求解中…';
    const runSettings = {
      direction: { ...this.settings.windDirection },
      windSpeedMps: this.settings.windSpeedMps,
      airDensity: this.settings.airDensity
    };

    try {
      const result = await this.api.simulate({
        model: this.store.snapshot(),
        conditions: { ...runSettings },
        signal: controller.signal
      });
      if (this._disposed || runId !== this._runId) return;
      this._ingestResult(result, initial);
      this._hideBusy();
      this.ui.runLabel.textContent = '重新求解';
      const conditionsChanged = this.settings.windSpeedMps !== runSettings.windSpeedMps
        || !sameDirection(this.settings.windDirection, runSettings.direction)
        || this.settings.airDensity !== runSettings.airDensity;
      if (conditionsChanged) {
        this.dirty = true;
        this.ui.runButton.classList.add('is-attention');
        this._setStatus('模拟完成，来流参数已修改', 'dirty');
      } else {
        this.dirty = false;
        this.ui.runButton.classList.remove('is-attention');
        this._setStatus(`模拟就绪 · ${result.computeTimeMs} ms`, 'ready');
      }
      this._persistSettings();
    } catch (error) {
      if (controller.signal.aborted || this._disposed || runId !== this._runId) return;
      const message = error?.message || '无法完成流场求解。';
      this._showError('求解失败', message);
      this._setStatus('求解失败', 'error');
      this.ui.runLabel.textContent = this._hasResult ? '重新求解' : '重试';
      showToast(message, { type: 'error', title: '求解失败', duration: 5000 });
    } finally {
      if (!this._disposed && runId === this._runId) {
        this._setRunDisabled(false);
      }
    }
  }

  _ingestResult(result, initial) {
    const hadResult = this._hasResult;
    const field = new FlowFieldData(result.flow);
    this.field = field;

    let maxSurfaceSpeed = 0;
    for (const part of result.surface.parts) {
      for (const speed of part.speed) maxSurfaceSpeed = Math.max(maxSurfaceSpeed, speed);
    }
    const rawSpeedMax = Math.max(result.summary.maxFlowSpeedMps, maxSurfaceSpeed, this.settings.windSpeedMps * 1.2);
    this.speedMax = Math.ceil(rawSpeedMax / 5) * 5;

    this.dynamicRoot.removeFromParent();
    disposeObject(this.dynamicRoot);
    this.dynamicRoot = new THREE.Group();
    this.dynamicRoot.name = 'simulation-visuals';
    this.scene.add(this.dynamicRoot);

    const surfaces = buildSurfaceMeshes(result.surface.parts, this.speedMax, this.metric);
    this.surfaceEntries = surfaces.entries;
    this.dynamicRoot.add(surfaces.group);

    this.streamlines = createStreamlines(field, this.speedMax);
    this.dynamicRoot.add(this.streamlines);

    this.particles = new FlowParticles(field, this.speedMax, 900);
    this.dynamicRoot.add(this.particles.points);

    this.volume = createFlowVolume(field, this.speedMax);
    this.dynamicRoot.add(this.volume);

    this.cage = createWindCage(field);
    this.dynamicRoot.add(this.cage);

    this.modelBounds = new THREE.Box3(
      new THREE.Vector3(result.modelBounds.min.x, result.modelBounds.min.y, result.modelBounds.min.z),
      new THREE.Vector3(result.modelBounds.max.x, result.modelBounds.max.y, result.modelBounds.max.z)
    );
    const axisCenter = this._axisCenter(this.sectionAxis);
    if (!Number.isFinite(this.sectionCoordinate) || !this._coordinateWithinAxis(this.sectionCoordinate)) {
      this.sectionCoordinate = axisCenter;
    }
    this.sectionPlane?.dispose();
    this.sectionPlane = new SectionPlane(field, this.modelBounds, {
      metric: this.metric,
      axis: this.sectionAxis,
      coordinate: this.sectionCoordinate,
      speedMax: this.speedMax
    });
    this.sectionPlane.setSurfaces(result.surface.parts);
    this.dynamicRoot.add(this.sectionPlane.group);

    this.result = result;
    this._hasResult = true;
    this.grid.position.set(this.modelBounds.getCenter(new THREE.Vector3()).x,
      this.modelBounds.min.y - 1.2, this.modelBounds.getCenter(new THREE.Vector3()).z);
    this._updateSectionRange();
    this._applyDisplayVisibility();
    this._updateToggleButtons();
    this._updateMetricUI();
    this._renderSummary(result);
    this._updateLegends(result);
    this.cockpit = this.model.cockpit;
    this.ui.cockpitLaunch.disabled = false;
    this.overlayHost.querySelectorAll('[data-section-axis]').forEach(button => { button.disabled = false; });
    this.ui.sectionSlider.disabled = false;
    this._updateCockpitHud();

    if (!hadResult || initial) {
      this.viewport.fitBounds(result.modelBounds.min, result.modelBounds.max, 1.36);
    }
  }

  _renderSummary(result) {
    const summary = result.summary;
    this._setStat('dynamicPressure', formatPressure(summary.dynamicPressurePa));
    this._setStat('drag', formatForce(summary.dragN));
    this._setStat('lift', formatForce(summary.liftN));
    this._setStat('maxSpeed', `${formatNumber(summary.maxFlowSpeedMps, 1)} <small>m/s</small>`);
    this.ui.solverTime.textContent = `${result.computeTimeMs} ms`;
    this.ui.solverLabel.textContent = result.solver;
    this.ui.surfaceArea.textContent = `表面积 ${formatNumber(summary.surfaceAreaM2, 2)} m²`;
    if (result.warnings?.length) {
      this.ui.solverNote.textContent = result.warnings.join(' ');
    }
  }

  _setStat(name, value) {
    const node = this.overlayHost.querySelector(`[data-stat="${name}"]`);
    if (node) node.innerHTML = value;
  }

  _updateLegends(result) {
    const summary = result.summary;
    this.ui.pressureDetail.textContent = `Δp ${formatNumber(summary.minPressureKpa, 2)} … ${formatNumber(summary.maxPressureKpa, 2)} kPa`;
    this.ui.speedMaxLabel.textContent = `≤ ${formatNumber(this.speedMax, 0)} m/s`;
    this.ui.speedMid.textContent = formatNumber(this.speedMax * 0.5, 0);
    this.ui.speedMax.textContent = formatNumber(this.speedMax, 0);
    this._updateLegendActive();
  }

  _updateLegendActive() {
    this.overlayHost.querySelectorAll('[data-legend]').forEach(card => {
      card.classList.toggle('is-primary', card.dataset.legend === this.metric);
    });
  }

  setMetric(metric) {
    if (!['pressure', 'speed'].includes(metric) || metric === this.metric) return;
    this.metric = metric;
    this.overlayHost.querySelectorAll('[data-metric]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.metric === metric);
    });
    this.surfaceEntries?.forEach(entry => entry.setMetric(metric));
    this._updateMetricUI();
    this._updateLegendActive();
    this._scheduleSectionUpdate();
    this._persistSettings();
  }

  _updateMetricUI() {
    this.ui.sectionMetric.textContent = this.metric === 'pressure' ? '压力系数 Cp' : '风速';
    this.overlayHost.querySelectorAll('[data-metric]').forEach(button => {
      const active = button.dataset.metric === this.metric;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this._updateLegendActive();
  }

  setSectionAxis(axis) {
    if (!['X', 'Y', 'Z'].includes(axis) || axis === this.sectionAxis) return;
    this.sectionAxis = axis;
    this.sectionCoordinate = this._axisCenter(axis);
    this._updateSectionRange();
    this.overlayHost.querySelectorAll('[data-section-axis]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.sectionAxis === axis);
    });
    this._scheduleSectionUpdate();
    this._persistSettings();
  }

  _axisCenter(axis) {
    if (!this.modelBounds) return 0;
    return (this.modelBounds.min[axis.toLowerCase()] + this.modelBounds.max[axis.toLowerCase()]) * 0.5;
  }

  _coordinateWithinAxis(value) {
    if (!this.modelBounds) return false;
    const axis = this.sectionAxis.toLowerCase();
    return value >= this.modelBounds.min[axis] && value <= this.modelBounds.max[axis];
  }

  _updateSectionRange() {
    if (!this.modelBounds) return;
    const axis = this.sectionAxis.toLowerCase();
    const min = this.modelBounds.min[axis];
    const max = this.modelBounds.max[axis];
    if (!Number.isFinite(this.sectionCoordinate) || !this._coordinateWithinAxis(this.sectionCoordinate)) {
      this.sectionCoordinate = (min + max) * 0.5;
    }
    this.ui.sectionSlider.min = min.toFixed(3);
    this.ui.sectionSlider.max = Math.max(max, min + 0.001).toFixed(3);
    this.ui.sectionSlider.step = '0.01';
    this.ui.sectionSlider.value = this.sectionCoordinate.toFixed(3);
    this.ui.sectionMin.textContent = `${formatNumber(min, 2)} m`;
    this.ui.sectionMax.textContent = `${formatNumber(max, 2)} m`;
    this._updateSectionReadout();
    this._updateRangeProgress(this.ui.sectionSlider);
    this.overlayHost.querySelectorAll('[data-section-axis]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.sectionAxis === this.sectionAxis);
    });
  }

  _updateSectionReadout() {
    if (!Number.isFinite(this.sectionCoordinate)) {
      this.ui.sectionCoordinate.textContent = '—';
      return;
    }
    this.ui.sectionCoordinate.textContent = `${this.sectionAxis} = ${formatNumber(this.sectionCoordinate, 2)} m`;
  }

  _scheduleSectionUpdate() {
    if (!this.sectionPlane) return;
    if (this._sectionFrame) cancelAnimationFrame(this._sectionFrame);
    this._sectionFrame = requestAnimationFrame(() => {
      this._sectionFrame = null;
      if (!this.sectionPlane) return;
      this.sectionPlane.update({
        metric: this.metric,
        axis: this.sectionAxis,
        coordinate: this.sectionCoordinate,
        speedMax: this.speedMax,
        modelBounds: this.modelBounds
      });
      this._updateSectionReadout();
      this._updateRangeProgress(this.ui.sectionSlider);
    });
  }

  _updateRangeProgress(input) {
    if (!input) return;
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const progress = ((value - min) / Math.max(max - min, 1e-6)) * 100;
    input.style.setProperty('--range-progress', `${progress}%`);
  }

  _applyDisplayVisibility() {
    if (!this.dynamicRoot) return;
    if (this.streamlines) this.streamlines.visible = this.display.streamlines;
    if (this.particles) this.particles.points.visible = this.display.particles;
    if (this.volume) this.volume.visible = this.display.volume;
    if (this.cage) this.cage.visible = this.display.cage;
    if (this.sectionPlane) {
      this.sectionPlane.setVisible(this.sectionEnabled && !this.cockpitActive);
    }
  }

  _updateToggleButtons() {
    this.overlayHost.querySelectorAll('[data-display-toggle]').forEach(button => {
      const key = button.dataset.displayToggle;
      button.classList.toggle('is-active', !!this.display[key]);
      button.setAttribute('aria-pressed', String(!!this.display[key]));
    });
  }

  _enterCockpit() {
    if (!this._hasResult || this.cockpitActive) return;
    this._exitCockpit();
    this.cockpitActive = true;
    this._cockpitLook = { yaw: 0, pitch: 0 };
    this._cockpitSnapshot = {
      position: this.viewport.camera.position.clone(),
      quaternion: this.viewport.camera.quaternion.clone(),
      target: this.viewport.controls.target.clone(),
      fov: this.viewport.camera.fov,
      near: this.viewport.camera.near
    };
    this.viewport.controls.enabled = false;
    this.viewport.camera.near = 0.015;
    this.viewport.camera.fov = 62;
    this.viewport.camera.updateProjectionMatrix();
    this.ui.simulationUI.classList.add('is-cockpit');
    this.ui.cockpitView.hidden = false;
    this.sectionPlane?.setVisible(false);
    this._ghostMaterials = [];
    for (const entry of this.surfaceEntries ?? []) {
      const material = entry.mesh.material;
      this._ghostMaterials.push({
        material,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite
      });
      material.transparent = true;
      material.opacity = 0.22;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    this._applyCockpitCamera();
    this._updateCockpitHud();
    showToast('已进入驾驶舱视角，按 Esc 返回。', { type: 'info', duration: 2400 });
  }

  _applyCockpitCamera() {
    if (!this.cockpitActive) return;
    const cockpit = this.model.cockpit;
    const yaw = THREE.MathUtils.degToRad(cockpit.yawDegrees + this._cockpitLook.yaw);
    const pitch = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp(cockpit.pitchDegrees + this._cockpitLook.pitch, -85, 85)
    );
    const position = cockpit.position;
    this.viewport.camera.position.set(position.x, position.y, position.z);
    const target = new THREE.Vector3(
      position.x + Math.cos(pitch) * Math.cos(yaw),
      position.y + Math.sin(pitch),
      position.z - Math.cos(pitch) * Math.sin(yaw)
    );
    this.viewport.camera.up.set(0, 1, 0);
    this.viewport.camera.lookAt(target);
  }

  _exitCockpit() {
    if (!this.cockpitActive) return;
    this.cockpitActive = false;
    this.ui.simulationUI.classList.remove('is-cockpit');
    this.ui.cockpitView.hidden = true;
    for (const ghost of this._ghostMaterials ?? []) {
      ghost.material.transparent = ghost.transparent;
      ghost.material.opacity = ghost.opacity;
      ghost.material.depthWrite = ghost.depthWrite;
      ghost.material.needsUpdate = true;
    }
    this._ghostMaterials = null;
    if (this._cockpitSnapshot) {
      this.viewport.camera.position.copy(this._cockpitSnapshot.position);
      this.viewport.camera.quaternion.copy(this._cockpitSnapshot.quaternion);
      this.viewport.camera.fov = this._cockpitSnapshot.fov;
      this.viewport.camera.near = this._cockpitSnapshot.near;
      this.viewport.controls.target.copy(this._cockpitSnapshot.target);
      this.viewport.camera.updateProjectionMatrix();
      this.viewport.controls.enabled = true;
      this.viewport.controls.update();
      this._cockpitSnapshot = null;
    }
    this._applyDisplayVisibility();
  }

  _updateCockpitHud() {
    const q = this.result?.summary?.dynamicPressurePa;
    this.ui.cockpitLive.textContent = `${formatNumber(this.settings.windSpeedMps, 1)} m/s · q ${formatNumber((q ?? 0) / 1000, 2)} kPa`;
  }

  _showBusy(title, detail) {
    this.ui.busy.hidden = false;
    this.ui.busy.classList.remove('is-error');
    this.ui.busyTitle.textContent = title;
    this.ui.busyDetail.textContent = detail;
    this.ui.retry.hidden = true;
  }

  _showError(title, detail) {
    this.ui.busy.hidden = false;
    this.ui.busy.classList.add('is-error');
    this.ui.busyTitle.textContent = title;
    this.ui.busyDetail.textContent = detail;
    this.ui.retry.hidden = false;
  }

  _hideBusy() {
    this.ui.busy.hidden = true;
  }

  _setRunDisabled(disabled) {
    this.ui.runButton.disabled = disabled;
  }

  _setStatus(text, state) {
    this.ui.status.textContent = text;
    this.ui.statusDot.dataset.state = state;
  }

  _persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        windSpeedMps: this.settings.windSpeedMps,
        direction: { ...this.settings.windDirection },
        airDensity: this.settings.airDensity,
        metric: this.metric,
        sectionAxis: this.sectionAxis,
        sectionEnabled: this.sectionEnabled,
        display: this.display
      }));
    } catch (error) {
      console.warn('Unable to persist simulation settings', error);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._runId++;
    this._requestController?.abort();
    this._events.abort();
    if (this._sectionFrame) cancelAnimationFrame(this._sectionFrame);
    this._persistSettings();
    this.viewport.dispose();
    this.overlayHost.replaceChildren();
    this.headerActions.replaceChildren();
    this.headerActions.onclick = null;
  }
}

function loadSettings() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    stored = {};
  }
  const windSpeedMps = clampNumber(stored.windSpeedMps, 1, 120, DEFAULT_SETTINGS.windSpeedMps);
  let windDirection = stored.direction;
  if (!windDirection || !Number.isFinite(Number(windDirection.x))
      || !Number.isFinite(Number(windDirection.y)) || !Number.isFinite(Number(windDirection.z))) {
    const legacyAzimuth = Number(stored.windFromAzimuthDeg);
    if (Number.isFinite(legacyAzimuth)) {
      const radians = legacyAzimuth * Math.PI / 180;
      windDirection = { x: -Math.cos(radians), y: 0, z: -Math.sin(radians) };
    } else {
      windDirection = { ...DEFAULT_SETTINGS.windDirection };
    }
  }
  const cleanComponent = value => Math.abs(value) < 1e-9 ? 0 : value;
  windDirection = {
    x: cleanComponent(clampNumber(windDirection.x, -10, 10, -1)),
    y: cleanComponent(clampNumber(windDirection.y, -10, 10, 0)),
    z: cleanComponent(clampNumber(windDirection.z, -10, 10, 0))
  };
  if (!isNonZeroVector(windDirection)) windDirection = { ...DEFAULT_SETTINGS.windDirection };
  const airDensity = clampNumber(stored.airDensity, 0.8, 1.5, DEFAULT_SETTINGS.airDensity);
  const metric = stored.metric === 'speed' ? 'speed' : 'pressure';
  const sectionAxis = ['X', 'Y', 'Z'].includes(stored.sectionAxis) ? stored.sectionAxis : DEFAULT_SETTINGS.sectionAxis;
  return {
    windSpeedMps,
    windDirection,
    airDensity,
    metric,
    sectionAxis,
    sectionEnabled: stored.sectionEnabled !== false,
    display: {
      streamlines: stored.display?.streamlines !== false,
      particles: stored.display?.particles !== false,
      volume: stored.display?.volume !== false,
      cage: stored.display?.cage !== false
    }
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function isNonZeroVector(direction) {
  return direction && Math.hypot(direction.x, direction.y, direction.z) > 1e-6;
}

function sameDirection(left, right) {
  return left && right
    && Math.abs(left.x - right.x) < 1e-9
    && Math.abs(left.y - right.y) < 1e-9
    && Math.abs(left.z - right.z) < 1e-9;
}

function directionLabel(direction) {
  if (!isNonZeroVector(direction)) return '方向向量不能为零';
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const x = direction.x / length;
  const y = direction.y / length;
  const z = direction.z / length;
  const labels = [];
  if (x < -0.35) labels.push('机头来流');
  else if (x > 0.35) labels.push('尾部来流');
  if (z > 0.35) labels.push('左舷来流');
  else if (z < -0.35) labels.push('右舷来流');
  if (y > 0.35) labels.push('下方来流');
  else if (y < -0.35) labels.push('上方来流');
  const kind = labels.length ? labels.join(' · ') : '斜向复合来流';
  return `(${formatNumber(x, 2)}, ${formatNumber(y, 2)}, ${formatNumber(z, 2)}) · ${kind}`;
}

function formatPressure(pa) {
  if (!Number.isFinite(pa)) return '—';
  return pa >= 1000
    ? `${formatNumber(pa / 1000, 2)} <small>kPa</small>`
    : `${formatNumber(pa, 0)} <small>Pa</small>`;
}

function formatForce(newtons) {
  if (!Number.isFinite(newtons)) return '—';
  const absolute = Math.abs(newtons);
  return absolute >= 1000
    ? `${formatNumber(newtons / 1000, 2)} <small>kN</small>`
    : `${formatNumber(newtons, 0)} <small>N</small>`;
}
