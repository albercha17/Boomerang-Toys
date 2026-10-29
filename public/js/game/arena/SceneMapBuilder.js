import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { THEMES } from './themes.js';
import { buildPitLiners, buildProceduralBase, roundedPath, tableShape } from './proceduralBase.js';
import { moverLocal, moverProgress } from './movers.js';
import { buildDevices, trackDistance } from './devices.js';
import { buildAmbient } from './ambient.js';
import { surfaceKind, surfaceMaterial, projectUV } from '../render/surfaces.js';

/**
 * Mapas descritos en public/maps/<id>.json (formato en shared/mapFormat.js; se editan en /editor).
 * - Base (mesa o suelo con huecos y paredes): la horneada en Blender (public/models/mapas/<id>/base.glb) si su huella
 *   (base.json) coincide con las medidas del mapa; si no, una hecha por código (proceduralBase.js).
 * - Objetos, rodillos y sueltos: modelos de la biblioteca (public/models/objetos/<modelo>.glb) colocados en vivo,
 *   con su sombra en tiempo real; así se pueden mover en el editor sin volver a hornear.
 * Devuelve la misma arena que HandmadeBuilder (hazardAt, bushAt, movers, update, sync, dispose...).
 */
const { normalizeMap, baseKey } = window.MapFormat;
const loader = new GLTFLoader();
const CACHE = {}; // id -> { data, base: Object3D | null, baseKey }
const MODELS = {}; // modelo -> { scene (pivote abajo en el centro), size: Vector3 } | null si no existe
let INDEX = []; // [{ id, name, theme, play }]

/** Textura de lava (una vez): manchas incandescentes sobre costra oscura; se repite y se desplaza despacio. */
let LAVA_TEXTURE = null;
function lavaTexture() {
  if (LAVA_TEXTURE) return LAVA_TEXTURE;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ff5a12';
  g.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blob = (x, y, r, inner, outer) => {
    // Se pinta también desplazada para que la textura se repita sin costuras
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, inner);
      grad.addColorStop(1, outer);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 26; i++) blob(rand() * size, rand() * size, 18 + rand() * 34, 'rgba(70,14,6,0.95)', 'rgba(120,24,6,0)'); // costra
  for (let i = 0; i < 30; i++) blob(rand() * size, rand() * size, 8 + rand() * 22, 'rgba(255,236,120,1)', 'rgba(255,140,20,0)'); // lo que brilla
  LAVA_TEXTURE = new THREE.CanvasTexture(canvas);
  LAVA_TEXTURE.wrapS = LAVA_TEXTURE.wrapT = THREE.RepeatWrapping;
  LAVA_TEXTURE.colorSpace = THREE.SRGBColorSpace;
  LAVA_TEXTURE.repeat.set(0.22, 0.22);
  return LAVA_TEXTURE;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Carga (una vez) los modelos de la biblioteca que falten. */
export async function ensureModels(names) {
  await Promise.all([...new Set(names)].filter((n) => !(n in MODELS)).map(async (name) => {
    try {
      const scene = (await loader.loadAsync(`/models/objetos/${name}.glb`)).scene;
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      const pivot = new THREE.Group();
      pivot.add(scene);
      pivot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      MODELS[name] = { scene: pivot, size };
    } catch {
      MODELS[name] = null; // sin modelo: forma provisional
    }
  }));
}

const modelsOf = (data) => [...data.objects.map((o) => o.model), ...data.movers.map((m) => m.model),
  ...(data.devices ?? []).flatMap((d) => (d.type === 'train' ? d.cars ?? [] : []))];

/** Base horneada del mapa, si existe y coincide con sus medidas. */
async function loadBase(id, data, baked = true) {
  if (!baked) return null; // en index.json: aún no se ha horneado nunca
  try {
    const stamp = await fetchJson(`/models/mapas/${id}/base.json`);
    if (stamp.key !== baseKey(data)) return null;
    const scene = (await loader.loadAsync(`/models/mapas/${id}/base.glb?v=${encodeURIComponent(stamp.bakedAt ?? '')}`)).scene;
    scene.userData.ao = Boolean(stamp.ao); // horneado nuevo: solo las sombras suaves (las texturas las pone el juego)
    return scene;
  } catch {
    return null;
  }
}

