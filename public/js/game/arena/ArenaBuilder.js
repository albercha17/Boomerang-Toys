import * as THREE from 'three';
import { CELL } from './generation/cells.js';
import { THEMES, THEME_IDS, floorTexture, buildProp, buildDecor } from './themes.js';
import { toonMaterial, instancedOutline } from '../render/toon.js';

const BLOCK_HEIGHT = 0.9;
const PILLAR_RADIUS = 0.38;
const PILLAR_HEIGHT = 1.15;
const OUTER_MARGIN = 2.5; // casillas de mesa fuera de la línea roja hasta el tope invisible
const STUDS = [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]];

/**
 * Construye en la escena y en el mundo físico una arena generada (ver generation/ArenaGenerator.js).
 * Los bloques se dibujan con mallas instanciadas (una llamada de dibujo por tipo de pieza) y las paredes
 * se fusionan en cajas por filas dentro de cada zona.
 * Con meshPerChunk cada zona (chunk) tiene sus propias mallas, para que la cámara descarte las que no ve:
 * útil en escenarios más grandes que la pantalla; con la arena entera a la vista, agrupar es más rápido.
 *
 * @returns arena con spawnPoints (mundo), bounds, layout, stats, sync() y dispose()
 */
export function buildArena(stage, physics, layout, { meshPerChunk = false } = {}) {
  const { cols, rows, grid } = layout;
  const originX = -cols / 2;
  const originZ = -rows / 2;
  const toWorld = ({ col, row }) => ({ x: originX + col + 0.5, z: originZ + row + 0.5 });
  const cellAt = (c, r) => grid[r * cols + c];

  const root = new THREE.Group();
  stage.scene.add(root);
  const owned = []; // geometrías, materiales y texturas creadas aquí (se liberan en dispose)
  const own = (resource) => { owned.push(resource); return resource; };
  const bodies = [];
  // Zona de la casa: la elegida en la configuración o una según la semilla del mapa.
  const theme = THEMES[layout.theme] ?? THEMES[THEME_IDS[Math.abs(layout.seed) % THEME_IDS.length]];
  const BLOCK_TINTS = theme.blocks;

  // Suelo de la zona y alrededores.
  const floorMap = own(floorTexture(theme));
  floorMap.repeat.set(cols / 4, rows / 4);
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(cols, rows)), own(toonMaterial(0xffffff, floorMap)));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const table = new THREE.Mesh(own(new THREE.PlaneGeometry(cols * 4, rows * 4)), own(toonMaterial(theme.outside)));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.02;
  table.receiveShadow = true;
  root.add(table, floor);

  // Geometrías compartidas por todas las zonas.
  const blockGeometry = own(new THREE.BoxGeometry(0.96, BLOCK_HEIGHT, 0.96));
  const studGeometry = own(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16));
  const pillarGeometry = own(new THREE.CylinderGeometry(PILLAR_RADIUS, PILLAR_RADIUS * 1.08, PILLAR_HEIGHT, 20));
  const capGeometry = own(new THREE.CylinderGeometry(PILLAR_RADIUS * 1.1, PILLAR_RADIUS * 1.1, 0.14, 20));
  const instanced = own(toonMaterial(0xffffff));
  const wood = own(toonMaterial(theme.pillar));

  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const stats = { chunks: 0, blocks: 0, pillars: 0, props: 0, colliders: 0, drawObjects: 0 };

  const addInstanced = (group, geometry, material, placements, withOutline = true) => {
    if (!placements.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    placements.forEach(({ x, y, z, tint }, i) => {
      mesh.setMatrixAt(i, matrix.makeTranslation(x, y, z));
      if (tint !== undefined) mesh.setColorAt(i, color.setHex(tint));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); // para que la cámara descarte la zona entera si no la ve
    group.add(mesh);
    if (withOutline) group.add(instancedOutline(mesh)); // contorno de dibujos animados
    stats.drawObjects++;
  };

  const newBatch = () => ({ blocks: [], studs: [], pillars: [], caps: [] });
  const batches = [];
  let shared = null;
  for (const chunk of layout.chunks) {
    const batch = meshPerChunk ? newBatch() : (shared ??= newBatch());
    if (meshPerChunk || batches.length === 0) batches.push(batch);
    const { blocks, studs, pillars, caps } = batch;
    const before = blocks.length + pillars.length;
    for (let r = chunk.row0; r <= chunk.row1; r++) {
      let runStart = -1;
      for (let c = chunk.col0; c <= chunk.col1 + 1; c++) {
        const type = c <= chunk.col1 ? cellAt(c, r) : CELL.EMPTY;
        const { x, z } = toWorld({ col: c, row: r });
        // Sin paredes en el borde, las casillas del borde son suelo normal (la zona la marca la línea roja).
        if (type === CELL.BLOCK || (type === CELL.BORDER && layout.walled)) {
          const tint = type === CELL.BORDER ? theme.border : BLOCK_TINTS[(c * 7 + r * 3) % BLOCK_TINTS.length];
          blocks.push({ x, y: BLOCK_HEIGHT / 2, z, tint });
          for (const [dx, dz] of STUDS) studs.push({ x: x + dx, y: BLOCK_HEIGHT + 0.05, z: z + dz, tint });
          if (runStart < 0) runStart = c;
          continue;
        }
        // Fin de una fila de bloques: una sola caja física para todos.
        if (runStart >= 0) {
          const length = c - runStart;
          bodies.push(physics.addWall(originX + runStart + length / 2, BLOCK_HEIGHT / 2, originZ + r + 0.5, length / 2, BLOCK_HEIGHT / 2, 0.5));
          runStart = -1;
        }
        if (type === CELL.PILLAR) {
          pillars.push({ x, y: PILLAR_HEIGHT / 2, z });
          caps.push({ x, y: PILLAR_HEIGHT, z, tint: BLOCK_TINTS[(c * 5 + r) % BLOCK_TINTS.length] });
          bodies.push(physics.addPillar(x, z, PILLAR_RADIUS, PILLAR_HEIGHT));
        }
      }
    }
    if (blocks.length + pillars.length > before) stats.chunks++;
  }
  for (const { blocks, studs, pillars, caps } of batches) {
    const group = new THREE.Group();
    addInstanced(group, blockGeometry, instanced, blocks);
    addInstanced(group, studGeometry, instanced, studs, false);
    addInstanced(group, pillarGeometry, wood, pillars);
    addInstanced(group, capGeometry, instanced, caps);
    root.add(group);
    stats.blocks += blocks.length;
    stats.pillars += pillars.length;
  }

  // Juguetes y objetos sueltos de la zona (dados, naranjas, patitos...): se pueden empujar y ruedan.
  const props = layout.props.map((prop, index) => {
    const { object: mesh, shape } = buildProp(theme, prop.color + index);
    const { x, z } = toWorld(prop);
    root.add(mesh);
    const radius = shape.sphere ?? shape.box[1];
    const body = physics.createPropBody(shape, x, radius, z);
    bodies.push(body);
    stats.props++;
    return { mesh, body };
  });

  stats.colliders = bodies.length;
  if (!layout.walled) {
    // Línea roja en el límite de la zona y, un poco más allá, un tope invisible para no perderse por la mesa.
    const red = own(new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    const thick = 0.14;
    const lines = [
      [cols + thick, thick, 0, originZ], [cols + thick, thick, 0, -originZ],
      [thick, rows + thick, originX, 0], [thick, rows + thick, -originX, 0],
    ];
    for (const [w, d, x, z] of lines) {
      const line = new THREE.Mesh(own(new THREE.BoxGeometry(w, 0.03, d)), red);
      line.position.set(x, 0.02, z);
      root.add(line);
    }
    const m = OUTER_MARGIN;
    const outer = [
      [cols / 2 + m + 0.5, 0, 0.5, rows / 2 + m + 1], [-(cols / 2 + m + 0.5), 0, 0.5, rows / 2 + m + 1],
      [0, rows / 2 + m + 0.5, cols / 2 + m + 1, 0.5], [0, -(rows / 2 + m + 0.5), cols / 2 + m + 1, 0.5],
    ];
    for (const [x, z, hx, hz] of outer) bodies.push(physics.addWall(x, 1, z, hx, 1, hz));
  }
  // Decorado al fondo, fuera de la zona de juego (sofá, muebles de cocina, valla, cama, bañera...).
  const decor = buildDecor(theme, cols);
  decor.position.z = originZ - (layout.walled ? 1.6 : OUTER_MARGIN + 1.5);
  root.add(decor);
  stage.setMood(theme);

  // Con línea roja se encuadra también parte de la mesa, para ver a quien sale de la zona.
  stage.frame(cols + (layout.walled ? 0 : OUTER_MARGIN * 1.6), rows + (layout.walled ? 0 : OUTER_MARGIN * 1.6));

  // Casillas libres con todo su alrededor libre (para colocar power-ups).
  const freePoints = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      let clear = true;
      for (let dr = -1; dr <= 1 && clear; dr++) for (let dc = -1; dc <= 1; dc++) if (cellAt(c + dc, r + dr) !== CELL.EMPTY) { clear = false; break; }
      if (clear) freePoints.push(toWorld({ col: c, row: r }));
    }
  }

  return {
    layout,
    stats,
    spawnPoints: layout.spawnPoints.map(toWorld),
    freePoints,
    bounds: { minX: originX, maxX: -originX, minZ: originZ, maxZ: -originZ }, // zona de juego (dentro de la línea roja)
    walled: layout.walled,
    theme,

    /** Después del paso de física: coloca los juguetes sueltos. */
    sync() {
      for (const { mesh, body } of props) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      }
    },

    /** Quita la arena de la escena y del mundo físico (para generar otra). */
    dispose() {
      stage.scene.remove(root);
      root.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        else if (object.isMesh) {
          // Juguetes y decorado: geometría y material propios (el material de contorno es compartido).
          object.geometry.dispose();
          if (!object.userData.isOutline) object.material.dispose();
        }
      });
      for (const resource of owned) resource.dispose();
      for (const body of bodies) physics.remove(body);
    },
  };
}
