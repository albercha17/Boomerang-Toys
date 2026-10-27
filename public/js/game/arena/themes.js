import * as THREE from 'three';
import { toonMaterial, addOutlines } from '../render/toon.js';

/**
 * Ambientaciones: zonas de la casa donde se juega. Cada una tiene su suelo (pintado a lo dibujo animado),
 * el color de alrededor, la luz, los colores de los bloques, los juguetes sueltos y algo de decorado
 * fuera de la zona de juego.
 */
const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;

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

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Suelos (cada textura cubre 4×4 casillas) --------------------------------

const FLOORS = {
  planks: (g, s) => {
    const tones = [0xd99a5b, 0xcf8e4f, 0xe0a466, 0xc98a4c];
    const h = s / 8;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = css(tones[i % 4]);
      g.fillRect(0, i * h, s, h);
      g.fillStyle = '#7a4a26';
      g.fillRect(0, i * h + h - 4, s, 4);
      g.fillRect((i * 173) % s, i * h, 4, h);
      g.strokeStyle = 'rgba(122, 74, 38, 0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc((i * 97) % s, i * h + h / 2, 10, 0, Math.PI * 2);
      g.stroke();
    }
  },
  tiles: (a, b) => (g, s) => {
    const n = 4;
    const t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = css((x + y) % 2 ? a : b);
      g.fillRect(x * t, y * t, t, t);
    }
    g.strokeStyle = '#6b5b4e';
    g.lineWidth = 6;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * t); g.lineTo(s, i * t); g.stroke();
    }
  },
  smallTiles: (color, grout) => (g, s) => {
    g.fillStyle = css(grout);
    g.fillRect(0, 0, s, s);
    const n = 8;
    const t = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = css(color);
      g.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x * t + 6, y * t + 6, t * 0.3, 5);
    }
  },
  grass: (g, s) => {
    g.fillStyle = '#62c35b';
    g.fillRect(0, 0, s, s);
    const rnd = seeded(9);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      g.strokeStyle = rnd() < 0.5 ? '#4aa845' : '#7ed672';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y - 9); g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = ['#fff', '#ffd23f', '#ff8fc7'][i % 3];
      const x = rnd() * s; const y = rnd() * s;
      for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(x + Math.cos(p * 1.26) * 6, y + Math.sin(p * 1.26) * 6, 4, 0, Math.PI * 2); g.fill(); }
    }
  },
  carpet: (base, star) => (g, s) => {
    g.fillStyle = css(base);
    g.fillRect(0, 0, s, s);
    const rnd = seeded(4);
    g.fillStyle = css(star);
    for (let i = 0; i < 18; i++) {
      const x = rnd() * s; const y = rnd() * s; const r = 8 + rnd() * 8;
      g.beginPath();
      for (let p = 0; p < 10; p++) {
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = p % 2 ? r * 0.45 : r;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 400; i++) g.fillRect(rnd() * s, rnd() * s, 2, 2);
  },
};

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

// --- Decorado fuera de la zona de juego -------------------------------------------

/** Cajas y piezas simples a lo largo del borde de arriba (al fondo), fuera de la zona de juego. */
const DECOR = {
  salon: (add, w) => {
    add(new THREE.BoxGeometry(w * 0.45, 1.6, 2.2), 0x7b4fa0, [-w * 0.15, 0.8, 0]); // sofá
    add(new THREE.BoxGeometry(w * 0.45, 1.4, 0.8), 0x6a3f8e, [-w * 0.15, 1.4, -0.9]);
    for (const x of [-0.34, -0.15, 0.04]) add(new THREE.BoxGeometry(1.6, 0.7, 1.2), 0xf4b400, [x * w, 1.8, 0.1]); // cojines
    add(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 10), 0x3b2a1e, [w * 0.3, 1.6, 0]); // lámpara
    add(new THREE.ConeGeometry(1, 1.2, 18, 1, true), 0xffe8a3, [w * 0.3, 3.4, 0]);
  },
  cocina: (add, w) => {
    for (let i = -3; i <= 2; i++) {
      add(new THREE.BoxGeometry(w / 7.2, 1.9, 1.8), 0xf1e3c8, [i * (w / 7) + w / 14, 0.95, 0]); // muebles
      add(new THREE.BoxGeometry(0.5, 0.12, 0.12), 0x6b5b4e, [i * (w / 7) + w / 14, 1.5, 0.95]); // tiradores
    }
    add(new THREE.BoxGeometry(w * 1.05, 0.15, 2), 0x8d6e63, [0, 1.95, 0]); // encimera
    add(new THREE.BoxGeometry(2.4, 4.2, 2), 0xdfe9ee, [w * 0.47, 2.1, 0]); // nevera
  },
  patio: (add, w) => {
    for (let x = -w / 2; x <= w / 2; x += 1.6) add(new THREE.BoxGeometry(0.4, 1.8, 0.2), 0xf5f0e1, [x, 0.9, 0]); // valla
    add(new THREE.BoxGeometry(w, 0.2, 0.15), 0xf5f0e1, [0, 1.4, 0]);
    for (const x of [-0.4, -0.1, 0.25, 0.42]) add(new THREE.SphereGeometry(1.3, 14, 10), 0x2f9e44, [x * w, 1, 1.2]); // arbustos
  },
  dormitorio: (add, w) => {
    add(new THREE.BoxGeometry(w * 0.5, 1.2, 3), 0xf4f1ea, [-w * 0.18, 0.6, 0]); // cama
    add(new THREE.BoxGeometry(w * 0.5, 0.5, 2.4), 0x1d7cf2, [-w * 0.18, 1.3, 0.3]); // manta
    add(new THREE.BoxGeometry(2, 0.5, 1.4), 0xffffff, [-w * 0.38, 1.4, -0.4]); // almohada
    add(new THREE.BoxGeometry(3, 1.6, 1.8), 0xc8693b, [w * 0.3, 0.8, 0]); // baúl de juguetes
    add(new THREE.BoxGeometry(3.1, 0.25, 1.9), 0xf4b400, [w * 0.3, 1.65, 0]);
  },
  bano: (add, w) => {
    add(new THREE.BoxGeometry(w * 0.55, 1.6, 3), 0xffffff, [-w * 0.12, 0.8, 0]); // bañera
    add(new THREE.BoxGeometry(w * 0.5, 0.2, 2.4), 0x7fd3e8, [-w * 0.12, 1.55, 0]); // agua
    add(new THREE.BoxGeometry(0.2, 2.4, 1.4), 0xff6fb5, [w * 0.35, 1.2, 0.4]); // toalla
    add(new THREE.CylinderGeometry(0.7, 0.5, 1.2, 16), 0xffffff, [w * 0.25, 0.6, 0]); // lavabo
  },
};

