import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Búmerang personalizado de cada personaje (public/models/bumerangs/<id>.glb, en manifest.json).
 * Cada modelo se centra, se tumba con su lado más fino en vertical (gira plano, como un búmerang) y se escala
 * a SIZE de lado mayor. Sin modelo, el personaje usa el búmerang en V de su color.
 */
const SIZE = 0.95;
const MODELS = {}; // id -> Object3D normalizado (se clona)
const loader = new GLTFLoader();

export async function loadBoomerangModels() {
  let ids = [];
  try {
    const res = await fetch('/models/bumerangs/manifest.json', { cache: 'no-cache' });
    if (res.ok) ids = await res.json();
  } catch { /* sin búmerangs propios */ }
  await Promise.all(ids.map((id) => loader.loadAsync(`/models/bumerangs/${id}.glb`).then((gltf) => {
    MODELS[id] = normalize(gltf.scene);
  }).catch(() => {})));
}

function normalize(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const inner = new THREE.Group();
  scene.position.sub(center);
  inner.add(scene);
  // El eje más fino, en vertical: así gira plano
  if (size.x < size.y && size.x <= size.z) inner.rotation.z = Math.PI / 2;
  else if (size.z < size.y && size.z < size.x) inner.rotation.x = Math.PI / 2;
  inner.scale.setScalar(SIZE / Math.max(size.x, size.y, size.z));
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (o.material?.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
  });
  const holder = new THREE.Group();
  holder.add(inner);
  return holder;
}

/** Copia del búmerang de ese personaje, o null si no tiene. */
export function boomerangModel(figureId) {
  return MODELS[figureId] ? MODELS[figureId].clone(true) : null;
}
