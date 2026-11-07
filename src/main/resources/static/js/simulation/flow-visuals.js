import * as THREE from 'three';
import { pressureColor, speedColor, srgbToLinear } from '../util/color-map.js';

export const PRESSURE_RANGE = [-1.2, 1.0];

export function buildSurfaceMeshes(surfaces, speedMax, metric) {
  const root = new THREE.Group();
  root.name = 'simulation-surfaces';
  const entries = [];

  for (const part of surfaces) {
    const positions = new Float32Array(part.positions);
    const normals = new Float32Array(part.normals);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const colors = new Float32Array(positions.length);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.18,
      roughness: 0.44,
      side: THREE.FrontSide,
      envMapIntensity: 0.65
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = part.name;
    mesh.renderOrder = 2;
    root.add(mesh);

    const entry = {
      mesh,
      surface: part,
      setMetric(nextMetric) {
        applySurfaceColors(geometry, part, nextMetric, speedMax);
      }
    };
    entry.setMetric(metric);
    entries.push(entry);
  }

  return { group: root, entries };
}

function applySurfaceColors(geometry, surface, metric, speedMax) {
  const colorAttribute = geometry.getAttribute('color');
  const colors = colorAttribute.array;
  const count = surface.positions.length / 3;
  for (let i = 0; i < count; i++) {
    let rgb;
    if (metric === 'speed') {
      rgb = speedColor(surface.speed[i] / Math.max(speedMax, 1e-6));
    } else {
      const t = (surface.pressureCoefficient[i] - PRESSURE_RANGE[0]) / (PRESSURE_RANGE[1] - PRESSURE_RANGE[0]);
      rgb = pressureColor(t);
    }
    colors[i * 3] = srgbToLinear(rgb[0]);
    colors[i * 3 + 1] = srgbToLinear(rgb[1]);
    colors[i * 3 + 2] = srgbToLinear(rgb[2]);
  }
  colorAttribute.needsUpdate = true;
}

export function createStreamlines(field, speedMax) {
  const lines = [];
  const colors = [];
  const yCount = 5;
  const zCount = 9;
  const size = field.bounds.getSize(new THREE.Vector3());
  const step = Math.max(field.minCell * 0.85, size.length() / 700);
  const maxSteps = 240;

  for (let yIndex = 0; yIndex < yCount; yIndex++) {
    const fy = (yIndex + 0.7) / (yCount + 0.4);
    const j = 0.06 * (field.ny - 1) + fy * 0.88 * (field.ny - 1);
    for (let zIndex = 0; zIndex < zCount; zIndex++) {
      const fz = (zIndex + 0.5) / zCount;
      const k = 0.035 * (field.nz - 1) + fz * 0.93 * (field.nz - 1);
      const start = field.positionAt(1.2, j, k);
      if (field.sample(start)) {
        traceLine(field, start, step, maxSteps, speedMax, lines, colors);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  const object = new THREE.LineSegments(geometry, material);
  object.name = 'speed-streamlines';
  object.renderOrder = 4;
  object.frustumCulled = false;
  return object;
}

function traceLine(field, start, step, maxSteps, speedMax, lines, colors) {
  let position = start.clone();
  let previousColor = null;
  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    const sample = field.sample(position);
    if (!sample) break;
    const velocity = sample.velocity;
    if (velocity.lengthSq() < 1e-8) break;
    const direction = velocity.clone().normalize();

    const midpoint = position.clone().addScaledVector(direction, step * 0.5);
    const midSample = field.sample(midpoint);
    if (!midSample) break;
    const midDirection = midSample.velocity.lengthSq() > 1e-8
      ? midSample.velocity.clone().normalize()
      : direction;

    const next = position.clone().addScaledVector(direction.add(midDirection).normalize(), step);
    const nextSample = field.sample(next);
    if (!nextSample) break;

    const rgb = speedColor(nextSample.speed / speedMax);
    const linear = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
    lines.push(position.x, position.y, position.z, next.x, next.y, next.z);
    colors.push(...(previousColor ?? linear), ...linear);
    previousColor = linear;
    position = next;

    const coord = field.gridCoordinates(position);
    if (coord.x >= field.nx - 1.6) break;
  }
}

export class FlowParticles {
  constructor(field, speedMax, count = 620) {
    this.field = field;
    this.speedMax = speedMax;
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: Math.max(field.minCell * 0.17, 0.045),
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'flow-particles';
    this.points.renderOrder = 5;
    this.points.frustumCulled = false;
    for (let i = 0; i < count; i++) this._respawn(i, true);
  }

  _respawn(index, anywhere = false) {
    const seed = anywhere ? this.field.randomSeed() : this.field.upstreamSeed();
    this.positions[index * 3] = seed.position.x;
    this.positions[index * 3 + 1] = seed.position.y;
    this.positions[index * 3 + 2] = seed.position.z;
  }

  update(delta) {
    const field = this.field;
    const visualScale = 0.12;
    for (let i = 0; i < this.count; i++) {
      const base = i * 3;
      const position = new THREE.Vector3(
        this.positions[base],
        this.positions[base + 1],
        this.positions[base + 2]
      );
      const sample = field.sample(position);
      if (!sample) {
        this._respawn(i);
        this.speeds[i] = 0;
        continue;
      }
      this.speeds[i] = sample.speed;
      const coord = field.gridCoordinates(position);
      if (coord.x > field.nx - 2 || coord.y < 0.4 || coord.y > field.ny - 1.4
          || coord.z < 0.4 || coord.z > field.nz - 1.4) {
        this._respawn(i);
        continue;
      }
      const direction = sample.velocity;
      if (direction.lengthSq() > 1e-8) {
        direction.normalize();
        const distance = Math.max(sample.speed * delta * visualScale, field.minCell * 0.02);
        position.addScaledVector(direction, distance);
        this.positions[base] = position.x;
        this.positions[base + 1] = position.y;
        this.positions[base + 2] = position.z;
      }
      const rgb = speedColor(sample.speed / this.speedMax);
      this.colors[base] = srgbToLinear(rgb[0]);
      this.colors[base + 1] = srgbToLinear(rgb[1]);
      this.colors[base + 2] = srgbToLinear(rgb[2]);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createWindCage(field) {
  const { nx, ny, nz } = field;
  const corners = [
    field.positionAt(0, 0, 0), field.positionAt(nx - 1, 0, 0),
    field.positionAt(nx - 1, ny - 1, 0), field.positionAt(0, ny - 1, 0),
    field.positionAt(0, 0, nz - 1), field.positionAt(nx - 1, 0, nz - 1),
    field.positionAt(nx - 1, ny - 1, nz - 1), field.positionAt(0, ny - 1, nz - 1)
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];
  const points = [];
  for (const [a, b] of edges) {
    points.push(corners[a].x, corners[a].y, corners[a].z, corners[b].x, corners[b].y, corners[b].z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x3a8290,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'wind-tunnel-cage';
  lines.renderOrder = 1;
  return lines;
}