/** Lista de mapas (public/maps/index.json) con sus datos, bases y modelos. Devuelve la lista. */
export async function loadSceneMaps() {
  try { INDEX = await fetchJson('/maps/index.json'); } catch { INDEX = []; }
  await Promise.all(INDEX.map(async (entry) => {
    try {
      const data = normalizeMap(await fetchJson(`/maps/${entry.id}.json`));
      data.id = entry.id;
      Object.assign(entry, { name: data.name, theme: data.theme, play: data.play });
      CACHE[entry.id] = { data, base: await loadBase(entry.id, data, entry.baked), baseKey: null };
      CACHE[entry.id].baseKey = CACHE[entry.id].base ? baseKey(data) : null;
      await ensureModels(modelsOf(data));
    } catch (error) {
      console.warn(`Mapa ${entry.id}:`, error);
    }
  }));
  INDEX = INDEX.filter((e) => CACHE[e.id]);
  return INDEX;
}

export const sceneMapIndex = () => INDEX;
/** Medidas naturales del modelo de la biblioteca (Vector3) o null si no está cargado. */
export const modelSize = (name) => MODELS[name]?.size ?? null;
export const hasSceneMap = (id) => Boolean(CACHE[id]);
export const sceneMapData = (id) => CACHE[id]?.data ?? null;

/** Para el editor: usa estos datos para el mapa (la base horneada se mantiene si sus medidas no cambian). */
export async function setSceneMapData(id, data, { reloadBase = false } = {}) {
  const entry = CACHE[id] ?? (CACHE[id] = { data, base: null, baseKey: null });
  entry.data = data;
  if (reloadBase || (entry.base && entry.baseKey !== baseKey(data))) {
    entry.base = reloadBase ? await loadBase(id, data) : null;
    entry.baseKey = entry.base ? baseKey(data) : null;
  }
  await ensureModels(modelsOf(data));
}

/** ¿Se está usando la base horneada (true) o la hecha por código (false)? */
export const usesBakedBase = (id) => Boolean(CACHE[id]?.base) && CACHE[id].baseKey === baseKey(CACHE[id].data);

/** Tablero con las esquinas recortadas: ¿está el punto encima? */
function onTable(t, x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  return ax <= t.w / 2 && az <= t.d / 2 && (ax - (t.w / 2 - t.chamfer)) + (az - (t.d / 2 - t.chamfer)) <= t.chamfer;
}

const inRect = (r, x, z, margin = 0) => Math.abs(x - r.x) < r.w / 2 + margin && Math.abs(z - r.z) < r.d / 2 + margin;

/** Dentro de un rectángulo de esquinas redondeadas (`round` = radio), con margen. */
function inRounded(r, x, z, margin = 0) {
  if (!inRect(r, x, z, margin)) return false;
  const rad = Math.min(r.round ?? 0, r.w / 2, r.d / 2);
  const dx = Math.max(0, Math.abs(x - r.x) - (r.w / 2 - rad));
  const dz = Math.max(0, Math.abs(z - r.z) - (r.d / 2 - rad));
  return Math.hypot(dx, dz) < rad + margin;
}

const DEG = Math.PI / 180;

/**
 * Coloca un objeto del mapa: grupo en su sitio y giro, con el modelo encajado en `size` (y estirado con `stretch`).
 * Devuelve { holder, wobble, footprint: [ancho, alto, fondo] reales antes de girar }.
 */
