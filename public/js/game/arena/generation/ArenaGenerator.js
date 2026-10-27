import { createRandom, hashSeed } from './random.js';
import { CELL, isSolid, STAMPS, PROP_TYPES } from './cells.js';
import { ROOM_SETS, MODEL_SIZE, FURNITURE_SCALE } from './rooms.js';

const ROOM_IDS = ['salon', 'cocina', 'patio', 'dormitorio', 'bano']; // mismo orden que arena/themes.js

const NEIGHBOURS_4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBOURS_8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const SPAWN_PROP_CLEARANCE = 2.5; // casillas libres de juguetes alrededor de cada aparición

/**
 * Genera la rejilla de una arena a partir de una configuración (ver presets.js).
 * Es código puro (sin Three.js ni física): se puede probar aparte y la misma semilla da el mismo mapa.
 *
 * Proceso: borde -> zonas (chunks) de chunkSize×chunkSize con piezas estampadas -> simetría opcional
 * -> se rellenan los huecos inaccesibles -> puntos de aparición repartidos -> juguetes sueltos.
 * Cada zona usa su propia semilla derivada de (semilla, zona), así una zona se puede generar sola:
 * es la base para escenarios más grandes o que se amplían.
 *
 * @returns {{ cols, rows, seed, chunkSize, grid: Uint8Array, chunks, spawnPoints, props, openCells, attempts }}
 */
export function generateArena(config) {
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const layout = tryGenerate(config, attempt);
    if (layout) return { ...layout, attempts: attempt + 1 };
  }
  // Último recurso: arena sin obstáculos (siempre válida).
  return { ...tryGenerate({ ...config, density: 0 }, 0), attempts: config.maxAttempts + 1 };
}

function tryGenerate(config, attempt) {
  const { cols, rows, chunkSize } = config;
  const seed = hashSeed(config.seed, attempt);
  const grid = new Uint8Array(cols * rows);
  const at = (c, r) => r * cols + c;
  const inside = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows;

  for (let c = 0; c < cols; c++) {
    grid[at(c, 0)] = CELL.BORDER;
    grid[at(c, rows - 1)] = CELL.BORDER;
  }
  for (let r = 0; r < rows; r++) {
    grid[at(0, r)] = CELL.BORDER;
    grid[at(cols - 1, r)] = CELL.BORDER;
  }

  // Zona de la casa: la pedida o una según la semilla (con habitaciones, los muebles dependen de ella).
  const theme = config.theme ?? (config.rooms ? ROOM_IDS[Math.abs(config.seed) % ROOM_IDS.length] : null);

  // Zonas del interior. Con simetría solo se generan las de la mitad izquierda.
  const mirror = config.symmetry === 'mirror-x';
  const lastCol = mirror ? Math.floor((cols - 1) / 2) : cols - 2;
  const chunks = listChunks(cols, rows, chunkSize);
  const furniture = []; // muebles colocados (con habitaciones)
  for (const chunk of chunks) {
    const c0 = Math.max(1, chunk.col0);
    const c1 = Math.min(lastCol, chunk.col1);
    const r0 = Math.max(1, chunk.row0);
    const r1 = Math.min(rows - 2, chunk.row1);
    if (c0 > c1 || r0 > r1) continue;
    const random = createRandom(hashSeed(seed, chunk.cx, chunk.cy));
    if (config.rooms) fillRoom(grid, cols, { c0, c1, r0, r1 }, ROOM_SETS[theme], config.density, random, furniture);
    else fillChunk(grid, cols, { c0, c1, r0, r1 }, config.density, random);
  }
  if (mirror) {
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1 - c; c++) grid[at(cols - 1 - c, r)] = grid[at(c, r)];
    }
    // Muebles reflejados: izquierda <-> derecha (los que miran a un lado pasan a mirar al otro)
    for (const item of [...furniture]) furniture.push({ ...item, x: cols - item.x, q: item.q % 2 ? -item.q : item.q });
  }

  // Huecos a los que no se puede llegar: se rellenan con bloques.
  const regions = emptyRegions(grid, cols, rows);
  regions.sort((a, b) => b.length - a.length);
  const open = regions[0] ?? [];
  for (const region of regions.slice(1)) for (const i of region) grid[i] = CELL.BLOCK;
  const interior = (cols - 2) * (rows - 2);
  if (open.length < interior * config.minOpenRatio) return null;

  const random = createRandom(hashSeed(seed, 0x5eed));
  const clear = (i) => NEIGHBOURS_8.every(([dc, dr]) => {
    const c = (i % cols) + dc;
    const r = Math.floor(i / cols) + dr;
    return inside(c, r) && !isSolid(grid[at(c, r)]);
  });
  const roomy = open.filter(clear);

  const spawnCells = spreadPoints(roomy.length >= config.spawnCount ? roomy : open, config.spawnCount, cols, random);
  if (spawnCells.length < Math.min(config.spawnCount, 2)) return null;

  const farFromSpawns = (i) => spawnCells.every((s) => cellDistance(i, s, cols) > SPAWN_PROP_CLEARANCE);
  const propCandidates = roomy.filter(farFromSpawns);
  const propCount = Math.min(propCandidates.length, Math.round(open.length * config.propDensity));
  const props = [];
  for (let k = 0; k < propCount; k++) {
    const index = random.int(0, propCandidates.length);
    const [cell] = propCandidates.splice(index, 1);
    props.push({ type: random.pick(PROP_TYPES), col: cell % cols, row: Math.floor(cell / cols), color: random.int(0, 6) });
  }

  // Muebles sueltos (sillas, cajas...): se empujan como los juguetes, siempre que su casilla quede libre.
  const loose = furniture.filter((f) => f.use === 'suelto');
  for (const f of loose) {
    const i = at(Math.floor(f.x), Math.floor(f.z));
    if (!isSolid(grid[i])) props.push({ type: 'mueble', model: f.model, q: f.q, x: f.x, z: f.z });
  }

  return {
    cols,
    rows,
    seed: config.seed,
    theme, // zona de la casa (null = según la semilla)
    furniture: furniture.filter((f) => f.use !== 'suelto'), // muebles fijos y adornos (en casillas, con decimales)
    // Borde: con paredes de bloques solo en algunos mapas; en el resto, línea roja (ver ArenaBuilder).
    walled: !config.rooms && createRandom(hashSeed(config.seed, 0xb0de)).next() < config.wallChance,
    chunkSize,
    grid,
    chunks,
    spawnPoints: spawnCells.map((i) => ({ col: i % cols, row: Math.floor(i / cols) })),
    props,
    openCells: open.length,
  };
}

