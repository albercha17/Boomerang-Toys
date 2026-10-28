import * as THREE from 'three';
import { makeFigure } from './makeFigure.js';
import { loadIaModels } from './IaFigure.js';

/**
 * Retratos de los personajes (para la pantalla de elección del móvil), con los mismos muñecos 3D que en la
 * partida. Devuelve { id: imagen PNG en dataURL }.
 */
export async function renderPortraits(ids, size = 192) {
  await loadIaModels([...new Set(['muneca', ...ids])]);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2e, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(3, 4, 2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(2.5, 1.35, 1.4); // tres cuartos: el juguete mira hacia +x
  camera.lookAt(0, 0.85, 0);

  const portraits = {};
  for (const id of ids) {
    const figure = makeFigure(id, null);
    figure.animate(0.5, 0, false); // postura de reposo
    scene.add(figure.group);
    await waitTextures(figure.group);
    renderer.render(scene, camera);
    portraits[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(figure.group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return portraits;
}

/** Espera a que las texturas del muñeco estén descargadas. */
async function waitTextures(root) {
  const maps = new Set();
  root.traverse((o) => { if (o.isMesh && o.material.map) maps.add(o.material.map); });
  for (let i = 0; i < 100 && [...maps].some((t) => !t.image || t.image.complete === false); i++) {
    await new Promise((r) => setTimeout(r, 30));
  }
}
