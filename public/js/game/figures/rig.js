import * as THREE from 'three';
import { G, FRONT_FACING_ROTATION } from './kit.js';
import { addOutlines } from '../render/toon.js';

/**
 * Esqueleto común de todos los juguetes: dos piernas y dos brazos con articulación (para andar y apuntar),
 * torso y cabeza. Cada parte es un grupo con su malla principal más los accesorios que se le añadan,
 * así que al desmontarse cada pieza sale volando con todo lo suyo (el sombrero con la cabeza, el escudo con el brazo…).
 * Mira hacia +x; su lado derecho es +z.
 */
const DEFAULT = {
  hipY: 0.34, legLen: 0.32, legR: 0.09, legSpread: 0.11,
  torsoY: 0.62, torsoH: 0.56, torsoW: 0.42, torsoD: 0.34,
  shoulderY: 0.8, shoulderZ: 0.27, armLen: 0.24, armR: 0.065,
  headY: 1.07, headR: 0.22,
};

const mesh = (geometry, material, { pos, rot, scale } = {}) => {
  const m = new THREE.Mesh(geometry, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  return m;
};

/**
 * @param spec {
 *   size?: proporciones (ver DEFAULT),
 *   legs: { mat, shape?: 'cyl'|'box', foot?: material, footSize?: [x,y,z] },
 *   torso: { mat, shape?: 'capsule'|'box'|'sphere'|'dress', mats?: materiales por cara (box) },
 *   arms: { mat, hand?: material | null },
 *   head: { mat, shape?: 'sphere'|'box'|'capsule', mats?: materiales por cara (box) },
 *   decorate?: (rig, helpers) => void
 * }
 */
export function buildRig(spec) {
  const s = { ...DEFAULT, ...spec.size };
  const group = new THREE.Group();
  const parts = [];
  const addPart = (kind, object, parent, shape) => {
    parent.add(object);
    parts.push({ kind, object, shape });
    return object;
  };
  const pivot = (x, y, z) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    group.add(p);
    return p;
  };

  // Piernas (cuelgan de la cadera)
  const legs = [];
  const legPivots = [-1, 1].map((side) => {
    const hip = pivot(0, s.hipY, side * s.legSpread);
    const leg = new THREE.Group();
    leg.position.y = -s.legLen / 2;
    const geometry = spec.legs.shape === 'box' ? G.box(s.legR * 2, s.legLen, s.legR * 2) : G.cyl(s.legR * 0.92, s.legR, s.legLen, 14);
    leg.add(mesh(geometry, spec.legs.mat));
    if (spec.legs.foot) {
      const [fx, fy, fz] = spec.legs.footSize ?? [s.legR * 2.6, s.legR * 0.9, s.legR * 2.1];
      leg.add(mesh(G.box(fx, fy, fz), spec.legs.foot, { pos: [fx * 0.22, -s.legLen / 2 + fy / 2 - 0.01, 0] }));
    }
    addPart('leg', leg, hip, { box: [s.legR, s.legLen / 2, s.legR] });
    legs.push(leg);
    return hip;
  });

  // Torso
  const torso = new THREE.Group();
  torso.position.y = s.torsoY;
  const t = spec.torso;
  let core;
  if (t.shape === 'box') {
    core = mesh(G.box(s.torsoD, s.torsoH, s.torsoW), t.mats ?? t.mat);
  } else if (t.shape === 'sphere') {
    core = mesh(G.sphere(0.5, 22, 16), t.mat, { scale: [s.torsoD, s.torsoH, s.torsoW] });
  } else if (t.shape === 'dress') {
    // Vestido: cono desde la cintura hasta casi el suelo
    core = mesh(G.cyl(s.torsoW * 0.32, s.torsoW * 0.78, s.torsoH, 22), t.mat);
  } else {
    const r = s.torsoW / 2;
    // Girada para que el centro de la textura quede delante; tras el giro, su eje z local es el fondo (x del muñeco).
    core = mesh(G.capsule(r, Math.max(0.01, s.torsoH - r * 2)), t.mat, { scale: [1, 1, s.torsoD / s.torsoW], rot: [0, FRONT_FACING_ROTATION.cylinder, 0] });
  }
  torso.add(core);
  addPart('torso', torso, group, { box: [s.torsoD / 2, s.torsoH / 2, s.torsoW / 2] });

  // Brazos (cuelgan del hombro)
  const arms = [];
  const armPivots = [-1, 1].map((side) => {
    const shoulder = pivot(0, s.shoulderY, side * s.shoulderZ);
    const arm = new THREE.Group();
    arm.position.y = -s.armLen / 2 - s.armR * 0.4;
    arm.add(mesh(G.capsule(s.armR, s.armLen), spec.arms.mat));
    if (spec.arms.hand) arm.add(mesh(G.sphere(s.armR * 1.25, 12, 10), spec.arms.hand, { pos: [0, -s.armLen / 2 - s.armR * 0.6, 0] }));
    addPart('arm', arm, shoulder, { box: [s.armR, s.armLen / 2 + s.armR, s.armR] });
    arms.push(arm);
    return shoulder;
  });
  const hand = new THREE.Object3D();
  hand.position.y = -s.armLen - s.armR * 1.6;
  armPivots[1].add(hand); // mano derecha: sujeta el arma

  // Cabeza
  const head = new THREE.Group();
  head.position.y = s.headY;
  const h = spec.head;
  let headShape;
  if (h.shape === 'box') {
    const [bx, by, bz] = h.size ?? [s.headR * 1.9, s.headR * 1.8, s.headR * 1.9];
    head.add(mesh(G.box(bx, by, bz), h.mats ?? h.mat));
    headShape = { box: [bx / 2, by / 2, bz / 2] };
  } else if (h.shape === 'capsule') {
    head.add(mesh(G.capsule(s.headR, h.length ?? s.headR), h.mat, { rot: [0, FRONT_FACING_ROTATION.cylinder, 0] }));
    headShape = { box: [s.headR, s.headR + (h.length ?? s.headR) / 2, s.headR] };
  } else {
    head.add(mesh(G.sphere(s.headR, 26, 18), h.mat));
    headShape = { sphere: s.headR };
  }
  addPart('head', head, group, headShape);

  for (const part of parts) part.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const rig = { group, parts, legPivots, armPivots, hand, head, torso, arms, legs, size: s };
  if (spec.decorate) {
    spec.decorate(rig, { mesh });
    for (const part of parts) part.object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  addOutlines(group); // contorno de dibujos animados (también lo llevan las piezas al desmontarse)
  return rig;
}
