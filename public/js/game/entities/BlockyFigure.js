import * as THREE from 'three';
import { MODELS } from '../render/models.js';
import { toonMaterial } from '../render/toon.js';
import { playerRing } from '../content/figures.js';

/**
 * Muñeco 3D animado (modelos Kenney «Blocky Characters», CC0) con la piel y los accesorios del juguete.
 * Las 6 piezas del modelo (cabeza, torso, brazos y piernas) son las que salen volando al desmontarse.
 * Misma interfaz que ToyFigure: group, animate, handWorldPosition, partsInWorld (+ strike y throw).
 * Mira hacia +x en coordenadas locales, como el resto de figuras.
 */
const HEIGHT = 1.45; // altura del muñeco (sin accesorios) con escala 1
const PART_KIND = { head: 'head', torso: 'torso', 'arm-left': 'arm', 'arm-right': 'arm', 'leg-left': 'leg', 'leg-right': 'leg' };
const FADE = 0.18;
const textureLoader = new THREE.TextureLoader();
const skins = new Map();

function skinTexture(url) {
  if (!skins.has(url)) {
    const texture = textureLoader.load(url);
    texture.flipY = false; // como las texturas de glTF
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; // el modelo usa coordenadas fuera de 0..1
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    skins.set(url, texture);
  }
  return skins.get(url);
}

export class BlockyFigure {
  /** @param {object} look { base, skin?, accessories?(nodes, helpers) } */
  constructor(look, ringColor, scale = 1) {
    const source = MODELS[look.base];
    this.scale = scale;
    this.group = new THREE.Group();
    this.model = source.scene.clone(true);
    this.model.rotation.y = Math.PI / 2; // el modelo mira a +z; el juego usa +x

    const map = look.skin ? skinTexture(look.skin) : null;
    this.nodes = {};
    this.model.traverse((o) => {
      if (o.name) this.nodes[o.name] = o;
      if (!o.isMesh) return;
      o.material = toonMaterial(0xffffff, map ?? o.material.map);
      o.castShadow = true;
    });

    // Altura del modelo para escalarlo como los demás muñecos
    const box = new THREE.Box3().setFromObject(this.model);
    const fit = (HEIGHT * scale) / (box.max.y - box.min.y);
    this.model.scale.setScalar(fit);
    this.model.position.y = -box.min.y * fit;
    this.group.add(this.model);

    look.accessories?.(this.nodes, ACCESSORY_HELPERS);

    // Piezas para el desmontaje: copia centrada de cada malla (sin hijos)
    this.parts = [];
    for (const [name, kind] of Object.entries(PART_KIND)) {
      const node = this.nodes[name];
      if (!node) continue;
      // La propia pieza (no las que cuelgan de ella: del torso cuelgan brazos y cabeza)
      const own = node.isMesh ? [node] : node.children.filter((c) => c.isMesh && !PART_KIND[c.name] && !c.userData.accessory);
      for (const mesh of own) this.parts.push(makePart(kind, mesh, node));
    }

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of source.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const name of ['attack-melee-right', 'interact-right']) {
      const a = this.actions[name];
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
    }
    this.loop = null;
    this.oneShot = null;
    this.play('idle');

    // Mano derecha: punta del brazo derecho
    this.hand = new THREE.Object3D();
    const arm = this.nodes['arm-right'];
    if (arm) {
      const armBox = new THREE.Box3();
      arm.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); armBox.union(o.geometry.boundingBox); } });
      this.hand.position.set((armBox.min.x + armBox.max.x) / 2, armBox.min.y + 0.12, armBox.max.z + 0.12); // asomando por delante
      arm.add(this.hand);
    } else {
      this.hand.position.set(0.3, 0.7, 0.25);
      this.group.add(this.hand);
    }

    if (ringColor !== null && ringColor !== undefined) this.group.add(playerRing(ringColor));
  }

  play(name) {
    const action = this.actions[name];
    if (!action || this.loop === action) return;
    action.reset().fadeIn(FADE).play();
    this.loop?.fadeOut(FADE);
    this.loop = action;
  }

  /** Animación de una vez (golpe, lanzamiento) por encima de la de andar. */
  once(name) {
    const action = this.actions[name];
    if (!action) return;
    this.oneShot?.stop();
    action.reset().setEffectiveWeight(1).fadeIn(0.05).play();
    action.timeScale = 1.6;
    this.oneShot = action;
  }

  strike() { this.once('attack-melee-right'); }
  throw() { this.once('interact-right'); }

  /** @param {number} speed01 velocidad relativa (0..1) @param {boolean} aiming apuntando con el búmerang */
  animate(dt, speed01, aiming) {
    if (speed01 > 0.75) this.play('sprint');
    else if (speed01 > 0.05) this.play('walk');
    else this.play(aiming ? 'holding-right' : 'idle');
    if (this.loop) this.loop.timeScale = speed01 > 0.05 ? 0.6 + speed01 * 0.8 : 1;
    if (this.oneShot && !this.oneShot.isRunning()) this.oneShot = null;
    this.mixer.update(dt);
    // Apuntando mientras anda: el brazo derecho adelantado
    if (aiming && speed01 > 0.05 && !this.oneShot && this.nodes['arm-right']) this.nodes['arm-right'].rotation.set(-Math.PI / 2, 0, 0);
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
        shape: { box: half.toArray().map((h, i) => Math.max(0.04, h * Math.abs(scale.getComponent(i)))) },
        position: source.localToWorld(center.clone()),
        quaternion: source.getWorldQuaternion(new THREE.Quaternion()),
        scale,
      };
    });
  }
}

function makePart(kind, mesh, node) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const center = bb.getCenter(new THREE.Vector3());
  const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const geometry = mesh.geometry.clone().translate(-center.x, -center.y, -center.z);
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geometry, mesh.material));
  // Los accesorios de la pieza salen volando con ella
  node.traverse((o) => {
    if (!o.userData.accessory || o.parent !== node) return;
    const copy = o.clone(true);
    copy.position.sub(center);
    object.add(copy);
  });
  return { kind, object, source: mesh, center, half };
}

/**
 * Ayudas para vestir al muñeco con piezas de bloque (sombreros, cascos, escudos...).
 * on(pieza) da un punto de enganche en medidas del modelo (la cabeza viene escalada ×0.1 en el archivo).
 */
const ACCESSORY_HELPERS = {
  on(node) {
    const mount = new THREE.Group();
    mount.scale.setScalar(1 / node.scale.x);
    mount.userData.accessory = true;
    node.add(mount);
    return mount;
  },
  box(parent, [w, h, d], color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], map = null) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color, map));
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.userData.accessory = true;
    parent.add(mesh);
    return mesh;
  },
  cylinder(parent, [rTop, rBottom, h], color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0], segments = 16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), toonMaterial(color));
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.userData.accessory = true;
    parent.add(mesh);
    return mesh;
  },
};
