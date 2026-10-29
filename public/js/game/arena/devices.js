import * as THREE from 'three';

/**
 * Artefactos del escenario (data.devices; formato en shared/mapFormat.js). Cada uno es un rectángulo (x, z, w, d, rot)
 * con lo suyo:
 *   conveyor  cinta transportadora: arrastra personajes, búmerangs del suelo y sueltos hacia su +x local (speed)
 *   door      puerta que sube y baja: cerrada es una pared (también para los búmerangs) (openMs, closedMs, offsetMs, height)
 *   fragile   pasarela que se cae: al pisarla tiembla (shakeMs), cae y vuelve a salir (respawnMs). Mientras está,
 *             se puede pisar aunque debajo haya un hueco o el vacío
 *   jump      trampolín: te lanza por el aire hasta target [x, z] (height, durationMs)
 *   portal    portal: te lleva al otro portal con el mismo `link` (y a los búmerangs que vuelan)
 *   ice       hielo: quien lo pisa resbala (grip: cuánto agarra, 0..1)
 *   spikes    pinchos: salen del suelo (downMs abajo, warnMs asomando, upMs arriba: matan; offsetMs para turnarse)
 *   spinner   brazo giratorio a ras de suelo que tumba a quien pilla (radius, speed rad/s, arms, height, color)
 *   maze      laberinto: paredes en una cuadrícula cols × rows que cada `periodMs` cambian a otro laberinto (las
 *             que sobran se hunden, las nuevas suben; parpadean `warnMs` antes); height, color, open, seed
 *   train     tren de juguete: da vueltas por una vía (w × d, esquinas de radio `radius`) a `speed` y atropella;
 *             cars = modelos de la biblioteca (el primero, la locomotora), carLength, flip (si van del revés)
 * buildDevices monta lo que se ve y la física; la partida llama a update (animación y estado) y a affect (lo que
 * hacen a personajes, búmerangs y sueltos).
 */
const DEG = Math.PI / 180;
const FALL_GRAVITY = 24;

/** Coordenadas locales del artefacto: `u` a lo largo (su +x girado) y `v` a lo ancho. */
function local(dev, x, z) {
  const a = -(dev.rot ?? 0) * DEG; // el giro del juego (rotation.y) lleva +x hacia -z
  const dx = x - dev.x;
  const dz = z - dev.z;
  return { u: dx * Math.cos(a) + dz * Math.sin(a), v: -dx * Math.sin(a) + dz * Math.cos(a) };
}

const inside = (dev, x, z, margin = 0) => {
  const { u, v } = local(dev, x, z);
  return Math.abs(u) <= dev.w / 2 + margin && Math.abs(v) <= dev.d / 2 + margin;
};

/** Dirección de la cinta en el mundo. */
const along = (dev) => ({ x: Math.cos(-(dev.rot ?? 0) * DEG), z: Math.sin(-(dev.rot ?? 0) * DEG) });

function stripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3b3f4a';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffcf33';
  for (const y of [32, 96]) { // flechas (chevrones) hacia +u
    g.beginPath();
    g.moveTo(40, y - 22); g.lineTo(76, y); g.lineTo(40, y + 22); g.lineTo(54, y + 22); g.lineTo(90, y); g.lineTo(54, y - 22);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(0, 0, 0, 0.25)';
  for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function plankTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  const tones = ['#c8894f', '#b97a42', '#d39a5d', '#bf8147'];
  for (let i = 0; i < 4; i++) { g.fillStyle = tones[i]; g.fillRect(0, i * 32, 128, 32); g.fillStyle = 'rgba(60, 30, 10, 0.5)'; g.fillRect(0, i * 32 + 30, 128, 2); }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Bloques de piedra con musgo (pasarelas y puertas con style 'piedra', para la selva). */
function stoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#4a463e';
  g.fillRect(0, 0, 128, 128);
  const tones = ['#7d776a', '#6f6a5e', '#857f70', '#767064'];
  let k = 0;
  for (let row = 0; row < 4; row++) {
    const shift = row % 2 ? 32 : 0;
    for (let x = -32; x < 128; x += 64) {
      g.fillStyle = tones[k++ % tones.length];
      g.fillRect(x + shift + 2, row * 32 + 2, 60, 28);
    }
  }
  g.fillStyle = 'rgba(96, 150, 70, 0.55)'; // musgo
  for (const [x, y, r] of [[20, 30, 9], [90, 64, 12], [60, 110, 8], [110, 10, 7]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Vía del tren: rectángulo de esquinas redondeadas (radio `radius`) de w × d centrado en el artefacto. trackPoint da
 * el punto a la distancia s de la vía (coordenadas locales u, v) y su dirección; trackDistance, lo lejos que está un
 * punto del mundo de la vía.
 */
function trackShape(def) {
  const a = def.w / 2;
  const b = def.d / 2;
  const r = Math.max(0.5, Math.min(def.radius ?? Math.min(a, b), a, b));
  const lx = 2 * (a - r);
  const lz = 2 * (b - r);
  const arc = (r * Math.PI) / 2;
  return { a, b, r, lx, lz, arc, length: 2 * lx + 2 * lz + 4 * arc };
}

export function trackPoint(def, s, shape = trackShape(def)) {
  const { a, b, r, lx, lz, arc, length } = shape;
  let t = ((s % length) + length) % length;
  const segs = [
    ['line', lx, -a + r, -b, 1, 0], ['arc', arc, a - r, -b + r, -Math.PI / 2],
    ['line', lz, a, -b + r, 0, 1], ['arc', arc, a - r, b - r, 0],
    ['line', lx, a - r, b, -1, 0], ['arc', arc, -a + r, b - r, Math.PI / 2],
    ['line', lz, -a, b - r, 0, -1], ['arc', arc, -a + r, -b + r, Math.PI],
  ];
  for (const [kind, len, x0, z0, p0, p1] of segs) {
    if (t > len) { t -= len; continue; }
    if (kind === 'line') return { u: x0 + p0 * t, v: z0 + p1 * t, hu: p0, hv: p1 };
    const ang = p0 + t / r;
    return { u: x0 + Math.cos(ang) * r, v: z0 + Math.sin(ang) * r, hu: -Math.sin(ang), hv: Math.cos(ang) };
  }
  return { u: -a + r, v: -b, hu: 1, hv: 0 };
}

export function trackDistance(def, x, z) {
  const { a, b, r } = trackShape(def);
  const { u, v } = local(def, x, z);
  const qx = Math.abs(u) - (a - r);
  const qz = Math.abs(v) - (b - r);
  return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r);
}

/** Del sistema local del artefacto (u, v) al mundo. */
function toWorld(def, u, v) {
  const a = (def.rot ?? 0) * DEG;
  return { x: def.x + u * Math.cos(a) + v * Math.sin(a), z: def.z - u * Math.sin(a) + v * Math.cos(a) };
}

const TRAIN_CARS = ['locomotora', 'vagon_cisterna', 'vagon_tolva', 'furgon_cola'];
const GAUGE = 0.9; // separación de los raíles

function buildTrain(dev, def, own, models) {
  const shape = trackShape(def);
  dev.shape = shape;
  // Traviesas y raíles (instanciados: una malla para cada cosa)
  const sleepers = Math.ceil(shape.length / 0.6);
  const sleeperMesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(0.3, 0.08, 1.5)), own(new THREE.MeshStandardMaterial({ color: 0x9a6a3f, roughness: 0.8 })), sleepers);
  const railSteps = Math.ceil(shape.length / 0.3);
  const railMesh = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 0.1, 0.09)), own(new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.35, metalness: 0.6 })), railSteps * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < sleepers; i++) {
    const p = trackPoint(def, (i * shape.length) / sleepers, shape);
    q.setFromAxisAngle(up, -Math.atan2(p.hv, p.hu));
    sleeperMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.u, 0.04, p.v), q, new THREE.Vector3(1, 1, 1)));
  }
  const step = shape.length / railSteps;
  for (let i = 0; i < railSteps; i++) {
    const p0 = trackPoint(def, i * step, shape);
    const p1 = trackPoint(def, (i + 1) * step, shape);
    for (const [k, side] of [[0, -1], [1, 1]]) { // un tramo de cada raíl, de un punto de la vía al siguiente
      const ax = p0.u - (p0.hv * side * GAUGE) / 2;
      const az = p0.v + (p0.hu * side * GAUGE) / 2;
      const bx = p1.u - (p1.hv * side * GAUGE) / 2;
      const bz = p1.v + (p1.hu * side * GAUGE) / 2;
      q.setFromAxisAngle(up, -Math.atan2(bz - az, bx - ax));
      railMesh.setMatrixAt(i * 2 + k, m.compose(new THREE.Vector3((ax + bx) / 2, 0.12, (az + bz) / 2), q, new THREE.Vector3(Math.hypot(bx - ax, bz - az) + 0.02, 1, 1)));
    }
  }
  for (const mesh of [sleeperMesh, railMesh]) { mesh.receiveShadow = true; mesh.castShadow = true; dev.group.add(mesh); }
  // Vagones: modelos de la biblioteca a lo largo de la vía (el primero, la locomotora, mide carLength; los demás,
  // a la misma escala que ella)
  dev.carLength = def.carLength ?? 2.2;
  const names = def.cars?.length ? def.cars : TRAIN_CARS;
  const first = models[names[0]];
  const scale = first ? dev.carLength / Math.max(first.size.x, first.size.z) : 1;
  dev.cars = names.map((name, i) => {
    const holder = new THREE.Group();
    const model = models[name];
    let width = 0.9;
    let length = dev.carLength;
    if (model) {
      const copy = model.scene.clone(true);
      const s = first ? scale : dev.carLength / Math.max(model.size.x, model.size.z);
      length = Math.max(model.size.x, model.size.z) * s;
      copy.scale.setScalar(s);
      const turn = new THREE.Group(); // el largo del modelo, a lo largo de la vía
      if (model.size.z > model.size.x) turn.rotation.y = Math.PI / 2;
      if (def.flip) turn.rotation.y += Math.PI;
      turn.add(copy);
      width = Math.min(model.size.x, model.size.z) * s;
      holder.add(turn);
    } else {
      const box = new THREE.Mesh(own(new THREE.BoxGeometry(dev.carLength, 0.9, 0.9)), own(new THREE.MeshStandardMaterial({ color: i ? 0x3a86ff : 0xe63946, roughness: 0.5 })));
      box.position.y = 0.45;
      box.castShadow = true;
      holder.add(box);
    }
    dev.group.add(holder);
    return { holder, width, length, x: def.x, z: def.z, hx: 1, hz: 0 };
  });
  dev.trainLength = dev.cars.reduce((sum, car) => sum + car.length + 0.25, 0);
  // Humo de la locomotora
  dev.puffs = [];
  const puffGeometry = own(new THREE.SphereGeometry(1, 8, 6));
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(puffGeometry, own(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 1, transparent: true, opacity: 0, depthWrite: false })));
    dev.group.add(puff);
    dev.puffs.push({ mesh: puff, phase: i / 5 });
  }
}

