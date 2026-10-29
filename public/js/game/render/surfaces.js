import * as THREE from 'three';
import { LIGHT, NEW_LIGHT } from './lightMode.js';

/**
 * Superficies de la base de los mapas (suelo, terreno de fuera, paredes, mesa): texturas de verdad (Poly Haven, CC0;
 * public/art/superficies/<tipo>/ color, normal y rugosidad) repetidas cada `tile` unidades y teñidas para que
 * encajen con el estilo de juguete. Se ven con la luz del juego (con sombras en tiempo real); de la base horneada
 * solo se usan las sombras suaves de las esquinas (aoMap).
 */
const KINDS = {
  hierba: { tile: 3.5, tint: 0xbfe8a0, rough: 1 },
  arena: { tile: 4, tint: 0xf0dcc4, rough: 1 },
  playa: { tile: 4, tint: 0xfff0d0, rough: 1 },
  arena_rosa: { dir: 'playa', tile: 4, tint: 0xffc2dc, rough: 1 }, // alrededor del mundo Barbie (`dir`: carpeta de otra textura)
  noche: { tile: 4, tint: 0x6b7f96, rough: 1 },
  luna: { tile: 5, tint: 0xd8d8e4, rough: 1 },
  chocolate: { tile: 3, tint: 0x8a4a28, rough: 0.55 },
  baldosas: { tile: 2.4, tint: 0xd8ecff, rough: 0.45, gain: 1.9 }, // gain: aclara la textura (es oscura)
  rosa: { tile: 2.4, tint: 0xffc0dc, rough: 0.6 },
  azulejo_pared: { tile: 1.6, tint: 0xeef6ff, rough: 0.35, gain: 1.3 },
  mesa: { tile: 6, tint: 0xffe2bf, rough: 0.8 },
  parquet: { tile: 3, tint: 0xffffff, rough: 0.8 },
};

/** Qué superficie lleva cada pieza de la base, por su nombre (como las crea herramientas/blender/hornear_base.py). */
export function surfaceKind(name, data) {
  const floor = data.room?.floor ?? 'baldosas';
  if (/tablero|pata/.test(name)) return 'mesa';
  if (/pared/.test(name)) return 'azulejo_pared';
  if (/fuera/.test(name)) return { arena: 'arena', hierba: 'hierba', rosa: 'arena_rosa', alfombra: 'parquet', noche: 'noche', luna: 'luna', chocolate: 'chocolate', playa: 'mar', arcade: 'arcade' }[floor] ?? null;
  if (/suelo/.test(name)) return data.room ? floor : 'baldosas';
  return null;
}

const loader = new THREE.TextureLoader();
const TEXTURES = {};
function textureSet(kind) {
  const dir = KINDS[kind]?.dir ?? kind;
  if (!TEXTURES[kind]) {
    const load = (file, color) => {
      const t = loader.load(`/art/superficies/${dir}/${file}`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    TEXTURES[kind] = { map: load('color.jpg', true), normalMap: load('normal.jpg'), roughnessMap: load('rugosidad.jpg') };
  }
  return TEXTURES[kind];
}

/** Material de una superficie (nuevo cada vez: lleva su propio aoMap). Sin tipo conocido, null. */
export function surfaceMaterial(kind, data) {
  if (kind === 'mar') return new THREE.MeshStandardMaterial({ color: 0x2a8fbf, roughness: 0.18, metalness: 0.05 });
  if (kind === 'arcade') {
    // Suelo de recreativos de los 80: moqueta oscura con rejilla de neón (dibujada; la rejilla brilla sola)
    const map = arcadeTexture();
    return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.85 });
  }
  if (kind === 'alfombra') {
    const map = loader.load('/art/suelos/alfombra.png');
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  }
  const def = KINDS[kind];
  if (!def) return null;
  const t = textureSet(kind);
  const color = new THREE.Color(def.tint).multiplyScalar(def.gain ?? 1);
  return new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, color, roughness: def.rough,
    normalScale: new THREE.Vector2(0.8, 0.8), envMapIntensity: NEW_LIGHT ? LIGHT.env * 0.6 : 1,
  });
}

let ARCADE = null;
function arcadeTexture() {
  if (ARCADE) return ARCADE;
  const n = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0d0820';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) { // moqueta: motitas de colores
    g.fillStyle = ['#2a1458', '#14244e', '#3a0f3a', '#1b1b40'][i % 4];
    g.fillRect(Math.random() * n, Math.random() * n, 3, 3);
  }
  const line = (x0, y0, x1, y1, color, w) => { g.strokeStyle = color; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  g.shadowBlur = 18;
  for (const [c, w] of [['rgba(255,43,214,0.35)', 14], ['#ff2bd6', 4]]) { // rejilla rosa con halo
    g.shadowColor = '#ff2bd6';
    line(0, 2, n, 2, c, w); line(2, 0, 2, n, c, w);
  }
  for (const [c, w] of [['rgba(43,240,255,0.3)', 10], ['#2bf0ff', 2]]) { // y una cian más fina por el medio
    g.shadowColor = '#2bf0ff';
    line(0, n / 2, n, n / 2, c, w); line(n / 2, 0, n / 2, n, c, w);
  }
  ARCADE = new THREE.CanvasTexture(canvas);
  ARCADE.colorSpace = THREE.SRGBColorSpace;
  ARCADE.wrapS = ARCADE.wrapT = THREE.RepeatWrapping;
  ARCADE.anisotropy = 8;
  return ARCADE;
}

/** Unidades que mide una repetición de la textura. */
export const surfaceTile = (kind) => (kind === 'arcade' ? 3.4 : KINDS[kind]?.tile ?? 4);

/**
 * Coordenadas de textura por posición (en el mundo, en unidades de `tile`): cada cara se proyecta desde el eje al
 * que más mira (arriba, lado o frente). La alfombra no se repite: cubre la zona de juego entera.
 * Guarda antes las UV que traiga (las del horneado) como uv1, para el aoMap.
 */
export function projectUV(mesh, kind, data) {
  const g = mesh.geometry;
  if (g.attributes.uv && !g.attributes.uv1) g.setAttribute('uv1', g.attributes.uv.clone());
  if (!g.attributes.normal) g.computeVertexNormals();
  mesh.updateMatrixWorld(true);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const tile = surfaceTile(kind);
  const W = data.room?.w ?? data.table?.w ?? 1;
  const D = data.room?.d ?? data.table?.d ?? 1;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm);
    let u;
    let v;
    if (kind === 'alfombra') { u = p.x / W + 0.5; v = 0.5 - p.z / D; } else if (Math.abs(n.y) >= Math.abs(n.x) && Math.abs(n.y) >= Math.abs(n.z)) {
      u = p.x / tile; v = -p.z / tile;
    } else if (Math.abs(n.x) >= Math.abs(n.z)) {
      u = p.z / tile; v = p.y / tile;
    } else {
      u = p.x / tile; v = p.y / tile;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
