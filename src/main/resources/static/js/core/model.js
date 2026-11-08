export const SHAPE_INFO = Object.freeze({
  BOX: { label: '立方体', defaultName: '立方体', size: { x: 1.2, y: 0.8, z: 1.2 }, rotation: { x: 0, y: 0, z: 0 } },
  ELLIPSOID: { label: '椭球体', defaultName: '椭球体', size: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0 } },
  CYLINDER: { label: '圆柱体', defaultName: '圆柱体', size: { x: 0.6, y: 2, z: 0.6 }, rotation: { x: 0, y: 0, z: -90 } },
  CONE: { label: '圆锥体', defaultName: '圆锥体', size: { x: 0.8, y: 1.4, z: 0.8 }, rotation: { x: 0, y: 0, z: -90 } }
});

export const PART_COLORS = ['#c9d7df', '#35c6b1', '#3f8fbf', '#e6a15c', '#b8c5d0', '#e06d5c', '#8c9dd6', '#6dcab3'];

export const LIVERY_PRESETS = Object.freeze([
  { id: 'teal', label: '极光青', primary: '#35c6b1', secondary: '#c9d7df', accent: '#e6a15c' },
  { id: 'navy', label: '深海蓝', primary: '#3f8fbf', secondary: '#d8e2ea', accent: '#f0b35f' },
  { id: 'crimson', label: '赤焰红', primary: '#d45a4f', secondary: '#e9dfd4', accent: '#2c7f8e' },
  { id: 'violet', label: '暮光紫', primary: '#8c7bd8', secondary: '#d7d4e8', accent: '#57d6c4' },
  { id: 'sunset', label: '日落橙', primary: '#e58a46', secondary: '#f1e3ce', accent: '#3d8f9c' },
  { id: 'mono', label: '石墨灰', primary: '#8b9aa4', secondary: '#d2d9dc', accent: '#e6c35c' }
]);

export function createDefaultLivery() {
  return { ...LIVERY_PRESETS[0] };
}

export function applyLiveryToModel(model, livery) {
  const next = {
    primary: normalizeHex(livery?.primary, LIVERY_PRESETS[0].primary),
    secondary: normalizeHex(livery?.secondary, LIVERY_PRESETS[0].secondary),
    accent: normalizeHex(livery?.accent, LIVERY_PRESETS[0].accent)
  };
  for (const part of model.parts ?? []) {
    const role = liveryRole(part);
    if (role === 'glass') continue;
    part.color = next[role] ?? next.secondary;
  }
  return model;
}

export function liveryForModel(model) {
  return {
    primary: normalizeHex(model?.livery?.primary, inferLiveryColor(model, 'primary')),
    secondary: normalizeHex(model?.livery?.secondary, inferLiveryColor(model, 'secondary')),
    accent: normalizeHex(model?.livery?.accent, inferLiveryColor(model, 'accent'))
  };
}

function inferLiveryColor(model, role) {
  const parts = model?.parts ?? [];
  const candidate = parts.find(part => liveryRole(part) === role);
  return candidate?.color ?? createDefaultLivery()[role];
}

function liveryRole(part) {
  const label = `${part?.id ?? ''} ${part?.name ?? ''}`.toLowerCase();
  if (/座舱|canopy|glass/.test(label)) return 'glass';
  if (/引擎|engine|短舱|nacelle|机炮|gun|进气/.test(label)) return 'accent';
  if (part.liftingSurface || /翼|wing|尾翼|tail|stab|fin|舵/.test(label)) return 'primary';
  return 'secondary';
}

function normalizeHex(value, fallback) {
  return COLOR_PATTERN.test(value ?? '') ? value.toLowerCase() : fallback;
}

export const FLIGHT_SYSTEM_META = Object.freeze({
  engines: { label: '引擎', plural: '引擎', color: '#58e0c7', prefix: 'engine' },
  horizontalRudders: { label: '水平舵', plural: '水平舵', color: '#80d96b', prefix: 'elevator' },
  verticalRudders: { label: '垂直舵', plural: '垂直舵', color: '#69b7ef', prefix: 'rudder' },
  guns: { label: '机炮', plural: '机炮', color: '#ffb166', prefix: 'gun' }
});

