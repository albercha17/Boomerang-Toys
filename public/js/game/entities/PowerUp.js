import * as THREE from 'three';
import { plastic } from '../render/materials.js';
import { addOutlines } from '../render/toon.js';
import { boxModel } from '../render/boxModels.js';

// Caja hecha por código: solo si no se pudo cargar el modelo (render/boxModels.js)
const BOX = new THREE.BoxGeometry(0.62, 0.62, 0.62);
const RIBBON_A = new THREE.BoxGeometry(0.66, 0.66, 0.16);
const RIBBON_B = new THREE.BoxGeometry(0.16, 0.66, 0.66);
const BOW = new THREE.TorusGeometry(0.12, 0.05, 8, 16);
const GLOW = new THREE.RingGeometry(0.55, 0.95, 40);
const SPARK = new THREE.OctahedronGeometry(0.09);
const GOLD = 0xffc93c;
const SIZE = { regalo: 0.82, cofre: 1.15 }; // lado mayor en unidades
const OPEN_MS = 450;

const ICON_TEXTURES = new Map(); // emoji -> textura (se dibuja una vez y se reutiliza)

/** Icono del power-up (emoji) flotando sobre la caja. */
function createIcon(emoji) {
  if (!ICON_TEXTURES.has(emoji)) ICON_TEXTURES.set(emoji, drawIcon(emoji));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ICON_TEXTURES.get(emoji), depthTest: false, transparent: true }));
  sprite.scale.set(0.7, 0.7, 1);
  sprite.renderOrder = 9;
  return sprite;
}

function drawIcon(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const g = canvas.getContext('2d');
  g.font = '70px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 48, 54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** La caja de antes, por código (de reserva). */
function fallbackBox(def) {
  const golden = Boolean(def.super);
  const group = new THREE.Group();
  const box = new THREE.Mesh(BOX, plastic(golden ? GOLD : def.color));
  const ribbon = plastic(golden ? def.color : 0xfff4e0);
  const bow = new THREE.Mesh(BOW, ribbon);
  bow.position.y = 0.36;
  bow.rotation.x = Math.PI / 2;
  group.add(box, new THREE.Mesh(RIBBON_A, ribbon), new THREE.Mesh(RIBBON_B, ribbon), bow);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.position.y += 0.31; } });
  addOutlines(group);
  return group;
}

/**
 * Caja sorpresa en el suelo: flota y gira hasta que alguien pasa por encima; entonces se abre (la tapa salta) y
 * desaparece. Los power-ups normales son una caja de regalo; los de superhabilidad (def.super), un cofre del tesoro
 * con un halo dorado en el suelo y destellos alrededor.
 */
export class PowerUp {
  constructor(stage, def, x, z) {
    this.stage = stage;
    this.def = def;
    this.x = x;
    this.z = z;
    this.bornAt = performance.now();
    this.openedAt = null;

    const golden = Boolean(def.super);
    const kind = golden ? 'cofre' : 'regalo';
    this.group = new THREE.Group();
    this.box = new THREE.Group(); // flota y gira
    const model = boxModel(kind);
    if (model) {
      model.object.scale.multiplyScalar(SIZE[kind]);
      this.box.add(model.object);
      this.lid = model.lid;
      if (this.lid) {
        this.lidHome = { y: this.lid.position.y, rx: this.lid.rotation.x };
        this.lidLift = new THREE.Box3().setFromObject(this.lid).getSize(new THREE.Vector3()).y / model.object.scale.y * 2.2;
      }
    } else {
      this.box.add(fallbackBox(def));
      if (golden) this.box.scale.setScalar(1.35);
    }
    this.baseScale = this.box.scale.x;
    this.icon = createIcon(def.icon);
    this.icon.position.y = golden ? 1.75 : 1.4;
    this.group.add(this.box, this.icon);
    this.sparks = [];
    if (golden) {
      this.glow = new THREE.Mesh(GLOW, new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, depthWrite: false }));
      this.glow.rotation.x = -Math.PI / 2;
      this.glow.position.y = 0.04;
      this.group.add(this.glow);
      const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
      for (let i = 0; i < 5; i++) {
        const spark = new THREE.Mesh(SPARK, sparkMaterial);
        this.group.add(spark);
        this.sparks.push(spark);
      }
      this.icon.scale.set(0.95, 0.95, 1);
    }
    this.group.position.set(x, 0, z);
    stage.scene.add(this.group);
  }

  /** Alguien la ha cogido: se abre y luego desaparece (update devuelve false cuando ha terminado). */
  open(now) {
    if (this.openedAt === null) this.openedAt = now;
  }

  get opening() { return this.openedAt !== null; }

  /** @returns {boolean} false cuando ya ha terminado de abrirse (hay que quitarla) */
  update(now) {
    const t = (now - this.bornAt) / 1000;
    // Aparece creciendo con un rebote
    const a = Math.min(1, t * 2.5);
    const pop = a < 1 ? 1 - Math.pow(1 - a, 3) + Math.sin(a * Math.PI) * 0.25 : 1;
    if (!this.opening) {
      this.box.position.y = 0.15 + Math.sin(t * 3) * 0.08;
      this.box.rotation.y = t * 1.4;
      this.box.scale.setScalar(this.baseScale * pop);
      this.icon.material.opacity = a;
      this.icon.position.y = (this.def.super ? 1.75 : 1.4) + Math.sin(t * 3) * 0.05;
    } else {
      // Abriéndose: la tapa salta y gira, la caja da un respingo y el icono sube y se desvanece
      const k = Math.min(1, (now - this.openedAt) / OPEN_MS);
      if (this.lid) {
        this.lid.position.y = this.lidHome.y + this.lidLift * Math.sin(k * Math.PI * 0.6);
        this.lid.rotation.x = this.lidHome.rx - k * 1.9;
      }
      this.box.scale.setScalar(this.baseScale * (1 + Math.sin(k * Math.PI) * 0.18) * (k > 0.75 ? 1 - (k - 0.75) * 4 : 1));
      this.icon.position.y += 0.05;
      this.icon.material.opacity = 1 - k;
      if (k >= 1) return false;
    }
    if (this.glow) {
      this.glow.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
      this.glow.material.opacity = (0.35 + Math.sin(t * 4) * 0.2) * (this.opening ? 0.5 : 1);
      this.sparks.forEach((spark, i) => {
        const ang = t * 2.2 + (i * Math.PI * 2) / this.sparks.length;
        spark.position.set(Math.cos(ang) * 0.95, 0.5 + Math.sin(t * 3 + i) * 0.35, Math.sin(ang) * 0.95);
        spark.rotation.y = t * 4;
      });
    }
    return true;
  }

  destroy() {
    this.stage.scene.remove(this.group);
    this.release();
  }

  /** Libera lo propio de esta caja (la textura del icono es compartida y se queda). */
  release() {
    if (this.glow) { this.glow.material.dispose(); this.sparks[0]?.material.dispose(); }
    this.icon.material.dispose();
  }
}
