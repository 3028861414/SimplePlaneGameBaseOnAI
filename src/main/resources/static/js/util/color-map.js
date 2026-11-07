const PRESSURE_STOPS = [
  [0.0, '#282a92'],
  [0.16, '#1857c7'],
  [0.32, '#1195d5'],
  [0.46, '#16c7b6'],
  [0.55, '#58d36f'],
  [0.68, '#efd447'],
  [0.82, '#f28a35'],
  [1.0, '#d42c2f']
];

const SPEED_STOPS = [
  [0.0, '#071a33'],
  [0.16, '#123f70'],
  [0.32, '#177b95'],
  [0.48, '#20b5a0'],
  [0.62, '#7fd266'],
  [0.76, '#f2dc4b'],
  [0.9, '#ff9b34'],
  [1.0, '#ed4936']
];

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function sampleStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (clamped <= stops[i][0]) {
      const [t0, hex0] = stops[i - 1];
      const [t1, hex1] = stops[i];
      const local = (clamped - t0) / Math.max(t1 - t0, 1e-8);
      const a = hexToRgb(hex0);
      const b = hexToRgb(hex1);
      return [
        a[0] + (b[0] - a[0]) * local,
        a[1] + (b[1] - a[1]) * local,
        a[2] + (b[2] - a[2]) * local
      ];
    }
  }
  return hexToRgb(stops.at(-1)[1]);
}

export function pressureColor(t) {
  return sampleStops(PRESSURE_STOPS, t);
}

export function speedColor(t) {
  return sampleStops(SPEED_STOPS, t);
}

export function cssGradient(stops, direction = 'to right') {
  const list = stops.map(([position, color]) => `${color} ${(position * 100).toFixed(1)}%`);
  return `linear-gradient(${direction}, ${list.join(', ')})`;
}

export function pressureGradient() {
  return cssGradient(PRESSURE_STOPS);
}

export function speedGradient() {
  return cssGradient(SPEED_STOPS);
}

export function srgbToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function rgbCss(rgb, alpha = 1) {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha})`;
}