/** Mueve el tren: la cabeza avanza `speed` por segundo y cada vagón sigue la vía detrás. */
function updateTrain(d, now) {
  const head = (now / 1000) * (d.speed ?? 4);
  const a = (d.rot ?? 0) * DEG;
  let back = head; // donde acaba el vagón de delante
  d.cars.forEach((car, i) => {
    const L = car.length;
    const center = back - L / 2;
    back -= L + 0.25;
    const f = trackPoint(d, center + L / 2, d.shape);
    const b = trackPoint(d, center - L / 2, d.shape);
    const u = (f.u + b.u) / 2;
    const v = (f.v + b.v) / 2;
    const yaw = Math.atan2(f.v - b.v, f.u - b.u);
    car.holder.position.set(u, 0.17, v);
    car.holder.rotation.y = -yaw;
    const w = toWorld(d, u, v);
    car.x = w.x;
    car.z = w.z;
    // dirección en el mundo (el giro del artefacto lleva +x hacia -z)
    car.hx = Math.cos(yaw) * Math.cos(a) + Math.sin(yaw) * Math.sin(a);
    car.hz = -Math.cos(yaw) * Math.sin(a) + Math.sin(yaw) * Math.cos(a);
    if (i === 0) {
      for (const p of d.puffs) {
        const k = ((now / 1600 + p.phase) % 1 + 1) % 1;
        p.mesh.position.set(u + Math.cos(yaw) * L * 0.3, 1.3 + k * 1.6, v + Math.sin(yaw) * L * 0.3);
        p.mesh.scale.setScalar(0.12 + k * 0.35);
        p.mesh.material.opacity = Math.sin(k * Math.PI) * 0.7;
      }
    }
  });
}

/** Generador de números con semilla (mulberry32): el mismo laberinto para la misma vuelta. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Tramos de pared posibles de un laberinto de cols × rows casillas (sin el borde): verticales entre una casilla y
 * la de su derecha, horizontales entre una y la de abajo. Cada uno con su centro, largo y orientación (local).
 */
function mazeSegments(def) {
  const cw = def.w / def.cols;
  const ch = def.d / def.rows;
  const segs = [];
  for (let i = 0; i < def.cols - 1; i++) {
    for (let j = 0; j < def.rows; j++) segs.push({ a: [i, j], b: [i + 1, j], u: -def.w / 2 + (i + 1) * cw, v: -def.d / 2 + (j + 0.5) * ch, len: ch, vertical: true });
  }
  for (let i = 0; i < def.cols; i++) {
    for (let j = 0; j < def.rows - 1; j++) segs.push({ a: [i, j], b: [i, j + 1], u: -def.w / 2 + (i + 0.5) * cw, v: -def.d / 2 + (j + 1) * ch, len: cw, vertical: false });
  }
  return segs;
}

/** Qué tramos están levantados en la vuelta `epoch`: un laberinto (todo conectado) con algunos huecos de más. */
function mazeLayout(def, segs, epoch) {
  const rand = seeded((def.seed ?? 7) * 7919 + epoch * 104729);
  const { cols, rows } = def;
  const key = (i, j) => j * cols + i;
  const wallOf = new Map(segs.map((s, k) => [`${key(...s.a)}-${key(...s.b)}`, k]));
  const up = new Array(segs.length).fill(true);
  const seen = new Set([key(Math.floor(rand() * cols), Math.floor(rand() * rows))]);
  const stack = [[...seen][0]];
  while (stack.length) { // recorrido en profundidad: tira paredes hasta que todo está conectado
    const c = stack[stack.length - 1];
    const i = c % cols;
    const j = Math.floor(c / cols);
    const next = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]].filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows && !seen.has(key(x, y)));
    if (!next.length) { stack.pop(); continue; }
    const [x, y] = next[Math.floor(rand() * next.length)];
    const n = key(x, y);
    up[wallOf.get(c < n ? `${c}-${n}` : `${n}-${c}`)] = false;
    seen.add(n);
    stack.push(n);
  }
  const open = def.open ?? 0.35; // y quita algunas más: varios caminos, mejor para pelear
  for (let k = 0; k < up.length; k++) if (up[k] && rand() < open) up[k] = false;
  return up;
}

function buildMaze(dev, def, own, physics) {
  const segs = mazeSegments(def);
  const h = def.height ?? 1.8;
  const thick = 0.4;
  const neon = new THREE.Color(def.color ?? 0x2bf0ff);
  const body = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)),
    own(new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.35, metalness: 0.3, emissive: 0x2a0a4a, emissiveIntensity: 0.6 })), segs.length);
  const strip = new THREE.InstancedMesh(own(new THREE.BoxGeometry(1, 1, 1)),
    own(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })), segs.length * 2); // sin luz: el color de cada tramo brilla
  strip.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(segs.length * 2 * 3).fill(1), 3);
  body.castShadow = true;
  body.receiveShadow = true;
  dev.group.add(body, strip);
  dev.segs = segs.map((s) => ({ ...s, rise: 0, target: 0, bodyOn: true,
    body: (() => {
      const w = toWorld(def, s.u, s.v);
      const rot = (def.rot ?? 0) * DEG + (s.vertical ? Math.PI / 2 : 0);
      return { w, rot, half: [s.len / 2 + thick / 2, h / 2, thick / 2] };
    })() }));
  for (const s of dev.segs) s.physics = physics.addWall(s.body.w.x, h / 2, s.body.w.z, ...s.body.half, s.body.rot); // se quitan los bajados al empezar
  dev.mazeMeshes = { body, strip };
  dev.mazeH = h;
  dev.thick = thick;
  dev.epoch = -1;
  dev.neon = neon;
}

