import * as THREE from 'three';

const RING = new THREE.TorusGeometry(0.3, 0.035, 10, 24);
const materials = new Map();

/** Aro del color del jugador a los pies (así se sabe quién es quién, aunque dos lleven el mismo personaje). */
export function playerRing(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
  const ring = new THREE.Mesh(RING, materials.get(color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}
