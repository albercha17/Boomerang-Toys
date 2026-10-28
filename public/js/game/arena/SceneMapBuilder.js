import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { THEMES } from './themes.js';

/**
 * Mapas con escena montada y horneada en Blender (herramientas/blender/construir_escena.py):
 * public/maps/<id>.json (tablero, objetos con sus choques, matorrales, lo que se mueve, apariciones) y
 * public/models/mapas/<id>/escena.glb (todo lo fijo, con la luz y las sombras ya horneadas).
 * Devuelve la misma arena que HandmadeBuilder (hazardAt, bushAt, movers, update, sync, dispose...).
 */
const loader = new GLTFLoader();
const CACHE = {}; // id -> { data, scene, movers: { modelo: scene } }

export async function loadSceneMaps(ids) {
  await Promise.all(ids.map(async (id) => {
    try {
      const data = await (await fetch(`/maps/${id}.json`, { cache: 'no-cache' })).json();
      const base = `/models/mapas/${id}`;
      const scene = (await loader.loadAsync(`${base}/escena.glb`)).scene;
      const movers = {};
      const apart = new Set([...(data.movers ?? []), ...(data.loose ?? [])].map((m) => m.model));
      for (const model of apart) {
        try { movers[model] = (await loader.loadAsync(`${base}/${model}.glb`)).scene; } catch { /* sin modelo: forma simple */ }
      }
      let sizes = {};
      try { sizes = await (await fetch(`${base}/medidas.json`, { cache: 'no-cache' })).json(); } catch { /* medidas del JSON */ }
      CACHE[id] = { data, scene, movers, sizes };
    } catch (error) {
      console.warn(`Mapa ${id} sin escena:`, error);
    }
  }));
}

export const hasSceneMap = (id) => Boolean(CACHE[id]);

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

/** Forma plana de un rectángulo de esquinas redondeadas, centrada (para el agua). */
function roundedShape(w, d, round) {
  const r = Math.min(round, w / 2, d / 2);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r);
  s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  s.lineTo(-w / 2, -d / 2 + r);
  s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  return s;
}

