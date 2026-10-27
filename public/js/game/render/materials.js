import * as THREE from 'three';

export const COLORS = Object.freeze({
  wood: 0xf0c991,
  ink: 0x2a1d14,
  border: 0xc58b54,
  table: 0x3b2a1e,
});

// Materiales compartidos por color: no se modifican nunca, se cambian por otro.
const cache = new Map();
function cached(key, create) {
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key);
}

/** Plástico brillante de juguete. */
export function plastic(color) {
  return cached(`plastic:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 }));
}

/** Acabado mate (madera, pintura). */
export function matte(color) {
  return cached(`matte:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
}

/** Sin iluminación (partículas y marcas en el suelo). */
export function flat(color) {
  return cached(`flat:${color}`, () => new THREE.MeshBasicMaterial({ color }));
}

export function darker(color, factor = 0.65) {
  return new THREE.Color(color).multiplyScalar(factor).getHex();
}

/** Textura de listones de madera dibujada por código. */
export function createPlankTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const tones = ['#d8b385', '#caa375', '#d3ad7f', '#c99f70'];
  const plank = size / 8;
  for (let i = 0; i < 8; i++) {
    const y = i * plank;
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, y, size, plank);
    g.strokeStyle = 'rgba(120, 85, 50, 0.18)';
    g.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      const yy = y + 8 + k * 11 + ((i * 7 + k * 3) % 5);
      g.beginPath();
      g.moveTo(0, yy);
      g.bezierCurveTo(size * 0.25, yy - 4, size * 0.75, yy + 5, size, yy - 1);
      g.stroke();
    }
    g.fillStyle = 'rgba(90, 60, 35, 0.55)';
    g.fillRect(0, y + plank - 2, size, 2);
    g.fillRect((i * 173) % size, y, 2, plank);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