/** Cada `periodMs`, laberinto nuevo: lo que sobra se hunde y lo nuevo sube; antes, parpadea lo que va a cambiar. */
function updateMaze(d, now, dt, physics) {
  const period = d.periodMs ?? 10000;
  const warn = d.warnMs ?? 1500;
  const epoch = Math.floor(now / period);
  if (epoch !== d.epoch) {
    d.epoch = epoch;
    const up = mazeLayout(d, d.segs, epoch);
    const next = mazeLayout(d, d.segs, epoch + 1);
    d.segs.forEach((s, k) => { s.target = up[k] ? 1 : 0; s.next = next[k] ? 1 : 0; });
  }
  const warning = now % period > period - warn;
  const blink = warning && Math.floor(now / 120) % 2 === 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const { body, strip } = d.mazeMeshes;
  d.segs.forEach((s, k) => {
    s.rise += (s.target - s.rise) * Math.min(1, dt * 6);
    const y = -d.mazeH / 2 - 0.05 + s.rise * (d.mazeH + 0.05);
    q.setFromAxisAngle(yAxis, s.vertical ? Math.PI / 2 : 0);
    body.setMatrixAt(k, m.compose(new THREE.Vector3(s.u, y, s.v), q, new THREE.Vector3(s.len + d.thick, d.mazeH, d.thick)));
    // Ribetes de neón arriba (en las dos caras); en el aviso parpadean los que van a cambiar
    const changes = s.next !== s.target;
    const glow = changes && blink ? 0.15 : 1;
    c.copy(d.neon).multiplyScalar(glow);
    if (changes && warning && !s.target) c.setRGB(blink ? 1 : 0.4, blink ? 0.9 : 0.35, 0.1); // va a subir: aviso amarillo en el suelo
    for (const side of [-1, 1]) {
      const off = new THREE.Vector3(0, 0, side * (d.thick / 2 + 0.01)).applyQuaternion(q);
      const sy = s.target || !warning ? y + d.mazeH / 2 - 0.08 : 0.03;
      strip.setMatrixAt(k * 2 + (side > 0 ? 1 : 0), m.compose(new THREE.Vector3(s.u + off.x, sy, s.v + off.z), q,
        new THREE.Vector3(s.len + d.thick, 0.06, 0.04)));
      strip.setColorAt(k * 2 + (side > 0 ? 1 : 0), c);
    }
    const solid = s.rise > 0.5;
    if (solid && !s.bodyOn) { physics.add(s.physics); s.bodyOn = true; s.justRose = true; } else if (!solid && s.bodyOn) { physics.remove(s.physics); s.bodyOn = false; }
  });
  body.instanceMatrix.needsUpdate = true;
  strip.instanceMatrix.needsUpdate = true;
  strip.instanceColor.needsUpdate = true;
}

/** ¿Está el punto encima de algún tramo posible del laberinto? (para no poner allí power-ups ni apariciones) */
export function mazeDistance(def, x, z) {
  const { u, v } = local(def, x, z);
  if (Math.abs(u) > def.w / 2 + 0.5 || Math.abs(v) > def.d / 2 + 0.5) return Infinity;
  const cw = def.w / def.cols;
  const ch = def.d / def.rows;
  const fu = (u + def.w / 2) / cw;
  const fv = (v + def.d / 2) / ch;
  const du = Math.abs(fu - Math.round(fu)) * cw;
  const dv = Math.abs(fv - Math.round(fv)) * ch;
  const inU = Math.round(fu) > 0 && Math.round(fu) < def.cols;
  const inV = Math.round(fv) > 0 && Math.round(fv) < def.rows;
  return Math.min(inU ? du : Infinity, inV ? dv : Infinity);
}

/** Hielo: lámina azul clara y brillante con grietas (dibujada una vez). */
let ICE_TEXTURE = null;
function iceTexture() {
  if (ICE_TEXTURE) return ICE_TEXTURE;
  const n = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, n, n);
  grad.addColorStop(0, '#cfefff');
  grad.addColorStop(0.5, '#a9dcf5');
  grad.addColorStop(1, '#d9f4ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let k = 0; k < 18; k++) { // grietas
    let x = Math.random() * n;
    let y = Math.random() * n;
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 120; y += (Math.random() - 0.5) * 120; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 0; k < 40; k++) g.fillRect(Math.random() * n, Math.random() * n, 30 + Math.random() * 60, 3); // reflejos
  ICE_TEXTURE = new THREE.CanvasTexture(canvas);
  ICE_TEXTURE.colorSpace = THREE.SRGBColorSpace;
  ICE_TEXTURE.wrapS = ICE_TEXTURE.wrapT = THREE.RepeatWrapping;
  return ICE_TEXTURE;
}