export function buildSceneMap(stage, physics, layout) {
  const { data, scene, movers: moverModels, sizes } = CACHE[layout.sceneMap];
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

  // Escena horneada: lo «HORNEADO_» sin luz (ya la lleva); el resto con la luz del juego pero sin sombras propias
  const view = scene.clone(true);
  view.traverse((o) => {
    if (!o.isMesh) return;
    const baked = /HORNEADO/.test(o.name) || /HORNEADO/.test(o.parent?.name ?? '');
    if (baked) {
      const map = o.material.map;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      o.material = own(new THREE.MeshBasicMaterial({ map }));
    } else {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  root.add(view);

  // Agua (bañera): superficie azul que se mece un poco
  const waterMeshes = waters.map((w) => {
    const geometry = w.round ? new THREE.ShapeGeometry(roundedShape(w.w, w.d, w.round), 12) : new THREE.PlaneGeometry(w.w, w.d);
    const mesh = new THREE.Mesh(own(geometry),
      own(new THREE.MeshStandardMaterial({ color: 0x5ec8f0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72 })));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w.x, w.y ?? -0.3, w.z);
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  });

  // Las sombras de los muñecos y del rodillo, sobre el tablero (capa transparente que solo recibe sombras)
  const shadowShape = new THREE.Shape();
  const C = t.chamfer;
  const pts = [[-t.w / 2 + C, -t.d / 2], [t.w / 2 - C, -t.d / 2], [t.w / 2, -t.d / 2 + C], [t.w / 2, t.d / 2 - C],
    [t.w / 2 - C, t.d / 2], [-t.w / 2 + C, t.d / 2], [-t.w / 2, t.d / 2 - C], [-t.w / 2, -t.d / 2 + C]];
  shadowShape.moveTo(pts[0][0], -pts[0][1]);
  for (const [x, z] of pts.slice(1)) shadowShape.lineTo(x, -z);
  for (const p of room?.pits ?? []) { // sin sombras flotando sobre el hueco de la bañera
    const hole = new THREE.Path();
    hole.moveTo(p.x - p.w / 2, -(p.z - p.d / 2));
    hole.lineTo(p.x - p.w / 2, -(p.z + p.d / 2));
    hole.lineTo(p.x + p.w / 2, -(p.z + p.d / 2));
    hole.lineTo(p.x + p.w / 2, -(p.z - p.d / 2));
    shadowShape.holes.push(hole);
  }
  const catcher = new THREE.Mesh(own(new THREE.ShapeGeometry(shadowShape)), own(new THREE.ShadowMaterial({ opacity: 0.3 })));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.01;
  catcher.receiveShadow = true;
  root.add(catcher);

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
  for (const o of data.objects) {
    if (o.collider === 'none' || !o.collider) continue;
    const [w, h, d] = o.colliderSize ?? sizes[o.id] ?? o.size; // medidas reales (Blender) si están
    if (o.collider === 'cylinder') bodies.push(physics.addPillar(o.x, o.z, Math.max(w, d) / 2 * 0.92, h));
    else bodies.push(physics.addWall(o.x, h / 2, o.z, (w / 2) * 0.92, h / 2, (d / 2) * 0.92));
  }

  // Matorrales (esconden a quien entra)
  const bushes = data.objects.filter((o) => o.bush).map((o) => ({
    x: o.x, z: o.z, r: (o.size[0] / 2) * 0.8, object: view.getObjectByName(o.id) ?? null, shakeUntil: 0,
  }));

  // Lo que se mueve: el rodillo rueda de un lado a otro por su carril
  const movers = (data.movers ?? []).map((def) => {
    const radius = def.radius;
    const length = def.length;
    const pin = new THREE.Group();
    const model = moverModels[def.model];
    if (model) {
      const copy = model.clone(true);
      const box = new THREE.Box3().setFromObject(copy);
      const size = box.getSize(new THREE.Vector3());
      const along = size.x >= size.z ? 'x' : 'z';
      const s = length / Math.max(size.x, size.z);
      copy.scale.setScalar(s);
      copy.position.set(-((box.min.x + box.max.x) / 2) * s, -((box.min.y + box.max.y) / 2) * s, -((box.min.z + box.max.z) / 2) * s);
      const holder = new THREE.Group();
      holder.add(copy);
      if (along === 'x') holder.rotation.y = Math.PI / 2; // tumbado a lo largo de z
      copy.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      pin.add(holder);
    } else {
      const cyl = new THREE.Mesh(own(new THREE.CylinderGeometry(radius, radius, length, 24)), own(new THREE.MeshStandardMaterial({ color: 0xd9a066 })));
      cyl.rotation.x = Math.PI / 2;
      cyl.castShadow = true;
      pin.add(cyl);
    }
    pin.position.set(-def.span, radius, def.lane);
    root.add(pin);
    const body = physics.addMover(radius, radius, length / 2);
    bodies.push(body);
    return { ...def, pin, body, z: def.lane, halfLength: length / 2, span: { from: -def.span, to: def.span }, x: -def.span, lastX: -def.span, rows: null };
  });

  // Sueltos que se empujan (patitos...): su modelo encajado en una caja física
  const props = (data.loose ?? []).map((l) => {
    const [w, h, d] = l.size;
    const object = new THREE.Group();
    const model = moverModels[l.model];
    if (model) {
      const copy = model.clone(true);
      const box = new THREE.Box3().setFromObject(copy);
      const size = box.getSize(new THREE.Vector3());
      const s = Math.min(w / size.x, h / size.y, d / size.z);
      copy.scale.setScalar(s);
      copy.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s - h / 2, -((box.min.z + box.max.z) / 2) * s);
      copy.rotation.y = l.rot ? (l.rot * Math.PI) / 180 : 0;
      copy.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      object.add(copy);
    }
    root.add(object);
    const body = physics.createPropBody({ box: [w / 2, h / 2, d / 2] }, l.x, h / 2 + 0.05, l.z);
    bodies.push(body);
    return { mesh: object, body };
  });

  stage.setMood(theme);
  stage.frame(t.w + 1.5, t.d + 3); // con margen: que se vea el borde de abajo

  // Puntos libres para los power-ups: lejos de objetos, matorrales, agua y del carril del rodillo
  const blockers = data.objects.map((o) => ({ x: o.x, z: o.z, r: Math.max(o.size[0], o.size[2]) / 2 + 0.9 }));
  const freePoints = [];
  for (let x = -t.w / 2 + 1.5; x <= t.w / 2 - 1.5; x += 1) {
    for (let z = -t.d / 2 + 1.2; z <= t.d / 2 - 1.2; z += 1) {
      if (!onArea(x, z) || !onArea(x + Math.sign(x) * 1.2, z + Math.sign(z) * 1.2)) continue;
      if (waters.some((w) => inRect(w, x, z, 1.4)) || (room?.pits ?? []).some((p) => inRect(p, x, z, 0.8))) continue;
      if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r)) continue;
      if (movers.some((m) => Math.abs(z - m.z) < m.halfLength + 0.8 && Math.abs(x) < m.span.to + m.radius + 0.6)) continue;
      freePoints.push({ x, z });
    }
  }

  return {
    layout,
    theme,
    walled: true,
    stats: { chunks: 1, blocks: data.objects.length, pillars: 0, props: props.length, colliders: bodies.length, drawObjects: 0 },
    spawnPoints: data.spawns.map(([x, z]) => ({ x, z })),
    freePoints,
    bounds: { minX: -t.w / 2, maxX: t.w / 2, minZ: -t.d / 2, maxZ: t.d / 2 },
    movers,
    bushes,
    fallDepth: -t.height, // el suelo de la cocina, donde se estrella quien cae de la mesa

    /** 0 suelo, 1 vacío (te caes), 2 agua (te ahogas). */
    hazardAt(x, z) {
      if (waters.some((w) => inRounded(w, x, z))) return 2;
      return onArea(x, z) ? 0 : 1;
    },

    bushAt(x, z) {
      return bushes.find((b) => Math.hypot(b.x - x, b.z - z) < b.r) ?? null;
    },

    rustle(bush, now) {
      bush.shakeUntil = now + 250;
    },

    update(now, dt) {
      for (const m of movers) {
        const cycle = m.periodMs + m.pauseMs * 2;
        const k0 = (now % cycle) / cycle;
        const travel = m.periodMs / 2 / cycle;
        const pause = m.pauseMs / cycle;
        let k;
        if (k0 < travel) k = k0 / travel;
        else if (k0 < travel + pause) k = 1;
        else if (k0 < travel * 2 + pause) k = 1 - (k0 - travel - pause) / travel;
        else k = 0;
        const eased = k * k * (3 - 2 * k);
        m.lastX = m.x;
        m.x = m.span.from + (m.span.to - m.span.from) * eased;
        m.body.position.set(m.x, m.radius, m.z);
        m.body.velocity.set(dt > 0 ? (m.x - m.lastX) / dt : 0, 0, 0);
        m.pin.position.x = m.x;
        m.pin.rotation.z -= (m.x - m.lastX) / m.radius; // rueda
      }
      for (const b of bushes) {
        if (!b.object) continue;
        b.object.rotation.z = now < b.shakeUntil ? Math.sin(now / 30) * 0.06 : b.object.rotation.z * 0.8;
      }
      waterMeshes.forEach((m, i) => { m.position.y = (waters[i].y ?? -0.3) + Math.sin(now / 700 + i) * 0.02; });
    },

    sync() {
      for (const { mesh, body } of props) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      }
    },

    dispose() {
      stage.scene.remove(root);
      for (const r of owned) r.dispose();
      for (const body of bodies) physics.remove(body);
      physics.setGroundLevel(0);
    },
  };
}
