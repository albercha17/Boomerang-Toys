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
      for (const m of data.movers ?? []) {
        try { movers[m.model] = (await loader.loadAsync(`${base}/${m.model}.glb`)).scene; } catch { /* sin modelo: cilindro */ }
      }
      CACHE[id] = { data, scene, movers };
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

export function buildSceneMap(stage, physics, layout) {
  const { data, scene, movers: moverModels } = CACHE[layout.sceneMap];
  const t = data.table;
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

  // Las sombras de los muñecos y del rodillo, sobre el tablero (capa transparente que solo recibe sombras)
  const shadowShape = new THREE.Shape();
  const C = t.chamfer;
  const pts = [[-t.w / 2 + C, -t.d / 2], [t.w / 2 - C, -t.d / 2], [t.w / 2, -t.d / 2 + C], [t.w / 2, t.d / 2 - C],
    [t.w / 2 - C, t.d / 2], [-t.w / 2 + C, t.d / 2], [-t.w / 2, t.d / 2 - C], [-t.w / 2, -t.d / 2 + C]];
  shadowShape.moveTo(pts[0][0], -pts[0][1]);
  for (const [x, z] of pts.slice(1)) shadowShape.lineTo(x, -z);
  const catcher = new THREE.Mesh(own(new THREE.ShapeGeometry(shadowShape)), own(new THREE.ShadowMaterial({ opacity: 0.3 })));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.01;
  catcher.receiveShadow = true;
  root.add(catcher);

  // Física: suelo de la cocina abajo, tablero, y los choques de cada objeto
  physics.setGroundLevel(-t.height);
  bodies.push(physics.addFloorBox(0, -t.thickness / 2, 0, t.w / 2, t.thickness / 2, t.d / 2));
  for (const o of data.objects) {
    if (o.collider === 'none' || !o.collider) continue;
    const [w, h, d] = o.colliderSize ?? o.size;
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

  stage.setMood(theme);
  stage.frame(t.w + 1.2, t.d + 1.2);

  // Puntos libres para los power-ups: encima de la mesa, lejos de objetos, matorrales y del carril del rodillo
  const blockers = data.objects.map((o) => ({ x: o.x, z: o.z, r: Math.max(o.size[0], o.size[2]) / 2 + 0.9 }));
  const freePoints = [];
  for (let x = -t.w / 2 + 1.5; x <= t.w / 2 - 1.5; x += 1) {
    for (let z = -t.d / 2 + 1.2; z <= t.d / 2 - 1.2; z += 1) {
      if (!onTable(t, x, z) || !onTable(t, x + Math.sign(x) * 1.2, z + Math.sign(z) * 1.2)) continue;
      if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r)) continue;
      if (movers.some((m) => Math.abs(z - m.z) < m.halfLength + 0.8 && Math.abs(x) < m.span.to + m.radius + 0.6)) continue;
      freePoints.push({ x, z });
    }
  }

  return {
    layout,
    theme,
    walled: true,
    stats: { chunks: 1, blocks: data.objects.length, pillars: 0, props: 0, colliders: bodies.length, drawObjects: 0 },
    spawnPoints: data.spawns.map(([x, z]) => ({ x, z })),
    freePoints,
    bounds: { minX: -t.w / 2, maxX: t.w / 2, minZ: -t.d / 2, maxZ: t.d / 2 },
    movers,
    bushes,

    hazardAt(x, z) {
      return onTable(t, x, z) ? 0 : 1;
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
    },

    sync() {},

    dispose() {
      stage.scene.remove(root);
      for (const r of owned) r.dispose();
      for (const body of bodies) physics.remove(body);
      physics.setGroundLevel(0);
    },
  };
}
