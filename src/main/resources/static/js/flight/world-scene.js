import * as THREE from 'three';
import { Viewport } from '../core/viewport.js';
import { decodeFloat32Base64 } from '../util/binary.js';
import { makeUnitGeometry } from '../util/part-geometry.js';
import { srgbToLinear } from '../util/color-map.js';
import { terrainColor } from './terrain-style.js';

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
    this.scene.fog = new THREE.Fog(0xb7d2dc, 280, 1700);

    this.world = null;
    this.chunks = new Map();
    this.chunkGroups = new Map();
    this.chunkQueue = [];
    this.queuedChunkKeys = new Set();
    this.chunkSize = 512;
    this.chunkResolution = 65;
    this.chunkRadius = 3;
    this.minChunkRadius = 2;
    this.maxChunkRadius = 6;
    this.hasState = false;
    this.cameraMode = 'third';
    this.orbitYaw = 0;
    this.orbitPitch = 0.26;
    this.orbitDistance = 19;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragging = null;
    this.currentPosition = new THREE.Vector3();
    this.currentQuaternion = new THREE.Quaternion();
    this.cameraLookTarget = new THREE.Vector3();
    this.stateBuffer = [];
    this.interpolationDelaySeconds = 0.07;
    this.renderClockSeconds = null;
    this.sunBase = new THREE.Vector3(-1200, 2100, 800);
    this.sunSpriteBase = new THREE.Vector3(-4200, 5000, 2900);
    this._events = new AbortController();
    this._disposed = false;
    this._chunkDrainScheduled = false;

    this.chunkMaterials = {
      terrain: new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
        side: THREE.FrontSide
      }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x5b4933, roughness: 1 }),
      crown: new THREE.MeshStandardMaterial({ color: 0x355a34, roughness: 0.95 })
    };

    this._buildLightingAndSky();
    this._buildAircraft();
    this._bindPointer();
    this.viewport.onFrame(dt => this._update(dt));
  }

  _buildLightingAndSky() {
    this.scene.add(new THREE.HemisphereLight(0xd4edff, 0x465137, 1.65));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    this.sun = new THREE.DirectionalLight(0xfff3d4, 3.1);
    this.sun.position.copy(this.sunBase);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);

    const skyGeometry = new THREE.SphereGeometry(9500, 32, 18);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4f86ad) },
        horizonColor: { value: new THREE.Color(0xdcebee) },
        glowColor: { value: new THREE.Color(0xf8e5bd) }
      },
      vertexShader: `
        varying vec3 vSkyDirection;
        void main() {
          vSkyDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 glowColor;
        varying vec3 vSkyDirection;
        void main() {
          float h = normalize(vSkyDirection).y;
          vec3 color = mix(horizonColor, topColor, smoothstep(-0.02, 0.68, h));
          float sunGlow = pow(max(dot(normalize(vSkyDirection), normalize(vec3(-0.46, 0.62, 0.31))), 0.0), 28.0);
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
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunGlow, transparent: true, depthWrite: false, opacity: 0.88, fog: false, toneMapped: false
    }));
    this.sunSprite.position.copy(this.sunSpriteBase);
    this.sunSprite.scale.set(1000, 1000, 1);
    this.scene.add(this.sunSprite);

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
    this.aircraftModel = new THREE.Group();
    this.aircraftModel.name = 'flight-aircraft-model';
    this.centerOfMass = new THREE.Vector3();
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
      this.aircraftModel.add(mesh);
    }
    this.aircraft.add(this.aircraftModel);
    this.aircraft.visible = false;
    this.scene.add(this.aircraft);
  }

  setWorld(worldDto) {
    this.world = worldDto;
    this.chunkSize = worldDto.chunkSize || 512;
    this.chunkResolution = worldDto.chunkResolution || 65;
    this.minChunkRadius = worldDto.minChunkRadius ?? 2;
    this.maxChunkRadius = worldDto.maxChunkRadius ?? 6;
    this.chunkRadius = THREE.MathUtils.clamp(
      worldDto.chunkRadius ?? 3, this.minChunkRadius, this.maxChunkRadius
    );
    this._updateFog();
    this._buildRunway();
    this.applyChunkUpdate(worldDto.chunks ?? [], [], { immediate: true });
    this.ready = true;
  }

  replaceChunks(chunks) {
    const removed = [...this.chunks.keys()];
    this.chunkQueue.length = 0;
    this.queuedChunkKeys.clear();
    this.applyChunkUpdate(chunks ?? [], removed, { immediate: true });
  }

  setChunkRadius(radius) {
    this.chunkRadius = THREE.MathUtils.clamp(radius, this.minChunkRadius, this.maxChunkRadius);
    this._updateFog();
  }

  applyChunkUpdate(added, removed, { immediate = false } = {}) {
    for (const key of removed ?? []) this._unloadChunk(key);
    for (const dto of added ?? []) {
      const key = `${dto.chunkX},${dto.chunkZ}`;
      if (this.chunks.has(key)) continue;
      if (immediate) this._buildChunk(dto);
      else this._enqueueChunk(dto);
    }
  }

  getMapData() {
    let biome = 'PLAINS';
    if (this.state?.position) {
      const chunkX = Math.floor(this.state.position.x / this.chunkSize);
      const chunkZ = Math.floor(this.state.position.z / this.chunkSize);
      biome = this.chunks.get(`${chunkX},${chunkZ}`)?.biome ?? biome;
    }
    return {
      chunks: this.chunks,
      chunkSize: this.chunkSize,
      radius: this.chunkRadius,
      biome,
      loaded: this.chunkGroups.size
    };
  }

  _updateFog() {
    const viewDistance = Math.max(800, this.chunkSize * (this.chunkRadius + 0.5));
    this.scene.fog.near = viewDistance * 0.4;
    this.scene.fog.far = viewDistance * 0.98;
  }

  _enqueueChunk(dto) {
    const key = `${dto.chunkX},${dto.chunkZ}`;
    if (this.queuedChunkKeys.has(key)) return;
    this.queuedChunkKeys.add(key);
    this.chunkQueue.push(dto);
    this._scheduleChunkDrain();
  }

  _scheduleChunkDrain() {
    if (this._chunkDrainScheduled || this.chunkQueue.length === 0) return;
    this._chunkDrainScheduled = true;
    const drain = () => {
      this._chunkDrainScheduled = false;
      if (this._disposed || this.chunkQueue.length === 0) return;
      this._processChunkQueue(1);
      if (this.chunkQueue.length > 0) this._scheduleChunkDrain();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(drain, { timeout: 120 });
    } else {
      window.setTimeout(drain, 0);
    }
  }

  _processChunkQueue(limit = 2) {
    let built = 0;
    while (built < limit && this.chunkQueue.length > 0) {
      const dto = this.chunkQueue.shift();
      const key = `${dto.chunkX},${dto.chunkZ}`;
      this.queuedChunkKeys.delete(key);
      if (this.chunks.has(key)) continue;
      this._buildChunk(dto);
      built++;
    }
  }

  _buildChunk(dto) {
    const heights = decodeFloat32Base64(dto.heights);
    if (heights.length !== dto.resolution * dto.resolution) return;
    const chunk = {
      ...dto,
      heights,
      key: `${dto.chunkX},${dto.chunkZ}`
    };
    const group = new THREE.Group();
    group.name = `terrain-chunk-${dto.chunkX}-${dto.chunkZ}`;
    const mesh = new THREE.Mesh(this._buildChunkGeometry(chunk), this.chunkMaterials.terrain);
    mesh.name = group.name;
    group.add(mesh);
    this._addChunkTrees(chunk, group);
    this.scene.add(group);
    this.chunks.set(chunk.key, chunk);
    this.chunkGroups.set(chunk.key, group);
  }

  _buildChunkGeometry(chunk) {
    const resolution = chunk.resolution;
    const count = resolution * resolution;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6);
    const stepX = chunk.sizeX / (resolution - 1);
    const stepZ = chunk.sizeZ / (resolution - 1);

    for (let iz = 0; iz < resolution; iz++) {
      const z = chunk.originZ + iz * stepZ;
      for (let ix = 0; ix < resolution; ix++) {
        const index = iz * resolution + ix;
        const x = chunk.originX + ix * stepX;
        const height = chunk.heights[index];
        positions[index * 3] = x;
        positions[index * 3 + 1] = height;
        positions[index * 3 + 2] = z;

        const left = chunk.heights[iz * resolution + Math.max(0, ix - 1)];
        const right = chunk.heights[iz * resolution + Math.min(resolution - 1, ix + 1)];
        const up = chunk.heights[Math.max(0, iz - 1) * resolution + ix];
        const down = chunk.heights[Math.min(resolution - 1, iz + 1) * resolution + ix];
        const slope = Math.hypot((right - left) / (2 * stepX), (down - up) / (2 * stepZ));
        const variation = hash2(chunk.chunkX * 131 + ix, chunk.chunkZ * 131 + iz);
        const rgb = terrainColor(height, slope, variation);
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
    return geometry;
  }

  _addChunkTrees(chunk, group) {
    const random = mulberry32(
      ((chunk.chunkX * 73856093) ^ (chunk.chunkZ * 19349663) ^ 0x9e3779b9) >>> 0
    );
    const placements = [];
    const runway = this.world.runway;
    const target = 9 + Math.floor(random() * 12);
    for (let attempt = 0; attempt < target * 5 && placements.length < target; attempt++) {
      const x = chunk.originX + 6 + random() * (chunk.sizeX - 12);
      const z = chunk.originZ + 6 + random() * (chunk.sizeZ - 12);
      const height = this._sampleChunk(chunk, x, z);
      if (height === null || height < 12 || height > 280) continue;
      if (Math.abs(x - runway.centerX) < runway.length * 0.5 + 24
          && Math.abs(z - runway.centerZ) < runway.width * 0.5 + 32) continue;
      const hx = this._sampleChunk(chunk, x + 6, z) ?? height;
      const hz = this._sampleChunk(chunk, x, z + 6) ?? height;
      if (Math.abs(hx - height) + Math.abs(hz - height) > 1.8) continue;
      placements.push({
        x,
        z,
        height,
        scale: 0.62 + random() * 0.9,
        shade: random()
      });
    }
    if (placements.length === 0) return;

    const trunkGeometry = new THREE.CylinderGeometry(0.32, 0.5, 1, 5);
    const crownGeometry = new THREE.ConeGeometry(1, 1, 7);
    const trunks = new THREE.InstancedMesh(trunkGeometry, this.chunkMaterials.trunk, placements.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, this.chunkMaterials.crown, placements.length);
    trunks.frustumCulled = false;
    crowns.frustumCulled = false;
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
    group.add(trunks, crowns);
  }

  _unloadChunk(key) {
    const group = this.chunkGroups.get(key);
    if (group) {
      this.scene.remove(group);
      group.traverse(object => {
        if (object.isMesh) object.geometry?.dispose();
      });
    }
    this.chunkGroups.delete(key);
    this.chunks.delete(key);
    this.queuedChunkKeys.delete(key);
    const index = this.chunkQueue.findIndex(dto => `${dto.chunkX},${dto.chunkZ}` === key);
    if (index >= 0) this.chunkQueue.splice(index, 1);
  }

  _heightAt(x, z) {
    if (!this.chunkSize) return null;
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkZ = Math.floor(z / this.chunkSize);
    const chunk = this.chunks.get(`${chunkX},${chunkZ}`);
    return chunk ? this._sampleChunk(chunk, x, z) : null;
  }

  _sampleChunk(chunk, x, z) {
    const resolution = chunk.resolution;
    const stepX = chunk.sizeX / (resolution - 1);
    const stepZ = chunk.sizeZ / (resolution - 1);
    const gx = Math.max(0, Math.min(resolution - 1, (x - chunk.originX) / stepX));
    const gz = Math.max(0, Math.min(resolution - 1, (z - chunk.originZ) / stepZ));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const z1 = Math.min(z0 + 1, resolution - 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const a = chunk.heights[z0 * resolution + x0];
    const b = chunk.heights[z0 * resolution + x1];
    const c = chunk.heights[z1 * resolution + x0];
    const d = chunk.heights[z1 * resolution + x1];
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fz;
  }

  _applyCenterOfMass(state) {
    const com = state.centerOfMass ?? { x: 0, y: 0, z: 0 };
    this.centerOfMass.set(com.x ?? 0, com.y ?? 0, com.z ?? 0);
    this.aircraftModel.position.copy(this.centerOfMass).multiplyScalar(-1);
  }

  _sampleState(state) {
    return {
      position: new THREE.Vector3(state.position.x, state.position.y, state.position.z),
      quaternion: new THREE.Quaternion(
        state.orientation.x, state.orientation.y, state.orientation.z, state.orientation.w
      ).normalize(),
      velocity: new THREE.Vector3(
        state.velocity?.x ?? 0,
        state.velocity?.y ?? 0,
        state.velocity?.z ?? 0
      ),
      serverTime: state.timeSeconds ?? 0,
      receivedAt: performance.now()
    };
  }

  setInitialState(state) {
    this.state = state;
    this._applyCenterOfMass(state);
    const sample = this._sampleState(state);
    this.stateBuffer = [sample];
    this.currentPosition.copy(sample.position);
    this.currentQuaternion.copy(sample.quaternion);
    this.renderClockSeconds = sample.serverTime - this.interpolationDelaySeconds;
    this.aircraft.position.copy(sample.position);
    this.aircraft.quaternion.copy(sample.quaternion);
    this.aircraft.visible = this.cameraMode === 'third';
    this.hasState = true;
    this.cameraLookTarget.copy(sample.position).add(new THREE.Vector3(4, 1.5, 0));
    this._followWorld();
    this._updateCamera(1, true);
  }

  pushState(state) {
    this.state = state;
    if (!this.hasState) {
      this.setInitialState(state);
      return;
    }
    this._applyCenterOfMass(state);
    const sample = this._sampleState(state);
    const last = this.stateBuffer.at(-1);
    const jumped = !last
      || sample.serverTime < last.serverTime - 0.01
      || sample.position.distanceToSquared(last.position) > 400_000;
    if (jumped) {
      this.stateBuffer = [sample];
      this.currentPosition.copy(sample.position);
      this.currentQuaternion.copy(sample.quaternion);
      this.renderClockSeconds = sample.serverTime - this.interpolationDelaySeconds;
    } else {
      this.stateBuffer.push(sample);
      if (this.stateBuffer.length > 16) this.stateBuffer.shift();
    }
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
    if (!this.hasState || this.stateBuffer.length === 0) return;
    const now = performance.now();
    const latest = this.stateBuffer.at(-1);
    const targetTime = latest.serverTime
      + (now - latest.receivedAt) / 1000
      - this.interpolationDelaySeconds;
    if (this.renderClockSeconds == null || Math.abs(targetTime - this.renderClockSeconds) > 0.28) {
      this.renderClockSeconds = targetTime;
    } else {
      this.renderClockSeconds += Math.min(dt, 0.05);
      const drift = targetTime - this.renderClockSeconds;
      this.renderClockSeconds += drift * (1 - Math.exp(-Math.min(dt, 0.05) * 2.4));
    }
    const renderTime = this.renderClockSeconds;

    let before = this.stateBuffer[0];
    let after = before;
    for (let i = 1; i < this.stateBuffer.length; i++) {
      const sample = this.stateBuffer[i];
      if (sample.serverTime <= renderTime) {
        before = sample;
        after = sample;
      } else {
        after = sample;
        break;
      }
    }

    const span = after.serverTime - before.serverTime;
    const alpha = span > 1e-6
      ? THREE.MathUtils.clamp((renderTime - before.serverTime) / span, 0, 1)
      : 1;
    this.currentPosition.lerpVectors(before.position, after.position, alpha);
    this.currentQuaternion.slerpQuaternions(before.quaternion, after.quaternion, alpha);
    if (renderTime > latest.serverTime) {
      const ahead = Math.min(0.15, renderTime - latest.serverTime);
      this.currentPosition.addScaledVector(latest.velocity, ahead);
    }

    this.aircraft.position.copy(this.currentPosition);
    this.aircraft.quaternion.copy(this.currentQuaternion);
    this._followWorld();
    this._updateCamera(dt, false);
  }

  _followWorld() {
    const position = this.currentPosition;
    this.sky.position.set(position.x, 0, position.z);
    this.clouds.position.set(position.x, 0, position.z);
    this.sunSprite.position.set(
      position.x + this.sunSpriteBase.x,
      this.sunSpriteBase.y,
      position.z + this.sunSpriteBase.z
    );
    this.sun.position.set(
      position.x + this.sunBase.x,
      position.y + this.sunBase.y,
      position.z + this.sunBase.z
    );
    this.sunTarget.position.copy(position);
  }

  _updateCamera(dt, immediate) {
    if (!this.hasState) return;
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.currentQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.currentQuaternion);
    if (this.cameraMode === 'first') {
      const cockpit = this.model.cockpit;
      const eye = new THREE.Vector3(cockpit.position.x, cockpit.position.y, cockpit.position.z)
        .sub(this.centerOfMass)
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
    const ground = this._heightAt(desiredPosition.x, desiredPosition.z);
    if (ground !== null) {
      desiredPosition.y = Math.max(desiredPosition.y, ground + 2.5);
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
    this._disposed = true;
    this._events.abort();
    this.viewport.dispose();
  }
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
