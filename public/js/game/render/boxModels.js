import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Modelos de las cajas de power-up (public/models/cajas, de grab3d.com, licencia CC0): la caja de regalo para los
 * normales y el cofre del tesoro para las superhabilidades. Los dos traen la tapa como pieza aparte («…_lid»), que se
 * abre al cogerlos. Cada modelo se apoya en el suelo, centrado y con su lado mayor de 1 unidad.
 */
const FILES = { regalo: '/models/cajas/regalo.glb', cofre: '/models/cajas/cofre.glb' };
const MODELS = {};
const loader = new GLTFLoader();

export async function loadBoxModels() {
  await Promise.all(Object.entries(FILES).map(async ([id, url]) => {
    try {
      const scene = (await loader.loadAsync(url)).scene;
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const k = 1 / Math.max(size.x, size.z);
      scene.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      const holder = new THREE.Group();
      holder.add(scene);
      holder.scale.setScalar(k);
      scene.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      MODELS[id] = holder;
    } catch {
      // sin modelo: PowerUp usa la caja hecha por código
    }
  }));
}

/** Copia de la caja (`regalo` o `cofre`) y su tapa, o null si no se cargó. */
export function boxModel(id) {
  if (!MODELS[id]) return null;
  const copy = MODELS[id].clone(true);
  let lid = null;
  copy.traverse((o) => { if (!lid && /_lid$/.test(o.name)) lid = o; });
  return { object: copy, lid };
}
