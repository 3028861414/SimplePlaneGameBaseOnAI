import * as THREE from 'three';
import { Viewport } from '../core/viewport.js';
import { decodeFloat32Base64 } from '../util/binary.js';
import { makeUnitGeometry } from '../util/part-geometry.js';
import { srgbToLinear } from '../util/color-map.js';

export class FlightWorldScene {
  constructor(container, model) {
    this.container = container;
    this.model = model;
    this.viewport = new Viewport(container, { studioLighting: false });
    this.viewport.controls.enabled = false;
    this.viewport.renderer.toneMappingExposure = 1.02;
    this.scene = this.viewport.scene;
    this.camera = this.viewport.camera;
    this.camera.near = 0.08;
    this.camera.far = 22000;
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
    this.scene.fog = new THREE.Fog(0xb7d2dc, 700, 5200);

    this.world = null;
    this.heightSampler = null;
    this.hasState = false;
    this.cameraMode = 'third';
    this.orbitYaw = 0;
    this.orbitPitch = 0.26;
    this.orbitDistance = 19;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragging = null;
    this.currentPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.currentQuaternion = new THREE.Quaternion();
    this.targetQuaternion = new THREE.Quaternion();
    this.cameraLookTarget = new THREE.Vector3();
    this._events = new AbortController();

    this._buildLightingAndSky();
    this._buildAircraft();
    this._bindPointer();
    this.viewport.onFrame(dt => this._update(dt));
  }

