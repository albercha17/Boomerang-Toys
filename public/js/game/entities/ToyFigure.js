import * as THREE from 'three';
import { COLORS, darker, matte, plastic } from '../render/materials.js';

const GEOMETRY = {
  leg: new THREE.CylinderGeometry(0.085, 0.095, 0.32, 12),
  torso: new THREE.CapsuleGeometry(0.2, 0.2, 6, 14),
  arm: new THREE.CapsuleGeometry(0.065, 0.2, 4, 10),
  head: new THREE.SphereGeometry(0.22, 20, 16),
  cap: new THREE.SphereGeometry(0.235, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
  eye: new THREE.SphereGeometry(0.035, 8, 6),
  nose: new THREE.SphereGeometry(0.045, 8, 6),
};

// Forma física aproximada de cada pieza al desmontarse (semitamaños o radio).
const PART_SHAPES = {
  head: { sphere: 0.22 },
  torso: { box: [0.17, 0.3, 0.2] },
  arm: { box: [0.065, 0.165, 0.065] },
  leg: { box: [0.09, 0.16, 0.09] },
};

/**
 * Muñeco articulado de juguete hecho de piezas sueltas (piernas, torso, brazos, cabeza).
 * Mira hacia +x en coordenadas locales; su lado derecho es +z.
 * Las mismas piezas son las que salen despedidas al desmontarse.
 */
export class ToyFigure {
  constructor(color, scale = 1) {
    this.scale = scale;
    this.group = new THREE.Group();
    this.group.scale.setScalar(scale);
    this.parts = [];
    const body = plastic(color);
    const legs = plastic(darker(color));
    const wood = matte(COLORS.wood);
    const ink = matte(COLORS.ink);

    const addPart = (kind, object, parent) => {
      parent.add(object);
      object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.parts.push({ kind, object });
      return object;
    };
    const pivot = (x, y, z) => {
      const group = new THREE.Group();
      group.position.set(x, y, z);
      this.group.add(group);
      return group;
    };

    this.legPivots = [-1, 1].map((side) => {
      const hip = pivot(0, 0.34, side * 0.11);
      const leg = new THREE.Mesh(GEOMETRY.leg, legs);
      leg.position.y = -0.16;
      addPart('leg', leg, hip);
      return hip;
    });

    const torso = new THREE.Mesh(GEOMETRY.torso, body);
    torso.position.y = 0.62;
    torso.scale.set(0.85, 1, 1);
    addPart('torso', torso, this.group);

    this.armPivots = [-1, 1].map((side) => {
      const shoulder = pivot(0, 0.8, side * 0.27);
      const arm = new THREE.Mesh(GEOMETRY.arm, body);
      arm.position.y = -0.15;
      addPart('arm', arm, shoulder);
      return shoulder;
    });
    this.hand = new THREE.Object3D();
    this.hand.position.y = -0.3;
    this.armPivots[1].add(this.hand); // mano derecha: sujeta el arma

    const head = new THREE.Group();
    head.position.y = 1.07;
    head.add(new THREE.Mesh(GEOMETRY.head, wood));
    const cap = new THREE.Mesh(GEOMETRY.cap, body);
    cap.position.y = 0.01;
    head.add(cap);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(GEOMETRY.eye, ink);
      eye.position.set(0.19, 0.02, side * 0.08);
      head.add(eye);
    }
    const nose = new THREE.Mesh(GEOMETRY.nose, matte(0xd9a066));
    nose.position.set(0.215, -0.05, 0);
    head.add(nose);
    addPart('head', head, this.group);

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
    return this.parts.map(({ kind, object }) => {
      const { sphere, box } = PART_SHAPES[kind];
      return {
        kind,
        object,
        shape: sphere ? { sphere: sphere * s } : { box: box.map((half) => half * s) },
        position: object.getWorldPosition(new THREE.Vector3()),
        quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
        scale: object.getWorldScale(new THREE.Vector3()),
      };
    });
  }
}
