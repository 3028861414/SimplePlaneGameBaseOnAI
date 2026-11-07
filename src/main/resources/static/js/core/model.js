export const SHAPE_INFO = Object.freeze({
  BOX: { label: '立方体', defaultName: '立方体', size: { x: 1.2, y: 0.8, z: 1.2 }, rotation: { x: 0, y: 0, z: 0 } },
  ELLIPSOID: { label: '椭球体', defaultName: '椭球体', size: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } },
  CYLINDER: { label: '圆柱体', defaultName: '圆柱体', size: { x: 0.6, y: 2, z: 0.6 }, rotation: { x: 0, y: 0, z: -90 } },
  CONE: { label: '圆锥体', defaultName: '圆锥体', size: { x: 0.8, y: 1.4, z: 0.8 }, rotation: { x: 0, y: 0, z: -90 } }
});

export const PART_COLORS = ['#c9d7df', '#35c6b1', '#3f8fbf', '#e6a15c', '#b8c5d0', '#e06d5c', '#8c9dd6', '#6dcab3'];

const STORAGE_KEY = 'aerolab.model.v1';

export function uid(prefix = 'part') {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function clone(value) {
  return structuredClone(value);
}

export function createPart(shape, overrides = {}) {
  const info = SHAPE_INFO[shape];
  if (!info) {
    throw new Error(`不支持的部件形状: ${shape}`);
  }
  return {
    id: overrides.id ?? uid('part'),
    name: overrides.name ?? info.defaultName,
    shape,
    position: { x: 0, y: 0, z: 0, ...overrides.position },
    rotation: { ...info.rotation, ...overrides.rotation },
    size: { ...info.size, ...overrides.size },
    color: overrides.color ?? PART_COLORS[Math.floor(Math.random() * PART_COLORS.length)]
  };
}

export function createDemoAircraft() {
  const parts = [
    {
      id: 'airframe-fuselage', name: '机身', shape: 'CYLINDER',
      position: vec3(0, 0, 0), rotation: vec3(0, 0, -90), size: vec3(1.05, 4.8, 1.05),
      color: '#c9d7df'
    },
    {
      id: 'airframe-nose', name: '机鼻', shape: 'CONE',
      position: vec3(2.95, 0, 0), rotation: vec3(0, 0, -90), size: vec3(1.05, 1.1, 1.05),
      color: '#a9bcc7'
    },
    {
      id: 'airframe-tailcone', name: '尾锥', shape: 'CONE',
      position: vec3(-2.45, 0, 0), rotation: vec3(0, 0, 90), size: vec3(0.8, 0.8, 0.8),
      color: '#a9bcc7'
    },
    {
      id: 'wing-left', name: '左主翼', shape: 'BOX',
      position: vec3(0.15, 0.06, -2.4), rotation: vec3(2.5, 0, 0), size: vec3(1.75, 0.12, 4.8),
      color: '#35c6b1'
    },
    {
      id: 'wing-right', name: '右主翼', shape: 'BOX',
      position: vec3(0.15, 0.06, 2.4), rotation: vec3(-2.5, 0, 0), size: vec3(1.75, 0.12, 4.8),
      color: '#35c6b1'
    },
    {
      id: 'engine-left', name: '左引擎', shape: 'CYLINDER',
      position: vec3(0.35, -0.44, -1.85), rotation: vec3(0, 0, -90), size: vec3(0.5, 1.75, 0.5),
      color: '#405462'
    },
    {
      id: 'engine-right', name: '右引擎', shape: 'CYLINDER',
      position: vec3(0.35, -0.44, 1.85), rotation: vec3(0, 0, -90), size: vec3(0.5, 1.75, 0.5),
      color: '#405462'
    },
    {
      id: 'tail-plane', name: '水平尾翼', shape: 'BOX',
      position: vec3(-2.28, 0.12, 0), rotation: vec3(0, 0, 0), size: vec3(0.92, 0.08, 3.0),
      color: '#2eab99'
    },
    {
      id: 'tail-fin', name: '垂直尾翼', shape: 'BOX',
      position: vec3(-2.18, 0.6, 0), rotation: vec3(0, 0, 0), size: vec3(0.96, 1.12, 0.08),
      color: '#4ac8b3'
    },
    {
      id: 'canopy', name: '座舱盖', shape: 'ELLIPSOID',
      position: vec3(1.22, 0.53, 0), rotation: vec3(0, 0, 0), size: vec3(0.98, 0.38, 0.58),
      color: '#123d49'
    }
  ];

  return {
    version: 1,
    name: 'AEROLAB X-01',
    parts,
    cockpit: {
      position: vec3(1.22, 0.72, 0),
      yawDegrees: 0,
      pitchDegrees: -4
    }
  };
}

export function modelStats(model) {
  const n = model.parts.length;
  if (n === 0) return { count: 0, span: 0, length: 0 };
  const xs = model.parts.map(p => p.position.x);
  const zs = model.parts.map(p => p.position.z);
  return {
    count: n,
    length: Math.max(...xs) - Math.min(...xs),
    span: Math.max(...zs) - Math.min(...zs)
  };
}

export class ModelStore {
  constructor() {
    this._model = this._load() ?? createDemoAircraft();
    this._saveTimer = null;
    this._listeners = new Set();
    this.savedAt = null;
  }

  get model() {
    return this._model;
  }

  snapshot() {
    return clone(this._model);
  }

  replace(model, reason = 'edit') {
    this._model = clone(model);
    this._scheduleSave();
    this._emit(reason);
  }

  resetToDemo() {
    this.replace(createDemoAircraft(), 'reset');
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._model));
      this.savedAt = new Date();
      this._emit('saved');
    } catch (error) {
      console.warn('Unable to persist model', error);
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flush(), 380);
  }

  _emit(reason) {
    for (const listener of this._listeners) {
      listener({ reason, savedAt: this.savedAt });
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.parts) || parsed.parts.length === 0) return null;
      if (!parsed.cockpit?.position) return null;
      return parsed;
    } catch (error) {
      console.warn('Unable to load persisted model', error);
      return null;
    }
  }
}
