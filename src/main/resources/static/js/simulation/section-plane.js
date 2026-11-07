import * as THREE from 'three';
import { pressureColor, speedColor, srgbToLinear } from '../util/color-map.js';
import { PRESSURE_RANGE } from './flow-visuals.js';

const AXIS_INDEX = { X: 0, Y: 1, Z: 2 };
const MAX_TEXTURE_EDGE = 280;
const MIN_TEXTURE_EDGE = 28;
const BANDS = 12;

export class SectionPlane {
  constructor(field, modelBounds, options = {}) {
    this.field = field;
    this.modelBounds = modelBounds;
    this.metric = options.metric ?? 'pressure';
    this.axis = options.axis ?? 'Z';
    this.speedMax = options.speedMax ?? 50;
    this.coordinate = options.coordinate ?? (modelBounds.min.z + modelBounds.max.z) * 0.5;
    this._triangles = [];

    this.group = new THREE.Group();
    this.group.name = 'analysis-section';
    this.group.renderOrder = 6;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(8), 2));
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);

    this.texture = null;
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.renderOrder = 6;
    this.group.add(this.mesh);

    this.borderGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
    ]);
    this.border = new THREE.LineLoop(
      this.borderGeometry,
      new THREE.LineBasicMaterial({ color: 0xffb166, transparent: true, opacity: 0.55, depthTest: false })
    );
    this.border.renderOrder = 9;
    this.group.add(this.border);

    this.outlineGeometry = new THREE.BufferGeometry();
    this.outline = new THREE.LineSegments(
      this.outlineGeometry,
      new THREE.LineBasicMaterial({ color: 0xffc178, transparent: true, opacity: 0.95, depthTest: false })
    );
    this.outline.renderOrder = 10;
    this.group.add(this.outline);

    this.update({ metric: this.metric, axis: this.axis, coordinate: this.coordinate });
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  update(options = {}) {
    if (options.metric) this.metric = options.metric;
    if (options.axis) this.axis = options.axis;
    if (Number.isFinite(options.speedMax)) this.speedMax = options.speedMax;
    if (Number.isFinite(options.coordinate)) this.coordinate = options.coordinate;
    if (options.modelBounds) this.modelBounds = options.modelBounds;
    this._rebuildGeometry();
    this._rebuildTexture();
    this._rebuildOutline();
  }

  _sectionBounds() {
    const min = this.modelBounds.min;
    const max = this.modelBounds.max;
    const size = max.clone().sub(min);
    const pad = new THREE.Vector3(
      Math.max(0.5, size.x * 0.22),
      Math.max(0.5, size.y * 0.55),
      Math.max(0.5, size.z * 0.22)
    );
    return {
      minX: min.x - pad.x, maxX: max.x + pad.x,
      minY: min.y - pad.y, maxY: max.y + pad.y,
      minZ: min.z - pad.z, maxZ: max.z + pad.z
    };
  }

  _rebuildGeometry() {
    const b = this._sectionBounds();
    let p0;
    let p1;
    let p2;
    let p3;
    let uMin;
    let uMax;
    let vMin;
    let vMax;

    if (this.axis === 'X') {
      p0 = new THREE.Vector3(this.coordinate, b.minY, b.minZ);
      p1 = new THREE.Vector3(this.coordinate, b.minY, b.maxZ);
      p2 = new THREE.Vector3(this.coordinate, b.maxY, b.maxZ);
      p3 = new THREE.Vector3(this.coordinate, b.maxY, b.minZ);
      uMin = b.minZ; uMax = b.maxZ;
      vMin = b.minY; vMax = b.maxY;
    } else if (this.axis === 'Y') {
      p0 = new THREE.Vector3(b.minX, this.coordinate, b.minZ);
      p1 = new THREE.Vector3(b.maxX, this.coordinate, b.minZ);
      p2 = new THREE.Vector3(b.maxX, this.coordinate, b.maxZ);
      p3 = new THREE.Vector3(b.minX, this.coordinate, b.maxZ);
      uMin = b.minX; uMax = b.maxX;
      vMin = b.minZ; vMax = b.maxZ;
    } else {
      p0 = new THREE.Vector3(b.minX, b.minY, this.coordinate);
      p1 = new THREE.Vector3(b.maxX, b.minY, this.coordinate);
      p2 = new THREE.Vector3(b.maxX, b.maxY, this.coordinate);
      p3 = new THREE.Vector3(b.minX, b.maxY, this.coordinate);
      uMin = b.minX; uMax = b.maxX;
      vMin = b.minY; vMax = b.maxY;
    }

    const positions = this.geometry.getAttribute('position');
    positions.setXYZ(0, p0.x, p0.y, p0.z);
    positions.setXYZ(1, p1.x, p1.y, p1.z);
    positions.setXYZ(2, p2.x, p2.y, p2.z);
    positions.setXYZ(3, p3.x, p3.y, p3.z);
    positions.needsUpdate = true;
    const uv = this.geometry.getAttribute('uv');
    uv.setXY(0, 0, 0);
    uv.setXY(1, 1, 0);
    uv.setXY(2, 1, 1);
    uv.setXY(3, 0, 1);
    uv.needsUpdate = true;
    this.geometry.computeBoundingSphere();

    this._section = { uMin, uMax, vMin, vMax, p0, p1, p2, p3 };
    const nextBorder = new THREE.BufferGeometry().setFromPoints([p0, p1, p2, p3]);
    nextBorder.computeBoundingSphere();
    this.border.geometry = nextBorder;
    this.borderGeometry.dispose();
    this.borderGeometry = nextBorder;
  }

  _rebuildTexture() {
    const { uMin, uMax, vMin, vMax } = this._section;
    const uExtent = Math.max(uMax - uMin, 1e-4);
    const vExtent = Math.max(vMax - vMin, 1e-4);
    const scale = MAX_TEXTURE_EDGE / Math.max(uExtent, vExtent);
    const width = Math.max(MIN_TEXTURE_EDGE, Math.min(MAX_TEXTURE_EDGE, Math.round(uExtent * scale)));
    const height = Math.max(MIN_TEXTURE_EDGE, Math.min(MAX_TEXTURE_EDGE, Math.round(vExtent * scale)));
    const data = new Uint8Array(width * height * 4);
    const normValues = new Float32Array(width * height).fill(Number.NaN);
    const array = this.metric === 'speed' ? this.field.speed : this.field.cp;

    for (let py = 0; py < height; py++) {
      const v = py / Math.max(height - 1, 1);
      const worldV = vMin + v * vExtent;
      for (let px = 0; px < width; px++) {
        const u = px / Math.max(width - 1, 1);
        const worldU = uMin + u * uExtent;
        const point = this._worldPoint(worldU, worldV);
        const value = this.field.sampleScalar(point, array);
        const pixel = (py * width + px) * 4;
        if (value === null) {
          data[pixel + 3] = 0;
          continue;
        }
        const norm = this.metric === 'speed'
          ? THREE.MathUtils.clamp(value / Math.max(this.speedMax, 1e-6), 0, 1)
          : THREE.MathUtils.clamp(
              (value - PRESSURE_RANGE[0]) / (PRESSURE_RANGE[1] - PRESSURE_RANGE[0]),
              0, 1
            );
        normValues[py * width + px] = norm;
        const rgb = this.metric === 'speed' ? speedColor(norm) : pressureColor(norm);
        const edgeFade = Math.min(1, Math.min(u, 1 - u) * 9, Math.min(v, 1 - v) * 9);
        data[pixel] = Math.round(rgb[0]);
        data[pixel + 1] = Math.round(rgb[1]);
        data[pixel + 2] = Math.round(rgb[2]);
        data[pixel + 3] = Math.round(225 * edgeFade);
      }
    }

    this._drawContours(data, normValues, width, height);
    this.material.map?.dispose();
    this.texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    this.texture.flipY = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
    this.material.map = this.texture;
    this.material.needsUpdate = true;
  }

  _drawContours(data, values, width, height) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const value = values[y * width + x];
        if (!Number.isFinite(value)) continue;
        const band = Math.floor(value * BANDS);
        const left = x > 0 ? values[y * width + x - 1] : Number.NaN;
        const below = y > 0 ? values[(y - 1) * width + x] : Number.NaN;
        const leftBand = Number.isFinite(left) ? Math.floor(left * BANDS) : band;
        const belowBand = Number.isFinite(below) ? Math.floor(below * BANDS) : band;
        if (leftBand !== band || belowBand !== band) {
          const pixel = (y * width + x) * 4;
          data[pixel] = Math.round(data[pixel] * 0.45);
          data[pixel + 1] = Math.round(data[pixel + 1] * 0.54);
          data[pixel + 2] = Math.round(data[pixel + 2] * 0.62);
        }
      }
    }
  }

  _worldPoint(u, v) {
    if (this.axis === 'X') return new THREE.Vector3(this.coordinate, v, u);
    if (this.axis === 'Y') return new THREE.Vector3(u, this.coordinate, v);
    return new THREE.Vector3(u, v, this.coordinate);
  }

  _rebuildOutline() {
    const axisIndex = AXIS_INDEX[this.axis];
    const plane = this.coordinate;
    const segments = [];
    const triangles = this._triangles;

    for (let t = 0; t < triangles.length; t += 9) {
      const ax = triangles[t];
      const ay = triangles[t + 1];
      const az = triangles[t + 2];
      const bx = triangles[t + 3];
      const by = triangles[t + 4];
      const bz = triangles[t + 5];
      const cx = triangles[t + 6];
      const cy = triangles[t + 7];
      const cz = triangles[t + 8];
      const a = axisIndex === 0 ? ax : axisIndex === 1 ? ay : az;
      const b = axisIndex === 0 ? bx : axisIndex === 1 ? by : bz;
      const c = axisIndex === 0 ? cx : axisIndex === 1 ? cy : cz;
      const da = a - plane;
      const db = b - plane;
      const dc = c - plane;
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;

      const intersections = [];
      addEdgeIntersection(intersections, da, db,
        new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz));
      addEdgeIntersection(intersections, db, dc,
        new THREE.Vector3(bx, by, bz), new THREE.Vector3(cx, cy, cz));
      addEdgeIntersection(intersections, dc, da,
        new THREE.Vector3(cx, cy, cz), new THREE.Vector3(ax, ay, az));

      if (intersections.length >= 2) {
        const first = intersections[0];
        const second = intersections[1];
        if (first.distanceToSquared(second) > 1e-10) {
          segments.push(first.x, first.y, first.z, second.x, second.y, second.z);
        }
      }
    }

    this.outlineGeometry.dispose();
    this.outlineGeometry = new THREE.BufferGeometry();
    this.outlineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    this.outline.geometry = this.outlineGeometry;
  }

  setSurfaces(surfaces) {
    const triangles = [];
    for (const part of surfaces) {
      for (let i = 0; i < part.positions.length; i++) triangles.push(part.positions[i]);
    }
    this._triangles = triangles;
    this._rebuildOutline();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture?.dispose();
    this.borderGeometry.dispose();
    this.border.material.dispose();
    this.outlineGeometry.dispose();
    this.outline.material.dispose();
  }
}

function addEdgeIntersection(points, da, db, a, b) {
  if ((da < 0 && db < 0) || (da > 0 && db > 0) || da === db) return;
  const t = da / (da - db);
  if (t < -1e-9 || t > 1 + 1e-9) return;
  const point = a.clone().lerp(b, t);
  if (!points.some(existing => existing.distanceToSquared(point) < 1e-10)) {
    points.push(point);
  }
}
