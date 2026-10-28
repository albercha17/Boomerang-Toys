import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toonMaterial, addOutlines } from '../render/toon.js';
import { playerRing } from './playerRing.js';

/**
 * Muñeco 3D generado por IA a partir del dibujo del personaje (herramientas/modelos_ia.py: TRELLIS).
 * El modelo llega en una sola pieza rígida; al cargarlo se parte en 6 (cabeza, torso, brazos y piernas) por
 * alturas y lados, cada una con su punto de giro (cuello, hombros, caderas). Así anda como un juguete
 * (piernas y brazos que se balancean, botecito y contoneo) y se desmonta en esas piezas al morir.
 * Interfaz de figura: group, parts, animate, handWorldPosition, partsInWorld, strike y throw.
 */
const HEIGHT = 1.5;
// Ajustes por personaje: `yaw` gira el modelo (radianes) si no viene mirando al frente; `rigid` para los de cuerpo
// redondo (no mueven piernas ni brazos sueltos al andar, se contonean enteros; al morir sí se desmontan)
const SETTINGS = {
  soldado: { yaw: -Math.PI / 2 },
  bichito: { rigid: true },
  dino: { rigid: true },
  capsula: { rigid: true },
};
const SOURCES = {}; // id -> { pieces: [{ kind, side, geometry, pivot }], material, size }
const loader = new GLTFLoader();

// Cortes en fracción de la altura (0 = pies) y del ancho (centrado en 0)
const LEG_TOP = 0.24;
const NECK = 0.56;
const ARM_X = 0.2;

/** Carga los modelos que haya (public/models/ia/manifest.json, lo escribe herramientas/modelos_ia.py). */
export async function loadIaModels(ids) {
  let available = [];
  try {
    const res = await fetch('/models/ia/manifest.json', { cache: 'no-cache' });
    if (res.ok) available = await res.json();
  } catch { /* sin modelos IA */ }
  await Promise.all(ids.filter((id) => available.includes(id) && !SOURCES[id]).map((id) => new Promise((resolve) => {
    loader.load(`/models/ia/${id}.glb`, (gltf) => {
      try { SOURCES[id] = split(gltf.scene, SETTINGS[id] ?? {}); } catch (error) { console.warn(`Modelo IA ${id}:`, error); }
      resolve();
    }, undefined, () => resolve()); // sin modelo: se usa el muñeco de bloques
  })));
}

export const hasIaModel = (id) => Boolean(SOURCES[id]);

/** Une las mallas del modelo y reparte sus triángulos en las 6 piezas. */
function split(scene, settings) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const mesh = meshes[0];
  const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
  if (settings.yaw) geometry.rotateY(settings.yaw);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const s = HEIGHT / size.y;
  // Normaliza: pies en y=0, centrado en x/z, altura HEIGHT
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(s, s, s);
  geometry.computeVertexNormals();
  const H = HEIGHT;
  const W = size.x * s;

  const pos = geometry.attributes.position;
  const groups = { head: [], torso: [], armL: [], armR: [], legL: [], legR: [] };
  const D = size.z * s;
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 / H;
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 / W;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 / D;
    let part;
    if (y > NECK) part = 'head';
    else if (y < LEG_TOP) part = x < 0 ? 'legR' : 'legL'; // el modelo mira a +z: su derecha es -x
    else if (Math.abs(x) > ARM_X && y > 0.3 && z > -0.15) part = x < 0 ? 'armR' : 'armL'; // sin el pelo de detrás
    else part = 'torso';
    groups[part].push(i);
  }

  const pivots = {
    head: [0, NECK * H, 0], torso: [0, LEG_TOP * H, 0],
    armL: [ARM_X * W, (NECK - 0.03) * H, 0], armR: [-ARM_X * W, (NECK - 0.03) * H, 0],
    legL: [0.1 * W, LEG_TOP * H, 0], legR: [-0.1 * W, LEG_TOP * H, 0],
  };
  const kinds = { head: 'head', torso: 'torso', armL: 'arm', armR: 'arm', legL: 'leg', legR: 'leg' };
  const pieces = [];
  for (const [name, starts] of Object.entries(groups)) {
    if (!starts.length) continue;
    const part = new THREE.BufferGeometry();
    for (const [key, attr] of Object.entries(geometry.attributes)) {
      const n = attr.itemSize;
      const data = new Float32Array(starts.length * 3 * n);
      let k = 0;
      for (const start of starts) for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) data[k++] = attr.array[(start + v) * n + c];
      part.setAttribute(key, new THREE.BufferAttribute(data, n));
    }
    const [px, py, pz] = pivots[name];
    part.translate(-px, -py, -pz);
    part.computeBoundingBox();
    pieces.push({ name, kind: kinds[name], geometry: part, pivot: new THREE.Vector3(px, py, pz) });
  }
  const map = mesh.material.map ?? null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  const material = toonMaterial(0xffffff, map);
  return { pieces, material, width: W, rigid: Boolean(settings.rigid) };
}