export const THEMES = Object.freeze({
  salon: {
    id: 'salon', name: 'Salón',
    floor: FLOORS.planks, outside: 0x7a3b3b, background: 0x4a2e2a,
    sky: 0xfff1dc, ground: 0x6b4a2e, sun: 1.7,
    blocks: [0xe63946, 0x1d7cf2, 0xf4b400, 0x2bb673, 0x9b5de5, 0xff7f11], border: 0xc58b54, pillar: 0xe7bf86,
    props: ['dado', 'libro', 'cojin', 'pelota'],
  },
  cocina: {
    id: 'cocina', name: 'Cocina',
    floor: FLOORS.tiles(0xfff3d6, 0xe07a5f), outside: 0x9c6b52, background: 0x8fb8c9,
    sky: 0xffffff, ground: 0x9c8b7a, sun: 1.6,
    blocks: [0xf28482, 0x84a59d, 0xf6bd60, 0x90be6d, 0xb5838d, 0x6d9dc5], border: 0xe9d8a6, pillar: 0xdfe9ee,
    props: ['naranja', 'taza', 'cereal'],
  },
  patio: {
    id: 'patio', name: 'Patio',
    floor: FLOORS.grass, outside: 0xc9a66b, background: 0x8ecae6,
    sky: 0xe0f4ff, ground: 0x5a8f3c, sun: 2,
    blocks: [0xe63946, 0xffb703, 0x219ebc, 0xfb8500, 0x8338ec, 0xff006e], border: 0xa47148, pillar: 0x8b5a2b,
    props: ['balon', 'maceta', 'pelota'],
  },
  dormitorio: {
    id: 'dormitorio', name: 'Dormitorio',
    floor: FLOORS.carpet(0x8e7dbe, 0xfff3b0), outside: 0xb08a6a, background: 0x2f2b55,
    sky: 0xd9d4ff, ground: 0x4b3f72, sun: 1.5,
    blocks: [0xff8fab, 0x80ed99, 0xffd166, 0x48cae4, 0xc77dff, 0xff9f1c], border: 0xddb892, pillar: 0xf4f1ea,
    props: ['dado', 'cojin', 'libro', 'pelota'],
  },
  bano: {
    id: 'bano', name: 'Baño',
    floor: FLOORS.smallTiles(0x7fd3e8, 0xf4fbfc), outside: 0xe9f5f7, background: 0xbfe3e8,
    sky: 0xffffff, ground: 0x7aa6b0, sun: 1.6,
    blocks: [0x4cc9f0, 0xf72585, 0xffd60a, 0x80ffdb, 0x7209b7, 0xff9e00], border: 0xf4fbfc, pillar: 0xffffff,
    props: ['patito', 'jabon'],
  },
});

export const THEME_IDS = Object.keys(THEMES);

export function floorTexture(theme) {
  return canvasTexture(512, theme.floor);
}

/** Crea la malla de un juguete suelto de la zona y su forma física. */
export function buildProp(theme, index) {
  const type = theme.props[index % theme.props.length];
  const kind = PROPS[type];
  const color = theme.blocks[(index * 3) % theme.blocks.length];
  const object = kind.build(color);
  object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  addOutlines(object);
  return { object, shape: kind.shape, type };
}

/** Decorado del fondo (fuera de la zona de juego y del tope invisible). */
export function buildDecor(theme, width) {
  const group = new THREE.Group();
  DECOR[theme.id]?.((geometry, color, pos) => {
    const m = new THREE.Mesh(geometry, toonMaterial(color));
    m.position.set(...pos);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }, width);
  addOutlines(group, 0.04);
  return group;
}
