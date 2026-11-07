import * as THREE from 'three';

function decodeFloats(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export class FlowFieldData {
  constructor(flow) {
    this.nx = flow.nx;
    this.ny = flow.ny;
    this.nz = flow.nz;
    this.origin = new THREE.Vector3(flow.origin.x, flow.origin.y, flow.origin.z);
    this.stepX = new THREE.Vector3(flow.stepX.x, flow.stepX.y, flow.stepX.z);
    this.stepY = new THREE.Vector3(flow.stepY.x, flow.stepY.y, flow.stepY.z);
    this.stepZ = new THREE.Vector3(flow.stepZ.x, flow.stepZ.y, flow.stepZ.z);
    this.axisX = this.stepX.clone().normalize();
    this.axisY = this.stepY.clone().normalize();
    this.axisZ = this.stepZ.clone().normalize();
    this.stepLengths = [this.stepX.length(), this.stepY.length(), this.stepZ.length()];
    this.speed = decodeFloats(flow.speed);
    this.cp = decodeFloats(flow.pressureCoefficient);
    this.vx = decodeFloats(flow.velocityX);
    this.vy = decodeFloats(flow.velocityY);
    this.vz = decodeFloats(flow.velocityZ);
    this.minCell = Math.min(...this.stepLengths);
    this.bounds = this._computeBounds();
  }

  _computeBounds() {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const i of [0, this.nx - 1]) {
      for (const j of [0, this.ny - 1]) {
        for (const k of [0, this.nz - 1]) {
          const p = this.positionAt(i, j, k);
          min.min(p);
          max.max(p);
        }
      }
    }
    return new THREE.Box3(min, max);
  }

  positionAt(i, j, k) {
    return this.origin.clone()
      .addScaledVector(this.stepX, i)
      .addScaledVector(this.stepY, j)
      .addScaledVector(this.stepZ, k);
  }

  gridCoordinates(world, target = new THREE.Vector3()) {
    const dx = world.x - this.origin.x;
    const dy = world.y - this.origin.y;
    const dz = world.z - this.origin.z;
    const x = (dx * this.axisX.x + dy * this.axisX.y + dz * this.axisX.z) / this.stepLengths[0];
    const y = (dx * this.axisY.x + dy * this.axisY.y + dz * this.axisY.z) / this.stepLengths[1];
    const z = (dx * this.axisZ.x + dy * this.axisZ.y + dz * this.axisZ.z) / this.stepLengths[2];
    return target.set(x, y, z);
  }

  containsGridPoint(coord) {
    return coord.x >= 0 && coord.x <= this.nx - 1
      && coord.y >= 0 && coord.y <= this.ny - 1
      && coord.z >= 0 && coord.z <= this.nz - 1;
  }

  sampleScalar(world, array) {
    const coord = this.gridCoordinates(world);
    if (!this.containsGridPoint(coord)) return null;
    return this._sampleArray(array, coord.x, coord.y, coord.z);
  }

  sample(world) {
    const coord = this.gridCoordinates(world);
    if (!this.containsGridPoint(coord)) return null;
    const speed = this._sampleArray(this.speed, coord.x, coord.y, coord.z);
    if (speed === null || !Number.isFinite(speed)) return null;
    const cp = this._sampleArray(this.cp, coord.x, coord.y, coord.z);
    const vx = this._sampleArray(this.vx, coord.x, coord.y, coord.z);
    const vy = this._sampleArray(this.vy, coord.x, coord.y, coord.z);
    const vz = this._sampleArray(this.vz, coord.x, coord.y, coord.z);
    if (cp === null || vx === null || vy === null || vz === null) return null;
    return { speed, cp, velocity: new THREE.Vector3(vx, vy, vz) };
  }

  _sampleArray(array, x, y, z) {
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    const k0 = Math.floor(z);
    const i1 = Math.min(i0 + 1, this.nx - 1);
    const j1 = Math.min(j0 + 1, this.ny - 1);
    const k1 = Math.min(k0 + 1, this.nz - 1);
    const fx = x - i0;
    const fy = y - j0;
    const fz = z - k0;

    const v000 = this._indexValue(array, i0, j0, k0);
    const v100 = this._indexValue(array, i1, j0, k0);
    const v010 = this._indexValue(array, i0, j1, k0);
    const v110 = this._indexValue(array, i1, j1, k0);
    const v001 = this._indexValue(array, i0, j0, k1);
    const v101 = this._indexValue(array, i1, j0, k1);
    const v011 = this._indexValue(array, i0, j1, k1);
    const v111 = this._indexValue(array, i1, j1, k1);
    if (![v000, v100, v010, v110, v001, v101, v011, v111].every(Number.isFinite)) return null;

    const c00 = v000 + (v100 - v000) * fx;
    const c10 = v010 + (v110 - v010) * fx;
    const c01 = v001 + (v101 - v001) * fx;
    const c11 = v011 + (v111 - v011) * fx;
    const c0 = c00 + (c10 - c00) * fy;
    const c1 = c01 + (c11 - c01) * fy;
    return c0 + (c1 - c0) * fz;
  }

  _indexValue(array, i, j, k) {
    return array[i + this.nx * (j + this.ny * k)];
  }

  randomSeed(random = Math.random) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const j = 1 + Math.floor(random() * (this.ny - 2));
      const k = 1 + Math.floor(random() * (this.nz - 2));
      const i = 1 + Math.floor(random() * Math.max(1, this.nx - 3));
      const position = this.positionAt(i, j, k);
      const sample = this.sample(position);
      if (sample) return { position, j, k };
    }
    return { position: this.positionAt(1, Math.floor(this.ny / 2), Math.floor(this.nz / 2)), j: 1, k: 1 };
  }

  upstreamSeed(random = Math.random) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const j = 1 + Math.floor(random() * (this.ny - 2));
      const k = 1 + Math.floor(random() * (this.nz - 2));
      const position = this.positionAt(1, j, k);
      if (this.sample(position)) return { position, j, k };
    }
    return { position: this.positionAt(1, Math.floor(this.ny / 2), Math.floor(this.nz / 2)), j: 1, k: 1 };
  }
}
