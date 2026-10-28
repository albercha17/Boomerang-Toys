import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { addOutlines } from './toon.js';

/**
 * Modelos 3D de los mapas (Kenney «Furniture», «Nature» y «Food Kit», CC0: public/models/casa, patio y comida).
 * Se cargan una vez; cada objeto del mapa es una copia que comparte geometría y materiales.
 */
const MODELS = {}; // nombre -> { scene, size }
const loader = new GLTFLoader();
const toonCache = new Map();

// «carpeta/modelo» (p. ej. comida/cake) o, si no, casa o patio (los del kit de naturaleza llevan «_»)
const urlOf = (name) => {
  if (name.includes('/')) return `/models/${name}.glb`;
  return name.includes('_') ? `/models/patio/${name}.glb` : `/models/casa/${name}.glb`;
};

/** Medidas del modelo cargado (ancho x, alto y, fondo z), o null. */
export const furnitureSize = (name) => MODELS[name]?.size ?? null;

/** Plástico de juguete brillante de un color (un material por color). */
function plastic(hex) {
  if (!toonCache.has(hex)) toonCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0 }));
  return toonCache.get(hex);
}

/** Mismo color en plástico de juguete. */
function toonOf(material) {
  const color = material.color.clone();
  const hsl = color.getHSL({});
  // El kit de naturaleza pinta la vegetación en turquesa: se pasa a verde hierba
  if (hsl.h > 0.4 && hsl.h < 0.56 && hsl.s > 0.25) color.setHSL(0.3, Math.min(1, hsl.s * 1.1), hsl.l * 0.95);
  return plastic(color.getHex());
}

/** Tonos de madera clara del kit de muebles (los que se pintan con la paleta de la zona). */
function isWood(color) {
  const { h, s, l } = color.getHSL({});
  return h > 0.04 && h < 0.13 && s > 0.15 && s < 0.75 && l > 0.45 && l < 0.85;
}

export async function loadFurniture(names) {
  await Promise.all([...new Set(names)].filter((n) => !MODELS[n]).map((name) => new Promise((resolve) => {
    loader.load(urlOf(name), (gltf) => {
      const scene = gltf.scene;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        const convert = (m) => (m.map
          ? new THREE.MeshStandardMaterial({ map: m.map, color: m.color, roughness: 0.5, metalness: 0 }) // con textura (kit de comida)
          : toonOf(m));
        o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.shared = true; // no se libera al cambiar de arena
      });
      addOutlines(scene, 0.012);
      scene.traverse((o) => { if (o.userData.isOutline) o.userData.shared = true; });
      const box = new THREE.Box3().setFromObject(scene);
      MODELS[name] = { scene, box, size: box.getSize(new THREE.Vector3()) };
      resolve();
    }, undefined, () => { console.warn(`Sin modelo ${name}`); resolve(); });
  })));
}

/**
 * Copia de un modelo apoyada en el suelo y centrada en (x, z): a una escala fija o encajada en una huella
 * (ancho × fondo) con un alto máximo. `color` pinta la madera de los muebles de ese color de plástico.
 */
export function placeFurniture(name, { x, z, y = 0, footprint = 0.96, maxHeight = 1.5, rotation = 0, scale = null, color = null }) {
  const model = MODELS[name];
  if (!model) return null;
  const { size, box } = model;
  const inner = model.scene.clone(true);
  if (color !== null) {
    // Mueble de juguete: la madera se vuelve plástico del color dado (sombreado algo distinto en cada tono)
    const base = new THREE.Color(color);
    inner.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || !isWood(o.material.color)) return;
      const shade = THREE.MathUtils.clamp(o.material.color.getHSL({}).l / 0.68, 0.75, 1.15);
      o.material = plastic(base.clone().multiplyScalar(shade).getHex());
    });
  }
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  const turned = new THREE.Group(); // giro dentro: la escala de fuera se aplica ya girado
  turned.add(inner);
  turned.rotation.y = rotation;
  const quarter = Math.abs(Math.round(rotation / (Math.PI / 2))) % 2 === 1; // girado 90°: ancho y fondo se cambian
  const w = quarter ? size.z : size.x;
  const d = quarter ? size.x : size.z;
  const pivot = new THREE.Group();
  pivot.add(turned);
  pivot.scale.setScalar(scale ?? Math.min(footprint / w, footprint / d, maxHeight / size.y));
  pivot.position.set(x, y, z);
  return pivot;
}
