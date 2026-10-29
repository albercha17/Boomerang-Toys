/**
 * Formato de los mapas (public/maps/<id>.json), compartido por el servidor (guardar, hornear) y el navegador
 * (juego y editor). Unidades del juego: 1 = una casilla, los muñecos miden 1,5; x a la derecha, z hacia la cámara.
 *
 *   { id, name, theme, play,                         play: false = no sale en la rotación del juego
 *     table: { w, d, chamfer, thickness, height }    mesa: salirse = caer (height = altura hasta el suelo)
 *     room:  { w, d, wallHeight, tile, wallTile, pitDepth, pits: [{ x, z, w, d, round }],   o habitación
 *              floor: 'baldosas' | 'rosa' | 'arena' | 'hierba', walls: 'baldosas' | 'ninguna' }   (suelo y paredes de la base)
 *     water: [{ x, z, w, d, y, round, lava }]        agua: caer dentro = ahogarse (lava: true = te quemas)
 *     objects: [{ id, model, x, y, z, rot, tilt: [x, z], size: [w, h, d], stretch: [x, y, z],
 *                 collider: 'box' | 'cylinder' | 'none', bush, loose }]
 *       size = caja en la que se encaja el modelo (sin deformarlo); stretch lo estira por ejes;
 *       rot = giro en grados sobre el eje vertical; tilt = inclinación en x y z; bush = esconde; loose = se empuja
 *     movers: [{ id, model, from: [x, z], to: [x, z], length, radius, periodMs, pauseMs }]   rodillos que aplastan
 *     devices: [{ id, type, x, z, w, d, rot, ... }]   artefactos (ver public/js/game/arena/devices.js):
 *       conveyor { speed } · door { openMs, closedMs, offsetMs, height, style } · fragile { shakeMs, respawnMs, style }
 *       (style: 'piedra' = de piedra con musgo; sin style, la puerta roja y la pasarela de tablas)
 *       jump { target: [x, z], height, durationMs } · portal { link } (dos portales con el mismo link)
 *     spawns: [[x, z], ...] }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MapFormat = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
  const THEMES = ['cocina', 'bano', 'dormitorio', 'salon', 'patio', 'oeste', 'barbie', 'selva'];
  const FLOORS = ['baldosas', 'rosa', 'arena', 'hierba'];
  const WALLS = ['baldosas', 'ninguna'];
  const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const round = (v) => Math.round(num(v) * 1000) / 1000;

  /** Copia del mapa en el formato actual (convierte el antiguo: sillas de fondo, sueltos y rodillo por carril). */
  function normalizeMap(raw) {
    const data = JSON.parse(JSON.stringify(raw ?? {}));
    const out = {
      id: String(data.id ?? 'mapa'),
      name: String(data.name ?? 'Mapa sin nombre'),
      theme: THEMES.includes(data.theme) ? data.theme : 'cocina',
      play: data.play !== false,
    };
    if (data.note) out.note = String(data.note);
    if (data.room) {
      const r = data.room;
      out.room = { w: num(r.w, 30), d: num(r.d, 18), wallHeight: num(r.wallHeight, 3.2), tile: num(r.tile, 1.4), wallTile: num(r.wallTile, 0.8),
        pitDepth: num(r.pitDepth, 5), pits: (r.pits ?? []).map((p) => ({ x: num(p.x), z: num(p.z), w: num(p.w, 4), d: num(p.d, 4), round: num(p.round) })),
        floor: FLOORS.includes(r.floor) ? r.floor : 'baldosas', walls: WALLS.includes(r.walls) ? r.walls : 'baldosas' };
    } else {
      const t = data.table ?? {};
      out.table = { w: num(t.w, 34), d: num(t.d, 20), chamfer: num(t.chamfer, 2.6), thickness: num(t.thickness, 0.7), height: num(t.height, 9) };
    }
    out.water = (data.water ?? []).map((w) => ({ x: num(w.x), z: num(w.z), w: num(w.w, 4), d: num(w.d, 4), y: num(w.y, -0.35), round: num(w.round),
      ...(w.lava ? { lava: true } : {}) }));

    const used = new Set();
    const uniqueId = (base) => {
      let id = String(base || 'obj').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      if (used.has(id)) { let i = 2; while (used.has(`${id}_${i}`)) i++; id = `${id}_${i}`; }
      used.add(id);
      return id;
    };
    const object = (o) => {
      const clean = { id: uniqueId(o.id ?? o.model), model: String(o.model ?? 'caja'), x: round(o.x), y: round(o.y), z: round(o.z), rot: round(o.rot),
        size: (o.size ?? [1, 1, 1]).slice(0, 3).map((v) => Math.max(0.05, round(v))), collider: ['box', 'cylinder', 'none'].includes(o.collider) ? o.collider : 'box' };
      if (o.tilt && (num(o.tilt[0]) || num(o.tilt[1]))) clean.tilt = [round(o.tilt[0]), round(o.tilt[1])];
      if (o.stretch && o.stretch.some((v) => num(v, 1) !== 1)) clean.stretch = o.stretch.slice(0, 3).map((v) => Math.max(0.05, round(num(v, 1))));
      if (o.bush) { clean.bush = true; clean.collider = 'none'; }
      if (o.loose) clean.loose = true;
      return clean;
    };
    out.objects = (data.objects ?? []).map(object);
    for (const l of data.loose ?? []) out.objects.push(object({ ...l, id: l.id ?? l.model, loose: true, collider: 'box' }));
    const height = out.table?.height ?? 0;
    const chairSize = data.background?.chairSize ?? [6, 11, 6];
    (data.background?.chairs ?? []).forEach(([x, z, rot], i) => out.objects.push(object({ id: `silla_${i}`, model: 'silla', x, z, y: -height, rot, size: chairSize, collider: 'none' })));

    const movers = [];
    for (const m of data.movers ?? []) {
      let from = m.from;
      let to = m.to;
      if (!from || !to) { // formato antiguo: carril `lane` en z y recorrido de -span a span en x
        from = [-num(m.span, 10), num(m.lane)];
        to = [num(m.span, 10), num(m.lane)];
      }
      movers.push({ id: uniqueId(m.id ?? m.model ?? 'rodillo'), model: String(m.model ?? 'rodillo'), from: from.map(round), to: to.map(round),
        length: Math.max(0.5, round(num(m.length, 6))), radius: Math.max(0.2, round(num(m.radius, 0.75))),
        periodMs: Math.max(1000, Math.round(num(m.periodMs, 7000))), pauseMs: Math.max(0, Math.round(num(m.pauseMs, 900))) });
    }
    out.movers = movers;
    const DEVICE_TYPES = ['conveyor', 'door', 'fragile', 'jump', 'portal'];
    out.devices = (data.devices ?? []).filter((d) => DEVICE_TYPES.includes(d.type)).map((d) => {
      const dev = { id: uniqueId(d.id ?? d.type), type: d.type, x: round(d.x), z: round(d.z), w: Math.max(0.3, round(num(d.w, 2))), d: Math.max(0.3, round(num(d.d, 2))), rot: round(d.rot) };
      if (d.type === 'conveyor') dev.speed = round(num(d.speed, 3.5));
      if (d.type === 'door') Object.assign(dev, { openMs: Math.round(num(d.openMs, 2500)), closedMs: Math.round(num(d.closedMs, 2500)), offsetMs: Math.round(num(d.offsetMs, 0)), height: round(num(d.height, 2.6)) });
      if (d.type === 'fragile') Object.assign(dev, { shakeMs: Math.round(num(d.shakeMs, 600)), respawnMs: Math.round(num(d.respawnMs, 5000)) });
      if (d.type === 'jump') Object.assign(dev, { target: (d.target ?? [d.x + 6, d.z]).slice(0, 2).map(round), height: round(num(d.height, 3.5)), durationMs: Math.round(num(d.durationMs, 800)) });
      if (d.type === 'portal') dev.link = String(d.link ?? 'a').slice(0, 20);
      if ((d.type === 'door' || d.type === 'fragile') && d.style === 'piedra') dev.style = 'piedra';
      return dev;
    });
    out.spawns = (data.spawns ?? []).map(([x, z]) => [round(x), round(z)]);
    return out;
  }

  /** Huella de la base (lo que hornea Blender: mesa o suelo con huecos y paredes). Si cambia, la base horneada no vale. */
  function baseKey(map) {
    const n = (v) => String(round(v));
    if (map.room) {
      const r = map.room;
      return ['room', r.w, r.d, r.wallHeight, r.tile, r.wallTile, r.pitDepth].map((v) => (typeof v === 'string' ? v : n(v))).join('|')
        + (r.pits ?? []).map((p) => `|pit:${[p.x, p.z, p.w, p.d, p.round].map(n).join(',')}`).join('')
        + ((r.floor ?? 'baldosas') !== 'baldosas' ? `|suelo:${r.floor}` : '') + ((r.walls ?? 'baldosas') !== 'baldosas' ? `|paredes:${r.walls}` : '');
    }
    const t = map.table;
    return ['table', t.w, t.d, t.chamfer, t.thickness, t.height].map((v) => (typeof v === 'string' ? v : n(v))).join('|');
  }

  /** Errores que impiden guardar (lista vacía si está bien). */
  function validateMap(map) {
    const errors = [];
    if (!ID_PATTERN.test(map.id)) errors.push('El identificador solo puede tener minúsculas, números, - y _');
    if (!map.table && !map.room) errors.push('Falta la mesa o la habitación');
    if ((map.spawns ?? []).length < 2) errors.push('Hacen falta al menos 2 apariciones');
    if ((map.objects ?? []).length > 300) errors.push('Demasiados objetos (máximo 300)');
    return errors;
  }

  /** Mapa nuevo desde cero. */
  function emptyMap(id, kind = 'table') {
    const base = { id, name: 'Mapa nuevo', theme: kind === 'room' ? 'bano' : 'cocina', play: true, objects: [], movers: [], water: [] };
    if (kind === 'room') base.room = { w: 30, d: 18, wallHeight: 3.2, tile: 1.4, wallTile: 0.8, pitDepth: 5, pits: [] };
    else base.table = { w: 34, d: 20, chamfer: 2.6, thickness: 0.7, height: 9 };
    const w = base.table?.w ?? base.room.w;
    const d = base.table?.d ?? base.room.d;
    base.spawns = [[-w * 0.3, -d * 0.3], [w * 0.3, d * 0.3], [-w * 0.3, d * 0.3], [w * 0.3, -d * 0.3],
      [-w * 0.1, -d * 0.4], [w * 0.1, d * 0.4], [-w * 0.42, 0], [w * 0.42, 0]].map(([x, z]) => [round(x), round(z)]);
    return normalizeMap(base);
  }

  return Object.freeze({ ID_PATTERN, THEMES, FLOORS, WALLS, normalizeMap, baseKey, validateMap, emptyMap });
});
