import { hypsometricColor } from './terrain-style.js';

export class FlightMinimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.chunks = new Map();
    this.chunkSize = 512;
    this.radius = 3;
    this._lastDraw = 0;
    this._image = this.ctx.createImageData(this.size, this.size);
    this._state = null;
  }

  update(state, mapData) {
    this._state = state;
    if (mapData) {
      this.chunks = mapData.chunks;
      this.chunkSize = mapData.chunkSize;
      this.radius = mapData.radius;
    }
    const now = performance.now();
    if (now - this._lastDraw < 180) return;
    this._lastDraw = now;
    this._draw(state);
  }

  setView(radius, chunkSize) {
    this.radius = radius;
    this.chunkSize = chunkSize;
    if (this._state) this.update(this._state, null);
  }

  _draw(state) {
    const ctx = this.ctx;
    const size = this.size;
    const center = size * 0.5;
    const visibleRadius = Math.max(640, this.chunkSize * (this.radius + 0.8));
    const scale = center / visibleRadius;
    const position = state.position;
    const data = this._image.data;

    if (this.chunks.size === 0) {
      ctx.fillStyle = '#07141a';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(112, 157, 158, 0.7)';
      ctx.font = '12px "SFMono-Regular", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('等待地形区块', center, center);
      return;
    }

    const sample = (worldX, worldZ) => this._sampleHeight(worldX, worldZ);

    for (let py = 0; py < size; py++) {
      const worldZ = position.z + (py - center) / scale;
      for (let px = 0; px < size; px++) {
        const worldX = position.x - (px - center) / scale;
        const height = sample(worldX, worldZ);
        const index = (py * size + px) * 4;
        if (height === null) {
          data[index] = 6;
          data[index + 1] = 17;
          data[index + 2] = 22;
          data[index + 3] = 255;
          continue;
        }

        const heightRight = sample(worldX + 14, worldZ);
        const heightDown = sample(worldX, worldZ + 14);
        const shadeBase = 0.86
          + (height - (heightRight ?? height)) * 0.006
          + (height - (heightDown ?? height)) * 0.004;
        const shade = Math.max(0.64, Math.min(1.16, shadeBase));
        const color = hypsometricColor(height);
        const contour = heightRight !== null
          && Math.floor(height / 50) !== Math.floor(heightRight / 50);
        const edge = contour ? 0.8 : 1;
        data[index] = Math.max(0, Math.min(255, color[0] * shade * edge));
        data[index + 1] = Math.max(0, Math.min(255, color[1] * shade * edge));
        data[index + 2] = Math.max(0, Math.min(255, color[2] * shade * edge));
        data[index + 3] = 255;
      }
    }
    ctx.putImageData(this._image, 0, 0);

    ctx.strokeStyle = 'rgba(197, 224, 218, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, center * 0.46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, center * 0.8, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232, 250, 244, 0.86)';
    ctx.font = 'bold 10px "SFMono-Regular", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', center, 14);
    ctx.beginPath();
    ctx.moveTo(center, 19);
    ctx.lineTo(center - 3, 25);
    ctx.lineTo(center + 3, 25);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((state.headingDeg * Math.PI) / 180);
    ctx.fillStyle = '#fff3c9';
    ctx.strokeStyle = 'rgba(8, 24, 29, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255, 243, 201, 0.4)';
    ctx.beginPath();
    ctx.arc(center, center, 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  _sampleHeight(x, z) {
    if (!this.chunkSize) return null;
    const chunkX = Math.floor(x / this.chunkSize);
    const chunkZ = Math.floor(z / this.chunkSize);
    const chunk = this.chunks.get(`${chunkX},${chunkZ}`);
    if (!chunk) return null;
    const stepX = chunk.sizeX / (chunk.resolution - 1);
    const stepZ = chunk.sizeZ / (chunk.resolution - 1);
    const gx = Math.max(0, Math.min(chunk.resolution - 1, (x - chunk.originX) / stepX));
    const gz = Math.max(0, Math.min(chunk.resolution - 1, (z - chunk.originZ) / stepZ));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(x0 + 1, chunk.resolution - 1);
    const z1 = Math.min(z0 + 1, chunk.resolution - 1);
    const fx = gx - x0;
    const fz = gz - z0;
    const a = chunk.heights[z0 * chunk.resolution + x0];
    const b = chunk.heights[z0 * chunk.resolution + x1];
    const c = chunk.heights[z1 * chunk.resolution + x0];
    const d = chunk.heights[z1 * chunk.resolution + x1];
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fz;
  }
}
