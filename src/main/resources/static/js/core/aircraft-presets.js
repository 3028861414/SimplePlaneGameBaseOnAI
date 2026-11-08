import {
  applyLiveryToModel,
  createDefaultBindings,
  createDefaultLivery,
  createPart,
  vec3
} from './model.js';

const PRESETS = [
  {
    id: 'x01',
    name: 'AEROLAB X-01 · 教练机',
    description: '双发上单翼教练机，平衡、稳定，适合熟悉操纵。',
    create: createTrainer
  },
  {
    id: 'j02',
    name: 'AEROLAB J-02 · 截击机',
    description: '双发后掠翼截击机，推力充沛、滚转迅速。',
    create: createInterceptor
  },
  {
    id: 'c03',
    name: 'AEROLAB C-03 · 运输机',
    description: '四发高单翼运输机，质量大、惯性明显。',
    create: createTransport
  },
  {
    id: 's04',
    name: 'AEROLAB S-04 · 运动双翼机',
    description: '轻巧的单发双翼机，低速灵活，适合特技。',
    create: createSportBiplane
  },
  {
    id: 'g05',
    name: 'AEROLAB G-05 · 飞翼',
    description: '无尾飞翼布局，翼身融合、轮廓独特。',
    create: createFlyingWing
  }
];

export function listAircraftPresets() {
  return PRESETS.map(({ id, name, description }) => ({ id, name, description }));
}

export function createAircraftPreset(id) {
  const preset = PRESETS.find(item => item.id === id) ?? PRESETS[0];
  return preset.create();
}

function createTrainer() {
  return finish({
    name: 'AEROLAB X-01',
    livery: createDefaultLivery(),
    parts: [
      part('CYLINDER', 'fuselage', '机身', vec3(0, 0, 0), vec3(1.05, 4.8, 1.05), 430),
      part('CONE', 'nose', '机鼻', vec3(2.95, 0, 0), vec3(1.05, 1.1, 1.05), 55, { rotation: vec3(0, 0, -90) }),
      part('CONE', 'tailcone', '尾锥', vec3(-2.45, 0, 0), vec3(0.8, 0.8, 0.8), 45, { rotation: vec3(0, 0, 90) }),
      part('BOX', 'wing-left', '左主翼', vec3(-0.15, 0.06, -2.4), vec3(1.75, 0.12, 4.8), 125, { liftingSurface: true, rotation: vec3(2.5, 0, 0) }),
      part('BOX', 'wing-right', '右主翼', vec3(-0.15, 0.06, 2.4), vec3(1.75, 0.12, 4.8), 125, { liftingSurface: true, rotation: vec3(-2.5, 0, 0) }),
      part('CYLINDER', 'engine-left', '左引擎短舱', vec3(0.35, -0.44, -1.85), vec3(0.5, 1.75, 0.5), 30),
      part('CYLINDER', 'engine-right', '右引擎短舱', vec3(0.35, -0.44, 1.85), vec3(0.5, 1.75, 0.5), 30),
      part('BOX', 'tail-plane', '水平尾翼', vec3(-2.28, 0.12, 0), vec3(0.92, 0.08, 3.0), 35, { liftingSurface: true }),
      part('BOX', 'tail-fin', '垂直尾翼', vec3(-2.18, 0.6, 0), vec3(0.96, 1.12, 0.08), 20),
      part('ELLIPSOID', 'canopy', '座舱盖', vec3(1.22, 0.53, 0), vec3(0.98, 0.38, 0.58), 25, { color: '#123d49' })
    ],
    flightSystems: systems(
      1350,
      [engine('left', '左引擎', vec3(0.35, -0.44, -1.85), 4200), engine('right', '右引擎', vec3(0.35, -0.44, 1.85), 4200)],
      [elevator('left', '左升降舵', vec3(-2.55, 0.13, -0.9)), elevator('right', '右升降舵', vec3(-2.55, 0.13, 0.9))],
      [rudder('main', '方向舵', vec3(-2.45, 0.65, 0))],
      [gun('left', '左机炮', vec3(3.05, 0, -0.18)), gun('right', '右机炮', vec3(3.05, 0, 0.18))]
    ),
    cockpit: cockpit(vec3(1.22, 0.72, 0), -4),
    bindings: createDefaultBindings()
  }, '#35c6b1');
}

