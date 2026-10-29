import * as THREE from 'three';
import { toonMaterial, addOutlines } from '../render/toon.js';

/**
 * Zonas de la casa: ambiente (fondo, luz) y colores y tipos de los juguetes sueltos.
 * Los mapas (arena/maps/handmade.js) eligen su zona; el resto del aspecto lo pone cada mapa.
 */

function canvasTexture(size, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// --- Juguetes y objetos sueltos (física: caja o esfera) -----------------------

const t = (color, map) => toonMaterial(color, map);
const mesh = (geometry, material, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
};
const diceTexture = canvasTexture(128, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#d7263d';
  for (const [x, y] of [[0.25, 0.25], [0.75, 0.75], [0.5, 0.5], [0.75, 0.25], [0.25, 0.75]]) { g.beginPath(); g.arc(x * s, y * s, 11, 0, Math.PI * 2); g.fill(); }
});
const beachTexture = canvasTexture(128, (g, s) => {
  ['#e63946', '#fff', '#1d7cf2', '#fff', '#f4b400', '#fff'].forEach((c, i) => { g.fillStyle = c; g.fillRect((i * s) / 6, 0, s / 6 + 1, s); });
});
const footballTexture = canvasTexture(128, (g, s) => {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1b1b1b';
  for (const [x, y] of [[0.2, 0.3], [0.6, 0.2], [0.45, 0.65], [0.85, 0.6], [0.1, 0.8]]) {
    g.beginPath();
    for (let p = 0; p < 5; p++) g.lineTo(x * s + Math.cos(p * 1.256) * 12, y * s + Math.sin(p * 1.256) * 12);
    g.fill();
  }
});
const cerealTexture = canvasTexture(128, (g, s) => {
  g.fillStyle = '#ffb703'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#e63946'; g.fillRect(0, 10, s, 30);
  g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText('CEREAL', 18, 33);
  g.fillStyle = '#fff3c4';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(30 + (i % 3) * 34, 70 + Math.floor(i / 3) * 30, 11, 0, Math.PI * 2); g.fill(); }
});

const PROPS = {
  dado: { shape: { box: [0.28, 0.28, 0.28] }, build: () => mesh(new THREE.BoxGeometry(0.56, 0.56, 0.56), t(0xffffff, diceTexture)) },
  pelota: { shape: { sphere: 0.3 }, build: () => mesh(new THREE.SphereGeometry(0.3, 20, 14), t(0xffffff, beachTexture)) },
  libro: {
    shape: { box: [0.3, 0.08, 0.22] },
    build: (color) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.16, 0.44), t(color)));
      g.add(mesh(new THREE.BoxGeometry(0.54, 0.12, 0.45), t(0xfff8e6), [0.02, 0, 0]));
      return g;
    },
  },
  cojin: {
    shape: { box: [0.34, 0.1, 0.34] },
    build: (color) => {
      const m = mesh(new THREE.SphereGeometry(0.36, 18, 10), t(color)); // esfera aplastada
      m.scale.set(1, 0.3, 1);
      return m;
    },
  },
  naranja: {
    shape: { sphere: 0.26 },
    build: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.26, 18, 14), t(0xff8c1a)));
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.12, 6), t(0x2bb673), [0, 0.28, 0], [0, 0, 0.6]));
      return g;
    },
  },
  taza: {
    shape: { box: [0.22, 0.2, 0.22] },
    build: (color) => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 18), t(color)));
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16), t(color), [0, 0, 0.25]));
      return g;
    },
  },
  cereal: { shape: { box: [0.2, 0.3, 0.09] }, build: () => mesh(new THREE.BoxGeometry(0.4, 0.6, 0.18), t(0xffffff, cerealTexture)) },
  balon: { shape: { sphere: 0.3 }, build: () => mesh(new THREE.SphereGeometry(0.3, 20, 14), t(0xffffff, footballTexture)) },
  maceta: {
    shape: { box: [0.22, 0.3, 0.22] },
    build: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.34, 14), t(0xc8693b), [0, -0.12, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.26, 14, 10), t(0x3fae49), [0, 0.18, 0]));
      return g;
    },
  },
  patito: {
    shape: { sphere: 0.27 },
    build: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.25, 18, 14), t(0xffd23f)));
      g.add(mesh(new THREE.SphereGeometry(0.15, 16, 12), t(0xffd23f), [0.13, 0.22, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.14, 8), t(0xff7f11), [0.3, 0.2, 0], [0, 0, -Math.PI / 2]));
      return g;
    },
  },
  jabon: { shape: { box: [0.2, 0.09, 0.13] }, build: (color) => mesh(new THREE.BoxGeometry(0.4, 0.18, 0.26), t(color)) },
};

