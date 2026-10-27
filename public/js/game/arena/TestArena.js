/**
 * Arena fija de pruebas para la Fase 2. La Fase 3 la sustituirá por generación procedural;
 * lo que devuelve createTestArena (walls, spawnPoints, bounds) es el contrato que deberá cumplir.
 *
 * Leyenda: '#' bloque, '.' suelo, 'S' punto de aparición. El borde exterior se añade solo.
 */
export const TILE = 48;

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

const BORDER_TINT = 0xc58b54;
const BLOCK_TINTS = [0xe63946, 0x1d7cf2, 0xf4b400, 0x2bb673, 0x9b5de5, 0xff7f11];

export function createTestArena(scene) {
  const width = INTERIOR[0].length + 2;
  const rows = ['#'.repeat(width), ...INTERIOR.map((row) => `#${row}#`), '#'.repeat(width)];
  rows.forEach((row, i) => {
    if (row.length !== width) throw new Error(`TestArena: la fila ${i} mide ${row.length} y debería medir ${width}`);
  });

  const pixelWidth = width * TILE;
  const pixelHeight = rows.length * TILE;
  const originX = Math.round((scene.scale.width - pixelWidth) / 2);
  const originY = scene.scale.height - pixelHeight;

  scene.add.tileSprite(originX, originY, pixelWidth, pixelHeight, 'floor').setOrigin(0).setDepth(0);

  const walls = scene.physics.add.staticGroup();
  const spawnPoints = [];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((cell, col) => {
      const x = originX + col * TILE + TILE / 2;
      const y = originY + rowIndex * TILE + TILE / 2;
      if (cell === 'S') spawnPoints.push({ x, y });
      if (cell !== '#') return;
      const isBorder = rowIndex === 0 || col === 0 || rowIndex === rows.length - 1 || col === width - 1;
      const tint = isBorder ? BORDER_TINT : BLOCK_TINTS[(col * 7 + rowIndex * 3) % BLOCK_TINTS.length];
      walls.create(x, y, 'block').setTint(tint).setDepth(4);
    });
  });

  return {
    walls,
    spawnPoints,
    bounds: new Phaser.Geom.Rectangle(originX, originY, pixelWidth, pixelHeight),
  };
}