function createInterceptor() {
  return finish({
    name: 'AEROLAB J-02',
    livery: { primary: '#3f8fbf', secondary: '#d8e2ea', accent: '#f0b35f' },
    parts: [
      part('BOX', 'fuselage', '升力机身', vec3(0, 0, 0), vec3(1.35, 6.4, 0.72), 2300),
      part('CONE', 'nose', '尖锐机鼻', vec3(3.6, 0, 0), vec3(0.8, 1.6, 0.7), 260, { rotation: vec3(0, 0, -90) }),
      part('CONE', 'tailcone', '尾喷口', vec3(-3.2, -0.02, 0), vec3(0.74, 0.9, 0.66), 210, { rotation: vec3(0, 0, 90) }),
      part('BOX', 'wing-left', '左后掠翼', vec3(-0.4, -0.05, -2.15), vec3(2.5, 0.12, 4.15), 510, { liftingSurface: true, rotation: vec3(0, -12, 0) }),
      part('BOX', 'wing-right', '右后掠翼', vec3(-0.4, -0.05, 2.15), vec3(2.5, 0.12, 4.15), 510, { liftingSurface: true, rotation: vec3(0, 12, 0) }),
      part('BOX', 'canard-left', '左鸭翼', vec3(2.45, 0.18, -0.78), vec3(0.85, 0.09, 1.35), 65, { liftingSurface: true, rotation: vec3(2, 0, 0) }),
      part('BOX', 'canard-right', '右鸭翼', vec3(2.45, 0.18, 0.78), vec3(0.85, 0.09, 1.35), 65, { liftingSurface: true, rotation: vec3(-2, 0, 0) }),
      part('CYLINDER', 'engine-left', '左引擎', vec3(0.2, -0.15, -0.66), vec3(0.42, 1.9, 0.42), 220),
      part('CYLINDER', 'engine-right', '右引擎', vec3(0.2, -0.15, 0.66), vec3(0.42, 1.9, 0.42), 220),
      part('BOX', 'tail-plane', '全动平尾', vec3(-2.85, 0.12, 0), vec3(1.05, 0.09, 2.5), 95, { liftingSurface: true }),
      part('BOX', 'tail-fin-left', '左垂尾', vec3(-2.7, 0.62, -0.46), vec3(1.0, 1.0, 0.08), 48),
      part('BOX', 'tail-fin-right', '右垂尾', vec3(-2.7, 0.62, 0.46), vec3(1.0, 1.0, 0.08), 48),
      part('ELLIPSOID', 'canopy', '座舱盖', vec3(2.05, 0.52, 0), vec3(1.2, 0.34, 0.52), 45, { color: '#123d49' })
    ],
    flightSystems: systems(
      7200,
      [engine('left', '左引擎', vec3(0.2, -0.15, -0.66), 52000), engine('right', '右引擎', vec3(0.2, -0.15, 0.66), 52000)],
      [elevator('left', '左升降舵', vec3(-2.9, 0.15, -0.95), 1.15), elevator('right', '右升降舵', vec3(-2.9, 0.15, 0.95), 1.15)],
      [rudder('left', '左方向舵', vec3(-2.7, 0.62, -0.46), 0.72), rudder('right', '右方向舵', vec3(-2.7, 0.62, 0.46), 0.72)],
      [gun('left', '左机炮', vec3(3.2, 0, -0.22), 38), gun('right', '右机炮', vec3(3.2, 0, 0.22), 38)]
    ),
    cockpit: cockpit(vec3(2.05, 0.68, 0), -3)
  }, '#3f8fbf');
}

