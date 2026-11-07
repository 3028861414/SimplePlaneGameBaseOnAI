import { escapeHtml, formatNumber } from '../core/ui.js';
import { BINDING_DEFINITIONS, formatKeyCode } from '../core/model.js';
import { icon } from '../util/icons.js';

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class FlightHud {
  constructor(overlayHost, { model, onToggleCamera, onRestart, onExit, onRetry }) {
    this.overlayHost = overlayHost;
    this.model = model;
    this.onToggleCamera = onToggleCamera;
    this.onRestart = onRestart;
    this.onExit = onExit;
    this.onRetry = onRetry;
    this.cameraMode = 'third';
    this._lastPhase = '';
    this._key = name => formatKeyCode(this.model.bindings?.[name]);
    this._startHint = `按住 ${this._key('throttleUp')} 增加油门；达到起飞速度后按 ${this._key('pitchUp')} 抬头`;
    this._cameraHint = `第三人称 · ${this._key('toggleCamera')}`;
    this._noticeTimer = null;
    this._build();
    this._bindEvents();
  }

  _build() {
    const bindings = this.model.bindings;
    const engineCount = this.model.flightSystems?.engines?.length ?? 0;
    this.overlayHost.innerHTML = `
      <div class="flight-ui is-loading">
        <div class="flight-topbar">
          <div class="flight-ident">
            <div class="panel-kicker">Virtual Flight / Local Solver</div>
            <div class="flight-ident__row">
              <strong>${escapeHtml(this.model.name)}</strong>
              <span class="flight-phase" data-flight-phase>PREFLIGHT</span>
            </div>
          </div>

          <div class="flight-compass" aria-label="航向">
            <div class="flight-compass__window">
              <div class="flight-compass__track" data-heading-tape></div>
              <i class="flight-compass__cursor"></i>
            </div>
            <div class="flight-compass__readout">
              <strong data-heading>000</strong><span>°</span><b data-cardinal>N</b>
            </div>
          </div>

          <div class="flight-top-actions">
            <button class="flight-chip-btn" type="button" data-hud-camera>
              ${icon('camera', 15)}<span data-camera-label>${this._cameraHint}</span>
            </button>
            <button class="flight-chip-btn" type="button" data-hud-exit>${icon('back', 14)} 返回建模</button>
          </div>
        </div>

        <div class="flight-notice" data-flight-notice>飞行核心生成中…</div>
        <div class="flight-warning" data-flight-warning hidden></div>

        <aside class="flight-controls-help">
          <div class="panel-kicker">Flight Controls</div>
          <h3>飞行操纵</h3>
          <div class="flight-key-grid">
            ${this._bindingRow(bindings, 'throttleUp', '油门 +')}
            ${this._bindingRow(bindings, 'throttleDown', '油门 −')}
            ${this._bindingRow(bindings, 'pitchUp', '抬头')}
            ${this._bindingRow(bindings, 'pitchDown', '低头')}
            ${this._bindingRow(bindings, 'yawLeft', '左偏航')}
            ${this._bindingRow(bindings, 'yawRight', '右偏航')}
            ${this._bindingRow(bindings, 'boost', '加力')}
            ${this._bindingRow(bindings, 'brake', '刹车')}
            ${this._bindingRow(bindings, 'toggleCamera', '切换视角')}
            ${this._bindingRow(bindings, 'resetFlight', '重新起飞')}
            ${this._bindingRow(bindings, 'fireGuns', '机炮（预留）')}
          </div>
          <p class="flight-help-note">拖动环视 · 滚轮${this.cameraMode === 'first' ? '视野' : '远近'} · ${engineCount} 台引擎</p>
        </aside>

        <div class="flight-dashboard">
          <div class="instrument instrument--airspeed">
            <div class="dial-shell">
              <svg viewBox="0 0 140 140" class="dial-svg" aria-hidden="true">
                <circle cx="70" cy="70" r="61" class="dial-rim"></circle>
                <circle cx="70" cy="70" r="54" class="dial-inner"></circle>
                ${this._airspeedTicks()}
                <line x1="70" y1="70" x2="70" y2="24" class="dial-needle" data-airspeed-needle></line>
                <circle cx="70" cy="70" r="5" class="dial-hub"></circle>
              </svg>
              <div class="dial-readout"><strong data-airspeed-value>0</strong><small>kt</small></div>
            </div>
            <span class="instrument-label">空速 / AIRSPEED</span>
            <span class="instrument-sub" data-airspeed-ms>0.0 m/s</span>
          </div>

          <div class="instrument instrument--attitude">
            <div class="attitude-mask">
              <div class="attitude-world" data-attitude-world>
                <div class="attitude-sky"></div>
                <div class="attitude-ground"></div>
                <div class="attitude-horizon"></div>
                <div class="attitude-ladder">
                  <span class="ladder ladder--up">10</span>
                  <span class="ladder ladder--up ladder--twenty">20</span>
                  <span class="ladder ladder--down">10</span>
                  <span class="ladder ladder--down ladder--twenty">20</span>
                </div>
              </div>
              <span class="attitude-bank-mark attitude-bank-mark--left"></span>
              <span class="attitude-bank-mark attitude-bank-mark--right"></span>
              <span class="attitude-aircraft"></span>
            </div>
            <div class="attitude-values">
              <span>PITCH <b data-pitch>0°</b></span>
              <span>BANK <b data-roll>0°</b></span>
            </div>
            <span class="instrument-label">姿态 / ATTITUDE</span>
          </div>

          <div class="instrument instrument--altitude">
            <div class="altitude-main"><strong data-altitude>0</strong><small>m</small></div>
            <div class="altitude-agl">AGL <b data-altitude-agl>0 m</b></div>
            <div class="vertical-speed">
              <span>V/S</span>
              <div class="vertical-speed__track"><i data-vs-marker></i></div>
              <strong data-vertical-speed>0.0 m/s</strong>
            </div>
            <span class="instrument-label">高度 / ALTITUDE</span>
          </div>

          <div class="instrument instrument--engine">
            <div class="throttle-ring" data-throttle-ring>
              <div class="throttle-ring__inside">
                <strong data-throttle>0</strong><small>%</small>
                <span>THR</span>
              </div>
            </div>
            <div class="engine-meta">
              <span>推力</span>
              <strong data-thrust>0.0 kN</strong>
              <div class="engine-lights">
                ${Array.from({ length: Math.max(1, engineCount) }, () => '<i></i>').join('')}
              </div>
              <span class="g-load">G <b data-gload>1.0</b></span>
            </div>
            <span class="instrument-label">动力 / ENGINE</span>
          </div>
        </div>

        <div class="first-person-frame" aria-hidden="true">
          <span class="fp-reticle"></span>
          <span class="fp-frame-line fp-frame-line--left"></span>
          <span class="fp-frame-line fp-frame-line--right"></span>
        </div>

        <div class="flight-crash" data-flight-crash hidden>
          <span class="crash-mark">${icon('target', 26)}</span>
          <div class="panel-kicker">Flight Terminated</div>
          <h2 data-crash-title>载具坠毁</h2>
          <p data-crash-detail>检查飞行姿态并重新起飞。</p>
          <div class="crash-actions">
            <button class="btn btn--primary btn--small" type="button" data-hud-restart>重新起飞 · R</button>
            <button class="btn btn--ghost btn--small" type="button" data-hud-exit>返回建模</button>
          </div>
        </div>

        <div class="flight-loading" data-flight-loading>
          <div class="flight-loader">
            <span class="flight-loader__plane">${icon('play', 22)}</span>
            <span class="flight-loader__orbit"></span>
          </div>
          <div class="panel-kicker">Generating Perlin Terrain</div>
          <h2 data-flight-loading-title>正在生成虚拟世界</h2>
          <p data-flight-loading-detail>连接飞行核心、铺设跑道并构建柏林噪声地形…</p>
          <button class="btn btn--ghost btn--small" type="button" data-hud-retry hidden>重新连接</button>
        </div>
      </div>
    `;

    this.ui = {
      root: this.overlayHost.querySelector('.flight-ui'),
      phase: this.overlayHost.querySelector('[data-flight-phase]'),
      heading: this.overlayHost.querySelector('[data-heading]'),
      cardinal: this.overlayHost.querySelector('[data-cardinal]'),
      headingTape: this.overlayHost.querySelector('[data-heading-tape]'),
      notice: this.overlayHost.querySelector('[data-flight-notice]'),
      warning: this.overlayHost.querySelector('[data-flight-warning]'),
      cameraLabel: this.overlayHost.querySelector('[data-camera-label]'),
      airspeed: this.overlayHost.querySelector('[data-airspeed-value]'),
      airspeedMs: this.overlayHost.querySelector('[data-airspeed-ms]'),
      airspeedNeedle: this.overlayHost.querySelector('[data-airspeed-needle]'),
      attitudeWorld: this.overlayHost.querySelector('[data-attitude-world]'),
      pitch: this.overlayHost.querySelector('[data-pitch]'),
      roll: this.overlayHost.querySelector('[data-roll]'),
      altitude: this.overlayHost.querySelector('[data-altitude]'),
      altitudeAgl: this.overlayHost.querySelector('[data-altitude-agl]'),
      verticalSpeed: this.overlayHost.querySelector('[data-vertical-speed]'),
      vsMarker: this.overlayHost.querySelector('[data-vs-marker]'),
      throttle: this.overlayHost.querySelector('[data-throttle]'),
      throttleRing: this.overlayHost.querySelector('[data-throttle-ring]'),
      thrust: this.overlayHost.querySelector('[data-thrust]'),
      gLoad: this.overlayHost.querySelector('[data-gload]'),
      engineLights: [...this.overlayHost.querySelectorAll('.engine-lights i')],
      crash: this.overlayHost.querySelector('[data-flight-crash]'),
      crashTitle: this.overlayHost.querySelector('[data-crash-title]'),
      crashDetail: this.overlayHost.querySelector('[data-crash-detail]'),
      loading: this.overlayHost.querySelector('[data-flight-loading]'),
      loadingTitle: this.overlayHost.querySelector('[data-flight-loading-title]'),
      loadingDetail: this.overlayHost.querySelector('[data-flight-loading-detail]'),
      retry: this.overlayHost.querySelector('[data-hud-retry]'),
      restart: this.overlayHost.querySelector('[data-hud-restart]'),
      cameraButton: this.overlayHost.querySelector('[data-hud-camera]')
    };
    this._buildHeadingTape();
  }

  _bindingRow(bindings, action, label) {
    return `<div><span>${label}</span><kbd>${escapeHtml(formatKeyCode(bindings[action]))}</kbd></div>`;
  }

  _airspeedTicks() {
    let markup = '';
    for (let speed = 0; speed <= 300; speed += 25) {
      const angle = -120 + (speed / 300) * 240;
      const major = speed % 50 === 0;
      markup += `<line x1="70" y1="18" x2="70" y2="${major ? 9 : 13}" class="dial-tick ${major ? 'is-major' : ''}" transform="rotate(${angle} 70 70)"></line>`;
      if (major) {
        const radians = (angle - 90) * Math.PI / 180;
        const x = 70 + Math.cos(radians) * 39;
        const y = 70 + Math.sin(radians) * 39;
        markup += `<text x="${x.toFixed(1)}" y="${(y + 2.5).toFixed(1)}" class="dial-number">${speed}</text>`;
      }
    }
    return markup;
  }

  _buildHeadingTape() {
    let markup = '';
    const tickWidth = 14;
    for (let degree = 0; degree <= 1080; degree += 10) {
      const normalized = degree % 360;
      const cardinal = normalized % 90 === 0 ? CARDINALS[normalized / 90] : '';
      const major = normalized % 30 === 0;
      markup += `<span class="heading-tick ${major ? 'is-major' : ''} ${cardinal ? 'is-cardinal' : ''}" style="width:${tickWidth}px">${cardinal || (major ? String(normalized).padStart(3, '0') : '')}</span>`;
    }
    this.ui.headingTape.innerHTML = markup;
    this._tickWidth = tickWidth;
  }

  _bindEvents() {
    this.ui.root.addEventListener('click', event => {
      if (event.target.closest('[data-hud-camera]')) this.onToggleCamera?.();
      if (event.target.closest('[data-hud-restart]')) this.onRestart?.();
      if (event.target.closest('[data-hud-exit]')) this.onExit?.();
      if (event.target.closest('[data-hud-retry]')) this.onRetry?.();
    });
  }

  setLoading(title, detail, { retry = false } = {}) {
    this.ui.loading.hidden = false;
    this.ui.root.classList.add('is-loading');
    this.ui.loadingTitle.textContent = title;
    this.ui.loadingDetail.textContent = detail;
    this.ui.retry.hidden = !retry;
  }

  hideLoading() {
    this.ui.loading.hidden = true;
    this.ui.root.classList.remove('is-loading');
  }

  setNotice(text, { type = 'info', duration = 3600 } = {}) {
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this.ui.notice.textContent = text;
    this.ui.notice.dataset.type = type;
    this.ui.notice.classList.add('is-visible');
    if (duration > 0) {
      this._noticeTimer = setTimeout(() => {
        this.ui.notice.classList.remove('is-visible');
      }, duration);
    }
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    this.ui.cameraLabel.textContent = `${mode === 'first' ? '第一人称' : '第三人称'} · ${this._key('toggleCamera')}`;
    this.ui.root.classList.toggle('is-first-person', mode === 'first');
    const note = this.ui.root.querySelector('.flight-help-note');
    if (note) note.textContent = `拖动环视 · 滚轮${mode === 'first' ? '视野' : '远近'} · ${this.model.flightSystems?.engines?.length ?? 0} 台引擎`;
  }

  update(state) {
    const knots = Math.max(0, state.speedMps * 1.943844);
    this.ui.airspeed.textContent = formatNumber(knots, 0);
    this.ui.airspeedMs.textContent = `${formatNumber(state.speedMps, 1)} m/s`;
    const needleAngle = -120 + Math.min(1, Math.max(0, knots / 300)) * 240;
    this.ui.airspeedNeedle.setAttribute('transform', `rotate(${needleAngle.toFixed(2)} 70 70)`);

    const heading = ((state.headingDeg % 360) + 360) % 360;
    this.ui.heading.textContent = String(Math.round(heading) % 360).padStart(3, '0');
    this.ui.cardinal.textContent = CARDINALS[Math.round(heading / 45) % 8];
    const tapeWidth = this.ui.headingTape.parentElement.clientWidth;
    const index = (360 + heading) / 10;
    this.ui.headingTape.style.transform = `translateX(${tapeWidth / 2 - (index + 0.5) * this._tickWidth}px)`;

    this.ui.attitudeWorld.style.transform = `rotate(${-state.rollDeg.toFixed(2)}deg) translateY(${(state.pitchDeg * 2.15).toFixed(2)}px)`;
    this.ui.pitch.textContent = `${state.pitchDeg > 0 ? '+' : ''}${formatNumber(state.pitchDeg, 1)}°`;
    this.ui.roll.textContent = `${state.rollDeg > 0 ? '+' : ''}${formatNumber(state.rollDeg, 1)}°`;
    this.ui.altitude.textContent = formatNumber(state.altitudeMslM, 0);
    this.ui.altitudeAgl.textContent = `${formatNumber(Math.max(0, state.altitudeAglM), 0)} m`;
    this.ui.verticalSpeed.textContent = `${state.verticalSpeedMps > 0 ? '+' : ''}${formatNumber(state.verticalSpeedMps, 1)} m/s`;
    const vsNorm = Math.max(-1, Math.min(1, state.verticalSpeedMps / 30));
    this.ui.vsMarker.style.bottom = `${50 + vsNorm * 42}%`;
    this.ui.throttle.textContent = formatNumber(state.throttle * 100, 0);
    this.ui.throttleRing.style.setProperty('--throttle-angle', `${Math.round(state.throttle * 360)}deg`);
    this.ui.thrust.textContent = `${formatNumber(state.engineThrustN / 1000, 1)} kN`;
    this.ui.gLoad.textContent = formatNumber(state.gLoad, 1);
    this.ui.engineLights.forEach(light => {
      light.style.opacity = String(0.18 + state.throttle * 0.82);
    });

    let phase = 'AIRBORNE';
    if (state.crashed) phase = 'CRASHED';
    else if (state.onGround) phase = 'ON GROUND';
    else if (state.stalled) phase = 'STALL';
    if (phase !== this._lastPhase) {
      this.ui.phase.textContent = phase;
      this.ui.phase.dataset.phase = phase;
      this._lastPhase = phase;
    }

    const warnings = [];
    if (state.crashed) warnings.push('载具已失去控制');
    else if (state.stalled) warnings.push('失速警告 · 增加油门并低头');
    if (!state.crashed && !state.onGround && state.altitudeAglM < 45) warnings.push('地形接近');
    if (state.outsideWorld) warnings.push('已离开训练空域');
    this.ui.warning.hidden = warnings.length === 0;
    this.ui.warning.textContent = warnings.join(' · ');

    if (state.crashed) {
      this.ui.crash.hidden = false;
      this.ui.crashTitle.textContent = state.crashReason || '载具坠毁';
      this.ui.crashDetail.textContent = '按 R 或点击重新起飞，回到跑道起点。';
    } else {
      this.ui.crash.hidden = true;
    }
    if (state.onGround && !state.crashed) {
      this.setNotice(this._startHint, { duration: 0 });
      this.ui.notice.classList.add('is-visible');
    } else if (!state.stalled && !state.crashed) {
      this.ui.notice.classList.remove('is-visible');
    }
  }

  resetCrashed() {
    this.ui.crash.hidden = true;
  }

  dispose() {
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = null;
  }
}
