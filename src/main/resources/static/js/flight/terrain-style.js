const HYPSOMETRIC_BANDS = [
  { max: 0, color: [42, 76, 96] },
  { max: 12, color: [83, 116, 70] },
  { max: 45, color: [83, 130, 73] },
  { max: 90, color: [104, 146, 76] },
  { max: 150, color: [143, 157, 88] },
  { max: 220, color: [183, 166, 102] },
  { max: 300, color: [170, 133, 89] },
  { max: 400, color: [139, 113, 97] },
  { max: 500, color: [168, 158, 149] },
  { max: Infinity, color: [224, 228, 224] }
];

const ROCK = [105, 102, 94];
const SNOW = [224, 229, 228];

export function hypsometricColor(height) {
  for (const band of HYPSOMETRIC_BANDS) {
    if (height < band.max) return band.color;
  }
  return HYPSOMETRIC_BANDS.at(-1).color;
}

export function terrainColor(height, slope, variation) {
  let color = [...hypsometricColor(height)];

  if (slope > 0.34) {
    const mix = Math.min(0.78, (slope - 0.34) / 0.85);
    color = mixColor(color, ROCK, mix);
  }
  if (height > 400 && slope < 1.05) {
    const snowLine = Math.min(0.85, (height - 400) / 180);
    color = mixColor(color, SNOW, snowLine * 0.9);
  } else if (height > 4 && slope < 0.2 && height < 80) {
    color = mixColor(color, [76, 130, 70], 0.18);
  }

  const shift = (variation - 0.5) * 12;
  return color.map(channel => Math.max(0, Math.min(255, Math.round(channel + shift))));
}

export function biomeLabel(name) {
  return {
    PLAINS: '平原',
    HILLS: '丘陵',
    MOUNTAINS: '山地',
    PLATEAU: '高原'
  }[name] ?? '未知地形';
}

function mixColor(a, b, amount) {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount
  ];
}
