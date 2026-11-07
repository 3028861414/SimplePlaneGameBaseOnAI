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

export function icon(name, size = 18) {
  const paths = {
    cube: '<path d="M12 3 21 8v8l-9 5-9-5V8l9-5Zm0 2.3L5.4 9 12 12.7 18.6 9 12 5.3ZM5 10.8v4.5l6 3.4v-4.5l-6-3.4Zm14 0-6 3.4v4.5l6-3.4v-4.5Z"/>',
    sphere: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.9 8h-3.2c-.2-2.5-1-4.8-2-6.5A7 7 0 0 1 18.9 11ZM12 4.7c1.2 1.7 2 4 2.2 6.3H9.8c.2-2.4 1-4.6 2.2-6.3ZM9.3 4.5c-1 1.7-1.8 4-2 6.5H5.1a7 7 0 0 1 4.2-6.5ZM5.1 13h2.2c.2 2.4 1 4.6 2 6.2A7 7 0 0 1 5.1 13Zm4.7 0h4.4c-.2 2.3-1 4.5-2.2 6.2-1.2-1.7-2-3.9-2.2-6.2Zm5.9 6.5c1-1.7 1.8-3.9 2-6.5h3.2a7 7 0 0 1-5.2 6.5Z"/>',
    cylinder: '<path d="M12 3c-4.4 0-8 1.5-8 3.3v11.4C4 19.5 7.6 21 12 21s8-1.5 8-3.3V6.3C20 4.5 16.4 3 12 3Zm6 5.1c-.7.7-3 1.5-6 1.5s-5.3-.8-6-1.5V6.5c1.4.8 3.7 1.2 6 1.2s4.6-.4 6-1.2v1.6Zm-6 10.7c-3 0-5.4-.8-6-1.6v-1.5c1.4.7 3.7 1.2 6 1.2s4.6-.5 6-1.2v1.5c-.6.8-3 1.6-6 1.6Z"/>',
    cone: '<path d="M12 2.5 4 19.2c0 1.3 3.6 2.3 8 2.3s8-1 8-2.3L12 2.5Zm0 2.8 5.8 12.1c-1.2.4-3.4.7-5.8.7s-4.6-.3-5.8-.7L12 5.3Z"/>',
    move: '<path d="M12 2 8.8 5.4l1.4 1.4 1-1V11H5.8l1-1L5.4 8.6 2 12l3.4 3.4 1.4-1.4-1-1H11v5.2l-1-1-1.4 1.4L12 23l3.4-3.4-1.4-1.4-1 1V13h5.2l-1 1 1.4 1.4L22 12l-3.4-3.4-1.4 1.4 1 1H13V5.8l1 1 1.4-1.4L12 2Z"/>',
    rotate: '<path d="M12 4a8 8 0 0 1 7.4 5H17l2.7 3.1L22.3 9h-2.1A10 10 0 1 0 22 12h-2a8 8 0 1 1-8-8Z"/>',
    scale: '<path d="M3 3h8v2H6.4l12.2 12.2H21v3h-8v-2h4.6L5.4 6H8V3H3Zm18 0v8h-2V6.4l-2.1 2.1-1.4-1.4L17.6 5H15V3h6Z"/>',
    fit: '<path d="M4 9V4h5v2H6v3H4Zm16 0V6h-3V4h5v5h-2ZM9 20H4v-5h2v3h3v2Zm6 0v-2h3v-3h2v5h-5Z"/>',
    eye: '<path d="M12 5c5.5 0 9.5 5.2 9.9 6.2.2.5.2 1.1 0 1.6C21.5 13.8 17.5 19 12 19s-9.5-5.2-9.9-6.2a2.1 2.1 0 0 1 0-1.6C2.5 10.2 6.5 5 12 5Zm0 2c-3.8 0-6.9 3.4-8 5 1.1 1.6 4.2 5 8 5s6.9-3.4 8-5c-1.1-1.6-4.2-5-8-5Zm0 1.7a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6Z"/>',
    play: '<path d="M8 5.3v13.4L19 12 8 5.3Zm2 3.3 5.7 3.4-5.7 3.4V8.6Z"/>',
    back: '<path d="m10.6 5.6-6.4 6.5 6.4 6.4 1.4-1.4-4-4h13.6v-2H8l4-4-1.4-1.5Z"/>',
    camera: '<path d="M8.2 5 7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-1.2-2H8.2ZM12 9a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/>',
    plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z"/>',
    trash: '<path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 5h12l-1 13H7L6 8Zm4 2v9h2v-9h-2Zm4 0v9h2v-9h-2Z"/>',
    copy: '<path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3ZM5 7h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h11V9H5Z"/>',
    target: '<path d="M12 2v3a7 7 0 0 1 6.7 5h3.1v2h-3.1A7 7 0 0 1 12 19v3h-2v-3a7 7 0 0 1-6.7-5H2v-2h1.3A7 7 0 0 1 10 5V2h2Zm-1 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
    chevron: '<path d="m8.6 5.6 1.4-1.4L19.2 13 10 22.2l-1.4-1.4L16.4 13 8.6 5.6Z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm0 7.9L5.4 7.3 12 10.9l6.6-3.6L12 10.9Zm0 3.9-9-5v2.5l9 5 9-5v-2.5l-9 5Z"/>',
    reset: '<path d="M12 5V2L7 6.5 12 11V8a5 5 0 1 1-5 5H5a7 7 0 1 0 7-8Z"/>',
    upload: '<path d="M11 15V4.8L7.4 8.4 6 7l6-6 6 6-1.4 1.4L13 4.8V15h-2Zm-7 2h2v3h12v-3h2v5H4v-5Z"/>',
    download: '<path d="M11 2h2v10.2l3.6-3.6L18 10l-6 6-6-6 1.4-1.4 3.6 3.6V2ZM4 17h2v3h12v-3h2v5H4v-5Z"/>',
    check: '<path d="M9.2 16.2 3.8 10.8l1.4-1.4 4 4L16.8 5.8l1.4 1.4-9 9Z"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor">${paths[name] ?? ''}</svg>`;
}
