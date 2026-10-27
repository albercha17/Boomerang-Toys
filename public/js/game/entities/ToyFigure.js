import * as THREE from 'three';
import { buildRig } from '../figures/rig.js';
import { FIGURES, playerRing } from '../content/figures.js';

/**
 * Juguete articulado hecho de piezas sueltas (piernas, torso, brazos y cabeza con sus accesorios).
 * El aspecto sale del catálogo (content/figures.js); el aro de los pies lleva el color del jugador.
 * Mira hacia +x en coordenadas locales; su lado derecho es +z.
 * Las mismas piezas son las que salen despedidas al desmontarse.
 */
export class ToyFigure {
  /** @param {string} figureId id de personaje @param {number|null} ringColor color del jugador (null = sin aro) */
  constructor(figureId, ringColor, scale = 1) {
    this.scale = scale;
    const rig = buildRig((FIGURES[figureId] ?? FIGURES.peon)());
    this.group = rig.group;
    this.group.scale.setScalar(scale);
    this.parts = rig.parts;
    this.legPivots = rig.legPivots;
    this.armPivots = rig.armPivots;
    this.hand = rig.hand;
    if (ringColor !== null && ringColor !== undefined) this.group.add(playerRing(ringColor));
    this.walkPhase = 0;
  }

  /** @param {number} speed01 velocidad relativa (0..1) @param {boolean} aiming brazo adelantado para lanzar */
  animate(dt, speed01, aiming) {
    this.walkPhase += dt * 12 * speed01;
    const swing = speed01 > 0.05 ? Math.sin(this.walkPhase) * 0.7 * Math.min(1, speed01 * 1.4) : 0;
    this.legPivots[0].rotation.z = swing;
    this.legPivots[1].rotation.z = -swing;
    this.armPivots[0].rotation.z = -swing * 0.8;
    const rightArm = aiming ? 1.45 : swing * 0.8;
    this.armPivots[1].rotation.z += (rightArm - this.armPivots[1].rotation.z) * Math.min(1, dt * 18);
    this.group.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04 * speed01 * this.scale;
  }

  handWorldPosition(target) {
    return this.hand.getWorldPosition(target);
  }

  /** Piezas con su posición, orientación y tamaño en el mundo, para crear los restos al desmontarse. */
  partsInWorld() {
    this.group.updateMatrixWorld(true);
    const s = this.scale;
    return this.parts.map(({ kind, object, shape }) => ({
      kind,
      object,
      shape: shape.sphere ? { sphere: shape.sphere * s } : { box: shape.box.map((half) => half * s) },
      position: object.getWorldPosition(new THREE.Vector3()),
      quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
      scale: object.getWorldScale(new THREE.Vector3()),
    }));
  }
}
