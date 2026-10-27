import * as THREE from 'three';
import { buildRig } from './rig.js';
import { FIGURES } from '../content/figures.js';

/**
 * Retratos de los personajes (para la pantalla de elección del móvil), dibujados con el mismo código 3D
 * que en la partida. Devuelve { id: imagen PNG en dataURL }.
 */
export function renderPortraits(ids, size = 192) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4a2e, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(3, 4, 2);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(2.7, 1.35, 1.5); // tres cuartos: el juguete mira hacia +x
  camera.lookAt(0, 0.72, 0);

  const portraits = {};
  for (const id of ids) {
    if (!FIGURES[id]) continue;
    const rig = buildRig(FIGURES[id]());
    rig.armPivots[1].rotation.z = 0.35; // un poco de pose
    scene.add(rig.group);
    renderer.render(scene, camera);
    portraits[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return portraits;
}