export class IaFigure {
  constructor(id, ringColor, scale = 1) {
    const source = SOURCES[id];
    this.scale = scale;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // bota y se contonea
    this.model = new THREE.Group();
    this.model.rotation.y = Math.PI / 2; // el modelo mira a +z; el juego usa +x
    this.model.scale.setScalar(scale);
    this.body.add(this.model);
    this.group.add(this.body);

    this.joints = {};
    this.parts = [];
    for (const piece of source.pieces) {
      const joint = new THREE.Group();
      joint.position.copy(piece.pivot);
      const mesh = new THREE.Mesh(piece.geometry, source.material);
      mesh.castShadow = true;
      joint.add(mesh);
      this.model.add(joint);
      this.joints[piece.name] = joint;
      const center = piece.geometry.boundingBox.getCenter(new THREE.Vector3());
      const half = piece.geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const debris = new THREE.Mesh(piece.geometry.clone().translate(-center.x, -center.y, -center.z), source.material);
      this.parts.push({ kind: piece.kind, object: debris, source: mesh, center, half });
    }
    addOutlines(this.model, 0.012);

    this.hand = new THREE.Object3D();
    this.hand.position.set(0, -0.3, 0.12);
    (this.joints.armR ?? this.model).add(this.hand);
    if (ringColor !== null && ringColor !== undefined) this.group.add(playerRing(ringColor));

    this.rigid = source.rigid;
    this.walkPhase = 0;
    this.time = Math.random() * 10;
    this.action = null; // { kind: 'strike'|'throw', t }
  }

  strike() { this.action = { kind: 'strike', t: 0 }; }
  throw() { this.action = { kind: 'throw', t: 0 }; }

  animate(dt, speed01, aiming) {
    this.time += dt;
    this.walkPhase += dt * 11 * speed01;
    const moving = speed01 > 0.05;
    const rigid = this.rigid;
    const swing = moving && !rigid ? Math.sin(this.walkPhase) * 0.55 * Math.min(1, speed01 * 1.3) : 0;
    const j = this.joints;
    if (j.legL) j.legL.rotation.x = swing;
    if (j.legR) j.legR.rotation.x = -swing;
    if (j.armL) j.armL.rotation.x = -swing * 0.8;

    // Brazo derecho: balanceo, apuntando (adelante) o el golpe/lanzamiento en curso (los de cuerpo redondo, quietos)
    let arm = swing * 0.8;
    if (aiming && !rigid) arm = -1.35;
    if (this.action) {
      this.action.t += dt;
      const t = this.action.t / (this.action.kind === 'throw' ? 0.3 : 0.25);
      if (t >= 1) this.action = null;
      else if (!rigid) arm = this.action.kind === 'throw' ? -2.4 + t * 3 : -1.6 * Math.sin(t * Math.PI);
    }
    if (j.armR) j.armR.rotation.x += (arm - j.armR.rotation.x) * Math.min(1, dt * 22);
    if (j.head) j.head.rotation.z = moving ? Math.sin(this.walkPhase * 0.5) * 0.06 : Math.sin(this.time * 1.6) * 0.04;

    // Cuerpo: botecito y contoneo al andar; respira parado
    this.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.09 * this.scale : 0;
    const waddle = rigid ? 0.16 : 0.07; // los de cuerpo redondo se contonean más (no mueven las piernas)
    this.body.rotation.x = moving ? Math.sin(this.walkPhase) * waddle : 0; // contoneo lateral (el modelo está girado)
    this.body.rotation.z = moving ? -0.12 * speed01 : 0; // se inclina hacia delante al correr
    const breathe = moving ? 1 : 1 + Math.sin(this.time * 2.4) * 0.015;
    this.model.scale.set(this.scale, this.scale * breathe, this.scale);
  }

  handWorldPosition(target) {
    return this.hand.getWorldPosition(target);
  }

  partsInWorld() {
    this.group.updateMatrixWorld(true);
    return this.parts.map(({ kind, object, source, center, half }) => {
      const scale = source.getWorldScale(new THREE.Vector3());
      return {
        kind,
        object,
        shape: { box: half.toArray().map((h, i) => Math.max(0.05, h * Math.abs(scale.getComponent(i)))) },
        position: source.localToWorld(center.clone()),
        quaternion: source.getWorldQuaternion(new THREE.Quaternion()),
        scale,
      };
    });
  }
}
