import * as THREE from 'three';

const VIEW = new THREE.Vector3(1.1, 0.78, 1.25).normalize();
const RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), VIEW).normalize();
const UP = new THREE.Vector3().crossVectors(VIEW, RIGHT).normalize();
const CUBE = 0.46;

/**
 * Small isometric cube + draggable wind vector. The numeric X/Y/Z fields remain
 * the source of truth; this is an additional direct-manipulation control.
 */
export class WindVectorGizmo {
  constructor(canvas, direction, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.direction = normalizeDirection(direction);
    this._drag = null;
    this._events = new AbortController();
    this._bind();
    this.setDirection(this.direction);
  }

  setDirection(direction) {
    const vector = new THREE.Vector3(
      Number(direction?.x) || 0,
      Number(direction?.y) || 0,
      Number(direction?.z) || 0
    );
    if (vector.lengthSq() < 1e-8) vector.set(-1, 0, 0);
    this.direction = { x: vector.x, y: vector.y, z: vector.z };
    this._draw();
  }

  _bind() {
    const signal = this._events.signal;
    this.canvas.addEventListener('pointerdown', event => {
      const point = this._eventPoint(event);
      event.preventDefault();
      event.stopPropagation();
      this._drag = {
        x: point.x,
        y: point.y,
        theta: Math.atan2(this.direction.z, this.direction.x),
        phi: Math.asin(THREE.MathUtils.clamp(this.direction.y, -1, 1)),
        magnitude: Math.max(0.1, Math.hypot(this.direction.x, this.direction.y, this.direction.z))
      };
      this.canvas.setPointerCapture?.(event.pointerId);
      this.canvas.classList.add('is-dragging');
    }, { signal });
    this.canvas.addEventListener('pointermove', event => {
      if (!this._drag) return;
      event.preventDefault();
      event.stopPropagation();
      const point = this._eventPoint(event);
      const theta = this._drag.theta - (point.x - this._drag.x) * 0.014;
      const phi = THREE.MathUtils.clamp(
        this._drag.phi - (point.y - this._drag.y) * 0.011,
        -Math.PI * 0.48,
        Math.PI * 0.48
      );
      const cosPhi = Math.cos(phi);
      const next = {
        x: cosPhi * Math.cos(theta) * this._drag.magnitude,
        y: Math.sin(phi) * this._drag.magnitude,
        z: cosPhi * Math.sin(theta) * this._drag.magnitude
      };
      const rounded = {
        x: roundComponent(next.x),
        y: roundComponent(next.y),
        z: roundComponent(next.z)
      };
      if (Math.hypot(rounded.x, rounded.y, rounded.z) < 0.05) return;
      this.direction = rounded;
      this._draw();
      this.onChange?.(rounded);
    }, { signal });
    const end = event => {
      if (!this._drag) return;
      this._drag = null;
      this.canvas.classList.remove('is-dragging');
      try { this.canvas.releasePointerCapture?.(event.pointerId); } catch { /* already released */ }
    };
    this.canvas.addEventListener('pointerup', end, { signal });
    this.canvas.addEventListener('pointercancel', end, { signal });
  }

  _eventPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * this.canvas.width,
      y: (event.clientY - rect.top) / rect.height * this.canvas.height
    };
  }

  _tipPoint() {
    const center = this._center();
    const direction = normalizeDirection(this.direction);
    const projected = this._project(new THREE.Vector3(direction.x, direction.y, direction.z));
    return { x: center.x + projected.x, y: center.y + projected.y };
  }

  _center() {
    return { x: this.canvas.width * 0.5, y: this.canvas.height * 0.56 };
  }

  _project(point) {
    return {
      x: point.dot(RIGHT) * 76,
      y: -point.dot(UP) * 76
    };
  }

  _draw() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const center = this._center();
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(center.x, center.y);
    this._drawCube(ctx);

    const direction = normalizeDirection(this.direction);
    const tip = this._project(new THREE.Vector3(direction.x, direction.y, direction.z));
    const length = Math.hypot(tip.x, tip.y);
    const ux = length > 1e-5 ? tip.x / length : 1;
    const uy = length > 1e-5 ? tip.y / length : 0;
    const start = 10;
    const endX = tip.x;
    const endY = tip.y;

    ctx.strokeStyle = '#ffb166';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255, 177, 102, 0.55)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(ux * start, uy * start);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    const head = 12;
    const angle = Math.atan2(uy, ux);
    ctx.fillStyle = '#ffd08c';
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - Math.cos(angle - 0.48) * head, endY - Math.sin(angle - 0.48) * head);
    ctx.lineTo(endX - Math.cos(angle + 0.48) * head, endY - Math.sin(angle + 0.48) * head);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(224, 248, 240, 0.86)';
    ctx.font = '600 10px "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('来流', endX + ux * 20, endY + uy * 20 - 5);
    ctx.restore();
  }

  _drawCube(ctx) {
    const vertices = [];
    for (const x of [-CUBE, CUBE]) {
      for (const y of [-CUBE, CUBE]) {
        for (const z of [-CUBE, CUBE]) {
          vertices.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const projected = vertices.map(vertex => this._project(vertex));
    const edges = [
      [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
      [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
    ];
    ctx.strokeStyle = 'rgba(128, 229, 212, 0.55)';
    ctx.lineWidth = 1;
    for (const [a, b] of edges) {
      ctx.beginPath();
      ctx.moveTo(projected[a].x, projected[a].y);
      ctx.lineTo(projected[b].x, projected[b].y);
      ctx.stroke();
    }

    const labels = [
      { text: 'X', point: new THREE.Vector3(0.86, 0, 0), color: '#e1766a' },
      { text: 'Y', point: new THREE.Vector3(0, 0.86, 0), color: '#7bd8ad' },
      { text: 'Z', point: new THREE.Vector3(0, 0, 0.86), color: '#6daee2' }
    ];
    ctx.font = '600 9px "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    for (const label of labels) {
      const projectedLabel = this._project(label.point);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, projectedLabel.x, projectedLabel.y);
    }
  }

  dispose() {
    this._events.abort();
  }
}

function normalizeDirection(direction) {
  const vector = new THREE.Vector3(
    Number(direction?.x) || 0,
    Number(direction?.y) || 0,
    Number(direction?.z) || 0
  );
  if (vector.lengthSq() < 1e-8) vector.set(-1, 0, 0);
  return {
    x: vector.x / vector.length(),
    y: vector.y / vector.length(),
    z: vector.z / vector.length()
  };
}

function roundComponent(value) {
  return Math.round(value * 100) / 100;
}
