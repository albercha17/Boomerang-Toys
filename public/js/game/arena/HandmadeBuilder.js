import * as THREE from 'three';
import { CELL } from './generation/cells.js';
import { THEMES, buildProp, hasPropType } from './themes.js';
import { toonMaterial } from '../render/toon.js';
import { ART } from '../render/art.js';
import { placeFurniture, furnitureSize } from '../render/furniture.js';

const TABLE_DROP = 7; // la mesa está a esta altura sobre el suelo de la cocina
const TUB_DEPTH = 0.7; // profundidad de la bañera
const WALL_HEIGHT = 1.4;

/**
 * Construye un mapa diseñado a mano (arena/maps/handmade.js) en la escena y en el mundo físico.
 * Devuelve la arena: spawnPoints y freePoints (mundo), bounds, theme, stats, hazardAt(x, z) (0 suelo,
 * 1 vacío, 2 agua), bushAt(x, z), movers (lo que aplasta), update(now, dt), rustle(bush), sync() y dispose().
 */
export function buildHandmade(stage, physics, layout) {
  const { cols, rows, grid, hazard, handmade: map } = layout;
  const originX = -cols / 2;
  const originZ = -rows / 2;
  const center = (c, r) => ({ x: originX + c + 0.5, z: originZ + r + 0.5 });
  const root = new THREE.Group();
  stage.scene.add(root);
  const owned = [];
  const own = (resource) => { owned.push(resource); return resource; };
  const bodies = [];
  const theme = { ...THEMES[map.theme], name: map.name };
  const pick = (list, c, r) => list[Math.abs(Math.floor(Math.abs(c + 0.5 - cols / 2) * 5 + r * 3)) % list.length];
  const add = (object) => { if (object) root.add(object); return object; };

  /** Tramos horizontales de casillas que cumplen `test` (para hacer pocas losas grandes). */
  const runs = (test) => {
    const out = [];
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const ok = c < cols && test(r * cols + c);
        if (ok && start < 0) start = c;
        if (!ok && start >= 0) { out.push({ r, c0: start, c1: c - 1 }); start = -1; }
      }
    }
    return out;
  };
  const floorMaterial = (texture, len, depth, tile, color = 0xffffff) => {
    if (!texture) return own(toonMaterial(color));
    const map = own(texture.clone());
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(len / tile, depth / tile);
    return own(new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 }));
  };
  /** Losa de suelo con su física: tramo de la fila r, de c0 a c1, con la cara de arriba en y = top. */
  const slab = ({ r, c0, c1 }, top, thickness, material) => {
    const len = c1 - c0 + 1;
    const x = originX + c0 + len / 2;
    const z = originZ + r + 0.5;
    const mesh = new THREE.Mesh(own(new THREE.BoxGeometry(len, thickness, 1)), material);
    mesh.position.set(x, top - thickness / 2, z);
    mesh.receiveShadow = true;
    root.add(mesh);
    bodies.push(physics.addFloorBox(x, top - thickness / 2, z, len / 2, thickness / 2, 0.5));
  };

  // --- Suelo, agua y alrededores de cada mapa ---
  const isFloor = (i) => !hazard[i];
  if (map.theme === 'cocina') {
    // Tablero de madera flotando sobre la cocina
    const wood = ART.floors.salon;
    for (const run of runs(isFloor)) slab(run, 0, 0.45, floorMaterial(wood, run.c1 - run.c0 + 1, 1, 5));
    physics.setGroundLevel(-TABLE_DROP);
    const kitchen = new THREE.Mesh(own(new THREE.PlaneGeometry(90, 70)), floorMaterial(ART.floors.cocina, 90, 70, 3.2));
    kitchen.rotation.x = -Math.PI / 2;
    kitchen.position.y = -TABLE_DROP;
    kitchen.receiveShadow = true;
    root.add(kitchen);
    const legMaterial = own(new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 }));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(own(new THREE.BoxGeometry(0.8, TABLE_DROP, 0.8)), legMaterial);
      leg.position.set(sx * (cols / 2 - 3.5), -TABLE_DROP / 2 - 0.45, sz * (rows / 2 - 2));
      leg.castShadow = true;
      root.add(leg);
    }
    // Sillas gigantes alrededor (vistas desde la mesa, los juguetes son diminutos)
    for (const [x, z, q] of [[-6, -rows / 2 - 2.6, 0], [6, -rows / 2 - 2.6, 0], [-cols / 2 - 2.6, 0, 1], [cols / 2 + 2.6, 0, -1]]) {
      add(placeFurniture('chair', { x, z, y: -TABLE_DROP, scale: 10, rotation: (q * Math.PI) / 2, color: 0xe76f51 }));
    }
  } else {
    // Suelo de baldosas alrededor de la bañera
    for (const run of runs(isFloor)) slab(run, 0, 0.3, floorMaterial(ART.floors.bano, run.c1 - run.c0 + 1, 1, 4));
    physics.setGroundLevel(-TUB_DEPTH);
    const water = runs((i) => hazard[i] === 2);
    const porcelain = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 }));
    const waterMaterial = own(new THREE.MeshStandardMaterial({ color: 0x4fc3f7, roughness: 0.1, transparent: true, opacity: 0.78 }));
    for (const { r, c0, c1 } of water) {
      const len = c1 - c0 + 1;
      const x = originX + c0 + len / 2;
      const z = originZ + r + 0.5;
      const bottom = new THREE.Mesh(own(new THREE.BoxGeometry(len, 0.1, 1)), porcelain);
      bottom.position.set(x, -TUB_DEPTH, z);
      const surface = new THREE.Mesh(own(new THREE.PlaneGeometry(len, 1)), waterMaterial);
      surface.rotation.x = -Math.PI / 2;
      surface.position.set(x, -0.22, z);
      surface.userData.water = true;
      root.add(bottom, surface);
    }
    // Borde de la bañera: en cada lado de casilla de agua que da a suelo
    const rimH = 0.28;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (hazard[r * cols + c] !== 2) continue;
        const { x, z } = center(c, r);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (r + dr) * cols + (c + dc);
          if (hazard[n] === 2) continue;
          const rim = new THREE.Mesh(own(new THREE.BoxGeometry(dc ? 0.18 : 1.18, rimH + TUB_DEPTH, dr ? 0.18 : 1.18)), porcelain);
          rim.position.set(x + dc * 0.5, (rimH - TUB_DEPTH) / 2, z + dr * 0.5);
          rim.castShadow = true;
          root.add(rim);
        }
      }
    }
  }

  // --- Objetos que bloquean (#): paredes del borde o muebles/comida en el interior ---
  const wallMaterial = map.theme === 'bano' ? floorMaterial(ART.floors.bano, 1, 1, 2) : own(toonMaterial(0xd9c7a1));
  const solid = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && grid[r * cols + c] === CELL.BLOCK;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!solid(c, r)) continue;
      const { x, z } = center(c, r);
      const edge = c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
      if (edge) {
        const wall = new THREE.Mesh(own(new THREE.BoxGeometry(1, WALL_HEIGHT, 1)), wallMaterial);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = wall.receiveShadow = true;
        root.add(wall);
      } else {
        const model = pick(map.blocks, c, r);
        const fits = model.startsWith('comida/') ? { footprint: 1.05, maxHeight: 1.5 } : { footprint: 1.0, maxHeight: 1.4 };
        add(placeFurniture(model, { x, z, ...fits, color: model.startsWith('comida/') ? null : 0x64b5f6 }));
      }
    }
  }
  // Física de los bloques: una caja por tramo horizontal
  for (const { r, c0, c1 } of runs((i) => grid[i] === CELL.BLOCK)) {
    const len = c1 - c0 + 1;
    bodies.push(physics.addWall(originX + c0 + len / 2, 0.6, originZ + r + 0.5, len / 2, 0.6, 0.5));
  }

  // --- Matorrales (esconden a quien entra) ---
  const bushes = layout.bushes.map(({ col, row }) => {
    const { x, z } = center(col, row);
    const object = add(placeFurniture(map.bush ?? 'plant_bushDetailed', { x, z, footprint: 1.5, maxHeight: 1.25 }));
    return { x, z, object, shakeUntil: 0 };
  });

  // --- Juguetes y cosas sueltas (o) ---
  const props = layout.props.map((prop, index) => {
    const { x, z } = center(prop.col, prop.row);
    let built;
    if (hasPropType(prop.model)) {
      built = buildProp(theme, index, prop.model);
    } else {
      const size = furnitureSize(prop.model) ?? new THREE.Vector3(0.3, 0.3, 0.3);
      const s = Math.min(0.75 / Math.max(size.x, size.z), 0.75 / size.y);
      const model = placeFurniture(prop.model, { x: 0, z: 0, y: (-size.y * s) / 2, scale: s });
      const object = new THREE.Group();
      if (model) object.add(model);
      built = { object, shape: { box: [(size.x * s) / 2, (size.y * s) / 2, (size.z * s) / 2] } };
    }
    root.add(built.object);
    const radius = built.shape.sphere ?? built.shape.box[1];
    const body = physics.createPropBody(built.shape, x, radius + 0.05, z);
    bodies.push(body);
    return { mesh: built.object, body };
  });

  // --- Lo que se mueve: el rodillo de cocina ---
  const movers = (map.movers ?? []).map((def) => {
    const [r0, r1] = def.rows;
    const length = r1 - r0 + 1.4;
    const radius = 0.48;
    const z = originZ + (r0 + r1 + 1) / 2;
    const span = { from: originX + 1.2, to: -originX - 1.2 };
    const pin = new THREE.Group();
    const size = furnitureSize(def.model);
    const model = size ? placeFurniture(def.model, { x: 0, z: 0, y: 0, scale: length / Math.max(size.x, size.z) }) : null;
    if (model) {
      model.position.y = -radius; // el modelo se apoya en el suelo: se centra en el eje
      if (size.x > size.z) model.rotation.y = Math.PI / 2; // tumbado a lo largo de z
      pin.add(model);
    }
    pin.position.set(span.from, radius, z);
    root.add(pin);
    const body = physics.addMover(radius, radius, length / 2);
    bodies.push(body);
    return { ...def, pin, body, z, radius, halfLength: length / 2, span, x: span.from, lastX: span.from };
  });

  stage.setMood(theme);
  stage.frame(cols + 1.5, rows + 1.5);

  // Casillas seguras con todo su alrededor libre (para los power-ups)
  const hazardCell = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || hazard[r * cols + c] !== 0;
  const inMoverLane = (r) => movers.some((m) => r >= m.rows[0] && r <= m.rows[1]);
  const freePoints = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      let clear = !inMoverLane(r);
      for (let dr = -1; dr <= 1 && clear; dr++) for (let dc = -1; dc <= 1; dc++) if (solid(c + dc, r + dr) || hazardCell(c + dc, r + dr)) { clear = false; break; }
      if (clear) freePoints.push(center(c, r));
    }
  }

  const waterMeshes = [];
  root.traverse((o) => { if (o.userData.water) waterMeshes.push(o); });

  return {
    layout,
    theme,
    walled: true,
    stats: { chunks: 1, blocks: grid.filter((v) => v === CELL.BLOCK).length, pillars: 0, props: props.length, colliders: bodies.length, drawObjects: 0 },
    spawnPoints: layout.spawnPoints.map(({ col, row }) => center(col, row)),
    freePoints,
    bounds: { minX: originX, maxX: -originX, minZ: originZ, maxZ: -originZ },
    movers,

    /** 0 suelo, 1 vacío (te caes), 2 agua (te ahogas). Fuera del mapa, vacío. */
    hazardAt(x, z) {
      const c = Math.floor(x - originX);
      const r = Math.floor(z - originZ);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return 1;
      return hazard[r * cols + c];
    },

    /** Matorral en ese punto (o null). */
    bushAt(x, z) {
      return bushes.find((b) => Math.abs(b.x - x) < 0.62 && Math.abs(b.z - z) < 0.62) ?? null;
    },

    /** El matorral se agita cuando alguien se mueve dentro. */
    rustle(bush, now) {
      bush.shakeUntil = now + 250;
    },

    /** Antes del paso de física: mueve lo que se mueve (ida y vuelta con pausa en cada extremo). */
    update(now, dt) {
      for (const m of movers) {
        const cycle = m.periodMs + m.pauseMs * 2;
        const t = (now % cycle) / cycle;
        const travel = m.periodMs / 2 / cycle;
        const pause = m.pauseMs / cycle;
        let k;
        if (t < travel) k = t / travel;
        else if (t < travel + pause) k = 1;
        else if (t < travel * 2 + pause) k = 1 - (t - travel - pause) / travel;
        else k = 0;
        const eased = k * k * (3 - 2 * k);
        m.lastX = m.x;
        m.x = m.span.from + (m.span.to - m.span.from) * eased;
        m.body.position.set(m.x, m.radius, m.z);
        m.body.velocity.set(dt > 0 ? (m.x - m.lastX) / dt : 0, 0, 0);
        m.pin.position.x = m.x;
        m.pin.rotation.z -= (m.x - m.lastX) / m.radius; // rueda
      }
      for (const b of bushes) {
        if (!b.object) continue;
        const shaking = now < b.shakeUntil;
        b.object.rotation.z = shaking ? Math.sin(now / 30) * 0.08 : b.object.rotation.z * 0.8;
      }
      for (const w of waterMeshes) w.position.y = -0.22 + Math.sin(now / 600 + w.position.x) * 0.015;
    },

    sync() {
      for (const { mesh, body } of props) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      }
    },

    dispose() {
      stage.scene.remove(root);
      root.traverse((object) => {
        if (object.isMesh && !object.userData.shared) {
          object.geometry.dispose();
          if (!object.userData.isOutline && !owned.includes(object.material)) object.material.dispose?.();
        }
      });
      for (const resource of owned) resource.dispose();
      for (const body of bodies) physics.remove(body);
      physics.setGroundLevel(0);
    },
  };
}