  _buildLightingAndSky() {
    this.scene.add(new THREE.HemisphereLight(0xd4edff, 0x465137, 1.65));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    this.sun = new THREE.DirectionalLight(0xfff3d4, 3.1);
    this.sun.position.set(-1200, 2100, 800);
    this.scene.add(this.sun);

    const skyGeometry = new THREE.SphereGeometry(9500, 32, 18);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4f86ad) },
        horizonColor: { value: new THREE.Color(0xdcebee) },
        glowColor: { value: new THREE.Color(0xf8e5bd) }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 glowColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 color = mix(horizonColor, topColor, smoothstep(-0.02, 0.68, h));
          float sunGlow = pow(max(dot(normalize(vWorldPosition), normalize(vec3(-0.46, 0.62, 0.31))), 0.0), 28.0);
          color = mix(color, glowColor, sunGlow * 0.55);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(this.sky);

    const sunGlow = createRadialTexture(['rgba(255,248,217,1)', 'rgba(255,223,151,0.42)', 'rgba(255,210,120,0)']);
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunGlow, transparent: true, depthWrite: false, opacity: 0.88, fog: false, toneMapped: false
    }));
    sunSprite.position.set(-4200, 5000, 2900);
    sunSprite.scale.set(1000, 1000, 1);
    this.scene.add(sunSprite);

    const cloudTexture = createRadialTexture(['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0)']);
    const random = mulberry32(7719);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTexture, transparent: true, depthWrite: false, opacity: 0.32 + random() * 0.22, fog: true
      }));
      const size = 260 + random() * 460;
      cloud.scale.set(size, size * (0.26 + random() * 0.16), 1);
      cloud.position.set(-2600 + random() * 5200, 500 + random() * 800, -2600 + random() * 5200);
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
  }

  _buildAircraft() {
    this.aircraft = new THREE.Group();
    this.aircraft.name = 'flight-aircraft';
    for (const part of this.model.parts) {
      const geometry = makeUnitGeometry(part.shape);
      const canopy = (part.name ?? '').includes('舱') || String(part.color).toLowerCase() === '#123d49';
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(part.color),
        roughness: canopy ? 0.15 : 0.48,
        metalness: canopy ? 0.25 : 0.32,
        transparent: canopy,
        opacity: canopy ? 0.85 : 1,
        side: THREE.FrontSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(part.position.x, part.position.y, part.position.z);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(part.rotation.x),
        THREE.MathUtils.degToRad(part.rotation.y),
        THREE.MathUtils.degToRad(part.rotation.z)
      );
      mesh.scale.set(part.size.x, part.size.y, part.size.z);
      this.aircraft.add(mesh);
    }
    this.aircraft.visible = false;
    this.scene.add(this.aircraft);
  }

  setWorld(worldDto) {
    this.world = {
      ...worldDto,
      heights: decodeFloat32Base64(worldDto.heights)
    };
    this.heightSampler = buildHeightSampler(this.world);
    this._buildTerrain();
    this._buildRunway();
    this._buildTrees();
    this.ready = true;
  }

  setInitialState(state) {
    this.state = state;
    const position = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
    const quaternion = new THREE.Quaternion(
      state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w
    ).normalize();
    this.currentPosition.copy(position);
    this.targetPosition.copy(position);
    this.currentQuaternion.copy(quaternion);
    this.targetQuaternion.copy(quaternion);
    this.aircraft.position.copy(position);
    this.aircraft.quaternion.copy(quaternion);
    this.aircraft.visible = this.cameraMode === 'third';
    this.hasState = true;
    this.cameraLookTarget.copy(position).add(new THREE.Vector3(4, 1.5, 0));
    this._updateCamera(1, true);
  }

  pushState(state) {
    this.state = state;
    this.targetPosition.set(state.position.x, state.position.y, state.position.z);
    this.targetQuaternion.set(
      state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w
    ).normalize();
    if (!this.hasState) this.setInitialState(state);
  }

  _buildTerrain() {
    const world = this.world;
    const resolution = world.resolution;
    const count = resolution * resolution;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6);
    const stepX = world.sizeX / (resolution - 1);
    const stepZ = world.sizeZ / (resolution - 1);
    const range = Math.max(1, world.maxHeight - world.minHeight);

    for (let iz = 0; iz < resolution; iz++) {
      const z = world.originZ + iz * stepZ;
      for (let ix = 0; ix < resolution; ix++) {
        const index = iz * resolution + ix;
        const x = world.originX + ix * stepX;
        const height = world.heights[index];
        positions[index * 3] = x;
        positions[index * 3 + 1] = height;
        positions[index * 3 + 2] = z;

        const left = world.heights[iz * resolution + Math.max(0, ix - 1)];
        const right = world.heights[iz * resolution + Math.min(resolution - 1, ix + 1)];
        const up = world.heights[Math.max(0, iz - 1) * resolution + ix];
        const down = world.heights[Math.min(resolution - 1, iz + 1) * resolution + ix];
        const slope = Math.hypot((right - left) / (2 * stepX), (down - up) / (2 * stepZ));
        const rgb = terrainColor(height, world.minHeight, range, slope, hash2(ix, iz));
        colors[index * 3] = srgbToLinear(rgb[0]);
        colors[index * 3 + 1] = srgbToLinear(rgb[1]);
        colors[index * 3 + 2] = srgbToLinear(rgb[2]);
      }
    }

    let cursor = 0;
    for (let iz = 0; iz < resolution - 1; iz++) {
      for (let ix = 0; ix < resolution - 1; ix++) {
        const a = iz * resolution + ix;
        const b = a + 1;
        const c = a + resolution;
        const d = c + 1;
        indices[cursor++] = a; indices[cursor++] = c; indices[cursor++] = b;
        indices[cursor++] = b; indices[cursor++] = c; indices[cursor++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      side: THREE.FrontSide
    });
    this.terrain = new THREE.Mesh(geometry, material);
    this.terrain.name = 'perlin-terrain';
    this.terrain.receiveShadow = false;
    this.scene.add(this.terrain);
  }

  _buildRunway() {
    const runway = this.world.runway;
    const texture = createRunwayTexture(this.viewport.renderer);
    const geometry = new THREE.PlaneGeometry(runway.length, runway.width);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.88,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const surface = new THREE.Mesh(geometry, material);
    surface.rotation.x = -Math.PI / 2;
    surface.rotation.z = -runway.headingRadians;
    surface.position.set(runway.centerX, runway.elevation + 0.08, runway.centerZ);
    this.runway = surface;
    this.scene.add(surface);

    const lightGeometry = new THREE.BoxGeometry(0.34, 0.12, 0.34);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2c5, toneMapped: false });
    const count = 32;
    const lights = new THREE.InstancedMesh(lightGeometry, lightMaterial, count * 2);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const along = -runway.length * 0.5 + (i / (count - 1)) * runway.length;
      for (let side = 0; side < 2; side++) {
        const across = (side === 0 ? -1 : 1) * (runway.width * 0.5 + 1.2);
        matrix.makeTranslation(
          runway.centerX + Math.cos(runway.headingRadians) * along - Math.sin(runway.headingRadians) * across,
          runway.elevation + 0.24,
          runway.centerZ + Math.sin(runway.headingRadians) * along + Math.cos(runway.headingRadians) * across
        );
        lights.setMatrixAt(i * 2 + side, matrix);
      }
    }
    lights.instanceMatrix.needsUpdate = true;
    this.scene.add(lights);
  }

  _buildTrees() {
    const random = mulberry32(40503);
    const placements = [];
    const runway = this.world.runway;
    const halfLength = runway.length * 0.5 + 120;
    const halfWidth = 190;
    for (let attempt = 0; attempt < 3000 && placements.length < 620; attempt++) {
      const x = this.world.originX + 100 + random() * (this.world.sizeX - 200);
      const z = this.world.originZ + 100 + random() * (this.world.sizeZ - 200);
      if (Math.abs(x - runway.centerX) < halfLength && Math.abs(z - runway.centerZ) < halfWidth) continue;
      const height = this.heightSampler(x, z);
      if (height < 20 || height > 210) continue;
      const slope = Math.abs(this.heightSampler(x + 12, z) - this.heightSampler(x - 12, z))
        + Math.abs(this.heightSampler(x, z + 12) - this.heightSampler(x, z - 12));
      if (slope > 7) continue;
      placements.push({ x, z, height, scale: 0.62 + random() * 0.95, shade: random() });
    }

    const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.5, 1, 5);
    const crownGeometry = new THREE.ConeGeometry(1, 1, 7);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b4933, roughness: 1 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x355a34, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, placements.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, placements.length);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < placements.length; i++) {
      const placement = placements[i];
      const treeHeight = 7 + placement.scale * 8;
      dummy.position.set(placement.x, placement.height + treeHeight * 0.23, placement.z);
      dummy.scale.set(placement.scale, treeHeight * 0.46, placement.scale);
      dummy.rotation.set(0, placement.shade * Math.PI * 2, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = placement.height + treeHeight * 0.68;
      dummy.scale.set(placement.scale * 2.1, treeHeight * 0.72, placement.scale * 2.1);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      color.setRGB(...treeShade(placement.shade));
      crowns.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    this.scene.add(trunks, crowns);
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    this.aircraft.visible = this.cameraMode === 'third';
    if (this.cameraMode === 'first') {
      this.camera.fov = 66;
      this.lookYaw = 0;
      this.lookPitch = 0;
    } else {
      this.camera.fov = 55;
    }
    this.camera.updateProjectionMatrix();
    this._updateCamera(0.016, true);
    return this.cameraMode;
  }

  _bindPointer() {
    const canvas = this.viewport.renderer.domElement;
    const signal = this._events.signal;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.dragging = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-looking');
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!this.dragging) return;
      const dx = event.clientX - this.dragging.x;
      const dy = event.clientY - this.dragging.y;
      this.dragging = { x: event.clientX, y: event.clientY };
      if (this.cameraMode === 'first') {
        this.lookYaw -= dx * 0.0032;
        this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - dy * 0.0028, -1.2, 1.2);
      } else {
        this.orbitYaw += dx * 0.005;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0036, 0.04, 1.28);
      }
    }, { signal });
    const stopDragging = event => {
      if (!this.dragging) return;
      this.dragging = null;
      canvas.classList.remove('is-looking');
      try { canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    };
    canvas.addEventListener('pointerup', stopDragging, { signal });
    canvas.addEventListener('pointercancel', stopDragging, { signal });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      if (this.cameraMode === 'first') {
        this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + event.deltaY * 0.026, 34, 88);
        this.camera.updateProjectionMatrix();
      } else {
        this.orbitDistance = THREE.MathUtils.clamp(this.orbitDistance * Math.exp(event.deltaY * 0.0009), 6, 110);
      }
    }, { passive: false, signal });
  }

  _update(dt) {
    if (this.hasState) {
      const smoothing = 1 - Math.exp(-Math.max(dt, 0.001) * 18);
      this.currentPosition.lerp(this.targetPosition, smoothing);
      this.currentQuaternion.slerp(this.targetQuaternion, smoothing);
      this.aircraft.position.copy(this.currentPosition);
      this.aircraft.quaternion.copy(this.currentQuaternion);
      this._updateCamera(dt, false);
    }
  }

  _updateCamera(dt, immediate) {
    if (!this.hasState) return;
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.currentQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.currentQuaternion);
    if (this.cameraMode === 'first') {
      const cockpit = this.model.cockpit;
      const eye = new THREE.Vector3(cockpit.position.x, cockpit.position.y, cockpit.position.z)
        .applyQuaternion(this.currentQuaternion);
      const cameraPosition = this.currentPosition.clone().add(eye);
      const baseYaw = THREE.MathUtils.degToRad(cockpit.yawDegrees);
      const basePitch = THREE.MathUtils.degToRad(cockpit.pitchDegrees);
      const baseDirection = new THREE.Vector3(
        Math.cos(basePitch) * Math.cos(baseYaw),
        Math.sin(basePitch),
        -Math.cos(basePitch) * Math.sin(baseYaw)
      ).applyQuaternion(this.currentQuaternion);
      const right = new THREE.Vector3(0, 0, 1).applyQuaternion(this.currentQuaternion);
      const yawed = baseDirection.applyAxisAngle(up, this.lookYaw);
      const direction = yawed.applyAxisAngle(right, this.lookPitch).normalize();
      this.camera.position.copy(cameraPosition);
      this.camera.up.copy(up);
      this.camera.lookAt(cameraPosition.clone().add(direction));
      return;
    }

    const heading = Math.atan2(forward.z, forward.x);
    const horizontal = Math.cos(this.orbitPitch) * this.orbitDistance;
    const orbitAngle = heading + Math.PI + this.orbitYaw;
    const desiredPosition = new THREE.Vector3(
      this.currentPosition.x + Math.cos(orbitAngle) * horizontal,
      this.currentPosition.y + Math.sin(this.orbitPitch) * this.orbitDistance + 1.0,
      this.currentPosition.z + Math.sin(orbitAngle) * horizontal
    );
    if (this.heightSampler) {
      desiredPosition.y = Math.max(desiredPosition.y, this.heightSampler(desiredPosition.x, desiredPosition.z) + 2.5);
    }
    const lookAhead = forward.clone().multiplyScalar(4).add(new THREE.Vector3(0, 1.2, 0)).add(this.currentPosition);
    if (immediate) {
      this.camera.position.copy(desiredPosition);
      this.cameraLookTarget.copy(lookAhead);
    } else {
      const cameraSmoothing = 1 - Math.exp(-Math.max(dt, 0.001) * 7.5);
      this.camera.position.lerp(desiredPosition, cameraSmoothing);
      this.cameraLookTarget.lerp(lookAhead, cameraSmoothing);
    }
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.cameraLookTarget);
  }

  dispose() {
    this._events.abort();
    this.viewport.dispose();
  }
}

