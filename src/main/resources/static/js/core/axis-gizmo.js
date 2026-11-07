import * as THREE from 'three';

const AXES = [
  { label: 'X', vector: new THREE.Vector3(1, 0, 0), color: '#e1766a' },
  { label: 'Y', vector: new THREE.Vector3(0, 1, 0), color: '#7bd8ad' },
  { label: 'Z', vector: new THREE.Vector3(0, 0, 1), color: '#6daee2' }
];

/**
 * Screen-corner orientation indicator. It only reads a camera transform and
 * deliberately owns no scene objects, so the same widget works for every view.
 */
export class AxisGizmo {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.center = canvas.width * 0.5;
    this.radius = canvas.width * 0.29;
    this._inverse = new THREE.Quaternion();
    this._screen = new THREE.Vector2();
  }

  render(camera) {
    if (!camera || !this.ctx) return;
    const ctx = this.ctx;
    const size = this.canvas.width;
    const center = this.center;
    ctx.clearRect(0, 0, size, size);
    this._inverse.copy(camera.quaternion).invert();

    const entries = AXES.map(axis => {
      const direction = axis.vector.clone().applyQuaternion(this._inverse);
      return { ...axis, direction };
    }).sort((a, b) => b.direction.z - a.direction.z);

    ctx.save();
    ctx.translate(center, center);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 1.12, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(144, 191, 196, 0.16)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    for (const entry of entries) {
      const direction = entry.direction;
      this._screen.set(direction.x, -direction.y);
      const magnitude = this._screen.length();
      const depthScale = 0.84 + 0.16 * (1 - (direction.z + 1) * 0.5);
      const length = this.radius * depthScale;

      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-this._screen.x * length * 0.48, -this._screen.y * length * 0.48);
      ctx.stroke();

      ctx.globalAlpha = 1;
      if (magnitude < 0.06) {
        ctx.fillStyle = entry.color;
        ctx.beginPath();
        ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const x = this._screen.x * length;
        const y = this._screen.y * length;
        ctx.strokeStyle = entry.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(x, y);
        ctx.stroke();
        this._arrow(ctx, x, y, this._screen.x, this._screen.y, entry.color);
      }

      const labelDistance = magnitude < 0.06 ? 0 : length + 12;
      ctx.fillStyle = entry.color;
      ctx.font = '600 17px "SFMono-Regular", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.label, this._screen.x * labelDistance, this._screen.y * labelDistance);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d8eee9';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _arrow(ctx, x, y, dx, dy, color) {
    const angle = Math.atan2(dy, dx);
    const size = 7.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x - Math.cos(angle - 0.48) * size,
      y - Math.sin(angle - 0.48) * size
    );
    ctx.lineTo(
      x - Math.cos(angle + 0.48) * size,
      y - Math.sin(angle + 0.48) * size
    );
    ctx.closePath();
    ctx.fill();
  }
}