export const BINDING_DEFINITIONS = Object.freeze([
  { action: 'throttleUp', label: '增加油门', group: '动力' },
  { action: 'throttleDown', label: '减小油门', group: '动力' },
  { action: 'boost', label: '氮气加速', group: '动力' },
  { action: 'pitchUp', label: '抬头 / 爬升', group: '姿态' },
  { action: 'pitchDown', label: '低头 / 俯冲', group: '姿态' },
  { action: 'yawLeft', label: '向左偏航', group: '姿态' },
  { action: 'yawRight', label: '向右偏航', group: '姿态' },
  { action: 'rollLeft', label: '向左滚转', group: '姿态' },
  { action: 'rollRight', label: '向右滚转', group: '姿态' },
  { action: 'brake', label: '刹车 / 减速', group: '辅助' },
  { action: 'toggleCamera', label: '切换视角', group: '驾驶' },
  { action: 'resetFlight', label: '重新起飞', group: '驾驶' },
  { action: 'fireGuns', label: '机炮按键（暂不作用）', group: '驾驶' }
]);

export const DEFAULT_BINDINGS = Object.freeze({
  throttleUp: 'KeyW',
  throttleDown: 'KeyS',
  pitchUp: 'ArrowUp',
  pitchDown: 'ArrowDown',
  yawLeft: 'ArrowLeft',
  yawRight: 'ArrowRight',
  rollLeft: 'KeyA',
  rollRight: 'KeyD',
  boost: 'ShiftLeft',
  brake: 'KeyB',
  toggleCamera: 'KeyC',
  resetFlight: 'KeyR',
  fireGuns: 'Space'
});

const STORAGE_KEY = 'aerolab.model.v1';
const SHAPES = new Set(Object.keys(SHAPE_INFO));
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

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
    massKg: Math.max(0, Number(overrides.massKg) || 0),
    liftingSurface: Boolean(overrides.liftingSurface),
    color: overrides.color ?? PART_COLORS[Math.floor(Math.random() * PART_COLORS.length)]
  };
}

export function createDefaultFlightSystems() {
  return {
    massKg: 1350,
    engines: [
      { id: 'sys-engine-left', name: '左引擎', position: vec3(0.35, -0.44, -1.85), maxThrustN: 4200, massKg: 165 },
      { id: 'sys-engine-right', name: '右引擎', position: vec3(0.35, -0.44, 1.85), maxThrustN: 4200, massKg: 165 }
    ],
    horizontalRudders: [
      { id: 'sys-elevator-left', name: '左升降舵', position: vec3(-2.55, 0.13, -0.9), areaM2: 0.9, massKg: 18 },
      { id: 'sys-elevator-right', name: '右升降舵', position: vec3(-2.55, 0.13, 0.9), areaM2: 0.9, massKg: 18 }
    ],
    verticalRudders: [
      { id: 'sys-rudder-main', name: '方向舵', position: vec3(-2.45, 0.65, 0), areaM2: 0.8, massKg: 14 }
    ],
    guns: [
      { id: 'sys-gun-left', name: '左机炮', position: vec3(3.05, 0, -0.18), massKg: 25 },
      { id: 'sys-gun-right', name: '右机炮', position: vec3(3.05, 0, 0.18), massKg: 25 }
    ]
  };
}

export function createDefaultBindings() {
  return { ...DEFAULT_BINDINGS };
}

