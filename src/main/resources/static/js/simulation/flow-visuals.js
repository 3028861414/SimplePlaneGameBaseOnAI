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
  const yCount = 9;
  const zCount = 17;
  const size = field.bounds.getSize(new THREE.Vector3());
  const step = Math.max(field.minCell * 0.82, size.length() / 760);
  const maxSteps = 280;

  for (let yIndex = 0; yIndex < yCount; yIndex++) {
    const fy = (yIndex + 0.5) / yCount;
    const j = 0.12 * (field.ny - 1) + fy * 0.76 * (field.ny - 1);
    for (let zIndex = 0; zIndex < zCount; zIndex++) {
      const fz = (zIndex + 0.5) / zCount;
      const k = 0.08 * (field.nz - 1) + fz * 0.84 * (field.nz - 1);
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
    opacity: 0.68,
    depthWrite: false,
    blending: THREE.AdditiveBlending
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
  constructor(field, speedMax, count = 1800) {
    this.field = field;
    this.speedMax = speedMax;
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    this.texture = createPointTexture();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: Math.max(field.minCell * 0.34, 0.078),
      map: this.texture,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      alphaTest: 0.005,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    const visualScale = 0.24;
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
    this.texture.dispose();
  }
}

export function createFlowVolume(field, speedMax) {
  const positions = [];
  const colors = [];
  const { nx, ny, nz } = field;
  const strideX = 2;
  const strideY = 3;
  const strideZ = 3;
  const color = new THREE.Color();

  for (let k = 1; k < nz - 1; k += strideZ) {
    for (let j = 1; j < ny - 1; j += strideY) {
      const yFraction = j / (ny - 1);
      if (yFraction < 0.16 || yFraction > 0.84) continue;
      for (let i = 1; i < nx - 1; i += strideX) {
        const xFraction = i / (nx - 1);
        if (xFraction < 0.08 || xFraction > 0.9) continue;
        const index = i + nx * (j + ny * k);
        const speed = field.speed[index];
        if (!Number.isFinite(speed) || speed <= 0) continue;
        const position = field.positionAt(i, j, k);
        positions.push(position.x, position.y, position.z);
        const rgb = speedColor(THREE.MathUtils.clamp(speed / Math.max(speedMax, 1e-6), 0, 1));
        color.setRGB(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]));
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  const texture = createPointTexture(0.32);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: Math.max(field.minCell * 0.12, 0.035),
    map: texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'flow-volume';
  points.renderOrder = 3;
  points.frustumCulled = false;
  points.userData.disposeTexture = texture;
  return points;
}

function createPointTexture(centerAlpha = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, `rgba(255,255,255,${centerAlpha})`);
  gradient.addColorStop(0.22, `rgba(255,255,255,${0.72 * centerAlpha})`);
  gradient.addColorStop(0.55, `rgba(255,255,255,${0.2 * centerAlpha})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function createWindCage(field) {
  const { nx, ny, nz } = field;
  const group = new THREE.Group();
  group.name = 'wind-tunnel-cage';
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
    opacity: 0.26,
    depthWrite: false
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 1;
  group.add(lines);

  const inlet = field.positionAt(1.5, 0, 0);
  const u = field.axisY;
  const v = field.axisZ;
  const width = field.stepLengths[1] * (ny - 1);
  const depth = field.stepLengths[2] * (nz - 1);
  const inletGeometry = new THREE.BufferGeometry().setFromPoints([
    inlet,
    inlet.clone().addScaledVector(u, width),
    inlet.clone().addScaledVector(u, width).addScaledVector(v, depth),
    inlet.clone().addScaledVector(v, depth)
  ]);
  inletGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const inletMesh = new THREE.Mesh(
    inletGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x71d8d2,
      transparent: true,
      opacity: 0.035,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  inletMesh.renderOrder = 1;
  group.add(inletMesh);

  const arrowLength = Math.max(field.stepLengths[0] * 3.5, 0.8);
  for (const yf of [0.22, 0.5, 0.78]) {
    for (const zf of [0.18, 0.5, 0.82]) {
      const origin = field.positionAt(
        1.5,
        Math.round(yf * (ny - 1)),
        Math.round(zf * (nz - 1))
      );
      const arrow = new THREE.ArrowHelper(
        field.axisX,
        origin,
        arrowLength,
        0x6ce4d7,
        arrowLength * 0.24,
        arrowLength * 0.13
      );
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.34;
      arrow.line.material.depthWrite = false;
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.42;
      arrow.cone.material.depthWrite = false;
      arrow.renderOrder = 2;
      group.add(arrow);
    }
  }

  return group;
}