export function placeObject(o, own = (r) => r) {
  const holder = new THREE.Group();
  holder.position.set(o.x, o.y ?? 0, o.z);
  holder.rotation.set((o.tilt?.[0] ?? 0) * DEG, (o.rot ?? 0) * DEG, (o.tilt?.[1] ?? 0) * DEG, 'YXZ');
  holder.name = o.id;
  const wobble = new THREE.Group(); // los matorrales se agitan
  holder.add(wobble);
  const [w, h, d] = o.size;
  const stretch = o.stretch ?? [1, 1, 1];
  const model = MODELS[o.model];
  let footprint;
  if (model) {
    const s = Math.min(w / model.size.x, h / model.size.y, d / model.size.z);
    const copy = model.scene.clone(true);
    copy.scale.set(s * stretch[0], s * stretch[1], s * stretch[2]);
    wobble.add(copy);
    footprint = [model.size.x * s * stretch[0], model.size.y * s * stretch[1], model.size.z * s * stretch[2]];
  } else {
    footprint = [w * stretch[0], h * stretch[1], d * stretch[2]];
    const geometry = o.collider === 'cylinder' || o.bush ? new THREE.CylinderGeometry(0.5, 0.5, 1, 20) : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(own(geometry), own(new THREE.MeshStandardMaterial({ color: o.bush ? 0x5aa548 : 0xd8d8e0, roughness: 0.6 })));
    mesh.scale.set(...footprint);
    mesh.position.y = footprint[1] / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    wobble.add(mesh);
  }
  return { holder, wobble, footprint };
}

/** Rodillo: grupo que va por su recorrido (eje x local = sentido del recorrido) con el modelo atravesado y rodando. */
export function placeMover(def, own = (r) => r) {
  const { radius, length } = def;
  const pin = new THREE.Group();
  pin.name = def.id;
  const roll = new THREE.Group();
  pin.add(roll);
  const model = MODELS[def.model];
  if (model) {
    const copy = model.scene.clone(true);
    const along = model.size.x >= model.size.z ? 'x' : 'z';
    const s = length / Math.max(model.size.x, model.size.z);
    copy.scale.setScalar(s);
    copy.position.y = -(model.size.y * s) / 2; // el modelo se apoya en el suelo: se centra en el eje
    const holder = new THREE.Group();
    holder.add(copy);
    if (along === 'x') holder.rotation.y = Math.PI / 2; // atravesado: a lo largo del eje z local
    roll.add(holder);
  } else {
    const cyl = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, length, 24)), own(new THREE.MeshStandardMaterial({ color: 0xd9a066 })));
    cyl.rotation.x = Math.PI / 2;
    cyl.castShadow = true;
    roll.add(cyl);
  }
  const angle = Math.atan2(def.to[1] - def.from[1], def.to[0] - def.from[0]);
  pin.rotation.y = -angle;
  pin.position.set(def.from[0], radius, def.from[1]);
  return { pin, roll, angle };
}