function buildIce(dev, def, own) {
  const tex = own(iceTexture().clone());
  tex.repeat.set(def.w / 6, def.d / 6);
  tex.needsUpdate = true;
  const r = Math.min(def.round ?? 1, def.w / 2 - 0.01, def.d / 2 - 0.01);
  const shape = new THREE.Shape();
  const a = def.w / 2;
  const b = def.d / 2;
  shape.moveTo(-a + r, -b); shape.lineTo(a - r, -b); shape.quadraticCurveTo(a, -b, a, -b + r); shape.lineTo(a, b - r);
  shape.quadraticCurveTo(a, b, a - r, b); shape.lineTo(-a + r, b); shape.quadraticCurveTo(-a, b, -a, b - r); shape.lineTo(-a, -b + r);
  shape.quadraticCurveTo(-a, -b, -a + r, -b);
  if (def.holeW > 0 && def.holeD > 0) { // agujero en el centro (un hueco con agua): el hielo no lo tapa
    const ha = def.holeW / 2;
    const hb = def.holeD / 2;
    const hr = Math.min(def.holeRound ?? 0.8, ha - 0.01, hb - 0.01);
    const hole = new THREE.Path();
    hole.moveTo(-ha + hr, -hb); hole.lineTo(ha - hr, -hb); hole.quadraticCurveTo(ha, -hb, ha, -hb + hr); hole.lineTo(ha, hb - hr);
    hole.quadraticCurveTo(ha, hb, ha - hr, hb); hole.lineTo(-ha + hr, hb); hole.quadraticCurveTo(-ha, hb, -ha, hb - hr); hole.lineTo(-ha, -hb + hr);
    hole.quadraticCurveTo(-ha, -hb, -ha + hr, -hb);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (geometry.attributes.position.getX(i) + a) / 6, (geometry.attributes.position.getY(i) + b) / 6);
  const mesh = new THREE.Mesh(own(geometry), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.08, metalness: 0.15, envMapIntensity: 1.2 })));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.025;
  mesh.receiveShadow = true;
  dev.group.add(mesh);
}

/** Pinchos: placa con agujeros y conos que salen del suelo. Ciclo: abajo → asoman (aviso) → arriba (matan) → abajo. */
function buildSpikes(dev, def, own) {
  const plate = new THREE.Mesh(own(new THREE.BoxGeometry(def.w, 0.06, def.d)), own(new THREE.MeshStandardMaterial({ color: 0x5a5560, roughness: 0.6, metalness: 0.5 })));
  plate.position.y = 0.03;
  plate.receiveShadow = true;
  dev.group.add(plate);
  const step = 0.55;
  const nx = Math.max(1, Math.floor(def.w / step));
  const nz = Math.max(1, Math.floor(def.d / step));
  const cone = own(new THREE.ConeGeometry(0.13, 0.75, 8));
  cone.translate(0, 0.375, 0);
  dev.spikeMesh = new THREE.InstancedMesh(cone, own(new THREE.MeshStandardMaterial({ color: 0xd8dde6, roughness: 0.25, metalness: 0.85 })), nx * nz);
  dev.spikeMesh.castShadow = true;
  dev.spikeCells = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) dev.spikeCells.push([-def.w / 2 + (i + 0.5) * (def.w / nx), -def.d / 2 + (j + 0.5) * (def.d / nz)]);
  dev.group.add(dev.spikeMesh);
  dev.spikeH = 0;
}

/** Fase de los pinchos: 'down', 'warn' (asoman), 'up' (matan). */
function spikePhase(d, now) {
  const cycle = (d.downMs ?? 2200) + (d.warnMs ?? 700) + (d.upMs ?? 1200);
  const t = ((now + (d.offsetMs ?? 0)) % cycle + cycle) % cycle;
  if (t < (d.downMs ?? 2200)) return 'down';
  if (t < (d.downMs ?? 2200) + (d.warnMs ?? 700)) return 'warn';
  return 'up';
}

function updateSpikes(d, now, dt) {
  d.phase = spikePhase(d, now);
  const target = d.phase === 'up' ? 1 : d.phase === 'warn' ? 0.18 + Math.sin(now / 40) * 0.05 : -0.05;
  d.spikeH += (target - d.spikeH) * Math.min(1, dt * (d.phase === 'up' ? 30 : 10));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, Math.max(0.001, d.spikeH), 1);
  d.spikeCells.forEach(([u, v], k) => d.spikeMesh.setMatrixAt(k, m.compose(new THREE.Vector3(u, 0.02, v), q, s)));
  d.spikeMesh.instanceMatrix.needsUpdate = true;
}

/** Brazo giratorio: poste en el centro y una barra de rayas que barre a ras de suelo (salta o agáchate... salta). */
function buildSpinner(dev, def, own) {
  const r = def.radius ?? Math.min(def.w, def.d) / 2;
  const h = def.height ?? 0.55;
  const post = new THREE.Mesh(own(new THREE.CylinderGeometry(0.45, 0.6, h + 0.5, 20)), own(new THREE.MeshStandardMaterial({ color: def.color ?? 0xff4d6d, roughness: 0.4 })));
  post.position.y = (h + 0.5) / 2;
  post.castShadow = true;
  dev.group.add(post);
  dev.arm = new THREE.Group();
  dev.arm.position.y = h;
  dev.group.add(dev.arm);
  const arms = def.arms ?? 2;
  const stripe = (() => { // barra de rayas de feria
    const c = document.createElement('canvas');
    c.width = 256; c.height = 32;
    const g = c.getContext('2d');
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : (def.stripe ?? '#ff3b6b'); g.fillRect(i * 32, 0, 32, 32); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return own(t);
  })();
  const barMaterial = own(new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.35 }));
  const bulbMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffe58a }));
  const bulb = own(new THREE.SphereGeometry(0.09, 8, 6));
  for (let k = 0; k < arms; k++) {
    const holder = new THREE.Group();
    holder.rotation.y = (k / arms) * Math.PI * 2;
    const bar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.22, 0.22, r, 14)), barMaterial);
    bar.rotation.z = Math.PI / 2;
    bar.position.x = r / 2;
    bar.castShadow = true;
    holder.add(bar);
    for (let b = 1; b < 6; b++) { const s = new THREE.Mesh(bulb, bulbMaterial); s.position.set((b / 6) * r, 0.24, 0); holder.add(s); }
    dev.arm.add(holder);
  }
  dev.radius = r;
  dev.arms = arms;
  dev.angle = def.phase ?? 0;
}

