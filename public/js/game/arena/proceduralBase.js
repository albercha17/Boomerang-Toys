import * as THREE from 'three';

/**
 * Base de un mapa hecha por código (tablero, patas, suelo, paredes y huecos): se usa mientras no haya una base
 * horneada en Blender que coincida con las medidas del mapa (p. ej. justo después de cambiarlas en el editor).
 * Con luz y sombras del juego; las texturas de madera y baldosas se pintan en un canvas.
 */
const TEXTURES = {};

function canvasTexture(key, size, paint) {
  if (!TEXTURES[key]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    paint(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    TEXTURES[key] = texture;
  }
  return TEXTURES[key];
}

/** Madera: tablones a lo largo de x con vetas. Una repetición = 8 unidades. */
function woodTexture() {
  return canvasTexture('madera', 512, (g, n) => {
    const planks = 4;
    for (let i = 0; i < planks; i++) {
      const tone = [0xc98d55, 0xbf8148, 0xd09860, 0xc48a50][i];
      g.fillStyle = `#${tone.toString(16)}`;
      g.fillRect(0, (i * n) / planks, n, n / planks);
      g.strokeStyle = 'rgba(90, 50, 20, 0.18)';
      for (let k = 0; k < 14; k++) { // vetas
        const y = (i * n) / planks + Math.random() * (n / planks);
        g.lineWidth = 1 + Math.random() * 2;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= n; x += 32) g.lineTo(x, y + Math.sin(x / 40 + k) * 3);
        g.stroke();
      }
      g.fillStyle = 'rgba(70, 38, 15, 0.55)'; // junta entre tablones
      g.fillRect(0, ((i + 1) * n) / planks - 3, n, 3);
    }
  });
}

/** Baldosas blancas y azules con junta gris. Una repetición = 2 baldosas por lado. */
function tileTexture() {
  return canvasTexture('baldosas', 256, (g, n) => {
    const half = n / 2;
    const colors = ['#f2f1ec', '#8fb4df', '#8fb4df', '#f2f1ec'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = colors[i];
      g.fillRect((i % 2) * half, Math.floor(i / 2) * half, half, half);
    }
    g.strokeStyle = '#b8b9bc';
    g.lineWidth = 6;
    for (let k = 0; k <= 2; k++) {
      g.beginPath(); g.moveTo(k * half, 0); g.lineTo(k * half, n); g.stroke();
      g.beginPath(); g.moveTo(0, k * half); g.lineTo(n, k * half); g.stroke();
    }
  });
}

/** Arena o hierba: dos tonos con manchas y piedrecitas. Una repetición = 6 unidades. */
function terrainTexture(kind) {
  const [light, dark, stone] = kind === 'hierba' ? ['#5c9e38', '#3e7a26', '#33571f'] : ['#dba866', '#b98045', '#86593a'];
  return canvasTexture(kind, 512, (g, n) => {
    g.fillStyle = light;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { // manchas suaves
      g.fillStyle = dark;
      g.globalAlpha = 0.05 + Math.random() * 0.12;
      g.beginPath();
      g.arc(Math.random() * n, Math.random() * n, 10 + Math.random() * 50, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.8;
    g.fillStyle = stone;
    for (let i = 0; i < 160; i++) { // piedrecitas
      g.beginPath();
      g.arc(Math.random() * n, Math.random() * n, 1 + Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });
}

function material(texture, repeatX, repeatY, color = 0xffffff) {
  const map = texture.clone();
  map.repeat.set(repeatX, repeatY);
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map, color, roughness: 0.7, metalness: 0 });
}

/** Contorno de la mesa con las esquinas recortadas, en el plano (x, -z) de una Shape. */
function tableShape(t) {
  const C = t.chamfer;
  const pts = [[-t.w / 2 + C, -t.d / 2], [t.w / 2 - C, -t.d / 2], [t.w / 2, -t.d / 2 + C], [t.w / 2, t.d / 2 - C],
    [t.w / 2 - C, t.d / 2], [-t.w / 2 + C, t.d / 2], [-t.w / 2, t.d / 2 - C], [-t.w / 2, -t.d / 2 + C]];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (const [x, z] of pts.slice(1)) shape.lineTo(x, -z);
  return shape;
}

/** Rectángulo de esquinas redondeadas centrado en (x, z), como camino de una Shape (plano x, -z). */
export function roundedPath(p, PathClass = THREE.Path) {
  const r = Math.min(p.round ?? 0, p.w / 2 - 0.01, p.d / 2 - 0.01);
  const x0 = p.x - p.w / 2;
  const x1 = p.x + p.w / 2;
  const y0 = -(p.z + p.d / 2);
  const y1 = -(p.z - p.d / 2);
  const path = new PathClass();
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0);
  if (r > 0) path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r);
  if (r > 0) path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1);
  if (r > 0) path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r);
  if (r > 0) path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

