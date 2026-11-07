import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Viewport {
  constructor(container, options = {}) {
    this.container = container;
    container.replaceChildren();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.className = 'webgl-canvas';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.04, 400);
    this.camera.position.set(9, 7, 11);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.75;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 160;
    this.controls.maxPolarAngle = Math.PI * 0.94;

    this.clock = new THREE.Clock();
    this.frameListeners = new Set();
    this._disposed = false;
    if (options.studioLighting !== false) this._setupLighting();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this._render());
  }

  _setupLighting() {
    const hemisphere = new THREE.HemisphereLight(0xb9e7ff, 0x17232b, 1.55);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(7, 12, 8);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x3bb4d8, 1.65);
    fill.position.set(-8, 2, -6);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffcc9a, 1.55);
    rim.position.set(-3, 7, -10);
    this.scene.add(rim);
  }

  addGrid(size = 90, divisions = 90, y = -3) {
    const grid = new THREE.GridHelper(size, divisions, 0x2b5561, 0x162a33);
    grid.position.y = y;
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
    }
    grid.renderOrder = -2;
    this.scene.add(grid);
    return grid;
  }

  addAxes(length = 1.7) {
    const axes = new THREE.AxesHelper(length);
    axes.material.transparent = true;
    axes.material.opacity = 0.55;
    axes.material.depthWrite = false;
    this.scene.add(axes);
    return axes;
  }

  fitBounds(min, max, padding = 1.35) {
    if (!min || !max) return;
    const box = new THREE.Box3(
      new THREE.Vector3(min.x, min.y, min.z),
      new THREE.Vector3(max.x, max.y, max.z)
    );
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 1);
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * padding;
    const direction = new THREE.Vector3(1.05, 0.68, 1.25).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.near = Math.max(distance / 1000, 0.03);
    this.camera.far = distance * 30;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  moveCamera(position, target) {
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
  }

  onFrame(listener) {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  resize() {
    if (this._disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  _render() {
    if (this._disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    if (this.controls.enabled) this.controls.update();
    for (const listener of this.frameListeners) {
      listener(delta, elapsed);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._disposed = true;
    this.renderer.setAnimationLoop(null);
    this._resizeObserver.disconnect();
    this.controls.dispose();
    this.frameListeners.clear();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

export function disposeObject(root) {
  root.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}