export function buildSceneMap(stage, physics, layout) {
  const entry = CACHE[layout.sceneMap];
  const data = entry.data;
  // Dos tipos: una mesa (salirse = caer) o una habitación (paredes, y el agua de la bañera ahoga)
  const room = data.room ?? null;
  const t = data.table ?? { w: room.w, d: room.d, chamfer: 0, thickness: 0.3, height: room.pitDepth ?? 3 };
  const waters = data.water ?? [];
  const onArea = (x, z) => (room ? Math.abs(x) <= room.w / 2 && Math.abs(z) <= room.d / 2 : onTable(t, x, z));
  const root = new THREE.Group();
  stage.scene.add(root);
  const owned = [];
  const own = (r) => { owned.push(r); return r; };
  const bodies = [];
  const theme = { ...THEMES[data.theme], name: data.name };
  const baked = usesBakedBase(layout.sceneMap);

  if (baked && entry.base.userData.ao) {
    // Base horneada nueva: cada pieza con su textura de verdad, la luz y las sombras del juego, y del horneado
    // solo las sombras suaves de las esquinas y bordes (aoMap)
    const view = entry.base.clone(true);
    view.traverse((o) => {
      if (!o.isMesh) return;
      const name = `${o.name} ${o.parent?.name ?? ''}`;
      const kind = surfaceKind(name, data);
      const baked = o.material.map;
      o.geometry = o.geometry.clone();
      const material = kind ? surfaceMaterial(kind, data) : null;
      if (material) {
        projectUV(o, kind, data);
        if (baked && /HORNEADO/.test(name)) {
          baked.channel = 1;
          baked.colorSpace = THREE.NoColorSpace; // son sombras, no color
          baked.needsUpdate = true;
          material.aoMap = baked;
          material.aoMapIntensity = 1;
        }
        o.material = own(material);
      }
      o.receiveShadow = true;
      o.castShadow = /pared|pata|tablero/.test(name);
    });
    root.add(view);
    owned.push(...buildPitLiners(root, data));
  } else if (baked) {
    // Base horneada antigua: lo «HORNEADO_» sin luz (ya la lleva); el resto (patas) con la luz del juego
    const view = entry.base.clone(true);
    view.traverse((o) => {
      if (!o.isMesh) return;
      if (/HORNEADO/.test(o.name) || /HORNEADO/.test(o.parent?.name ?? '')) {
        const map = o.material.map;
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        o.material = own(new THREE.MeshBasicMaterial({ map }));
      } else {
        o.receiveShadow = true;
      }
    });
    root.add(view);
    // Las sombras de objetos, muñecos y rodillos, sobre el tablero (capa transparente que solo recibe sombras)
    const shadowShape = room ? new THREE.Shape(new THREE.Path([new THREE.Vector2(-t.w / 2, -t.d / 2), new THREE.Vector2(t.w / 2, -t.d / 2),
      new THREE.Vector2(t.w / 2, t.d / 2), new THREE.Vector2(-t.w / 2, t.d / 2)]).getPoints()) : tableShape(t);
    for (const p of room?.pits ?? []) shadowShape.holes.push(roundedPath(p)); // sin sombras flotando sobre los huecos
    const catcher = new THREE.Mesh(own(new THREE.ShapeGeometry(shadowShape, 10)), own(new THREE.ShadowMaterial({ opacity: 0.32 })));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.01;
    catcher.receiveShadow = true;
    root.add(catcher);
    owned.push(...buildPitLiners(root, data)); // el horneado solo recorta el agujero
  } else {
    owned.push(...buildProceduralBase(root, data));
  }

  // Agua (bañera): superficie azul que se mece un poco; la lava brilla, se desplaza y palpita
  const waterMeshes = waters.map((w) => {
    const shape = new THREE.Shape(roundedPath({ ...w, x: 0, z: 0 }, THREE.Shape).getPoints(10));
    const material = w.lava
      ? new THREE.MeshBasicMaterial({ map: lavaTexture(), color: 0xffffff })
      : new THREE.MeshStandardMaterial({ color: 0x5ec8f0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 });
    const mesh = new THREE.Mesh(own(new THREE.ShapeGeometry(shape)), own(material));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w.x, w.y ?? -0.3, w.z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  });

  // Física: suelo de abajo (cocina o fondo de la bañera), losas de suelo, paredes y los choques de cada objeto
  physics.setGroundLevel(-t.height);
  if (room) {
    const pits = room.pits ?? [];
    const xs = [...new Set([-room.w / 2, room.w / 2, ...pits.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2])])].sort((a, b) => a - b);
    const zs = [...new Set([-room.d / 2, room.d / 2, ...pits.flatMap((p) => [p.z - p.d / 2, p.z + p.d / 2])])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < zs.length - 1; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cz = (zs[j] + zs[j + 1]) / 2;
        if (pits.some((p) => inRect(p, cx, cz))) continue;
        bodies.push(physics.addFloorBox(cx, -0.15, cz, (xs[i + 1] - xs[i]) / 2, 0.15, (zs[j + 1] - zs[j]) / 2));
      }
    }
    const H = 1.5;
    const W2 = room.w / 2;
    const D2 = room.d / 2;
    bodies.push(physics.addWall(0, H, -D2 - 0.25, W2 + 0.5, H, 0.25)); // fondo
    bodies.push(physics.addWall(0, H, D2 + 0.25, W2 + 0.5, H, 0.25)); // delante (invisible: no tapa la vista)
    bodies.push(physics.addWall(-W2 - 0.25, H, 0, 0.25, H, D2 + 0.5));
    bodies.push(physics.addWall(W2 + 0.25, H, 0, 0.25, H, D2 + 0.5));
  } else {
    bodies.push(physics.addFloorBox(0, -t.thickness / 2, 0, t.w / 2, t.thickness / 2, t.d / 2));
  }

  // Objetos: fijos (con su choque), matorrales (esconden) y sueltos (se empujan)
  const handles = { objects: new Map(), movers: new Map(), devices: new Map() };
  const bushes = [];
  const props = [];
  const blockers = [];
  for (const o of data.objects) {
    const { holder, wobble, footprint } = placeObject(o, own);
    const [w, h, d] = footprint;
    const yaw = (o.rot ?? 0) * DEG;
    handles.objects.set(o.id, holder);
    if (o.loose) {
      const body = physics.createPropBody({ box: [w / 2, h / 2, d / 2] }, o.x, (o.y ?? 0) + h / 2 + 0.05, o.z);
      body.quaternion.setFromEuler(0, yaw, 0);
      bodies.push(body);
      const mesh = new THREE.Group();
      holder.position.set(0, -h / 2, 0);
      holder.rotation.set((o.tilt?.[0] ?? 0) * DEG, 0, (o.tilt?.[1] ?? 0) * DEG, 'YXZ'); // el giro lo lleva el cuerpo
      mesh.add(holder);
      mesh.name = o.id;
      root.add(mesh);
      handles.objects.set(o.id, mesh); // el editor mueve el grupo que sigue al cuerpo
      props.push({ mesh, body });
      continue;
    }
    root.add(holder);
    if (o.bush) {
      bushes.push({ x: o.x, z: o.z, r: (Math.max(w, d) / 2) * 0.8, object: wobble, shakeUntil: 0 });
      blockers.push({ x: o.x, z: o.z, r: Math.max(w, d) / 2 + 0.9 });
      continue;
    }
    if (o.collider === 'none' || (o.y ?? 0) < -0.5) continue; // decorado (sillas de abajo, bañera en su hueco...)
    const base = o.y ?? 0;
    if (o.collider === 'cylinder') bodies.push(physics.addPillar(o.x, o.z, (Math.max(w, d) / 2) * 0.92, base + h));
    else bodies.push(physics.addWall(o.x, (base + h) / 2, o.z, (w / 2) * 0.92, (base + h) / 2, (d / 2) * 0.92, yaw));
    blockers.push({ x: o.x, z: o.z, r: Math.max(w, d) / 2 + 0.9 });
  }

  // Lo que se mueve: cada rodillo va y viene por su recorrido (de `from` a `to`) y aplasta
  const movers = data.movers.map((def) => {
    const { pin, roll, angle } = placeMover(def, own);
    root.add(pin);
    handles.movers.set(def.id, pin);
    const body = physics.addMover(def.radius, def.radius, def.length / 2);
    body.quaternion.setFromEuler(0, -angle, 0);
    bodies.push(body);
    const [x0, z0] = def.from;
    return { ...def, pin, roll, body, angle, radius: def.radius, halfLength: def.length / 2, x: x0, z: z0, lastX: x0, lastZ: z0, forward: true, progress: 0,
      pathLength: Math.hypot(def.to[0] - x0, def.to[1] - z0) };
  });

  // Artefactos: cintas, puertas, pasarelas que se caen, trampolines y portales
  const devices = buildDevices(root, physics, data.devices ?? [], own, MODELS);
  for (const d of devices.list) handles.devices.set(d.id, d.group);
  const ambient = buildAmbient(root, data, own); // humo del volcán y burbujas de la lava

  stage.tuneMaterials(root); // con la luz nueva, que los modelos no reflejen tanto el entorno
  stage.setMood(theme);
  // Se ve entero: con el canto delantero de la mesa o, en una habitación, con la pared del fondo
  stage.frame(t.w, t.d, room ? { rise: room.wallHeight ?? 3 } : { drop: t.thickness + 0.25 });

  // Puntos libres para los power-ups: lejos de objetos, matorrales, agua y del recorrido de los rodillos
  const onMoverPath = (m, x, z) => {
    const { along, across } = moverLocal({ ...m, x: m.from[0], z: m.from[1] }, x, z);
    return along > -m.radius - 0.6 && along < m.pathLength + m.radius + 0.6 && Math.abs(across) < m.halfLength + 0.8;
  };
  const freePoints = [];
  for (let x = -t.w / 2 + 1.5; x <= t.w / 2 - 1.5; x += 1) {
    for (let z = -t.d / 2 + 1.2; z <= t.d / 2 - 1.2; z += 1) {
      if (!onArea(x, z) || !onArea(x + Math.sign(x) * 1.2, z + Math.sign(z) * 1.2)) continue;
      if (waters.some((w) => inRect(w, x, z, 1.4)) || (room?.pits ?? []).some((p) => inRect(p, x, z, 0.8))) continue;
      if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r)) continue;
      if (movers.some((m) => onMoverPath(m, x, z))) continue;
      if ((data.devices ?? []).some((d) => (d.type === 'train' ? trackDistance(d, x, z) < 1.6
        : Math.hypot(d.x - x, d.z - z) < Math.max(d.w, d.d) / 2 + 0.8))) continue; // ni encima de artefactos (del tren, solo la vía)
      freePoints.push({ x, z });
    }
  }

  const arena = {
    layout,
    theme,
    walled: true,
    baked,
    handles,
    stats: { chunks: 1, blocks: data.objects.length, pillars: 0, props: props.length, colliders: bodies.length, drawObjects: 0 },
    spawnPoints: data.spawns.map(([x, z]) => ({ x, z })),
    freePoints,
    bounds: { minX: -t.w / 2, maxX: t.w / 2, minZ: -t.d / 2, maxZ: t.d / 2 },
    movers,
    bushes,
    devices,
    props,
    fallDepth: -t.height, // el suelo de la cocina, donde se estrella quien cae de la mesa

    /** 0 suelo, 1 vacío (te caes), 2 agua (te ahogas), 3 lava (te quemas). */
    hazardAt(x, z) {
      if (devices.solidAt(x, z)) return 0; // pasarela entera: se pisa aunque debajo no haya suelo
      const pool = waters.find((w) => inRounded(w, x, z));
      if (pool) return pool.lava ? 3 : 2;
      // Hueco sin agua: te caes (con agua, como la bañera, el borde se pisa y lo que ahoga es el agua)
      if ((room?.pits ?? []).some((p) => inRounded(p, x, z) && !waters.some((w) => inRect(p, w.x, w.z)))) return 1;
      return onArea(x, z) ? 0 : 1;
    },

    bushAt(x, z) {
      return bushes.find((b) => Math.hypot(b.x - x, b.z - z) < b.r) ?? null;
    },

    rustle(bush, now) {
      bush.shakeUntil = now + 250;
    },

    update(now, dt) {
      devices.update(now, dt);
      ambient.update(now);
      for (const m of movers) {
        const k = moverProgress(m, now);
        m.forward = k >= m.progress;
        m.progress = k;
        m.lastX = m.x;
        m.lastZ = m.z;
        m.x = m.from[0] + (m.to[0] - m.from[0]) * k;
        m.z = m.from[1] + (m.to[1] - m.from[1]) * k;
        m.body.position.set(m.x, m.radius, m.z);
        m.body.velocity.set(dt > 0 ? (m.x - m.lastX) / dt : 0, 0, dt > 0 ? (m.z - m.lastZ) / dt : 0);
        m.pin.position.set(m.x, m.radius, m.z);
        m.roll.rotation.z -= (Math.hypot(m.x - m.lastX, m.z - m.lastZ) * (m.forward ? 1 : -1)) / m.radius; // rueda
      }
      for (const b of bushes) {
        b.object.rotation.z = now < b.shakeUntil ? Math.sin(now / 30) * 0.06 : b.object.rotation.z * 0.8;
      }
      waterMeshes.forEach((m, i) => { m.position.y = (waters[i].y ?? -0.3) + Math.sin(now / 700 + i) * 0.02; });
      if (LAVA_TEXTURE && waters.some((w) => w.lava)) {
        LAVA_TEXTURE.offset.set(now / 90000, now / 140000);
        const glow = 0.86 + Math.sin(now / 520) * 0.14;
        waterMeshes.forEach((m, i) => { if (waters[i].lava) m.material.color.setScalar(glow); });
      }
    },

    sync() {
      for (const { mesh, body } of props) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      }
    },

    dispose() {
      devices.dispose();
      stage.scene.remove(root);
      for (const r of owned) r.dispose?.();
      for (const body of bodies) physics.remove(body);
      physics.setGroundLevel(0);
    },
  };
  return arena;
}