function buildHeightSampler(world) {
  const resolution = world.resolution;
  const stepX = world.sizeX / (resolution - 1);
  const stepZ = world.sizeZ / (resolution - 1);
  return (x, z) => {
    const localX = Math.max(world.originX, Math.min(world.originX + world.sizeX, x));
    const localZ = Math.max(world.originZ, Math.min(world.originZ + world.sizeZ, z));
    const gx = (localX - world.originX) / stepX;
    const gz = (localZ - world.originZ) / stepZ;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const z1 = Math.min(z0 + 1, resolution - 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const a = world.heights[z0 * resolution + x0];
    const b = world.heights[z0 * resolution + x1];
    const c = world.heights[z1 * resolution + x0];
    const d = world.heights[z1 * resolution + x1];
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fz;
  };
}

function terrainColor(height, minHeight, range, slope, variation) {
  const t = THREE.MathUtils.clamp((height - minHeight) / range, 0, 1);
  let color;
  if (t < 0.12) color = [47, 66, 43];
  else if (t < 0.3) color = [58, 82, 47];
  else if (t < 0.5) color = [83, 98, 57];
  else if (t < 0.68) color = [113, 109, 75];
  else if (t < 0.84) color = [112, 110, 102];
  else color = [179, 188, 187];
  if (slope > 0.28) {
    const rock = [97, 94, 86];
    const mix = THREE.MathUtils.clamp((slope - 0.28) / 0.65, 0, 0.72);
    color = [
      color[0] + (rock[0] - color[0]) * mix,
      color[1] + (rock[1] - color[1]) * mix,
      color[2] + (rock[2] - color[2]) * mix
    ];
  }
  if (t > 0.83 && slope < 0.3) {
    const snow = [208, 216, 218];
    const mix = THREE.MathUtils.clamp((t - 0.83) / 0.13, 0, 0.8);
    color = [
      color[0] + (snow[0] - color[0]) * mix,
      color[1] + (snow[1] - color[1]) * mix,
      color[2] + (snow[2] - color[2]) * mix
    ];
  }
  const shift = (variation - 0.5) * 18;
  return color.map(channel => Math.max(0, Math.min(255, channel + shift)));
}

function treeShade(value) {
  const shade = 0.17 + value * 0.09;
  return [srgbToLinear(45 + value * 20), srgbToLinear(72 + shade * 110), srgbToLinear(42 + value * 18)];
}

function hash2(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
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

function createRadialTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  stops.forEach((color, index) => gradient.addColorStop(index / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRunwayTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 4096;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#252c2c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const random = mulberry32(991);
  for (let i = 0; i < 1500; i++) {
    const alpha = 0.018 + random() * 0.035;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    const size = 1 + random() * 4;
    ctx.fillRect(random() * canvas.width, random() * canvas.height, size, size);
  }

  ctx.fillStyle = 'rgba(235, 236, 222, 0.82)';
  ctx.fillRect(0, 8, canvas.width, 3);
  ctx.fillRect(0, canvas.height - 11, canvas.width, 3);

  ctx.fillStyle = 'rgba(238, 238, 221, 0.8)';
  for (let x = 140; x < canvas.width - 150; x += 92) {
    ctx.fillRect(x, canvas.height / 2 - 2, 48, 4);
  }

  ctx.fillStyle = 'rgba(238, 238, 221, 0.86)';
  for (let i = 0; i < 8; i++) {
    const inset = 20 + i * 15;
    ctx.fillRect(68, inset, 8, canvas.height - inset * 2);
    ctx.fillRect(canvas.width - 76, inset, 8, canvas.height - inset * 2);
  }

  ctx.save();
  ctx.translate(210, 64);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = 'rgba(245, 244, 223, 0.9)';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('09', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(canvas.width - 210, 64);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(245, 244, 223, 0.9)';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('27', 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