function updateSpinner(d, now, dt) {
  d.angle += (d.speed ?? 1.4) * dt;
  d.arm.rotation.y = d.angle;
}

/** ¿Barre el brazo el punto (x, z)? */
function spinnerHits(d, x, z, r) {
  const dx = x - d.x;
  const dz = z - d.z;
  const dist = Math.hypot(dx, dz);
  if (dist > d.radius + r || dist < 0.5) return dist < 0.6 + r; // el poste también
  const a = Math.atan2(-dz, dx) - (d.rot ?? 0) * DEG; // mismo sentido que rotation.y
  for (let k = 0; k < d.arms; k++) {
    const arm = d.angle + (k / d.arms) * Math.PI * 2;
    const diff = Math.atan2(Math.sin(a - arm), Math.cos(a - arm));
    if (Math.abs(diff * dist) < 0.25 + r * 0.7) return true;
  }
  return false;
}

const PORTAL_COLORS = [0x9b5de5, 0x00b4c6, 0xff7f11, 0x2bb673, 0xe63946];

export function buildDevices(root, physics, list, own, models = {}) {
  const devices = [];
  const portalLinks = [...new Set(list.filter((d) => d.type === 'portal').map((d) => d.link))];
  for (const def of list) {
    const dev = { ...def, group: new THREE.Group(), state: 'idle', since: 0 };
    dev.group.name = def.id;
    dev.group.position.set(def.x, 0, def.z);
    dev.group.rotation.y = (def.rot ?? 0) * DEG;
    root.add(dev.group);
    const mesh = (geometry, material) => { const m = new THREE.Mesh(own(geometry), own(material)); m.castShadow = true; m.receiveShadow = true; dev.group.add(m); return m; };

    if (def.type === 'conveyor') {
      const tex = own(stripeTexture());
      tex.repeat.set(def.w / 1.2, def.d / 1.2);
      dev.texture = tex;
      const belt = mesh(new THREE.BoxGeometry(def.w, 0.12, def.d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      belt.position.y = 0.06;
      for (const side of [-1, 1]) { // barandillas
        const rail = mesh(new THREE.BoxGeometry(def.w, 0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.4, metalness: 0.3 }));
        rail.position.set(0, 0.11, side * (def.d / 2 + 0.07));
      }
    } else if (def.type === 'door') {
      const h = def.height ?? 2.6;
      dev.panel = new THREE.Group();
      dev.group.add(dev.panel);
      const stone = def.style === 'piedra';
      let slabMaterial;
      if (stone) {
        const tex = own(stoneTexture());
        tex.repeat.set(def.w / 2, h / 2);
        slabMaterial = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      } else {
        slabMaterial = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.45 });
      }
      const slab = new THREE.Mesh(own(new THREE.BoxGeometry(def.w, h, def.d)), own(slabMaterial));
      slab.position.y = h / 2;
      slab.castShadow = true;
      dev.panel.add(slab);
      for (let k = -1; k <= 1; k += 2) { // franjas amarillas de aviso (en piedra, cenefas talladas)
        const stripe = new THREE.Mesh(own(new THREE.BoxGeometry(def.w * 1.01, 0.18, def.d * 1.02)),
          own(new THREE.MeshStandardMaterial({ color: stone ? 0x2a9d8f : 0xffd166, roughness: stone ? 0.7 : 0.4 })));
        stripe.position.y = h / 2 + k * h * 0.28;
        dev.panel.add(stripe);
      }
      for (const side of [-1, 1]) { // postes
        const post = mesh(new THREE.BoxGeometry(0.3, h + 0.3, def.d + 0.25), new THREE.MeshStandardMaterial(stone
          ? { color: 0x7d7768, roughness: 0.95 } : { color: 0x5c6b7a, roughness: 0.5, metalness: 0.4 }));
        post.position.set(side * (def.w / 2 + 0.15), (h + 0.3) / 2, 0);
      }
      dev.height = h;
      dev.open = 0; // 0 cerrada, 1 abierta (bajo el suelo)
    } else if (def.type === 'fragile') {
      const tex = own(def.style === 'piedra' ? stoneTexture() : plankTexture());
      tex.repeat.set(def.w / 2, def.d / 2);
      dev.planks = new THREE.Group();
      dev.group.add(dev.planks);
      const n = Math.max(1, Math.round(def.w / 0.9));
      dev.plankMeshes = [];
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(own(new THREE.BoxGeometry(def.w / n - 0.06, 0.16, def.d)), own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
        p.position.set(-def.w / 2 + (i + 0.5) * (def.w / n), -0.06, 0);
        p.castShadow = p.receiveShadow = true;
        dev.planks.add(p);
        dev.plankMeshes.push({ mesh: p, home: p.position.clone(), vy: 0, spin: (Math.random() - 0.5) * 3 });
      }
    } else if (def.type === 'jump') {
      const r = Math.min(def.w, def.d) / 2;
      mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.18, 28), new THREE.MeshStandardMaterial({ color: 0x5c6b7a, roughness: 0.5, metalness: 0.4 })).position.y = 0.09;
      dev.top = mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0xff5fa2, roughness: 0.35 }));
      dev.top.position.y = 0.26;
      const spring = mesh(new THREE.TorusGeometry(r * 0.45, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.3 }));
      spring.rotation.x = Math.PI / 2;
      spring.position.y = 0.2;
      dev.radius = r;
    } else if (def.type === 'portal') {
      const r = Math.min(def.w, def.d) / 2;
      const color = PORTAL_COLORS[portalLinks.indexOf(def.link) % PORTAL_COLORS.length];
      const ring = mesh(new THREE.TorusGeometry(r, 0.12, 10, 36), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.08;
      dev.swirl = new THREE.Mesh(own(new THREE.CircleGeometry(r * 0.95, 32)), own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false })));
      dev.swirl.rotation.x = -Math.PI / 2;
      dev.swirl.position.y = 0.05;
      dev.group.add(dev.swirl);
      dev.radius = r;
      dev.color = color;
    } else if (def.type === 'train') {
      buildTrain(dev, def, own, models);
    } else if (def.type === 'maze') {
      buildMaze(dev, def, own, physics);
    } else if (def.type === 'ice') {
      buildIce(dev, def, own);
    } else if (def.type === 'spikes') {
      buildSpikes(dev, def, own);
    } else if (def.type === 'spinner') {
      buildSpinner(dev, def, own);
    }
    if (def.type === 'door') {
      dev.body = physics.addWall(def.x, (dev.height) / 2, def.z, def.w / 2, dev.height / 2, def.d / 2, (def.rot ?? 0) * DEG);
    }
    devices.push(dev);
  }

  const api = {
    list: devices,

    /** ¿Hay suelo firme de una pasarela entera en ese punto? (aunque debajo haya un hueco o el vacío) */
    solidAt(x, z) {
      return devices.some((d) => d.type === 'fragile' && d.state !== 'fallen' && inside(d, x, z));
    },

    /** Animación y estado (puertas, pasarelas, cintas, portales, trampolines). */
    update(now, dt) {
      for (const d of devices) {
        if (d.type === 'conveyor') d.texture.offset.x -= (d.speed ?? 3.5) * dt / 1.2;
        else if (d.type === 'train') updateTrain(d, now);
        else if (d.type === 'maze') updateMaze(d, now, dt, physics);
        else if (d.type === 'spikes') updateSpikes(d, now, dt);
        else if (d.type === 'spinner') updateSpinner(d, now, dt);
        else if (d.type === 'portal') d.swirl.rotation.z += dt * 2.5;
        else if (d.type === 'jump') d.top.position.y += (0.26 - d.top.position.y) * Math.min(1, dt * 8);
        else if (d.type === 'door') {
          const open = d.openMs ?? 2500;
          const closed = d.closedMs ?? 2500;
          const cycle = open + closed;
          const t = ((now + (d.offsetMs ?? 0)) % cycle + cycle) % cycle;
          const target = t < closed ? 0 : 1; // primero cerrada, luego abierta
          d.open += (target - d.open) * Math.min(1, dt * 5);
          d.panel.position.y = -d.open * (d.height + 0.05);
          const solid = d.open < 0.5;
          if (solid && !d.bodyOn) { physics.add(d.body); d.bodyOn = true; } else if (!solid && d.bodyOn) { physics.remove(d.body); d.bodyOn = false; }
        } else if (d.type === 'fragile') {
          const shake = d.shakeMs ?? 600;
          if (d.state === 'shaking') {
            for (const p of d.plankMeshes) { p.mesh.position.x = p.home.x + Math.sin(now / 25 + p.home.x) * 0.04; p.mesh.position.y = p.home.y + Math.sin(now / 31) * 0.03; }
            if (now - d.since > shake) { d.state = 'fallen'; d.since = now; for (const p of d.plankMeshes) p.vy = 0; }
          } else if (d.state === 'fallen') {
            for (const p of d.plankMeshes) {
              p.vy -= FALL_GRAVITY * dt;
              p.mesh.position.y += p.vy * dt;
              p.mesh.rotation.x += p.spin * dt;
            }
            if (now - d.since > (d.respawnMs ?? 5000)) { d.state = 'back'; d.since = now; }
          } else if (d.state === 'back') { // vuelve a salir creciendo
            const k = Math.min(1, (now - d.since) / 400);
            for (const p of d.plankMeshes) { p.mesh.position.copy(p.home); p.mesh.rotation.set(0, 0, 0); p.mesh.scale.setScalar(Math.max(0.01, k)); }
            if (k >= 1) d.state = 'idle';
          }
        }
      }
    },

    /** Lo que hacen a personajes, búmerangs y sueltos (antes del paso de física). */
    affect(game, now, dt) {
      const chars = [...game.characters.values()].filter((c) => c.alive && !c.falling && !c.leap);
      for (const c of game.characters.values()) c.grip = 1; // agarre al suelo (el hielo lo baja)
      for (const d of devices) {
        if (d.type === 'ice') {
          for (const c of chars) if (inside(d, c.x, c.z)) c.grip = d.grip ?? 0.08;
          continue;
        }
        if (d.type === 'spikes') {
          if (d.phase === 'up') {
            for (const c of chars) {
              if (!inside(d, c.x, c.z, -0.1)) continue;
              game.kill(c, Math.random() * Math.PI * 2, now, { force: true });
              game.effects.burst(c.x, 0.4, c.z, [0xd8dde6, 0xffffff, 0xff4d00], 16, 0.6);
            }
          }
          continue;
        }
        if (d.type === 'spinner') {
          for (const c of chars) {
            if (!spinnerHits(d, c.x, c.z, c.def.radius)) continue;
            game.kill(c, Math.atan2(c.z - d.z, c.x - d.x), now, { force: true });
            game.stage.shake(180, 0.3);
          }
          continue;
        }
        if (d.type === 'conveyor') {
          const dir = along(d);
          const step = (d.speed ?? 3.5) * dt;
          for (const c of chars) if (inside(d, c.x, c.z)) { c.body.position.x += dir.x * step; c.body.position.z += dir.z * step; }
          for (const w of game.weapons) if (w.state === 'ground' && inside(d, w.x, w.z)) { w.body.position.x += dir.x * step; w.body.position.z += dir.z * step; }
          for (const p of game.arena.props ?? []) if (inside(d, p.body.position.x, p.body.position.z)) { p.body.position.x += dir.x * step; p.body.position.z += dir.z * step; p.body.wakeUp?.(); }
        } else if (d.type === 'maze') {
          // A quien le sube una pared debajo, la pared lo empuja al lado más cercano
          for (const s of d.segs) {
            if (!s.bodyOn) continue;
            for (const c of chars) {
              const { u, v } = local(d, c.x, c.z);
              const du = u - s.u;
              const dv = v - s.v;
              const along = s.vertical ? dv : du;
              const across = s.vertical ? du : dv;
              const reach = d.thick / 2 + c.def.radius;
              if (Math.abs(along) > s.len / 2 + d.thick / 2 || Math.abs(across) >= reach) continue;
              const push = (across >= 0 ? 1 : -1) * (reach + 0.02) - across;
              const pu = s.vertical ? push : 0;
              const pv = s.vertical ? 0 : push;
              const a = (d.rot ?? 0) * DEG;
              c.body.position.x += pu * Math.cos(a) + pv * Math.sin(a);
              c.body.position.z += -pu * Math.sin(a) + pv * Math.cos(a);
            }
          }
        } else if (d.type === 'train') {
          // Atropella a quien pilla un vagón (quien va por el aire, saltando, se libra)
          for (const c of chars) {
            const r = c.def.radius;
            for (const car of d.cars) {
              const dx = c.x - car.x;
              const dz = c.z - car.z;
              const ahead = dx * car.hx + dz * car.hz;
              const side = -dx * car.hz + dz * car.hx;
              if (Math.abs(ahead) < car.length / 2 + r * 0.6 && Math.abs(side) < car.width / 2 + r * 0.6) {
                game.kill(c, Math.atan2(car.hz, car.hx), now, { force: true });
                game.stage.shake(200, 0.35);
                break;
              }
            }
          }
        } else if (d.type === 'fragile') {
          if (d.state === 'idle' && chars.some((c) => inside(d, c.x, c.z))) { d.state = 'shaking'; d.since = now; }
        } else if (d.type === 'jump') {
          for (const c of chars) {
            if (Math.hypot(c.x - d.x, c.z - d.z) > d.radius || now < (c.jumpReadyAt ?? 0)) continue;
            c.jumpReadyAt = now + 600;
            d.top.position.y = 0.05; // el muelle se hunde y rebota
            game.startLeap(c, now, { to: { x: d.target[0], z: d.target[1] }, height: d.height ?? 3.5, durationMs: d.durationMs ?? 800, wave: false });
          }
        } else if (d.type === 'portal') {
          const other = devices.find((o) => o !== d && o.type === 'portal' && o.link === d.link);
          if (!other) continue;
          const travel = (thing, x, z, set) => {
            const near = Math.hypot(x - d.x, z - d.z) <= d.radius * 0.8;
            if (!near) { if (thing.portalLock === d.id) thing.portalLock = null; return; }
            if (thing.portalLock) return; // acaba de llegar por un portal: tiene que salir de él antes de usar otro
            thing.portalLock = other.id;
            set(other.x + (x - d.x), other.z + (z - d.z));
            game.effects.burst(other.x, 0.6, other.z, [d.color, 0xffffff], 14, 0.5);
          };
          for (const c of chars) travel(c, c.x, c.z, (x, z) => c.body.position.set(x, c.body.position.y, z));
          for (const w of game.weapons) if (w.state !== 'held') travel(w, w.x, w.z, (x, z) => w.body.position.set(x, w.body.position.y, z));
        }
      }
    },

    /** ¿Hay un tren cerca de ese punto? (para que los bots no se metan delante) */
    dangerAt(x, z) {
      return devices.some((d) => (d.type === 'train' && d.cars.some((car, i) => Math.hypot(car.x - x, car.z - z) < (i === 0 ? 4 : 2.4)))
        || (d.type === 'spikes' && d.phase !== 'down' && inside(d, x, z, 0.3))
        || (d.type === 'spinner' && Math.hypot(x - d.x, z - d.z) < d.radius + 0.6 && spinnerHits({ ...d, angle: d.angle + 0.35 }, x, z, 0.8)));
    },

    dispose() {
      for (const d of devices) if (d.body && d.bodyOn) physics.remove(d.body);
      for (const d of devices) for (const s of d.segs ?? []) if (s.bodyOn) physics.remove(s.physics);
    },
  };
  // Las puertas empiezan con su pared puesta
  for (const d of devices) if (d.body) d.bodyOn = true;
  return api;
}
