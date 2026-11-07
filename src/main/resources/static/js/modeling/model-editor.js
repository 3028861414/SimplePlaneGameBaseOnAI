import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Viewport } from '../core/viewport.js';
import { PART_COLORS, SHAPE_INFO, createPart, uid } from '../core/model.js';
import { escapeHtml, showToast } from '../core/ui.js';
import { icon } from '../util/icons.js';
import { makeUnitGeometry, disposePartGroup } from '../util/part-geometry.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const SHAPE_GLYPHS = {
  BOX: 'cube',
  ELLIPSOID: 'sphere',
  CYLINDER: 'cylinder',
  CONE: 'cone'
};

const SIZE_HINTS = {
  BOX: 'X 宽度 · Y 高度 · Z 深度',
  ELLIPSOID: 'X / Y / Z 直径',
  CYLINDER: 'X / Z 直径 · Y 长度',
  CONE: 'X / Z 底部直径 · Y 长度'
};

export class ModelEditor {
  constructor({ container, overlay, headerActions, store, onSimulation }) {
    this.container = container;
    this.overlayHost = overlay;
    this.headerActions = headerActions;
    this.store = store;
    this.onSimulation = onSimulation;
    this.model = store.snapshot();
    this.selectedId = null;
    this.transformMode = 'translate';
    this.pickMode = false;
    this.previewActive = false;
    this._previewLook = { yaw: 0, pitch: 0 };
    this._lookDrag = null;
    this._commitTimer = null;
    this._pointerStart = null;
    this._disposed = false;
    this._events = new AbortController();

    this.viewport = new Viewport(container);
    this.scene = this.viewport.scene;
    this.viewport.addGrid(100, 100, -3);
    this.viewport.addAxes(1.65);

    this.meshRoot = new THREE.Group();
    this.meshRoot.name = 'aircraft-parts';
    this.scene.add(this.meshRoot);

    this.partGroups = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._buildTransformControls();
    this._buildCockpitMarker();
    this._renderOverlay();
    this._bindHeader();
    this._bindOverlay();
    this._bindKeyboard();
    this._bindPointer();
    this._unsubscribeStore = this.store.subscribe(({ reason }) => {
      if (reason === 'saved') {
        this._setSaveStatus('自动已保存', 'saved');
      } else if (reason === 'edit') {
        this._setSaveStatus('保存中…', 'saving');
      }
    });

    this._rebuildScene();
    this._select(null);
    requestAnimationFrame(() => this.fitView());
  }

  _buildTransformControls() {
    this.transform = new TransformControls(this.viewport.camera, this.viewport.renderer.domElement);
    this.transform.setSize(0.72);
    this.transform.setSpace('world');
    this.transform.addEventListener('dragging-changed', event => {
      this.viewport.controls.enabled = !event.value && !this.previewActive;
      if (!event.value) {
        this._commitNow();
      }
    });
    this.transform.addEventListener('objectChange', () => this._applyGizmoTransform());
    this.scene.add(this.transform.getHelper());
  }