export function createDemoAircraft() {
  const parts = [
    {
      id: 'airframe-fuselage', name: '机身', shape: 'CYLINDER',
      position: vec3(0, 0, 0), rotation: vec3(0, 0, -90), size: vec3(1.05, 4.8, 1.05),
      color: '#c9d7df',
      massKg: 430
    },
    {
      id: 'airframe-nose', name: '机鼻', shape: 'CONE',
      position: vec3(2.95, 0, 0), rotation: vec3(0, 0, -90), size: vec3(1.05, 1.1, 1.05),
      color: '#a9bcc7',
      massKg: 55
    },
    {
      id: 'airframe-tailcone', name: '尾锥', shape: 'CONE',
      position: vec3(-2.45, 0, 0), rotation: vec3(0, 0, 90), size: vec3(0.8, 0.8, 0.8),
      color: '#a9bcc7',
      massKg: 45
    },
    {
      id: 'wing-left', name: '左主翼', shape: 'BOX',
      position: vec3(-0.15, 0.06, -2.4), rotation: vec3(2.5, 0, 0), size: vec3(1.75, 0.12, 4.8),
      color: '#35c6b1',
      massKg: 125,
      liftingSurface: true
    },
    {
      id: 'wing-right', name: '右主翼', shape: 'BOX',
      position: vec3(-0.15, 0.06, 2.4), rotation: vec3(-2.5, 0, 0), size: vec3(1.75, 0.12, 4.8),
      color: '#35c6b1',
      massKg: 125,
      liftingSurface: true
    },
    {
      id: 'engine-left', name: '左引擎短舱', shape: 'CYLINDER',
      position: vec3(0.35, -0.44, -1.85), rotation: vec3(0, 0, -90), size: vec3(0.5, 1.75, 0.5),
      color: '#405462',
      massKg: 30
    },
    {
      id: 'engine-right', name: '右引擎短舱', shape: 'CYLINDER',
      position: vec3(0.35, -0.44, 1.85), rotation: vec3(0, 0, -90), size: vec3(0.5, 1.75, 0.5),
      color: '#405462',
      massKg: 30
    },
    {
      id: 'tail-plane', name: '水平尾翼', shape: 'BOX',
      position: vec3(-2.28, 0.12, 0), rotation: vec3(0, 0, 0), size: vec3(0.92, 0.08, 3.0),
      color: '#2eab99',
      massKg: 35,
      liftingSurface: true
    },
    {
      id: 'tail-fin', name: '垂直尾翼', shape: 'BOX',
      position: vec3(-2.18, 0.6, 0), rotation: vec3(0, 0, 0), size: vec3(0.96, 1.12, 0.08),
      color: '#4ac8b3',
      massKg: 20
    },
    {
      id: 'canopy', name: '座舱盖', shape: 'ELLIPSOID',
      position: vec3(1.22, 0.53, 0), rotation: vec3(0, 0, 0), size: vec3(0.98, 0.38, 0.58),
      color: '#123d49',
      massKg: 25
    }
  ];

  return {
    version: 3,
    name: 'AEROLAB X-01',
    parts,
    livery: createDefaultLivery(),
    cockpit: {
      position: vec3(1.22, 0.72, 0),
      yawDegrees: 0,
      pitchDegrees: -4
    },
    flightSystems: createDefaultFlightSystems(),
    bindings: createDefaultBindings()
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

export function normalizeAircraft(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('模型文件内容为空或格式无效。');
  }
  const source = raw.aircraft && typeof raw.aircraft === 'object' ? raw.aircraft : raw;
  const parts = normalizeParts(source.parts);
  const cockpitSource = source.cockpit ?? {};
  const cockpit = {
    position: normalizeVector(cockpitSource.position, vec3(1.22, 0.72, 0), -2000, 2000),
    yawDegrees: clampNumber(cockpitSource.yawDegrees, -360, 360, 0),
    pitchDegrees: clampNumber(cockpitSource.pitchDegrees, -89, 89, -4)
  };
  return {
    version: 3,
    name: normalizeText(source.name, '未命名飞行器', 80),
    parts,
    livery: normalizeLivery(source.livery, parts),
    cockpit,
    flightSystems: normalizeFlightSystems(source.flightSystems),
    bindings: normalizeBindings(source.bindings)
  };
}

export function buildAircraftExport(model) {
  const normalized = normalizeAircraft(model);
  return JSON.stringify({
    format: 'aerolab-aircraft',
    version: 3,
    exportedAt: new Date().toISOString(),
    ...normalized
  }, null, 2);
}

export function parseAircraftFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 文件无法解析。');
  }
  if (parsed?.format && parsed.format !== 'aerolab-aircraft') {
    throw new Error('不是有效的 AEROLAB 飞机文件。');
  }
  const normalized = normalizeAircraft(parsed);
  if (normalized.parts.length === 0) {
    throw new Error('飞机文件至少需要一个几何部件。');
  }
  return normalized;
}

export function safeAircraftFileName(model) {
  const base = (model?.name || 'aerolab-aircraft').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return `${base || 'aerolab-aircraft'}.aerolab.json`;
}

export function formatKeyCode(code) {
  if (!code) return '未绑定';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
    ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
    Enter: 'ENTER', Tab: 'TAB', Escape: 'ESC'
  };
  return map[code] ?? code.replace(/^Numpad/, 'NUM ');
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
      return normalizeAircraft(JSON.parse(raw));
    } catch (error) {
      console.warn('Unable to load persisted model', error);
      return null;
    }
  }
}

function normalizeParts(rawParts) {
  if (!Array.isArray(rawParts)) return [];
  const seen = new Set();
  const parts = [];
  for (const raw of rawParts.slice(0, 80)) {
    if (!raw || !SHAPES.has(raw.shape)) continue;
    let id = normalizeText(raw.id, uid('part'), 80);
    if (seen.has(id)) id = uid('part');
    seen.add(id);
    parts.push({
      id,
      name: normalizeText(raw.name, SHAPE_INFO[raw.shape].defaultName, 60),
      shape: raw.shape,
      position: normalizeVector(raw.position, vec3(0, 0, 0), -2000, 2000),
      rotation: normalizeVector(raw.rotation, SHAPE_INFO[raw.shape].rotation, -1080, 1080),
      size: normalizeVector(raw.size, SHAPE_INFO[raw.shape].size, 0.02, 100),
      massKg: clampNumber(raw.massKg, 0, 100000, 0),
      liftingSurface: normalizeLiftingSurface(raw),
      color: COLOR_PATTERN.test(raw.color ?? '') ? raw.color : PART_COLORS[0]
    });
  }
  return parts;
}

