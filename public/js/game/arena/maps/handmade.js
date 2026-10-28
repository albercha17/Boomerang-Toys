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
 *
 * Los mapas con `scene: true` son los de verdad: se describen en public/maps/<id>.json (lista en index.json), se
 * editan en /editor y los construye SceneMapBuilder. Se añaden al cargar con registerSceneMaps().
 */
export const HANDMADE_MAPS = [
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

const playable = () => HANDMADE_MAPS.filter((m) => !m.hidden);

/** Añade los mapas de public/maps/index.json (en su orden, antes de la sala de pruebas). */
export function registerSceneMaps(index) {
  const entries = index.map((e) => ({ id: e.id, name: e.name, theme: e.theme, scene: true, hidden: e.play === false }));
  HANDMADE_MAPS.splice(0, HANDMADE_MAPS.length - 1, ...entries);
}

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
  const list = playable().length ? playable() : HANDMADE_MAPS;
  const first = fixed ? wanted : list[Math.floor(Math.random() * list.length)].id;
  return { mapId: first, fixed, seed: randomSeed() };
}

/** El mapa de la ronda siguiente (o de «Nuevo mapa»): el siguiente de la lista, salvo si se fijó uno. */
export function nextMapConfig(config) {
  if (config.fixed) return { ...config, seed: randomSeed() };
  const list = playable().length ? playable() : HANDMADE_MAPS;
  const index = list.findIndex((m) => m.id === config.mapId);
  return { ...config, mapId: list[(index + 1) % list.length].id, seed: randomSeed() };
}

/** Rejilla y datos del mapa de la configuración, listos para construir (HandmadeBuilder). */
export function generateArena(config) {
  const map = HANDMADE_MAPS.find((m) => m.id === config.mapId) ?? HANDMADE_MAPS[0];
  if (map.scene) return { sceneMap: map.id, theme: map.theme, seed: config.seed };
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