  _buildCockpitMarker() {
    const group = new THREE.Group();
    group.name = 'cockpit-camera-marker';
    const accent = 0xffb166;
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x201812, emissive: accent, emissiveIntensity: 0.28, metalness: 0.4, roughness: 0.28
    });
    const accentMaterial = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.94, depthTest: false });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.11), bodyMaterial);
    body.renderOrder = 30;
    group.add(body);

    const lens = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.2, 18), accentMaterial);
    lens.rotation.z = -Math.PI / 2;
    lens.position.x = 0.19;
    lens.renderOrder = 30;
    group.add(lens);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.009, 8, 40),
      accentMaterial
    );
    halo.rotation.y = Math.PI / 2;
    halo.renderOrder = 30;
    group.add(halo);

    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a4, depthTest: false })
    );
    pin.position.x = -0.14;
    pin.renderOrder = 31;
    group.add(pin);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.27, 0, 0),
      new THREE.Vector3(2.4, 0, 0)
    ]);
    const line = new THREE.Line(lineGeometry, new THREE.LineDashedMaterial({
      color: accent, transparent: true, opacity: 0.56, dashSize: 0.1, gapSize: 0.08, depthTest: false
    }));
    line.computeLineDistances();
    line.renderOrder = 29;
    group.add(line);

    group.traverse(object => {
      if (object.isMesh || object.isLine) object.frustumCulled = false;
    });
    this.scene.add(group);
    this.cockpitMarker = group;
    this._updateCockpitMarker();
  }

  _renderOverlay() {
    this.overlayHost.innerHTML = `
      <div class="editor-ui">
        <div class="floating-panel add-panel">
          <div class="panel-kicker">创建几何基元</div>
          <div class="shape-tools">
            ${Object.entries(SHAPE_INFO).map(([shape, info]) => `
              <button class="shape-tool" type="button" data-add-shape="${shape}" title="添加${info.label}">
                <span class="shape-tool__icon">${icon(SHAPE_GLYPHS[shape], 21)}</span>
                <span>${info.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <section class="floating-panel scene-panel">
          <div class="panel-titlebar">
            <div>
              <div class="panel-kicker">场景结构</div>
              <h2>模型部件 <span class="count-badge" data-part-count>0</span></h2>
            </div>
            <button class="icon-btn" type="button" data-action="reset" title="载入示例飞行器">${icon('reset', 16)}</button>
          </div>
          <label class="model-name-row">
            <span>模型</span>
            <input data-model-name maxlength="80" spellcheck="false" value="${escapeHtml(this.model.name ?? '')}">
          </label>
          <div class="part-list" data-part-list></div>
        </section>

        <aside class="floating-panel inspector-panel">
          <div class="inspector-heading">
            <div>
              <div class="panel-kicker">属性检查器</div>
              <h2>部件与相机</h2>
            </div>
            <span class="inspector-shape-tag" data-selected-tag>未选择</span>
          </div>
          <div class="inspector-scroll" data-inspector-body></div>
        </aside>

        <div class="editor-dock">
          <div class="dock-cluster">
            <button class="dock-btn ${this.transformMode === 'translate' ? 'is-active' : ''}" type="button" data-transform="translate" title="移动 (W)">
              ${icon('move', 17)}<span>移动</span><kbd>W</kbd>
            </button>
            <button class="dock-btn ${this.transformMode === 'rotate' ? 'is-active' : ''}" type="button" data-transform="rotate" title="旋转 (E)">
              ${icon('rotate', 17)}<span>旋转</span><kbd>E</kbd>
            </button>
            <button class="dock-btn ${this.transformMode === 'scale' ? 'is-active' : ''}" type="button" data-transform="scale" title="缩放 (R)">
              ${icon('scale', 17)}<span>缩放</span><kbd>R</kbd>
            </button>
          </div>
          <span class="dock-separator"></span>
          <button class="dock-btn" type="button" data-action="fit">${icon('fit', 17)}<span>适配视图</span></button>
          <button class="dock-btn" type="button" data-action="preview">${icon('camera', 17)}<span>驾驶舱</span></button>
        </div>

        <div class="controller-card">
          <span><b>鼠标左键</b> 环绕</span>
          <span><b>滚轮</b> 缩放</span>
          <span><b>右键</b> 平移</span>
        </div>

        <div class="pick-banner" data-pick-banner hidden>
          <span class="pick-banner__pulse"></span>
          点击模型表面放置驾驶舱相机
          <button type="button" data-action="cancel-pick">取消</button>
        </div>

        <div class="cockpit-preview" data-cockpit-preview hidden>
          <div class="cockpit-hud">
            <span class="cockpit-hud__label">驾驶舱视角预览</span>
            <span class="cockpit-hud__hint">拖动环视 · 滚轮缩放 · Esc 返回</span>
            <button class="btn btn--small btn--ghost" type="button" data-action="exit-preview">返回建模视图</button>
          </div>
          <div class="cockpit-crosshair"></div>
          <div class="cockpit-frame"></div>
        </div>
      </div>
    `;
    this.ui = {
      partList: this.overlayHost.querySelector('[data-part-list]'),
      partCount: this.overlayHost.querySelector('[data-part-count]'),
      inspector: this.overlayHost.querySelector('[data-inspector-body]'),
      selectedTag: this.overlayHost.querySelector('[data-selected-tag]'),
      modelName: this.overlayHost.querySelector('[data-model-name]'),
      pickBanner: this.overlayHost.querySelector('[data-pick-banner]'),
      preview: this.overlayHost.querySelector('[data-cockpit-preview]'),
      saveStatus: null
    };
  }

  _bindHeader() {
    this.headerActions.innerHTML = `
      <div class="header-status" title="模型自动保存在浏览器本地">
        <span class="status-dot"></span>
        <span data-save-status>自动已保存</span>
      </div>
      <button class="btn btn--primary" type="button" data-action="simulate">
        <span>进入模拟</span>${icon('chevron', 15)}
      </button>
    `;
    this.ui.saveStatus = this.headerActions.querySelector('[data-save-status]');
    this.headerActions.onclick = event => {
      if (event.target.closest('[data-action="simulate"]')) {
        if (this.model.parts.length === 0) {
          showToast('请先添加至少一个几何部件。', { type: 'error' });
          return;
        }
        let repaired = false;
        if (!this.model.name?.trim()) {
          this.model.name = '未命名飞行器';
          this.ui.modelName.value = this.model.name;
          repaired = true;
        }
        for (const part of this.model.parts) {
          if (!part.name?.trim()) {
            part.name = SHAPE_INFO[part.shape]?.label ?? '部件';
            repaired = true;
          }
          for (const axis of ['x', 'y', 'z']) {
            if (!Number.isFinite(part.size[axis]) || part.size[axis] < 0.02) {
              part.size[axis] = 0.02;
              repaired = true;
            }
          }
        }
        if (repaired) this._rebuildScene();
        this._cancelPick();
        this._exitPreview();
        this._commitNow();
        this.store.flush();
        this.onSimulation?.();
      }
    };
  }

  _bindOverlay() {
    this.overlayHost.addEventListener('click', event => {
      const addButton = event.target.closest('[data-add-shape]');
      if (addButton) {
        this.addPart(addButton.dataset.addShape);
        return;
      }

      const partRow = event.target.closest('[data-part-select]');
      if (partRow) {
        this._select(partRow.dataset.partSelect);
        return;
      }

      const transformButton = event.target.closest('[data-transform]');
      if (transformButton) {
        this.setTransformMode(transformButton.dataset.transform);
        return;
      }

      const swatch = event.target.closest('[data-part-color-value]');
      if (swatch && this.selectedId) {
        this._setPartColor(swatch.dataset.partColorValue);
        return;
      }

      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action) this._handleAction(action);
    }, { signal: this._events.signal });

    this.overlayHost.addEventListener('input', event => this._handleFieldInput(event), { signal: this._events.signal });
    this.overlayHost.addEventListener('change', event => {
      if (event.target.matches('input')) {
        this._commitNow();
        if (event.target.matches('[data-part-vec], [data-cockpit-vec], [data-cockpit-scalar]')) {
          this._syncVisibleFields();
        }
      }
    }, { signal: this._events.signal });
  }

  _bindKeyboard() {
    window.addEventListener('keydown', event => {
      const typing = event.target.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') {
        if (this.previewActive) {
          this._exitPreview();
          event.preventDefault();
        } else if (this.pickMode) {
          this._cancelPick();
          event.preventDefault();
        } else if (!typing && this.selectedId) {
          this._select(null);
        }
        return;
      }
      if (typing) return;
      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'd' && this.selectedId) {
          event.preventDefault();
          this.duplicateSelected();
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'w') this.setTransformMode('translate');
      if (key === 'e') this.setTransformMode('rotate');
      if (key === 'r') this.setTransformMode('scale');
      if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedId) {
        event.preventDefault();
        this.deleteSelected();
      }
    }, { signal: this._events.signal });
  }

  _bindPointer() {
    const canvas = this.viewport.renderer.domElement;

    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this._pointerStart = { x: event.clientX, y: event.clientY };
      if (this.previewActive) {
        this._lookDrag = { x: event.clientX, y: event.clientY };
        canvas.setPointerCapture?.(event.pointerId);
        canvas.classList.add('is-looking');
      }
    });

    canvas.addEventListener('pointermove', event => {
      if (!this.previewActive || !this._lookDrag) return;
      const dx = event.clientX - this._lookDrag.x;
      const dy = event.clientY - this._lookDrag.y;
      this._lookDrag = { x: event.clientX, y: event.clientY };
      this._previewLook.yaw -= dx * 0.15;
      this._previewLook.pitch = THREE.MathUtils.clamp(this._previewLook.pitch - dy * 0.12, -72, 72);
      this._applyPreviewCamera();
    });

    const endLook = event => {
      if (this._lookDrag) {
        this._lookDrag = null;
        canvas.classList.remove('is-looking');
        try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
      }
    };
    canvas.addEventListener('pointerup', endLook);
    canvas.addEventListener('pointercancel', endLook);

    canvas.addEventListener('pointerup', event => {
      if (event.button !== 0 || this.previewActive) return;
      if (!this._pointerStart) return;
      const moved = Math.hypot(event.clientX - this._pointerStart.x, event.clientY - this._pointerStart.y);
      this._pointerStart = null;
      if (moved > 5) return;
      if (this.transform.dragging) return;

      const hit = this._raycast(event);
      if (this.pickMode) {
        if (hit) this._placeCockpit(hit);
        return;
      }
      if (hit) {
        this._select(hit.object.userData.partId);
      } else {
        this._select(null);
      }
    });

    canvas.addEventListener('wheel', event => {
      if (!this.previewActive) return;
      event.preventDefault();
      this.viewport.camera.fov = THREE.MathUtils.clamp(this.viewport.camera.fov + event.deltaY * 0.025, 34, 78);
      this.viewport.camera.updateProjectionMatrix();
    }, { passive: false });
  }

  _raycast(event) {
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.viewport.camera);
    const meshes = [...this.partGroups.values()]
      .map(group => group.userData.mesh)
      .filter(Boolean);
    return this.raycaster.intersectObjects(meshes, false)[0] ?? null;
  }

  _handleAction(action) {
    switch (action) {
      case 'reset':
        if (this.model.parts.length === 0) {
          this._resetToDemo();
        } else if (this._resetArmed) {
          this._resetArmed = false;
          this._resetToDemo();
        } else {
          this._resetArmed = true;
          showToast('再次点击“载入示例”以确认覆盖当前模型。', { type: 'info', duration: 3200 });
          setTimeout(() => { this._resetArmed = false; }, 3200);
        }
        break;
      case 'fit':
        this.fitView();
        break;
      case 'preview':
        this._enterPreview();
        break;
      case 'pick':
        this._startPick();
        break;
      case 'cancel-pick':
        this._cancelPick();
        break;
      case 'exit-preview':
        this._exitPreview();
        break;
      case 'duplicate':
        this.duplicateSelected();
        break;
      case 'delete':
        this.deleteSelected();
        break;
      default:
        break;
    }
  }

  _handleFieldInput(event) {
    const input = event.target;
    if (input.matches('[data-model-name]')) {
      this.model.name = input.value;
      this._scheduleCommit();
      return;
    }

    const part = this.selectedPart();
    if (!part) return;

    if (input.matches('[data-part-name]')) {
      part.name = input.value;
      this._updatePartRow(part);
      this.ui.selectedTag.textContent = part.name || SHAPE_INFO[part.shape].label;
      this._scheduleCommit();
      return;
    }

    if (input.matches('[data-part-color]')) {
      this._setPartColor(input.value, false);
      return;
    }

    if (input.matches('[data-part-vec]')) {
      const path = input.dataset.partVec.split('.');
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      const [group, axis] = path;
      if (group === 'size') {
        part.size[axis] = THREE.MathUtils.clamp(value, 0.02, 100);
      } else if (group === 'rotation') {
        part.rotation[axis] = THREE.MathUtils.clamp(value, -1080, 1080);
      } else {
        part.position[axis] = THREE.MathUtils.clamp(value, -2000, 2000);
      }
      this._applyPartTransform(part);
      this._syncSelectionHelper();
      this._scheduleCommit();
      return;
    }

    if (input.matches('[data-cockpit-vec]') || input.matches('[data-cockpit-scalar]')) {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      if (input.matches('[data-cockpit-vec]')) {
        const axis = input.dataset.cockpitVec;
        this.model.cockpit.position[axis] = THREE.MathUtils.clamp(value, -2000, 2000);
      } else {
        const field = input.dataset.cockpitScalar;
        if (field === 'yawDegrees') this.model.cockpit.yawDegrees = THREE.MathUtils.clamp(value, -360, 360);
        if (field === 'pitchDegrees') this.model.cockpit.pitchDegrees = THREE.MathUtils.clamp(value, -89, 89);
      }
      this._updateCockpitMarker();
      if (this.previewActive) this._applyPreviewCamera();
      this._scheduleCommit();
    }
  }

  _setPartColor(color, commit = true) {
    const part = this.selectedPart();
    if (!part) return;
    part.color = color;
    const group = this.partGroups.get(part.id);
    if (group?.userData.mesh?.material) {
      group.userData.mesh.material.color.set(color);
    }
    const picker = this.ui.inspector.querySelector('[data-part-color]');
    if (picker) picker.value = color;
    this.ui.inspector.querySelectorAll('[data-part-color-value]').forEach(swatch => {
      swatch.classList.toggle('is-active', swatch.dataset.partColorValue.toLowerCase() === color.toLowerCase());
    });
    this._updatePartRow(part);
    if (commit) this._commitNow();
  }

  _scheduleCommit() {
    if (this._commitTimer) clearTimeout(this._commitTimer);
    this._setSaveStatus('编辑中…', 'saving');
    this._commitTimer = setTimeout(() => this._commitNow(), 180);
  }

  _commitNow() {
    if (this._commitTimer) {
      clearTimeout(this._commitTimer);
      this._commitTimer = null;
    }
    this.store.replace(this.model, 'edit');
  }

  _setSaveStatus(text, state) {
    if (!this.ui.saveStatus) return;
    this.ui.saveStatus.textContent = text;
    this.headerActions.querySelector('.header-status')?.classList.toggle('is-saving', state === 'saving');
  }

  _rebuildScene() {
    this.transform.detach();
    this._clearSelectionHelper();
    for (const group of this.partGroups.values()) {
      this.meshRoot.remove(group);
      disposePartGroup(group);
    }
    this.partGroups.clear();

    for (const part of this.model.parts) {
      const group = this._createPartGroup(part);
      this.meshRoot.add(group);
      this.partGroups.set(part.id, group);
    }
    this._renderPartList();
    this._updateCounts();
    if (this.selectedId && !this.partGroups.has(this.selectedId)) {
      this.selectedId = null;
    }
    this._select(this.selectedId);
    this._updateCockpitMarker();
  }

  _createPartGroup(part) {
    const group = new THREE.Group();
    group.name = part.name;
    group.userData.partId = part.id;

    const geometry = makeUnitGeometry(part.shape);
    const isCanopy = part.name.includes('舱') || part.color.toLowerCase() === '#123d49';
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color),
      metalness: isCanopy ? 0.15 : 0.42,
      roughness: isCanopy ? 0.14 : 0.38,
      transparent: isCanopy,
      opacity: isCanopy ? 0.82 : 1,
      envMapIntensity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.partId = part.id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    group.userData.mesh = mesh;

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: 0x9ce9e2, transparent: true, opacity: 0.12, depthWrite: false })
    );
    edges.renderOrder = 2;
    group.add(edges);

    this._applyPartTransform(part, group);
    return group;
  }

  _applyPartTransform(part, group = this.partGroups.get(part.id)) {
    if (!group) return;
    group.position.set(part.position.x, part.position.y, part.position.z);
    group.rotation.set(
      THREE.MathUtils.degToRad(part.rotation.x),
      THREE.MathUtils.degToRad(part.rotation.y),
      THREE.MathUtils.degToRad(part.rotation.z)
    );
    group.scale.set(part.size.x, part.size.y, part.size.z);
    group.updateMatrixWorld(true);
  }

  _applyGizmoTransform() {
    const group = this.selectedGroup();
    const part = this.selectedPart();
    if (!group || !part) return;
    const scale = group.scale;
    group.scale.set(Math.max(scale.x, 0.02), Math.max(scale.y, 0.02), Math.max(scale.z, 0.02));
    part.position = {
      x: round(group.position.x),
      y: round(group.position.y),
      z: round(group.position.z)
    };
    part.rotation = {
      x: round(THREE.MathUtils.radToDeg(group.rotation.x)),
      y: round(THREE.MathUtils.radToDeg(group.rotation.y)),
      z: round(THREE.MathUtils.radToDeg(group.rotation.z))
    };
    part.size = {
      x: round(Math.max(group.scale.x, 0.02)),
      y: round(Math.max(group.scale.y, 0.02)),
      z: round(Math.max(group.scale.z, 0.02))
    };
    this._syncVisibleFields();
    this._syncSelectionHelper();
    this._updatePartRow(part);
    this._setSaveStatus('编辑中…', 'saving');
  }

  _renderPartList() {
    if (!this.ui) return;
    if (this.model.parts.length === 0) {
      this.ui.partList.innerHTML = `
        <div class="scene-empty">
          <span>${icon('cube', 24)}</span>
          <strong>场景为空</strong>
          <p>从左侧添加几何基元开始构建。</p>
        </div>`;
      return;
    }
    this.ui.partList.innerHTML = this.model.parts.map(part => `
      <button class="part-row ${part.id === this.selectedId ? 'is-active' : ''}" type="button" data-part-select="${escapeHtml(part.id)}">
        <span class="part-row__icon">${icon(SHAPE_GLYPHS[part.shape], 15)}</span>
        <span class="part-row__copy">
          <strong>${escapeHtml(part.name)}</strong>
          <small>${SHAPE_INFO[part.shape]?.label ?? part.shape}</small>
        </span>
        <span class="part-row__swatch" style="--part-color:${escapeHtml(part.color)}"></span>
      </button>
    `).join('');
    this._updateCounts();
  }

  _updatePartRow(part) {
    const row = this.ui.partList.querySelector(`[data-part-select="${cssEscape(part.id)}"]`);
    if (!row) return;
    row.querySelector('.part-row__copy strong').textContent = part.name;
    row.querySelector('.part-row__swatch').style.setProperty('--part-color', part.color);
  }

  _updateCounts() {
    if (this.ui?.partCount) this.ui.partCount.textContent = String(this.model.parts.length);
    const simulateButton = this.headerActions.querySelector('[data-action="simulate"]');
    if (simulateButton) {
      simulateButton.disabled = this.model.parts.length === 0;
      simulateButton.title = simulateButton.disabled ? '请先添加部件' : '开始气动模拟';
    }
  }

  _select(id) {
    this.selectedId = id && this.partGroups.has(id) ? id : null;
    this.overlayHost.querySelectorAll('[data-part-select]').forEach(row => {
      row.classList.toggle('is-active', row.dataset.partSelect === this.selectedId);
    });
    this.transform.detach();
    this._clearSelectionHelper();

    const group = this.selectedGroup();
    if (group) {
      this.transform.attach(group);
      this._createSelectionHelper(group);
      this.ui.selectedTag.textContent = this.selectedPart()?.name ?? '未选择';
    } else {
      this.ui.selectedTag.textContent = '未选择';
    }
    this._renderInspector();
    this._updatePartListScroll();
  }

  _createSelectionHelper(group) {
    this.scene.updateMatrixWorld(true);
    const helper = new THREE.BoxHelper(group, 0xffb166);
    helper.material.transparent = true;
    helper.material.opacity = 0.8;
    helper.material.depthTest = false;
    helper.renderOrder = 20;
    this.selectionHelper = helper;
    this.scene.add(helper);
  }

  _clearSelectionHelper() {
    if (!this.selectionHelper) return;
    this.scene.remove(this.selectionHelper);
    this.selectionHelper.geometry.dispose();
    this.selectionHelper.material.dispose();
    this.selectionHelper = null;
  }

  _syncSelectionHelper() {
    if (!this.selectionHelper || !this.selectedGroup()) return;
    this.scene.updateMatrixWorld(true);
    this.selectionHelper.update();
  }

  _updatePartListScroll() {
    const row = this.ui.partList.querySelector('.part-row.is-active');
    row?.scrollIntoView({ block: 'nearest' });
  }

  _renderInspector() {
    if (!this.ui?.inspector) return;
    const part = this.selectedPart();
    let partMarkup = '';

    if (part) {
      const info = SHAPE_INFO[part.shape];
      partMarkup = `
        <section class="inspector-section">
          <div class="section-heading">
            <div>
              <div class="panel-kicker">选中部件</div>
              <h3>${escapeHtml(part.name)}</h3>
            </div>
            <div class="icon-actions">
              <button class="icon-btn" type="button" data-action="duplicate" title="复制部件">${icon('copy', 15)}</button>
              <button class="icon-btn icon-btn--danger" type="button" data-action="delete" title="删除部件">${icon('trash', 15)}</button>
            </div>
          </div>
          <div class="shape-chip">${icon(SHAPE_GLYPHS[part.shape], 14)} ${info.label}</div>
          <label class="field">
            <span>名称</span>
            <input data-part-name maxlength="60" value="${escapeHtml(part.name)}" spellcheck="false">
          </label>
          <div class="field color-field">
            <span>部件颜色</span>
            <div class="color-field__controls">
              <input type="color" data-part-color value="${escapeHtml(part.color)}" aria-label="部件颜色">
              <div class="swatch-strip">
                ${PART_COLORS.map(color => `<button type="button" class="swatch ${color.toLowerCase() === part.color.toLowerCase() ? 'is-active' : ''}" data-part-color-value="${color}" style="--swatch:${color}" title="${color}"></button>`).join('')}
              </div>
            </div>
          </div>
          ${this._vectorFields('位置', 'position', part.position, 'm', 0.1, 'data-part-vec')}
          ${this._vectorFields('旋转', 'rotation', part.rotation, '°', 1, 'data-part-vec')}
          ${this._vectorFields('尺寸', 'size', part.size, 'm', 0.05, 'data-part-vec')}
          <p class="section-note">${SIZE_HINTS[part.shape]}</p>
        </section>
      `;
    } else {
      partMarkup = `
        <div class="inspector-empty">
          <div class="inspector-empty__mark">${icon('target', 22)}</div>
          <strong>选择场景中的部件</strong>
          <p>点击模型或左侧列表以编辑位置、旋转与尺寸。</p>
        </div>
      `;
    }

    this.ui.inspector.innerHTML = partMarkup + this._cockpitMarkup();
  }

  _vectorFields(label, group, values, unit, step, attribute) {
    return `
      <div class="field-group">
        <div class="field-group__head"><span>${label}</span><small>${unit}</small></div>
        <div class="axis-inputs">
          ${['x', 'y', 'z'].map(axis => `
            <label class="axis-input">
              <span>${axis.toUpperCase()}</span>
              <input type="number" step="${step}" value="${formatField(values[axis])}" ${attribute}="${group}.${axis}">
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  _cockpitMarkup() {
    const cockpit = this.model.cockpit;
    return `
      <section class="inspector-section cockpit-inspector">
        <div class="section-heading">
          <div>
            <div class="panel-kicker">相机定义</div>
            <h3>驾驶舱视角</h3>
          </div>
          <span class="required-badge">必需</span>
        </div>
        <div class="field-group">
          <div class="field-group__head"><span>载具坐标</span><small>m</small></div>
          <div class="axis-inputs">
            ${['x', 'y', 'z'].map(axis => `
              <label class="axis-input">
                <span>${axis.toUpperCase()}</span>
                <input type="number" step="0.05" value="${formatField(cockpit.position[axis])}" data-cockpit-vec="${axis}">
              </label>
            `).join('')}
          </div>
        </div>
        <div class="two-fields">
          <label class="field">
            <span>航向角</span>
            <div class="field-with-unit"><input type="number" step="1" value="${formatField(cockpit.yawDegrees)}" data-cockpit-scalar="yawDegrees"><small>°</small></div>
          </label>
          <label class="field">
            <span>俯仰角</span>
            <div class="field-with-unit"><input type="number" step="1" value="${formatField(cockpit.pitchDegrees)}" data-cockpit-scalar="pitchDegrees"><small>°</small></div>
          </label>
        </div>
        <div class="action-row">
          <button class="btn btn--small btn--ghost" type="button" data-action="pick">${icon('target', 14)} 表面拾取</button>
          <button class="btn btn--small btn--ghost" type="button" data-action="preview">${icon('camera', 14)} 预览</button>
        </div>
        <p class="section-note">该相机位置与朝向将用于模拟视图的驾驶舱渲染。</p>
      </section>
    `;
  }

  _syncVisibleFields() {
    const part = this.selectedPart();
    if (!part) return;
    this.ui.inspector.querySelectorAll('[data-part-vec]').forEach(input => {
      const [group, axis] = input.dataset.partVec.split('.');
      const value = part[group]?.[axis];
      if (document.activeElement !== input && value !== undefined) input.value = formatField(value);
    });
    this.ui.inspector.querySelectorAll('[data-cockpit-vec]').forEach(input => {
      if (document.activeElement !== input) input.value = formatField(this.model.cockpit.position[input.dataset.cockpitVec]);
    });
    this.ui.inspector.querySelectorAll('[data-cockpit-scalar]').forEach(input => {
      if (document.activeElement !== input) input.value = formatField(this.model.cockpit[input.dataset.cockpitScalar]);
    });
  }

  _updateCockpitMarker() {
    if (!this.cockpitMarker) return;
    const { position, yawDegrees, pitchDegrees } = this.model.cockpit;
    this.cockpitMarker.position.set(position.x, position.y, position.z);
    const yaw = THREE.MathUtils.degToRad(yawDegrees);
    const pitch = THREE.MathUtils.degToRad(pitchDegrees);
    const forward = new THREE.Vector3(
      Math.cos(pitch) * Math.cos(yaw),
      Math.sin(pitch),
      -Math.cos(pitch) * Math.sin(yaw)
    ).normalize();
    this.cockpitMarker.quaternion.setFromUnitVectors(X_AXIS, forward);
  }

  setTransformMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) return;
    this.transformMode = mode;
    this.transform.setMode(mode);
    this.overlayHost.querySelectorAll('[data-transform]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.transform === mode);
    });
  }

  addPart(shape) {
    if (this.model.parts.length >= 80) {
      showToast('已达到 80 个部件的上限。', { type: 'error' });
      return;
    }
    const info = SHAPE_INFO[shape];
    if (!info) return;
    const target = this.viewport.controls.target;
    const count = this.model.parts.filter(part => part.shape === shape).length + 1;
    const part = createPart(shape, {
      name: `${info.defaultName} ${count}`,
      position: {
        x: round(target.x),
        y: round(target.y),
        z: round(target.z)
      },
      color: PART_COLORS[this.model.parts.length % PART_COLORS.length]
    });
    this.model.parts.push(part);
    this._rebuildScene();
    this._select(part.id);
    this._commitNow();
    showToast(`已添加 ${info.label}。`, { type: 'success', duration: 1800 });
  }

  duplicateSelected() {
    const source = this.selectedPart();
    if (!source) return;
    if (this.model.parts.length >= 80) {
      showToast('已达到 80 个部件的上限。', { type: 'error' });
      return;
    }
    const copy = structuredClone(source);
    copy.id = uid('part');
    copy.name = `${source.name} 副本`;
    copy.position.x = round(copy.position.x + 0.25);
    copy.position.y = round(copy.position.y + 0.25);
    this.model.parts.push(copy);
    this._rebuildScene();
    this._select(copy.id);
    this._commitNow();
  }

  deleteSelected() {
    const part = this.selectedPart();
    if (!part) return;
    this.model.parts = this.model.parts.filter(item => item.id !== part.id);
    this.selectedId = null;
    this._rebuildScene();
    this._commitNow();
    showToast(`已删除 ${part.name}。`, { type: 'info', duration: 1800 });
  }

  _resetToDemo() {
    this._exitPreview();
    this._cancelPick();
    this.store.resetToDemo();
    this.model = this.store.snapshot();
    this.selectedId = null;
    this.ui.modelName.value = this.model.name;
    this._rebuildScene();
    this.fitView();
    this._setSaveStatus('自动已保存', 'saved');
    showToast('已载入示例飞行器。', { type: 'success' });
  }

  fitView() {
    if (this._disposed) return;
    this.scene.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(this.meshRoot);
    if (box.isEmpty()) {
      box = new THREE.Box3(new THREE.Vector3(-2, -1, -2), new THREE.Vector3(2, 1, 2));
    }
    const min = box.min;
    const max = box.max;
    this.viewport.fitBounds(
      { x: min.x, y: min.y, z: min.z },
      { x: max.x, y: max.y, z: max.z },
      1.58
    );
  }

  _startPick() {
    if (this.previewActive) this._exitPreview();
    this.pickMode = true;
    this.overlayHost.classList.add('is-picking');
    this.ui.pickBanner.hidden = false;
    showToast('点击模型表面以放置驾驶舱相机。', { type: 'info', duration: 2600 });
  }

  _cancelPick() {
    this.pickMode = false;
    this.overlayHost.classList.remove('is-picking');
    if (this.ui?.pickBanner) this.ui.pickBanner.hidden = true;
  }

  _placeCockpit(hit) {
    let normal = hit.face?.normal?.clone();
    if (normal) {
      normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
    } else {
      normal = new THREE.Vector3(0, 1, 0);
    }
    const position = hit.point.clone().addScaledVector(normal, 0.04);
    this.model.cockpit.position = {
      x: round(position.x),
      y: round(position.y),
      z: round(position.z)
    };
    this._updateCockpitMarker();
    this._renderInspector();
    this._cancelPick();
    this._commitNow();
    showToast('驾驶舱相机位置已更新。', { type: 'success', duration: 2200 });
  }

  _enterPreview() {
    if (this.previewActive) return;
    this._cancelPick();
    this.previewActive = true;
    this._previewLook = { yaw: 0, pitch: 0 };
    this._previewSnapshot = {
      position: this.viewport.camera.position.clone(),
      quaternion: this.viewport.camera.quaternion.clone(),
      target: this.viewport.controls.target.clone(),
      fov: this.viewport.camera.fov,
      near: this.viewport.camera.near
    };
    this.viewport.controls.enabled = false;
    this.viewport.camera.near = 0.015;
    this.viewport.camera.fov = 58;
    this.viewport.camera.updateProjectionMatrix();
    this._ghostMaterials = [];
    for (const group of this.partGroups.values()) {
      const material = group.userData.mesh?.material;
      if (!material) continue;
      this._ghostMaterials.push({
        material,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite
      });
      material.transparent = true;
      material.opacity = 0.2;
      material.depthWrite = false;
      material.needsUpdate = true;
    }
    this._previewVisibility = {
      gizmo: this.transform.getHelper().visible,
      helper: this.selectionHelper?.visible ?? false,
      marker: this.cockpitMarker.visible
    };
    this.transform.getHelper().visible = false;
    if (this.selectionHelper) this.selectionHelper.visible = false;
    this.cockpitMarker.visible = false;
    this.overlayHost.classList.add('is-cockpit-preview');
    this.ui.preview.hidden = false;
    this._applyPreviewCamera();
    this.overlayHost.querySelectorAll('[data-action="preview"]').forEach(button => button.classList.add('is-active'));
  }

  _applyPreviewCamera() {
    if (!this.previewActive) return;
    const position = this.model.cockpit.position;
    const yawDegrees = this.model.cockpit.yawDegrees + this._previewLook.yaw;
    const pitchDegrees = THREE.MathUtils.clamp(this.model.cockpit.pitchDegrees + this._previewLook.pitch, -85, 85);
    const yaw = THREE.MathUtils.degToRad(yawDegrees);
    const pitch = THREE.MathUtils.degToRad(pitchDegrees);
    this.viewport.camera.position.set(position.x, position.y, position.z);
    const target = new THREE.Vector3(
      position.x + Math.cos(pitch) * Math.cos(yaw),
      position.y + Math.sin(pitch),
      position.z - Math.cos(pitch) * Math.sin(yaw)
    );
    this.viewport.camera.up.copy(Y_AXIS);
    this.viewport.camera.lookAt(target);
    this.viewport.camera.updateMatrixWorld();
  }

  _exitPreview() {
    if (!this.previewActive) return;
    this.previewActive = false;
    this.overlayHost.classList.remove('is-cockpit-preview');
    if (this.ui?.preview) this.ui.preview.hidden = true;
    if (this._previewVisibility) {
      this.transform.getHelper().visible = this._previewVisibility.gizmo;
      if (this.selectionHelper) this.selectionHelper.visible = this._previewVisibility.helper;
      this.cockpitMarker.visible = this._previewVisibility.marker;
      this._previewVisibility = null;
    }
    for (const ghost of this._ghostMaterials ?? []) {
      ghost.material.transparent = ghost.transparent;
      ghost.material.opacity = ghost.opacity;
      ghost.material.depthWrite = ghost.depthWrite;
      ghost.material.needsUpdate = true;
    }
    this._ghostMaterials = null;
    if (this._previewSnapshot) {
      this.viewport.camera.position.copy(this._previewSnapshot.position);
      this.viewport.camera.quaternion.copy(this._previewSnapshot.quaternion);
      this.viewport.camera.fov = this._previewSnapshot.fov;
      this.viewport.camera.near = this._previewSnapshot.near;
      this.viewport.controls.target.copy(this._previewSnapshot.target);
      this.viewport.camera.updateProjectionMatrix();
      this.viewport.controls.enabled = true;
      this.viewport.controls.update();
      this._previewSnapshot = null;
    }
    this.overlayHost.querySelectorAll('[data-action="preview"]').forEach(button => button.classList.remove('is-active'));
  }

  selectedPart() {
    return this.model.parts.find(part => part.id === this.selectedId) ?? null;
  }

  selectedGroup() {
    return this.selectedId ? this.partGroups.get(this.selectedId) : null;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._commitTimer) clearTimeout(this._commitTimer);
    this.store.flush();
    this._unsubscribeStore?.();
    this._events.abort();
    this.transform.detach();
    this.transform.dispose();
    this._clearSelectionHelper();
    this.viewport.dispose();
    this.overlayHost.replaceChildren();
    this.headerActions.replaceChildren();
    this.headerActions.onclick = null;
  }
}

function formatField(value) {
  if (!Number.isFinite(Number(value))) return '0';
  return Number(value).toFixed(2).replace(/\.?0+$/, '');
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replaceAll('"', '\\"');
}