function normalizeLivery(raw, parts) {
  const fallback = createDefaultLivery();
  return {
    primary: normalizeHex(raw?.primary, parts.find(part => liveryRole(part) === 'primary')?.color ?? fallback.primary),
    secondary: normalizeHex(raw?.secondary, parts.find(part => liveryRole(part) === 'secondary')?.color ?? fallback.secondary),
    accent: normalizeHex(raw?.accent, parts.find(part => liveryRole(part) === 'accent')?.color ?? fallback.accent)
  };
}

function normalizeFlightSystems(raw) {
  if (!raw || typeof raw !== 'object') return createDefaultFlightSystems();
  return {
    massKg: clampNumber(raw.massKg, 100, 100000, 1350),
    engines: normalizeEngineList(raw.engines),
    horizontalRudders: normalizeSurfaceList(raw.horizontalRudders, 'elevator'),
    verticalRudders: normalizeSurfaceList(raw.verticalRudders, 'rudder'),
    guns: normalizeGunList(raw.guns)
  };
}

function normalizeEngineList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.slice(0, 12).map((item, index) => ({
    id: uniqueSystemId(item?.id, 'engine', index, seen),
    name: normalizeText(item?.name, `引擎 ${index + 1}`, 60),
    position: normalizeVector(item?.position, vec3(0, 0, 0), -2000, 2000),
    maxThrustN: clampNumber(item?.maxThrustN, 0, 200000, 4200),
    massKg: clampNumber(item?.massKg, 0, 100000, 0)
  }));
}

function normalizeSurfaceList(raw, prefix) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.slice(0, 12).map((item, index) => ({
    id: uniqueSystemId(item?.id, prefix, index, seen),
    name: normalizeText(item?.name, prefix === 'elevator' ? `水平舵 ${index + 1}` : `垂直舵 ${index + 1}`, 60),
    position: normalizeVector(item?.position, vec3(0, 0, 0), -2000, 2000),
    areaM2: clampNumber(item?.areaM2, 0.01, 500, prefix === 'elevator' ? 0.9 : 0.8),
    massKg: clampNumber(item?.massKg, 0, 100000, 0)
  }));
}

function normalizeGunList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.slice(0, 16).map((item, index) => ({
    id: uniqueSystemId(item?.id, 'gun', index, seen),
    name: normalizeText(item?.name, `机炮 ${index + 1}`, 60),
    position: normalizeVector(item?.position, vec3(0, 0, 0), -2000, 2000),
    massKg: clampNumber(item?.massKg, 0, 100000, 0)
  }));
}

function uniqueSystemId(rawId, prefix, index, seen) {
  let id = normalizeText(rawId, `${prefix}-${index + 1}`, 80);
  if (seen.has(id)) id = uid(prefix);
  seen.add(id);
  return id;
}

function normalizeLiftingSurface(raw) {
  if (typeof raw.liftingSurface === 'boolean') return raw.liftingSurface;
  const shape = raw.shape;
  if (shape !== 'BOX' && shape !== 'ELLIPSOID') return false;
  const size = raw.size ?? {};
  const x = Number(size.x) || 1;
  const y = Number(size.y) || 1;
  const z = Number(size.z) || 1;
  const label = `${raw.name ?? ''} ${raw.id ?? ''}`.toLowerCase();
  if (/垂直尾翼|垂尾|fin|rudder/.test(label)) return false;
  if (/主翼|机翼|尾翼|wing|tail|stab/.test(label)) return true;
  return y < Math.min(x, z) * 0.45 && z > x * 0.8;
}

function normalizeBindings(raw) {
  const bindings = createDefaultBindings();
  if (raw && typeof raw === 'object') {
    for (const { action } of BINDING_DEFINITIONS) {
      const code = raw[action];
      if (typeof code === 'string' && code.trim() && code.trim().length <= 40) {
        bindings[action] = code.trim();
      }
    }
  }
  return bindings;
}

function normalizeVector(raw, fallback, min, max) {
  return {
    x: clampNumber(raw?.x, min, max, fallback?.x ?? 0),
    y: clampNumber(raw?.y, min, max, fallback?.y ?? 0),
    z: clampNumber(raw?.z, min, max, fallback?.z ?? 0)
  };
}

function normalizeText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
