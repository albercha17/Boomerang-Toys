import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Modelos 3D animados de los personajes (Kenney «Blocky Characters», CC0: public/models/blocky).
 * Se cargan una vez antes de empezar; cada figura clona el que le toca.
 */
export const MODELS = {}; // base ('a'..'r') -> { scene, animations }

const loader = new GLTFLoader();

export async function loadModels(bases) {
  await Promise.all([...new Set(bases)].map((base) => new Promise((resolve) => {
    loader.load(`/models/blocky/character-${base}.glb`, (gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      });
      MODELS[base] = { scene: gltf.scene, animations: gltf.animations };
      resolve();
    }, undefined, (error) => {
      console.warn(`No se pudo cargar el modelo ${base}:`, error);
      resolve();
    });
  })));
  return MODELS;
}
