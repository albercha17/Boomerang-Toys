import * as THREE from 'three';
import { COLORS, createPlankTexture, matte } from '../render/materials.js';

/**
 * Arena fija de pruebas. La Fase 3 la sustituirá por generación procedural;
 * lo que devuelve createTestArena (spawnPoints, bounds) es el contrato que deberá cumplir.
 *
 * Leyenda: '#' bloque, '.' suelo, 'S' punto de aparición. El borde exterior se añade solo.
 */
const INTERIOR = [
  '........................',
  '..S.........S........S..',
  '........................',
  '.....##..........##.....',
  '.....#............#.....',
  '..S........##........S..',
  '...........##...........',
  '.....#............#.....',
  '.....##..........##.....',
  '........................',
  '..S.........S........S..',
  '........................',
];

const BLOCK_HEIGHT = 0.9;
const BLOCK_TINTS = [0xe63946, 0x1d7cf2, 0xf4b400, 0x2bb673, 0x9b5de5, 0xff7f11];
const STUDS = [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]];

export function createTestArena(stage, physics) {
  const cols = INTERIOR[0].length + 2;
  const grid = ['#'.repeat(cols), ...INTERIOR.map((row) => `#${row}#`), '#'.repeat(cols)];
  grid.forEach((row, i) => {
    if (row.length !== cols) throw new Error(`TestArena: la fila ${i} mide ${row.length} y debería medir ${cols}`);
  });
  const rows = grid.length;
  const originX = -cols / 2;
  const originZ = -rows / 2;
  const center = (col, row) => ({ x: originX + col + 0.5, z: originZ + row + 0.5 });

  // Suelo de listones y mesa alrededor.
  const planks = createPlankTexture();
  planks.repeat.set(cols / 4, rows / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const table = new THREE.Mesh(new THREE.PlaneGeometry(cols * 4, rows * 4), matte(COLORS.table));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.02;
  table.receiveShadow = true;
  stage.scene.add(table, floor);

  // Bloques de construcción: dos mallas instanciadas (cuerpo y tetones) para dibujarlos todos de una vez.
  const blocks = [];
  const spawnPoints = [];
  grid.forEach((row, r) => [...row].forEach((cell, c) => {
    if (cell === 'S') spawnPoints.push(center(c, r));
    if (cell !== '#') return;
    const border = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
    blocks.push({ ...center(c, r), color: border ? COLORS.border : BLOCK_TINTS[(c * 7 + r * 3) % BLOCK_TINTS.length] });
  }));

  const plasticWhite = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.05 });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, BLOCK_HEIGHT, 0.96), plasticWhite(), blocks.length);
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16), plasticWhite(), blocks.length * STUDS.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  blocks.forEach((block, i) => {
    color.setHex(block.color);
    matrix.makeTranslation(block.x, BLOCK_HEIGHT / 2, block.z);
    bodies.setMatrixAt(i, matrix);
    bodies.setColorAt(i, color);
    STUDS.forEach(([dx, dz], s) => {
      matrix.makeTranslation(block.x + dx, BLOCK_HEIGHT + 0.05, block.z + dz);
      studs.setMatrixAt(i * STUDS.length + s, matrix);
      studs.setColorAt(i * STUDS.length + s, color);
    });
  });
  for (const mesh of [bodies, studs]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stage.scene.add(mesh);
  }

  // Física: los bloques contiguos de cada fila se unen en una sola caja (menos cuerpos, mismo choque).
  grid.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const solid = row[c] === '#';
      if (solid && start < 0) start = c;
      if (!solid && start >= 0) {
        const length = c - start;
        physics.addWall(originX + start + length / 2, BLOCK_HEIGHT / 2, originZ + r + 0.5, length / 2, BLOCK_HEIGHT / 2, 0.5);
        start = -1;
      }
    }
  });

  stage.frame(cols, rows);
  return {
    spawnPoints,
    bounds: { minX: originX, maxX: -originX, minZ: originZ, maxZ: -originZ },
  };
}
