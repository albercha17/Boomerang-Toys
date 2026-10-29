/**
 * API del editor de mapas (/editor):
 *   GET    /api/mapas                 lista (public/maps/index.json) con el estado de la base horneada
 *   GET    /api/mapas/:id             datos del mapa (formato de shared/mapFormat.js)
 *   PUT    /api/mapas/:id             guarda (crea si no existe: así se copia o se hace uno nuevo); si cambiaron las
 *                                     medidas de la base, la vuelve a hornear en Blender en segundo plano
 *   DELETE /api/mapas/:id             lo quita de la lista (el fichero y su base pasan a public/maps/borrados)
 *   GET    /api/modelos               biblioteca de objetos (public/models/objetos/index.json)
 *   GET    /api/modelos/disponibles   modelos .glb de la carpeta bumeran-elementos que aún no están en la biblioteca
 *   POST   /api/modelos/importar      { ruta, id, name, giro } prepara uno con Blender y lo añade a la biblioteca
 *   GET    /api/trabajos              trabajos de Blender (cola, horneando, hecho, error)
 * Blender trabaja de uno en uno; los trabajos se quedan en memoria (se pierden al cerrar el servidor). Las bases se
 * hornean BAKE_DELAY_MS después del último guardado: si se guarda varias veces seguidas, se hornea una sola vez.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const { normalizeMap, baseKey, validateMap, ID_PATTERN } = require('../shared/mapFormat');

const ROOT = path.join(__dirname, '..');
const MAPS = path.join(ROOT, 'public', 'maps');
const BASES = path.join(ROOT, 'public', 'models', 'mapas');
const LIBRARY = path.join(ROOT, 'public', 'models', 'objetos');
const TOOLS = path.join(ROOT, 'herramientas', 'blender');
const ELEMENTS = process.env.BUMERAN_ELEMENTOS || path.join(ROOT, '..', 'bumeran-elementos');
const SKIP_FOLDERS = new Set(['personajes', 'bumerangs']); // personajes y sus búmerangs, no objetos de mapa

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const mapFile = (id) => path.join(MAPS, `${id}.json`);
const readIndex = () => readJson(path.join(MAPS, 'index.json'), []);
const writeIndex = (index) => writeJson(path.join(MAPS, 'index.json'), index);
const readLibrary = () => readJson(path.join(LIBRARY, 'index.json'), []);
const slug = (text) => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/3d model|3d/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'modelo';

/** Blender: variable BLENDER o la versión más nueva en Archivos de programa. */
function findBlender() {
  if (process.env.BLENDER && fs.existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const dir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Blender Foundation');
  try {
    const versions = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'blender.exe'))).sort().reverse();
    if (versions.length) return path.join(dir, versions[0], 'blender.exe');
  } catch { /* sin Blender */ }
  return null;
}

/** ¿La base horneada del mapa coincide con sus medidas? */
function baseState(map) {
  const stamp = readJson(path.join(BASES, map.id, 'base.json'), null);
  if (!stamp) return 'sin hornear';
  return stamp.key === baseKey(map) ? 'horneada' : 'desfasada';
}

// --- cola de Blender -----------------------------------------------------------------------------
const BAKE_DELAY_MS = Number(process.env.BAKE_DELAY_MS ?? 15000);
const jobs = [];
let pumpTimer = null;
let running = null;
let nextJobId = 1;

function enqueue(job) {
  const pending = jobs.find((j) => j.state === 'cola' && j.kind === job.kind && j.target === job.target);
  if (pending) {
    pending.notBefore = Math.max(pending.notBefore, job.notBefore ?? 0); // otro guardado: espera un poco más
    pump();
    return pending;
  }
  const entry = { id: nextJobId++, state: 'cola', queuedAt: new Date().toISOString(), log: '', notBefore: 0, ...job };
  jobs.push(entry);
  if (jobs.length > 50) jobs.splice(0, jobs.length - 50);
  pump();
  return entry;
}

