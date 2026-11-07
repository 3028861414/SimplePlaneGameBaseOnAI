import * as THREE from 'three';

export function makeUnitGeometry(shape) {
  switch (shape) {
    case 'BOX':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'ELLIPSOID':
      return new THREE.SphereGeometry(0.5, 40, 26);
    case 'CYLINDER':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 44, 1, false);
    case 'CONE':
      return new THREE.CylinderGeometry(0, 0.5, 1, 44, 1, false);
    default:
      throw new Error(`未知部件形状: ${shape}`);
  }
}

export function disposePartGroup(group) {
  group.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
}
