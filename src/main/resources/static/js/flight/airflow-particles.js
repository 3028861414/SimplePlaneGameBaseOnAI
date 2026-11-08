import * as THREE from 'three';

const HALF_BOX = new THREE.Vector3(7.5, 2.8, 6.0);
const BOX = HALF_BOX.clone().multiplyScalar(2);

/**
 * Lightweight aircraft-relative air streaks. The particles live in the body
 * frame so the effect stays visible from both cockpit and chase cameras.
 */
export class AirflowParticles {
  constructor(scene, count = 340) {
    this.scene = scene;
    this.count = count;
    this.enabled = true;
    this._positions = new Float32Array(count * 2 * 3);
    this._local = new Float32Array(count * 3);
    this._random = mulberry32(0x51f0a3);
    for (let i = 0; i < count; i++) {
      this._local[i * 3] = (this._random() * 2 - 1) * HALF_BOX.x;
      this._local[i * 3 + 1] = (this._random() * 2 - 1) * HALF_BOX.y;
      this._local[i * 3 + 2] = (this._random() * 2 - 1) * HALF_BOX.z;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.name = 'airflow-particles';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.lines.visible = false;
    scene.add(this.lines);

    this._inverse = new THREE.Quaternion();
    this._air = new THREE.Vector3();
  }

  setVisible(visible) {
    this.enabled = Boolean(visible);
    this.lines.visible = this.enabled;
  }

  update(dt, position, quaternion, velocity, windVelocity) {
    if (!this.enabled) return;
    const step = Math.min(Math.max(dt, 0), 0.05);
    this._inverse.copy(quaternion).invert();
    this._air.set(
      (windVelocity?.x ?? 0) - (velocity?.x ?? 0),
      (windVelocity?.y ?? 0) - (velocity?.y ?? 0),
      (windVelocity?.z ?? 0) - (velocity?.z ?? 0)
    ).applyQuaternion(this._inverse);

    const speed = this._air.length();
    this.lines.visible = speed > 1.2;
    if (!this.lines.visible) return;
    const dirX = speed > 1e-5 ? this._air.x / speed : -1;
    const dirY = speed > 1e-5 ? this._air.y / speed : 0;
    const dirZ = speed > 1e-5 ? this._air.z / speed : 0;
    const streakLength = THREE.MathUtils.clamp(0.22 + speed * 0.045, 0.22, 3.4);
    const travel = step * 0.32;

    const local = this._local;
    const positions = this._positions;
    for (let i = 0; i < this.count; i++) {
      let x = local[i * 3] + this._air.x * travel;
      let y = local[i * 3 + 1] + this._air.y * travel;
      let z = local[i * 3 + 2] + this._air.z * travel;

      if (x < -HALF_BOX.x) x += BOX.x;
      else if (x > HALF_BOX.x) x -= BOX.x;
      if (y < -HALF_BOX.y) y += BOX.y;
      else if (y > HALF_BOX.y) y -= BOX.y;
      if (z < -HALF_BOX.z) z += BOX.z;
      else if (z > HALF_BOX.z) z -= BOX.z;

      local[i * 3] = x;
      local[i * 3 + 1] = y;
      local[i * 3 + 2] = z;

      const offset = i * 6;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x + dirX * streakLength;
      positions[offset + 4] = y + dirY * streakLength;
      positions[offset + 5] = z + dirZ * streakLength;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.lines.position.copy(position);
    this.lines.quaternion.copy(quaternion);
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