function createTransport() {
  return finish({
    name: 'AEROLAB C-03',
    livery: { primary: '#d45a4f', secondary: '#e9dfd4', accent: '#2c7f8e' },
    parts: [
      part('BOX', 'fuselage', '宽体机身', vec3(0, 0, 0), vec3(2.1, 7.2, 1.8), 6200),
      part('ELLIPSOID', 'nose', '机鼻', vec3(3.4, 0, 0), vec3(1.8, 1.8, 1.7), 850),
      part('CONE', 'tailcone', '尾段', vec3(-3.8, 0, 0), vec3(1.5, 1.7, 1.5), 720, { rotation: vec3(0, 0, 90) }),
      part('BOX', 'wing-left', '左主翼', vec3(0.2, 0.4, -3.65), vec3(2.6, 0.2, 5.5), 1150, { liftingSurface: true, rotation: vec3(1.5, 0, 0) }),
      part('BOX', 'wing-right', '右主翼', vec3(0.2, 0.4, 3.65), vec3(2.6, 0.2, 5.5), 1150, { liftingSurface: true, rotation: vec3(-1.5, 0, 0) }),
      part('CYLINDER', 'engine-left', '左外引擎', vec3(0.25, 0.1, -4.75), vec3(0.62, 2.5, 0.62), 340),
      part('CYLINDER', 'engine-left-inner', '左内引擎', vec3(0.25, 0.1, -3.0), vec3(0.62, 2.5, 0.62), 340),
      part('CYLINDER', 'engine-right-inner', '右内引擎', vec3(0.25, 0.1, 3.0), vec3(0.62, 2.5, 0.62), 340),
      part('CYLINDER', 'engine-right', '右外引擎', vec3(0.25, 0.1, 4.75), vec3(0.62, 2.5, 0.62), 340),
      part('BOX', 'tail-plane', '水平尾翼', vec3(-3.35, 0.45, 0), vec3(1.55, 0.12, 5.0), 220, { liftingSurface: true }),
      part('BOX', 'tail-fin', '垂直尾翼', vec3(-3.4, 1.15, 0), vec3(1.65, 1.8, 0.14), 180),
      part('ELLIPSOID', 'canopy', '驾驶舱玻璃', vec3(3.0, 0.8, 0), vec3(1.6, 0.38, 1.1), 80, { color: '#123d49' })
    ],
    flightSystems: systems(
      22000,
      [
        engine('left', '左外引擎', vec3(0.25, 0.1, -4.75), 18000),
        engine('left-inner', '左内引擎', vec3(0.25, 0.1, -3.0), 18000),
        engine('right-inner', '右内引擎', vec3(0.25, 0.1, 3.0), 18000),
        engine('right', '右外引擎', vec3(0.25, 0.1, 4.75), 18000)
      ],
      [elevator('left', '左升降舵', vec3(-3.6, 0.45, -1.5), 2.2), elevator('right', '右升降舵', vec3(-3.6, 0.45, 1.5), 2.2)],
      [rudder('main', '方向舵', vec3(-3.4, 1.15, 0), 1.8)],
      [gun('left', '左机炮', vec3(3.5, 0.1, -0.35), 45), gun('right', '右机炮', vec3(3.5, 0.1, 0.35), 45)]
    ),
    cockpit: cockpit(vec3(3.0, 0.95, 0), -3)
  }, '#d45a4f');
}

function createSportBiplane() {
  return finish({
    name: 'AEROLAB S-04',
    livery: { primary: '#8c7bd8', secondary: '#d7d4e8', accent: '#57d6c4' },
    parts: [
      part('CYLINDER', 'fuselage', '机身', vec3(0, 0, 0), vec3(0.7, 3.8, 0.7), 145),
      part('CONE', 'nose', '发动机整流罩', vec3(2.1, 0, 0), vec3(0.72, 0.75, 0.72), 48, { rotation: vec3(0, 0, -90) }),
      part('BOX', 'wing-lower-left', '左下翼', vec3(0.0, -0.18, -1.35), vec3(1.35, 0.1, 2.7), 36, { liftingSurface: true }),
      part('BOX', 'wing-lower-right', '右下翼', vec3(0.0, -0.18, 1.35), vec3(1.35, 0.1, 2.7), 36, { liftingSurface: true }),
      part('BOX', 'wing-upper-left', '左上翼', vec3(0.08, 0.42, -1.45), vec3(1.3, 0.1, 2.9), 38, { liftingSurface: true }),
      part('BOX', 'wing-upper-right', '右上翼', vec3(0.08, 0.42, 1.45), vec3(1.3, 0.1, 2.9), 38, { liftingSurface: true }),
      part('CYLINDER', 'engine-main', '星形发动机', vec3(2.02, 0, 0), vec3(0.55, 0.4, 0.55), 95),
      part('BOX', 'tail-plane', '水平尾翼', vec3(-1.8, 0.18, 0), vec3(0.78, 0.08, 1.8), 20, { liftingSurface: true }),
      part('BOX', 'tail-fin', '垂直尾翼', vec3(-1.7, 0.55, 0), vec3(0.8, 0.9, 0.06), 12),
      part('ELLIPSOID', 'canopy', '座舱盖', vec3(0.65, 0.32, 0), vec3(0.72, 0.26, 0.45), 18, { color: '#123d49' })
    ],
    flightSystems: systems(
      780,
      [engine('main', '星形发动机', vec3(2.02, 0, 0), 5200)],
      [elevator('left', '左升降舵', vec3(-1.9, 0.18, -0.55)), elevator('right', '右升降舵', vec3(-1.9, 0.18, 0.55))],
      [rudder('main', '方向舵', vec3(-1.7, 0.55, 0), 0.65)],
      [gun('left', '左机炮', vec3(2.2, 0, -0.18), 22), gun('right', '右机炮', vec3(2.2, 0, 0.18), 22)]
    ),
    cockpit: cockpit(vec3(0.65, 0.5, 0), -3)
  }, '#8c7bd8');
}

