import { CELL } from '../generation/cells.js';
import { createRandom, hashSeed } from '../generation/random.js';

/**
 * Mapas diseñados a mano, al estilo de Boomerang Fu: pequeños (se cruzan en ~5 s), simétricos y con una idea
 * propia cada uno. Se dibujan en texto, una fila por línea (todas del mismo ancho):
 *   .  suelo            #  objeto que bloquea (paredes y muebles: chocan los personajes y rebota el búmerang)
 *   ~  agua (te ahogas)  (espacio) vacío: te caes      B  matorral: quien está dentro no se ve
 *   S  aparición        o  juguete suelto que se empuja
 * Fuera del dibujo también es vacío.
 * `blocks`: modelos para los «#» (se reparten por el mapa); `movers`: lo que se mueve y aplasta.
 */
export const HANDMADE_MAPS = [
  {
    id: 'mesa',
    name: 'Encima de la mesa',
    theme: 'cocina',
    rows: [
      '   ............   ',
      '  .S..........S.  ',
      ' ...##......##... ',
      '..B.#...o....#.B..',
      '..................',
      '..................',
      '..................',
      '..B.#....o...#.B..',
      ' ...##......##... ',
      '  .S..........S.  ',
      '   ............   ',
    ],
    blocks: ['comida/carton', 'comida/loaf-round', 'comida/cake', 'comida/pot-stew', 'comida/watermelon', 'comida/knife-block'],
    bush: 'comida/cabbage',
    props: ['comida/apple', 'comida/orange', 'comida/tomato'],
    // El rodillo de cocina rueda de un lado a otro por la franja central (filas 4 a 6)
    movers: [{ type: 'rodillo', model: 'comida/rollingPin', rows: [4, 6], periodMs: 6500, pauseMs: 900 }],
  },
  {
    id: 'banera',
    name: 'La bañera',
    theme: 'bano',
    rows: [
      '##################',
      '#S......o.......S#',
      '#..##........##..#',
      '#..#..~~~~~~..#..#',
      '#....~~~~~~~~....#',
      '#.S..~~~~~~~~..S.#',
      '#....~~~~~~~~....#',
      '#..#..~~~~~~..#..#',
      '#..##........##..#',
      '#S.......o......S#',
      '##################',
    ],
    blocks: ['toilet', 'bathroomSink', 'washer', 'bathroomCabinetDrawer', 'dryer'],
    props: ['patito'],
    movers: [],
  },
  {
    // Sala lisa para las pruebas automáticas: no sale en la rotación; solo con /?mapa=prueba
    id: 'prueba',
    name: 'Sala de pruebas',
    theme: 'bano',
    hidden: true,
    rows: [
      '#'.repeat(28),
      ...Array.from({ length: 14 }, () => `#${'.'.repeat(26)}#`),
      '#'.repeat(28),
    ],
    blocks: ['bathroomCabinetDrawer'],
    props: [],
    movers: [],
  },
];

const PLAYABLE = HANDMADE_MAPS.filter((m) => !m.hidden);

const CHAR_CELL = { '.': CELL.EMPTY, S: CELL.EMPTY, o: CELL.EMPTY, B: CELL.EMPTY, '#': CELL.BLOCK, '~': CELL.EMPTY, ' ': CELL.EMPTY };
const SPAWN_COUNT = 8;

const randomSeed = () => Math.floor(Math.random() * 1e6);

/**
 * Configuración de mapa desde la dirección: /?mapa=mesa juega siempre ese mapa; si no, se van turnando.
 * @returns {{ mapId: string, fixed: boolean, seed: number }}
 */
export function readMapConfig(search = '') {
  const wanted = new URLSearchParams(search).get('mapa');
  const fixed = HANDMADE_MAPS.some((m) => m.id === wanted);
  const first = fixed ? wanted : PLAYABLE[Math.floor(Math.random() * PLAYABLE.length)].id;
  return { mapId: first, fixed, seed: randomSeed() };
}

/** El mapa de la ronda siguiente (o de «Nuevo mapa»): el siguiente de la lista, salvo si se fijó uno. */
export function nextMapConfig(config) {
  if (config.fixed) return { ...config, seed: randomSeed() };
  const index = PLAYABLE.findIndex((m) => m.id === config.mapId);
  return { ...config, mapId: PLAYABLE[(index + 1) % PLAYABLE.length].id, seed: randomSeed() };
}

/** Rejilla y datos del mapa de la configuración, listos para construir (HandmadeBuilder). */
export function generateArena(config) {
  const map = HANDMADE_MAPS.find((m) => m.id === config.mapId) ?? HANDMADE_MAPS[0];
  return parseHandmade(map, config.seed);
}

/** Convierte un mapa dibujado en el formato de arena del juego (lo que construye HandmadeBuilder). */
export function parseHandmade(map, seed) {
  const rows = map.rows.length;
  const cols = map.rows[0].length;
  const grid = new Uint8Array(cols * rows);
  const hazard = new Uint8Array(cols * rows); // 0 suelo, 1 vacío, 2 agua
  const bushes = [];
  const spawns = [];
  const props = [];
  map.rows.forEach((line, r) => {
    if (line.length !== cols) throw new Error(`Mapa ${map.id}: la fila ${r} mide ${line.length} y no ${cols}`);
    [...line].forEach((ch, c) => {
      const i = r * cols + c;
      grid[i] = CHAR_CELL[ch] ?? CELL.EMPTY;
      if (ch === ' ') hazard[i] = 1;
      if (ch === '~') hazard[i] = 2;
      if (ch === 'B') bushes.push({ col: c, row: r });
      if (ch === 'S') spawns.push({ col: c, row: r });
      if (ch === 'o') props.push({ col: c, row: r });
    });
  });
  const random = createRandom(hashSeed(seed, 0x4d41));
  // Más apariciones si hacen falta (hasta 8): en suelo seguro, lo más lejos posible de las demás
  const safe = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (grid[i] === CELL.EMPTY && !hazard[i] && !bushes.some((b) => b.col === c && b.row === r)) safe.push({ col: c, row: r });
    }
  }
  while (spawns.length < SPAWN_COUNT && safe.length) {
    let best = null;
    let bestDistance = -1;
    for (const p of safe) {
      const d = Math.min(...spawns.map((s) => Math.hypot(s.col - p.col, s.row - p.row)), Infinity);
      if (d > bestDistance) { best = p; bestDistance = d; }
    }
    spawns.push(best);
  }
  return {
    handmade: map,
    cols,
    rows,
    seed,
    theme: map.theme,
    walled: true, // sin línea roja: los bordes son agua, vacío o paredes
    chunkSize: Math.max(cols, rows),
    chunks: [{ cx: 0, cy: 0, col0: 0, row0: 0, col1: cols - 1, row1: rows - 1 }],
    grid,
    hazard,
    bushes,
    spawnPoints: spawns,
    props: props.map((p, k) => ({ ...p, type: 'mapa', model: map.props[k % map.props.length], color: random.int(0, 6) })),
    openCells: safe.length,
    attempts: 1,
  };
}
