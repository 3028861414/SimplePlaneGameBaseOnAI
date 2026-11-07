import * as THREE from 'three';

const RADIUS_X = 42;
const RADIUS_Z = 42;
const TOP = 38;
const BOTTOM = -8;

/**
 * Localized rain/wind streaks around the aircraft. It is intentionally a
 * separate, toggleable group so low-end devices can disable all weather work.
 */
export class WeatherEffect {
  constructor(scene, count = 420) {
    this.scene = scene;
    this.count = count;
    this.enabled = false;
    this._positions = new Float32Array(count * 2 * 3);
    this._drops = new Float32Array(count * 4);
    const random = mulberry32(0x9e3779b9);
    for (let i = 0; i < count; i++) {
      this._drops[i * 4] = (random() * 2 - 1) * RADIUS_X;
      this._drops[i * 4 + 1] = BOTTOM + random() * (TOP - BOTTOM);
      this._drops[i * 4 + 2] = (random() * 2 - 1) * RADIUS_Z;
      this._drops[i * 4 + 3] = 0.55 + random() * 1.7;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xb5dce8,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.name = 'weather-rain';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lines.visible = false;
    scene.add(this.lines);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.lines.visible = this.enabled;
  }

  update(dt, position, windVelocity) {
    if (!this.enabled) return;
    const step = Math.min(Math.max(dt, 0), 0.05);
    const windX = windVelocity?.x ?? 0;
    const windZ = windVelocity?.z ?? 0;
    const drops = this._drops;
    const positions = this._positions;
    for (let i = 0; i < this.count; i++) {
      let x = drops[i * 4] + windX * step * 0.45;
      let y = drops[i * 4 + 1] - (15 + drops[i * 4 + 3] * 8) * step;
      let z = drops[i * 4 + 2] + windZ * step * 0.45;
      if (y < BOTTOM) {
        y = TOP;
        x = (Math.random() * 2 - 1) * RADIUS_X;
        z = (Math.random() * 2 - 1) * RADIUS_Z;
      }
      if (x < -RADIUS_X) x += RADIUS_X * 2;
      else if (x > RADIUS_X) x -= RADIUS_X * 2;
      if (z < -RADIUS_Z) z += RADIUS_Z * 2;
      else if (z > RADIUS_Z) z -= RADIUS_Z * 2;
      drops[i * 4] = x;
      drops[i * 4 + 1] = y;
      drops[i * 4 + 2] = z;

      const offset = i * 6;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x - windX * 0.018;
      positions[offset + 4] = y - drops[i * 4 + 3];
      positions[offset + 5] = z - windZ * 0.018;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.lines.position.copy(position);
  }

  dispose() {
    this.scene.remove(this.lines);
    this.geometry.dispose();
    this.material.dispose();
  }
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
