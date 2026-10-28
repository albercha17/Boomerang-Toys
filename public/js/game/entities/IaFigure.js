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
// redondo (no mueven piernas ni brazos sueltos al andar, se contonean enteros; al morir sí se desmontan).
// `arms`: para los que traen un brazo levantado (L = su izquierda, +x; R = su derecha, -x), qué triángulos son ese
// brazo: |x| ≥ minX (unidades del modelo de 1,5 de alto) y altura entre minY y maxY (fracción de la altura);
// `shoulder` es su punto de giro y el brazo se gira desde ahí para que cuelgue al costado (ver restArm).
// `armsStill`: brazos quietos al andar (el soldadito sujeta el fusil con las dos manos).
// `legsAxis: 'z'`: piernas una delante y otra detrás (modelo de perfil), en vez de izquierda y derecha.
// `legSwing`: cuánto balancea las piernas (1 = normal; menos para los de piernas cortas y anchas).
// Se miden con la foto de frente con rejilla (herramienta de pruebas frente_foto.js + frente_rejilla.py).
const SETTINGS = {
  soldado: { yaw: -Math.PI / 2, armsStill: true, legsAxis: 'z', legSwing: 0.5 },
  bichito: { legSwing: 0.55, armsStill: true }, // sus «brazos» son los costados del cuerpo redondo
  dino: { legSwing: 0.6, armsStill: true },
  robot: { legSwing: 0.45 },
  payaso: {
    arms: { L: { minX: 0.21, minY: 0.5, maxY: 0.95, shoulder: [0.2, 0.56] }, R: { minX: 0.21, minY: 0.5, maxY: 0.95, shoulder: [-0.2, 0.56] } },
  },
  vaquero: { arms: { L: { minX: 0.13, minY: 0.5, maxY: 0.76, shoulder: [0.13, 0.56] } } },
  capsula: { arms: { L: { minX: 0.19, minY: 0.45, maxY: 1.01, shoulder: [0.2, 0.5], hang: 0.75 } } }, // cuerpo ancho: más abierto
};
const SOURCES = {}; // id -> { pieces: [{ kind, side, geometry, pivot }], material, size }
const loader = new GLTFLoader();

// Cortes en fracción de la altura (0 = pies) y del ancho (centrado en 0)
const LEG_TOP = 0.24;
const NECK = 0.56;
const ARM_X = 0.2;
const SEAM_ARM = 0.07; // anchura (fracción del ancho) del arranque del brazo que se queda también en el cuerpo
const SEAM_LEG = 0.05; // altura (fracción) de la parte alta de la pierna que se queda también en el cuerpo
const SEAM_NECK = 0.03;
const STRIDE = 2.25; // radianes de zancada por unidad recorrida (a 5 unidades/s, unas 1,8 zancadas por segundo)

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

const HANG = 0.28; // los brazos en reposo cuelgan algo abiertos hacia fuera

/**
 * Brazo levantado (el modelo viene saludando o con las manos arriba): se gira desde el hombro para que cuelgue al
 * costado, y así el balanceo al correr parte de los brazos abajo. La geometría ya está en coordenadas del hombro.
 * @param side 1 para el izquierdo (+x), -1 para el derecho
 * @param hang cuánto se abre hacia fuera
 */