function createFlyingWing() {
  return finish({
    name: 'AEROLAB G-05',
    livery: { primary: '#e58a46', secondary: '#f1e3ce', accent: '#3d8f9c' },
    parts: [
      part('ELLIPSOID', 'fuselage', '翼身融合体', vec3(0, 0, 0), vec3(2.8, 1.0, 4.6), 620),
      part('BOX', 'wing-left', '左翼身', vec3(-0.2, 0, -2.6), vec3(2.4, 0.16, 3.2), 260, { liftingSurface: true }),
      part('BOX', 'wing-right', '右翼身', vec3(-0.2, 0, 2.6), vec3(2.4, 0.16, 3.2), 260, { liftingSurface: true }),
      part('CYLINDER', 'engine-left', '左涵道风扇', vec3(0.4, 0.15, -1.15), vec3(0.45, 1.2, 0.45), 90),
      part('CYLINDER', 'engine-right', '右涵道风扇', vec3(0.4, 0.15, 1.15), vec3(0.45, 1.2, 0.45), 90),
      part('BOX', 'tail-fin-left', '左翼尖舵', vec3(-1.4, 0.45, -3.9), vec3(1.0, 0.85, 0.08), 30),
      part('BOX', 'tail-fin-right', '右翼尖舵', vec3(-1.4, 0.45, 3.9), vec3(1.0, 0.85, 0.08), 30),
      part('ELLIPSOID', 'canopy', '座舱盖', vec3(1.3, 0.45, 0), vec3(1.1, 0.28, 0.72), 38, { color: '#123d49' })
    ],
    flightSystems: systems(
      950,
      [engine('left', '左涵道风扇', vec3(0.4, 0.15, -1.15), 4200), engine('right', '右涵道风扇', vec3(0.4, 0.15, 1.15), 4200)],
      [elevator('left', '左升降副翼', vec3(-1.0, 0.12, -2.2), 1.1), elevator('right', '右升降副翼', vec3(-1.0, 0.12, 2.2), 1.1)],
      [rudder('left', '左翼尖方向舵', vec3(-1.4, 0.45, -3.9), 0.65), rudder('right', '右翼尖方向舵', vec3(-1.4, 0.45, 3.9), 0.65)],
      [gun('left', '左机炮', vec3(1.6, 0.05, -0.25), 20), gun('right', '右机炮', vec3(1.6, 0.05, 0.25), 20)]
    ),
    cockpit: cockpit(vec3(1.3, 0.62, 0), -2)
  }, '#e58a46');
}

function part(shape, id, name, position, size, massKg, overrides = {}) {
  return createPart(shape, { id, name, position, size, massKg, ...overrides });
}

function engine(id, name, position, maxThrustN) {
  return { id: `sys-engine-${id}`, name, position, maxThrustN, massKg: Math.max(70, Math.round(maxThrustN / 160)) };
}

function elevator(id, name, position, areaM2 = 0.9) {
  return { id: `sys-elevator-${id}`, name, position, areaM2, massKg: 18 };
}

function rudder(id, name, position, areaM2 = 0.8) {
  return { id: `sys-rudder-${id}`, name, position, areaM2, massKg: 14 };
}

function gun(id, name, position, massKg = 25) {
  return { id: `sys-gun-${id}`, name, position, massKg };
}

function systems(massKg, engines, horizontalRudders, verticalRudders, guns) {
  return { massKg, engines, horizontalRudders, verticalRudders, guns };
}

function cockpit(position, pitchDegrees) {
  return { position, yawDegrees: 0, pitchDegrees };
}

function finish(model, primary) {
  model.version = 3;
  model.bindings = createDefaultBindings();
  model.parts.forEach(partItem => {
    if (!partItem.color) partItem.color = '#c9d7df';
  });
  applyLiveryToModel(model, model.livery);
  return model;
}