/** Divide la rejilla completa (borde incluido) en zonas cuadradas. */
export function listChunks(cols, rows, chunkSize) {
  const chunks = [];
  for (let cy = 0; cy * chunkSize < rows; cy++) {
    for (let cx = 0; cx * chunkSize < cols; cx++) {
      chunks.push({
        cx,
        cy,
        col0: cx * chunkSize,
        row0: cy * chunkSize,
        col1: Math.min(cols, (cx + 1) * chunkSize) - 1,
        row1: Math.min(rows, (cy + 1) * chunkSize) - 1,
      });
    }
  }
  return chunks;
}

/** Estampa piezas en una zona sin tocar otras piezas ni el borde (deja siempre pasillo de 1 casilla). */
function fillChunk(grid, cols, bounds, density, random) {
  const { c0, c1, r0, r1 } = bounds;
  const area = (c1 - c0 + 1) * (r1 - r0 + 1);
  const wanted = Math.round((area * density) / 2.2 * random.range(0.7, 1.3));
  let placed = 0;
  for (let tries = 0; tries < wanted * 6 && placed < wanted; tries++) {
    const stamp = random.weighted(STAMPS);
    const cells = rotate(stamp.cells, random.int(0, 4));
    const col = random.int(c0, c1 + 1);
    const row = random.int(r0, r1 + 1);
    const target = cells.map(([dc, dr]) => [col + dc, row + dr]);
    if (!target.every(([c, r]) => c >= c0 && c <= c1 && r >= r0 && r <= r1)) continue;
    const own = new Set(target.map(([c, r]) => r * cols + c));
    const free = target.every(([c, r]) => NEIGHBOURS_8.concat([[0, 0]]).every(([dc, dr]) => {
      const i = (r + dr) * cols + (c + dc);
      return own.has(i) || !isSolid(grid[i]);
    }));
    if (!free) continue;
    for (const i of own) grid[i] = stamp.type ?? CELL.BLOCK;
    placed++;
  }
}

/**
 * Coloca conjuntos de muebles de la habitación en una zona (sofá con mesita, isla de cocina, cama con mesillas...).
 * Las casillas que pisan los muebles «pared» pasan a ser sólidas; se deja 1 casilla de paso entre conjuntos.
 */