/** Monta la base en `root` y devuelve lo que hay que liberar al quitar el mapa. */
export function buildProceduralBase(root, data) {
  const owned = [];
  const own = (r) => { owned.push(r); return r; };
  const add = (mesh) => { mesh.receiveShadow = true; root.add(mesh); return mesh; };

  if (data.table) {
    const t = data.table;
    const top = new THREE.ExtrudeGeometry(tableShape(t), { depth: t.thickness, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4 });
    top.rotateX(-Math.PI / 2);
    top.translate(0, -t.thickness, 0);
    const wood = own(material(woodTexture(), 1 / 8, 1 / 8));
    add(new THREE.Mesh(own(top), wood));
    const legGeometry = own(new THREE.CylinderGeometry(0.55, 0.45, t.height - t.thickness, 20));
    const legMaterial = own(new THREE.MeshStandardMaterial({ color: 0x8c5a30, roughness: 0.6 }));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = add(new THREE.Mesh(legGeometry, legMaterial));
        leg.position.set(sx * (t.w / 2 - 1.6), -t.thickness - (t.height - t.thickness) / 2, sz * (t.d / 2 - 1.4));
      }
    }
    const floorW = t.w * 3.6;
    const floorD = t.d * 4.2;
    const floor = add(new THREE.Mesh(own(new THREE.PlaneGeometry(floorW, floorD)), own(material(tileTexture(), floorW / 3.2, floorD / 3.2, 0xe8e8e8))));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -t.height;
  } else {
    const r = data.room;
    const tile = r.tile ?? 1.4;
    const shape = new THREE.Shape();
    shape.moveTo(-r.w / 2, -r.d / 2);
    shape.lineTo(r.w / 2, -r.d / 2);
    shape.lineTo(r.w / 2, r.d / 2);
    shape.lineTo(-r.w / 2, r.d / 2);
    for (const p of r.pits ?? []) shape.holes.push(roundedPath(p));
    const floorGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
    floorGeometry.rotateX(-Math.PI / 2);
    floorGeometry.translate(0, -0.1, 0);
    const kind = r.floor ?? 'baldosas';
    const floorMaterial = kind === 'baldosas' ? own(material(tileTexture(), 1 / (tile * 2), 1 / (tile * 2))) : own(material(terrainTexture(kind), 1 / 6, 1 / 6));
    add(new THREE.Mesh(own(floorGeometry), floorMaterial));
    if (kind !== 'baldosas') { // al aire libre: el terreno sigue más allá de la zona de juego
      const outW = r.w * 3;
      const outD = r.d * 4;
      const outside = add(new THREE.Mesh(own(new THREE.PlaneGeometry(outW, outD)), own(material(terrainTexture(kind), outW / 6, outD / 6, 0xd8d0c4))));
      outside.rotation.x = -Math.PI / 2;
      outside.position.y = -0.12;
    }
    const depth = r.pitDepth ?? 3;
    owned.push(...buildPitLiners(root, data));
    const wallHeight = r.wallHeight ?? 3;
    const wallTile = r.wallTile ?? 0.8;
    const walls = { fondo: [0, -r.d / 2 - 0.25, r.w + 1, 0.5], izq: [-r.w / 2 - 0.25, 0, 0.5, r.d], der: [r.w / 2 + 0.25, 0, 0.5, r.d] };
    for (const [x, z, w, d] of (r.walls ?? 'baldosas') === 'baldosas' ? Object.values(walls) : []) {
      const len = Math.max(w, d);
      const wall = add(new THREE.Mesh(own(new THREE.BoxGeometry(w, wallHeight, d)), own(material(tileTexture(), len / (wallTile * 2), wallHeight / (wallTile * 2)))));
      wall.position.set(x, wallHeight / 2, z);
      wall.castShadow = true;
    }
    const under = add(new THREE.Mesh(own(new THREE.PlaneGeometry(r.w + 40, r.d + 40)), own(new THREE.MeshStandardMaterial({ color: 0x5f7b8f }))));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -depth - 0.05;
  }
  return owned;
}

/** Paredes (se ven por dentro) y fondo de cada hueco de una habitación; también sobre la base horneada. */
export function buildPitLiners(root, data) {
  const owned = [];
  const depth = data.room?.pitDepth ?? 3;
  for (const p of data.room?.pits ?? []) {
    const pitShape = new THREE.Shape(roundedPath(p, THREE.Shape).getPoints(12));
    const geometry = new THREE.ExtrudeGeometry(pitShape, { depth: depth - 0.02, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -depth, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, roughness: 0.6, side: THREE.BackSide });
    const liner = new THREE.Mesh(geometry, material);
    liner.receiveShadow = true;
    root.add(liner);
    owned.push(geometry, material);
  }
  return owned;
}

/** Contorno de la mesa (para la capa de sombras sobre una base horneada). */
export { tableShape };
