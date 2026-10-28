import * as THREE from 'three';
import { NEW_LIGHT, LIGHT } from './lightMode.js';

/**
 * Estilo de dibujos animados: sombreado por bandas (3 tonos planos) y contorno negro.
 * El contorno es una copia de la malla vuelta del revés y empujada hacia fuera por sus normales:
 * se ve como una línea de grosor constante alrededor de cada pieza.
 */
const OUTLINE_COLOR = 0x1d130d;
export const OUTLINE_WIDTH = 0.022;

/** Rampa de luz con 3 tonos (sombra, medio, luz) sin degradado. */
export const TOON_GRADIENT = (() => {
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();

/**
 * Material de juguete. Con la luz nueva, plástico suave (con brillo y reflejo del entorno); con la vieja, dibujos
 * por bandas. El contorno negro (addOutlines) se mantiene en los dos.
 */
export function toonMaterial(color, map = null, extra = {}) {
  if (NEW_LIGHT) return new THREE.MeshStandardMaterial({ color, map, roughness: 0.55, metalness: 0, envMapIntensity: LIGHT.env, ...extra });
  return new THREE.MeshToonMaterial({ color, map, gradientMap: TOON_GRADIENT, ...extra });
}

function outlineMaterial(width) {
  const material = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n transformed += normalize(normal) * ${width.toFixed(4)};`,
    );
  };
  material.customProgramCacheKey = () => `outline-${width}`;
  return material;
}

const materials = new Map();
export function outline(width = OUTLINE_WIDTH) {
  if (!materials.has(width)) materials.set(width, outlineMaterial(width));
  return materials.get(width);
}

/** Pone contorno a todas las mallas opacas de un objeto (personajes, búmerangs, juguetes...). */
export function addOutlines(root, width = OUTLINE_WIDTH) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh && !o.userData.isOutline && !o.material.transparent && !o.material.isMeshBasicMaterial) meshes.push(o);
  });
  for (const m of meshes) {
    const line = new THREE.Mesh(m.geometry, outline(width));
    line.userData.isOutline = true;
    line.castShadow = false;
    line.receiveShadow = false;
    m.add(line);
  }
  return root;
}

/** Contorno para una malla instanciada (los bloques del escenario): mismas instancias, material de contorno. */
export function instancedOutline(instanced, width = OUTLINE_WIDTH) {
  const line = new THREE.InstancedMesh(instanced.geometry, outline(width), instanced.count);
  line.instanceMatrix.copy(instanced.instanceMatrix);
  line.userData.isOutline = true;
  line.computeBoundingSphere();
  return line;
}