export const THEMES = Object.freeze({
  salon: {
    id: 'salon', name: 'Salón',
    background: 0x4a2e2a,
    sky: 0xfff1dc, ground: 0x6b4a2e, sun: 1.7,
    blocks: [0xe63946, 0x1d7cf2, 0xf4b400, 0x2bb673, 0x9b5de5, 0xff7f11],
    props: ['dado', 'libro', 'cojin', 'pelota'],
  },
  cocina: {
    id: 'cocina', name: 'Cocina',
    background: 0x8fb8c9,
    sky: 0xffffff, ground: 0x9c8b7a, sun: 1.6,
    blocks: [0xf28482, 0x84a59d, 0xf6bd60, 0x90be6d, 0xb5838d, 0x6d9dc5],
    props: ['naranja', 'taza', 'cereal'],
  },
  patio: {
    id: 'patio', name: 'Patio',
    background: 0x8ecae6,
    sky: 0xe0f4ff, ground: 0x5a8f3c, sun: 2,
    blocks: [0xe63946, 0xffb703, 0x219ebc, 0xfb8500, 0x8338ec, 0xff006e],
    props: ['balon', 'maceta', 'pelota'],
  },
  dormitorio: {
    id: 'dormitorio', name: 'Dormitorio',
    background: 0x2f2b55,
    sky: 0xd9d4ff, ground: 0x4b3f72, sun: 1.5,
    blocks: [0xff8fab, 0x80ed99, 0xffd166, 0x48cae4, 0xc77dff, 0xff9f1c],
    props: ['dado', 'cojin', 'libro', 'pelota'],
  },
  oeste: {
    id: 'oeste', name: 'Oeste',
    background: 0xe9c48c,
    sky: 0xfff0d2, ground: 0xb5834e, sun: 1.9,
    blocks: [0xb5651d, 0x8c4b1f, 0xd9a066, 0x6b8e23, 0xc0392b, 0xe1b15b],
    props: ['naranja'],
  },
  barbie: {
    id: 'barbie', name: 'Mundo Barbie',
    background: 0xffc8e4,
    sky: 0xfff0f8, ground: 0xd98cb3, sun: 1.75,
    blocks: [0xff5fa2, 0xffb3d9, 0xc77dff, 0x80ffdb, 0xffd166, 0xffffff],
    props: ['cojin'],
  },
  recreativos: {
    id: 'recreativos', name: 'Recreativos',
    background: 0x07040f,
    sky: 0x9a7cff, ground: 0x1a0a2a, sun: 0.9,
    blocks: [0xff2bd6, 0x2bf0ff, 0xffe62b, 0x7cff4f, 0xff7a2b, 0xffffff],
    props: ['pelota'],
  },
  piratas: {
    id: 'piratas', name: 'Isla pirata',
    background: 0x7fd3f0,
    sky: 0xf4fbff, ground: 0xc9a86a, sun: 1.9,
    blocks: [0xc0392b, 0x2c3e50, 0xf1c40f, 0x8e5a2b, 0x16a085, 0xecf0f1],
    props: ['naranja'],
  },
  espacio: {
    id: 'espacio', name: 'Base lunar',
    background: 0x0c0f24,
    sky: 0xc9d4ff, ground: 0x3a3a48, sun: 1.6,
    blocks: [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xffffff],
    props: ['pelota'],
  },
  dulces: {
    id: 'dulces', name: 'País de las golosinas',
    background: 0xffd6ec,
    sky: 0xfff4fb, ground: 0x7a3e20, sun: 1.8,
    blocks: [0xff7eb6, 0x7ee0ff, 0xfff07e, 0xb6ff7e, 0xd6a6ff, 0xffffff],
    props: ['cojin'],
  },
  halloween: {
    id: 'halloween', name: 'Cementerio encantado',
    background: 0x231a38,
    sky: 0x8f86e0, ground: 0x1e1830, sun: 1.0,
    blocks: [0xff7a1a, 0x8e5cff, 0x3ddc84, 0xffd23f, 0x2b2b3a, 0xe8e2ff],
    props: ['naranja'],
  },
  cuarto: {
    id: 'cuarto', name: 'Cuarto de juegos',
    background: 0xf3e3c8,
    sky: 0xfff8ec, ground: 0xb07a4a, sun: 1.75,
    blocks: [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xb197fc, 0xff922b],
    props: ['dado', 'pelota', 'cojin'],
  },
  selva: {
    id: 'selva', name: 'Selva azteca',
    background: 0x9fd8b8,
    sky: 0xf2fff0, ground: 0x3f7a3a, sun: 1.8,
    blocks: [0x2d6a4f, 0x95d5b2, 0xe76f51, 0xf4a261, 0xe9c46a, 0x264653],
    props: ['naranja'],
  },
  bano: {
    id: 'bano', name: 'Baño',
    background: 0xbfe3e8,
    sky: 0xffffff, ground: 0x7aa6b0, sun: 1.6,
    blocks: [0x4cc9f0, 0xf72585, 0xffd60a, 0x80ffdb, 0x7209b7, 0xff9e00],
    props: ['patito', 'jabon'],
  },
});

export const THEME_IDS = Object.keys(THEMES);

export const hasPropType = (type) => Boolean(PROPS[type]);

/** Crea la malla de un juguete suelto de la zona y su forma física (de un tipo concreto, si se pide). */
export function buildProp(theme, index, forcedType = null) {
  const type = forcedType ?? theme.props[index % theme.props.length];
  const kind = PROPS[type];
  const color = theme.blocks[(index * 3) % theme.blocks.length];
  const object = kind.build(color);
  object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  addOutlines(object);
  return { object, shape: kind.shape, type };
}