function restArm(geometry, side, hang = HANG) {
  const pos = geometry.attributes.position;
  const centroid = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) centroid.add(v.fromBufferAttribute(pos, i));
  centroid.divideScalar(pos.count);
  if (centroid.lengthSq() < 1e-6) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(centroid.normalize(), new THREE.Vector3(side * hang, -1, 0.04).normalize());
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(turn));
  geometry.computeVertexNormals();
}

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
  const armBoxes = settings.arms ?? {};
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 / H;
    const xu = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const x = xu / W;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 / D;
    const side = x < 0 ? 'R' : 'L';
    const box = armBoxes[side];
    let part;
    if (box && Math.abs(xu) >= box.minX && y >= box.minY && y <= box.maxY) part = `arm${side}`; // brazo levantado
    else if (y > NECK) part = 'head';
    else if (y < LEG_TOP) part = (settings.legsAxis === 'z' ? z < 0 : x < 0) ? 'legR' : 'legL'; // mira a +z: su derecha es -x
    else if (Math.abs(x) > ARM_X && y > 0.3 && z > -0.15) part = x < 0 ? 'armR' : 'armL'; // sin el pelo de detrás
    else part = 'torso';
    groups[part].push(i);
    // Costura: el arranque de brazos y piernas y la base del cuello se quedan también en el cuerpo, para que al
    // moverse no se abra un agujero donde estaban pegados
    const seam = (part.startsWith('arm') && (box ? Math.abs(xu) <= box.minX + SEAM_ARM * W && y <= box.shoulder[1] + 0.05 : Math.abs(x) <= ARM_X + SEAM_ARM))
      || (part.startsWith('leg') && y >= LEG_TOP - SEAM_LEG)
      || (part === 'head' && y <= NECK + SEAM_NECK);
    if (seam) groups.torso.push(i);
  }

  const pivots = {
    head: [0, NECK * H, 0], torso: [0, LEG_TOP * H, 0],
    armL: [ARM_X * W, (NECK - 0.03) * H, 0], armR: [-ARM_X * W, (NECK - 0.03) * H, 0],
    legL: [0.1 * W, LEG_TOP * H, 0], legR: [-0.1 * W, LEG_TOP * H, 0],
  };
  if (settings.legsAxis === 'z') { pivots.legL = [0, LEG_TOP * H, 0.1 * D]; pivots.legR = [0, LEG_TOP * H, -0.1 * D]; }
  for (const [side, box] of Object.entries(armBoxes)) if (box.shoulder) pivots[`arm${side}`] = [box.shoulder[0], box.shoulder[1] * H, 0];
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
    if (name === 'armL' && armBoxes.L) restArm(part, 1, armBoxes.L.hang);
    if (name === 'armR' && armBoxes.R) restArm(part, -1, armBoxes.R.hang);
    part.computeBoundingBox();
    pieces.push({ name, kind: kinds[name], geometry: part, pivot: new THREE.Vector3(px, py, pz) });
  }
  const map = mesh.material.map ?? null;
  if (map) map.colorSpace = THREE.SRGBColorSpace;
  const material = toonMaterial(0xffffff, map, { side: THREE.DoubleSide }); // por dentro también: sin rendijas al fondo
  return { pieces, material, width: W, rigid: Boolean(settings.rigid), armsStill: Boolean(settings.armsStill), legSwing: settings.legSwing ?? 1 };
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
    this.armsStill = source.armsStill;
    this.legSwing = source.legSwing;
    this.walkPhase = 0;
    this.time = Math.random() * 10;
    this.action = null; // { kind: 'strike'|'throw', t }
    this.lean = 0; // inclinación hacia delante (suavizada)
    this.bank = 0; // ladeo hacia dentro de la curva (suavizado)
    this.squash = null; // aplastamiento al aterrizar: { t, k }
    this.wasDashing = false;
  }

  strike() { this.action = { kind: 'strike', t: 0 }; }
  throw() { this.action = { kind: 'throw', t: 0 }; }
  /** Se aplasta un instante (al terminar el dash o al caer del Supersalto). */
  land(k = 1) { this.squash = { t: 0, k }; }

  /**
   * @param speed01 0..1 cuánto corre (respecto a su velocidad máxima)
   * @param aiming apunta para lanzar (brazo derecho adelante)
   * @param motion { speed (unidades/s), accel (aceleración hacia delante), turn (rad/s de giro), dashing } — si falta
   *   (señuelos), se anima solo con speed01
   */
  animate(dt, speed01, aiming, motion = null) {
    this.time += dt;
    const speed = motion ? motion.speed : speed01 * 5;
    const dashing = Boolean(motion?.dashing);
    // Zancada según lo recorrido (no según el tiempo): los pies no patinan
    this.walkPhase += Math.min(speed, 7) * dt * STRIDE;
    const moving = speed01 > 0.05 || speed > 0.25;
    const rigid = this.rigid;
    const run = Math.min(1, speed01 * 1.2);
    const j = this.joints;
    const ease = (from, to, rate) => from + (to - from) * Math.min(1, dt * rate);

    // Piernas: se balancean (más largo al correr); en el dash, una delante y otra detrás
    const sin = Math.sin(this.walkPhase);
    let legSwing = moving && !rigid ? sin * (0.45 + 0.35 * run) * this.legSwing : 0;
    if (dashing && !rigid) legSwing = 0.7 * this.legSwing;
    if (j.legL) j.legL.rotation.x = ease(j.legL.rotation.x, legSwing, 30);
    if (j.legR) j.legR.rotation.x = ease(j.legR.rotation.x, -legSwing, 30);

    // Brazos: opuestos a las piernas y algo abiertos al correr; parados se mecen; en el dash, echados atrás
    const armsFree = !rigid && !this.armsStill;
    let armSwing = moving && armsFree ? -sin * (0.4 + 0.6 * run) : Math.sin(this.time * 1.7) * 0.05;
    if (dashing && armsFree) armSwing = 0.9;
    const spread = armsFree ? 0.06 + 0.12 * run : 0; // hacia fuera (eje del hombro)
    if (j.armL) {
      j.armL.rotation.x = ease(j.armL.rotation.x, armsFree ? armSwing : 0, 22);
      j.armL.rotation.z = ease(j.armL.rotation.z, -spread, 12);
    }
    // Brazo derecho: igual, salvo al apuntar (adelante) o al golpear/lanzar
    let arm = dashing && armsFree ? 0.9 : armsFree ? -armSwing : 0;
    if (aiming && armsFree) arm = -1.35;
    if (this.action) {
      this.action.t += dt;
      const t = this.action.t / (this.action.kind === 'throw' ? 0.3 : 0.25);
      if (t >= 1) this.action = null;
      else if (armsFree) arm = this.action.kind === 'throw' ? -2.4 + t * 3 : -1.6 * Math.sin(t * Math.PI); // los de brazos quietos no lo mueven
    }
    if (j.armR) {
      j.armR.rotation.x = ease(j.armR.rotation.x, arm, 22);
      j.armR.rotation.z = ease(j.armR.rotation.z, aiming ? 0 : spread, 12);
    }

    // Cuerpo: se inclina adelante al correr y al acelerar, y se ladea hacia dentro en las curvas
    const accel = motion ? Math.max(-12, Math.min(12, motion.accel)) : 0;
    const leanTarget = dashing ? 0.38 : moving ? 0.08 + 0.12 * run + accel * 0.012 : 0;
    const bankTarget = motion ? Math.max(-0.28, Math.min(0.28, -motion.turn * speed * 0.02)) : 0;
    this.lean = ease(this.lean, leanTarget, 9);
    this.bank = ease(this.bank, bankTarget, 7);
    if (j.head) {
      j.head.rotation.z = (moving ? Math.sin(this.walkPhase * 0.5) * 0.06 : Math.sin(this.time * 1.6) * 0.04) + this.lean * 0.4; // mira al frente
      j.head.rotation.x = -this.bank * 0.5;
    }
    this.body.position.y = moving && !dashing ? Math.abs(sin) * (0.05 + 0.05 * run) * this.scale : 0; // bote: dos por zancada
    const waddle = rigid ? 0.16 : 0.05; // los de cuerpo redondo se contonean más (no mueven las piernas)
    this.body.rotation.x = (moving && !dashing ? sin * waddle : 0) + this.bank; // lateral (el modelo está girado)
    this.body.rotation.z = -this.lean;

    // Estirado en el dash; aplastado un instante al terminarlo (o al caer del Supersalto); respira parado
    if (this.wasDashing && !dashing) this.land(0.8);
    this.wasDashing = dashing;
    let sy = moving ? 1 : 1 + Math.sin(this.time * 2.4) * 0.015;
    let sxz = 1;
    if (dashing) { sy = 1.07; sxz = 0.96; }
    if (this.squash) {
      this.squash.t += dt;
      const t = this.squash.t / 0.18;
      if (t >= 1) this.squash = null;
      else { const k = Math.sin(t * Math.PI) * 0.14 * this.squash.k; sy -= k; sxz += k * 0.6; }
    }
    this.model.scale.set(this.scale * sxz, this.scale * sy, this.scale * sxz);
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
