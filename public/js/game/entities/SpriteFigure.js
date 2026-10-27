import * as THREE from 'three';
import { playerRing } from '../content/figures.js';

/**
 * Personaje ilustrado (arte de ChatGPT) como un muñeco de papel recortado: la ilustración se parte en 6 trozos
 * que juntos forman la imagen entera (cabeza, torso, brazos y piernas). Siempre mira a la cámara, se gira hacia
 * donde va y, al andar, balancea brazos y piernas. Al desmontarse, esos 6 trozos salen volando.
 * Misma interfaz que ToyFigure: group, parts, animate, handWorldPosition, partsInWorld.
 */
// Trozos de la ilustración: [tipo, u0, v0, u1, v1, pivote (u, v)] (v = 0 abajo, 1 arriba)
const PIECES = [
  ['leg', 0, 0, 0.5, 0.3, [0.38, 0.3]],
  ['leg', 0.5, 0, 1, 0.3, [0.62, 0.3]],
  ['torso', 0.3, 0.3, 0.7, 0.58, [0.5, 0.44]],
  ['arm', 0, 0.3, 0.3, 0.58, [0.3, 0.56]],
  ['arm', 0.7, 0.3, 1, 0.58, [0.7, 0.56]],
  ['head', 0, 0.58, 1, 1, [0.5, 0.6]],
];
const CAMERA_TILT = -0.42; // el recorte se inclina un poco hacia atrás para verse mejor desde la cámara alta
const SHADOW = new THREE.CircleGeometry(0.5, 24);
const SHADOW_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

export class SpriteFigure {
  constructor(texture, ringColor, scale = 1) {
    this.scale = scale;
    this.group = new THREE.Group();
    const aspect = texture.image.width / texture.image.height;
    const height = 1.32 * scale;
    const width = height * aspect;
    this.size = { width, height };

    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
    this.card = new THREE.Group(); // gira para mirar a la cámara
    this.tilt = new THREE.Group();
    this.tilt.rotation.x = CAMERA_TILT;
    this.card.add(this.tilt);
    this.group.add(this.card);

    this.parts = [];
    this.pivots = { leg: [], arm: [] };
    for (const [kind, u0, v0, u1, v1, [pu, pv]] of PIECES) {
      const w = (u1 - u0) * width;
      const h = (v1 - v0) * height;
      const geometry = new THREE.PlaneGeometry(w, h);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      const piece = new THREE.Mesh(geometry, material);
      // El pivote (cadera, hombro, cuello) está en el trozo; la malla se coloca respecto a él.
      const pivot = new THREE.Group();
      pivot.position.set((pu - 0.5) * width, pv * height, 0);
      piece.position.set(((u0 + u1) / 2 - pu) * width, ((v0 + v1) / 2 - pv) * height, 0);
      pivot.add(piece);
      this.tilt.add(pivot);
      this.parts.push({ kind, object: piece, shape: { box: [w / 2, h / 2, 0.04] } });
      if (this.pivots[kind]) this.pivots[kind].push(pivot);
    }
    // Compatibilidad con ToyFigure (Character anima legPivots/armPivots a través de animate)
    this.legPivots = this.pivots.leg;
    this.armPivots = this.pivots.arm;

    this.hand = new THREE.Object3D(); // donde se ve el búmerang sujeto
    this.hand.position.set(0.32 * width, 0.42 * height, 0.08);
    this.tilt.add(this.hand);

    const shadow = new THREE.Mesh(SHADOW, SHADOW_MATERIAL);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shadow.scale.setScalar(Math.max(0.6, width * 0.7));
    this.group.add(shadow);
    if (ringColor !== null && ringColor !== undefined) this.group.add(playerRing(ringColor));

    this.walkPhase = 0;
    this.lookRight = true;
  }

  animate(dt, speed01, aiming) {
    // El grupo gira con el personaje; el recorte deshace ese giro para mirar siempre a la cámara
    const facing = -this.group.rotation.y;
    this.card.rotation.y = facing;
    const right = Math.cos(facing) >= -0.05;
    if (right !== this.lookRight) this.lookRight = right;
    this.card.scale.x += ((right ? 1 : -1) - this.card.scale.x) * Math.min(1, dt * 16); // media vuelta rápida

    this.walkPhase += dt * 12 * speed01;
    const swing = speed01 > 0.05 ? Math.sin(this.walkPhase) * 0.35 * Math.min(1, speed01 * 1.4) : 0;
    this.legPivots[0].rotation.z = swing;
    this.legPivots[1].rotation.z = -swing;
    this.armPivots[0].rotation.z = -swing * 0.8;
    const rightArm = aiming ? -1.1 : swing * 0.8;
    this.armPivots[1].rotation.z += (rightArm - this.armPivots[1].rotation.z) * Math.min(1, dt * 18);
    // Botecito y balanceo al andar, como un muñeco de cartón
    const hop = Math.abs(Math.sin(this.walkPhase)) * 0.08 * speed01 * this.scale;
    this.tilt.position.y = hop;
    this.tilt.rotation.z = Math.sin(this.walkPhase) * 0.06 * speed01;
  }

  handWorldPosition(target) {
    return this.hand.getWorldPosition(target);
  }

  partsInWorld() {
    this.group.updateMatrixWorld(true);
    return this.parts.map(({ kind, object, shape }) => ({
      kind,
      object,
      shape,
      position: object.getWorldPosition(new THREE.Vector3()),
      quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
      scale: object.getWorldScale(new THREE.Vector3()),
    }));
  }
}