function fillRoom(grid, cols, bounds, sets, density, random, out) {
  const { c0, c1, r0, r1 } = bounds;
  const area = (c1 - c0 + 1) * (r1 - r0 + 1);
  const budget = area * density * random.range(0.8, 1.25); // casillas sólidas que se quieren en la zona
  let used = 0;
  // El conjunto principal de la habitación (sofá con mesita, isla, cama...) va primero en algunas zonas
  const heroTries = random.next() < 0.45 ? 6 : 0;
  for (let tries = 0; tries < 40 && used < budget; tries++) {
    const set = tries < heroTries ? sets[0] : random.weighted(sets.slice(1));
    const flip = random.next() < 0.5; // media vuelta al conjunto entero
    if (set.w > c1 - c0 + 1 || set.h > r1 - r0 + 1) continue;
    const col = random.int(c0, c1 - set.w + 2);
    const row = random.int(r0, r1 - set.h + 2);
    if (col + set.w - 1 > c1 || row + set.h - 1 > r1) continue;
    const items = set.items.map(([model, x, z, q, use, y = 0]) => ({
      model, use, y,
      x: col + (flip ? set.w - x : x),
      z: row + (flip ? set.h - z : z),
      q: flip ? q + 2 : q,
    }));
    // Todo el conjunto (también adornos y sueltos) sobre suelo libre y sin tocar otros muebles
    const solid = new Set(items.filter((i) => i.use === 'pared').flatMap((i) => footprint(i, cols)));
    let free = true;
    for (let r = row - 1; r <= row + set.h && free; r++) {
      for (let c = col - 1; c <= col + set.w && free; c++) if (isSolid(grid[r * cols + c])) free = false;
    }
    if (!free || !solid.size) continue;
    for (const i of solid) grid[i] = CELL.BLOCK;
    out.push(...items);
    used += solid.size;
  }
}

/** Casillas que pisa un mueble (con un pequeño margen para no bloquear por un borde). */
function footprint(item, cols) {
  const size = MODEL_SIZE[item.model] ?? [0.4, 0.4, 0.4];
  const quarter = Math.abs(item.q) % 2 === 1;
  const w = (quarter ? size[2] : size[0]) * FURNITURE_SCALE;
  const d = (quarter ? size[0] : size[2]) * FURNITURE_SCALE;
  const cells = [];
  const margin = 0.2;
  for (let r = Math.floor(item.z - d / 2 + margin); r <= Math.floor(item.z + d / 2 - margin); r++) {
    for (let c = Math.floor(item.x - w / 2 + margin); c <= Math.floor(item.x + w / 2 - margin); c++) cells.push(r * cols + c);
  }
  if (!cells.length) cells.push(Math.floor(item.z) * cols + Math.floor(item.x));
  return cells;
}

/** Gira una pieza 90° `turns` veces y la vuelve a apoyar en (0, 0). */
function rotate(cells, turns) {
  let result = cells;
  for (let t = 0; t < turns; t++) result = result.map(([x, y]) => [-y, x]);
  const minX = Math.min(...result.map(([x]) => x));
  const minY = Math.min(...result.map(([, y]) => y));
  return result.map(([x, y]) => [x - minX, y - minY]);
}

/** Regiones de suelo libre conectadas (vecinos en cruz). */
function emptyRegions(grid, cols, rows) {
  const seen = new Uint8Array(grid.length);
  const regions = [];
  for (let start = 0; start < grid.length; start++) {
    if (seen[start] || isSolid(grid[start])) continue;
    const region = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length) {
      const i = queue.pop();
      region.push(i);
      const c = i % cols;
      const r = Math.floor(i / cols);
      for (const [dc, dr] of NEIGHBOURS_4) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const n = nr * cols + nc;
        if (!seen[n] && !isSolid(grid[n])) {
          seen[n] = 1;
          queue.push(n);
        }
      }
    }
    regions.push(region);
  }
  return regions;
}

/** Elige `count` casillas lo más separadas posible entre sí (muestreo del punto más lejano). */
function spreadPoints(candidates, count, cols, random) {
  if (!candidates.length) return [];
  const chosen = [candidates[random.int(0, candidates.length)]];
  while (chosen.length < Math.min(count, candidates.length)) {
    let best = -1;
    let bestDistance = -1;
    for (const i of candidates) {
      const nearest = chosen.reduce((min, s) => Math.min(min, cellDistance(i, s, cols)), Infinity);
      if (nearest > bestDistance) {
        best = i;
        bestDistance = nearest;
      }
    }
    chosen.push(best);
  }
  return chosen;
}

function cellDistance(a, b, cols) {
  return Math.hypot((a % cols) - (b % cols), Math.floor(a / cols) - Math.floor(b / cols));
}