function pump() {
  if (running) return;
  clearTimeout(pumpTimer);
  const waiting = jobs.filter((j) => j.state === 'cola');
  const job = waiting.find((j) => j.notBefore <= Date.now());
  if (!job) {
    if (waiting.length) pumpTimer = setTimeout(pump, Math.min(...waiting.map((j) => j.notBefore)) - Date.now() + 50);
    return;
  }
  const blender = findBlender();
  if (!blender) {
    Object.assign(job, { state: 'error', error: 'No se encuentra Blender (instálalo o pon su ruta en la variable BLENDER)' });
    return pump();
  }
  running = job;
  Object.assign(job, { state: 'trabajando', startedAt: new Date().toISOString() });
  job.start?.();
  const child = spawn(blender, ['-b', '--factory-startup', '--python', job.script, '--', ...job.args], { windowsHide: true });
  const collect = (chunk) => { job.log = (job.log + chunk.toString()).slice(-4000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('error', (error) => finish(job, error.message));
  child.on('close', (code) => finish(job, code === 0 && job.check() ? null : `Blender terminó con código ${code}`));
}

function finish(job, error) {
  if (job.state !== 'trabajando') return;
  job.endedAt = new Date().toISOString();
  if (error) {
    job.state = 'error';
    job.error = error;
  } else {
    job.state = 'hecho';
    job.done?.();
  }
  running = null;
  pump();
}

function queueBake(map) {
  let key = baseKey(map);
  const current = () => { const m = readJson(mapFile(map.id), null); return m ? normalizeMap(m) : null; };
  return enqueue({
    kind: 'base',
    target: map.id,
    label: `Hornear la base de «${map.name}»`,
    notBefore: Date.now() + BAKE_DELAY_MS,
    script: path.join(TOOLS, 'hornear_base.py'),
    args: [map.id, '--muestras', '32'],
    start: () => { const m = current(); if (m) key = baseKey(m); }, // Blender lee el mapa tal como está al empezar
    check: () => fs.existsSync(path.join(BASES, map.id, 'base.glb')),
    done: () => {
      // Si mientras horneaba se cambiaron otra vez las medidas, se vuelve a hornear
      const now = current();
      if (now && baseKey(now) !== key) queueBake(now);
      writeJson(path.join(BASES, map.id, 'base.json'), { key, bakedAt: new Date().toISOString(), ao: true });
      writeIndex(readIndex().map((e) => (e.id === map.id ? { ...e, baked: true } : e))); // el juego ya puede pedir su base
    },
  });
}

function queueImport({ source, id, name, giro }) {
  return enqueue({
    kind: 'modelo',
    target: id,
    label: `Traer el modelo «${name}»`,
    script: path.join(TOOLS, 'preparar_objeto.py'),
    args: [source, path.join(LIBRARY, `${id}.glb`), '12000', giro || ''],
    check: () => fs.existsSync(path.join(LIBRARY, `${id}.glb`)),
    done: () => {
      const library = readLibrary().filter((m) => m.id !== id);
      library.push({ id, name, source: path.relative(ELEMENTS, source) });
      writeJson(path.join(LIBRARY, 'index.json'), library);
    },
  });
}

/** Al guardar una copia (?desde=<id>): si la base del original vale para la copia, se copia y no hay que hornear. */
function copyBase(from, map) {
  if (!ID_PATTERN.test(from) || from === map.id) return;
  const source = path.join(BASES, from);
  const stamp = readJson(path.join(source, 'base.json'), null);
  if (!stamp || stamp.key !== baseKey(map)) return;
  const target = path.join(BASES, map.id);
  fs.mkdirSync(target, { recursive: true });
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(target, file));
}

// --- rutas ----------------------------------------------------------------------------------------
function mapsRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));

  const checkId = (req, res, next) => (ID_PATTERN.test(req.params.id) ? next() : res.status(400).json({ error: 'Identificador no válido' }));

  router.get('/mapas', (req, res) => {
    const list = readIndex().map((entry) => {
      const map = readJson(mapFile(entry.id), null);
      return map ? { ...entry, base: baseState({ ...normalizeMap(map), id: entry.id }) } : null;
    }).filter(Boolean);
    res.json(list);
  });

  router.get('/mapas/:id', checkId, (req, res) => {
    const map = readJson(mapFile(req.params.id), null);
    if (!map) return res.status(404).json({ error: 'No existe ese mapa' });
    res.json({ ...normalizeMap(map), id: req.params.id });
  });

  router.put('/mapas/:id', checkId, (req, res) => {
    const map = { ...normalizeMap(req.body), id: req.params.id };
    const errors = validateMap(map);
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    writeJson(mapFile(map.id), map);
    copyBase(String(req.query.desde ?? ''), map);
    const index = readIndex();
    const at = index.findIndex((e) => e.id === map.id);
    const baked = (at >= 0 && Boolean(index[at].baked)) || baseState(map) === 'horneada';
    const entry = { id: map.id, name: map.name, theme: map.theme, play: map.play, baked };
    if (at >= 0) index[at] = entry;
    else index.push(entry);
    writeIndex(index);
    const base = baseState(map);
    const bake = base !== 'horneada' && req.query.hornear !== 'no' ? queueBake(map) : null;
    res.json({ ok: true, map, base, job: bake?.id ?? null });
  });

  router.delete('/mapas/:id', checkId, (req, res) => {
    const index = readIndex();
    if (!index.some((e) => e.id === req.params.id)) return res.status(404).json({ error: 'No existe ese mapa' });
    writeIndex(index.filter((e) => e.id !== req.params.id));
    const file = mapFile(req.params.id);
    if (fs.existsSync(file)) {
      fs.mkdirSync(path.join(MAPS, 'borrados'), { recursive: true });
      fs.renameSync(file, path.join(MAPS, 'borrados', `${req.params.id}-${Date.now()}.json`));
    }
    const base = path.join(BASES, req.params.id);
    if (fs.existsSync(base)) fs.renameSync(base, path.join(MAPS, 'borrados', `${req.params.id}-${Date.now()}-base`));
    res.json({ ok: true });
  });

  router.get('/modelos', (req, res) => res.json(readLibrary()));

  router.get('/modelos/disponibles', (req, res) => {
    const imported = new Set(readLibrary().map((m) => m.source).filter(Boolean));
    const found = [];
    const walk = (dir, depth = 0) => {
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && depth < 3 && !(depth === 0 && SKIP_FOLDERS.has(e.name.toLowerCase()))) walk(full, depth + 1);
        else if (e.isFile() && /\.glb$/i.test(e.name)) {
          const rel = path.relative(ELEMENTS, full);
          if (!imported.has(rel)) found.push({ ruta: rel, carpeta: path.dirname(rel), nombre: e.name, id: slug(path.basename(e.name, '.glb')) });
        }
      }
    };
    walk(ELEMENTS);
    res.json({ carpeta: ELEMENTS, modelos: found });
  });

  router.post('/modelos/importar', (req, res) => {
    const source = path.resolve(ELEMENTS, String(req.body?.ruta ?? ''));
    if (!source.startsWith(path.resolve(ELEMENTS) + path.sep) || !fs.existsSync(source)) {
      return res.status(400).json({ error: 'Ese fichero no está en la carpeta de elementos' });
    }
    const id = slug(req.body?.id || path.basename(source, '.glb'));
    const name = String(req.body?.name || id).slice(0, 60);
    const giro = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(req.body?.giro ?? '') ? req.body.giro : '';
    const job = queueImport({ source, id, name, giro });
    res.json({ ok: true, id, job: job.id });
  });

  router.get('/trabajos', (req, res) => {
    res.json(jobs.map(({ script, args, check, done, ...rest }) => rest));
  });

  return router;
}

module.exports = { mapsRouter };
