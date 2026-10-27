import * as THREE from 'three';
import { POWERUPS } from '../content/powerups.js';

const MAX_PATCHES = 140;
const GEOMETRY = new THREE.CircleGeometry(1, 16);
const COLORS = [0xff4d00, 0xff9a00, 0xffd000];

/**
 * Rastro de fuego del power-up Fuego: manchas de llamas en el suelo que eliminan a quien las pisa
 * (salvo a quien lanzó el búmerang) hasta que se apagan.
 */
export class FireSystem {
  constructor(stage) {
    this.stage = stage;
    this.patches = [];
  }

  add(x, z, owner, now) {
    const material = new THREE.MeshBasicMaterial({ color: COLORS[this.patches.length % COLORS.length], transparent: true, opacity: 0.85, depthWrite: false });
    const mesh = new THREE.Mesh(GEOMETRY, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.04, z);
    mesh.scale.setScalar(POWERUPS.fuego.radius);
    this.stage.scene.add(mesh);
    this.patches.push({ x, z, owner, bornAt: now, mesh });
    while (this.patches.length > MAX_PATCHES) this.remove(this.patches.shift());
  }

  /** Llama a onBurn(objetivo) para cada personaje o señuelo vivo que pise el fuego de otro. */
  update(now, targets, onBurn) {
    const { lifeMs, radius } = POWERUPS.fuego;
    this.patches = this.patches.filter((patch) => {
      const age = now - patch.bornAt;
      if (age >= lifeMs) {
        this.remove(patch);
        return false;
      }
      const t = age / lifeMs;
      patch.mesh.scale.setScalar(radius * (1 + Math.sin(now / 60 + patch.x * 7) * 0.12) * (1 - t * 0.5));
      patch.mesh.material.opacity = 0.85 * (1 - t);
      for (const target of targets) {
        if (target.alive && target !== patch.owner && target.owner !== patch.owner
          && Math.hypot(target.x - patch.x, target.z - patch.z) < radius + target.def.radius * 0.6) {
          onBurn(target);
        }
      }
      return true;
    });
  }

  clear() {
    for (const patch of this.patches) this.remove(patch);
    this.patches = [];
  }

  remove(patch) {
    this.stage.scene.remove(patch.mesh);
    patch.mesh.material.dispose();
  }
}
