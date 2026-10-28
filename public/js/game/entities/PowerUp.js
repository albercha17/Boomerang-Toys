import * as THREE from 'three';
import { plastic } from '../render/materials.js';
import { addOutlines } from '../render/toon.js';

const BOX = new THREE.BoxGeometry(0.62, 0.62, 0.62);
const RIBBON_A = new THREE.BoxGeometry(0.66, 0.66, 0.16);
const RIBBON_B = new THREE.BoxGeometry(0.16, 0.66, 0.66);
const BOW = new THREE.TorusGeometry(0.12, 0.05, 8, 16);
const GLOW = new THREE.RingGeometry(0.55, 0.95, 40);
const SPARK = new THREE.OctahedronGeometry(0.09);
const GOLD = 0xffc93c;

/** Icono del power-up (emoji) flotando sobre la caja. */
function createIcon(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const g = canvas.getContext('2d');
  g.font = '70px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 48, 54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(0.7, 0.7, 1);
  sprite.renderOrder = 9;
  return sprite;
}

/**
 * Caja sorpresa en el suelo: flota y gira hasta que alguien pasa por encima.
 * Las de superhabilidad (def.super) son doradas, más grandes, con un halo en el suelo y destellos alrededor.
 */
export class PowerUp {
  constructor(stage, def, x, z) {
    this.stage = stage;
    this.def = def;
    this.x = x;
    this.z = z;
    this.bornAt = performance.now();

    this.group = new THREE.Group();
    const golden = Boolean(def.super);
    const box = new THREE.Mesh(BOX, plastic(golden ? GOLD : def.color));
    const ribbon = plastic(golden ? def.color : 0xfff4e0);
    const bow = new THREE.Mesh(BOW, ribbon);
    bow.position.y = 0.36;
    bow.rotation.x = Math.PI / 2;
    this.box = new THREE.Group();
    this.box.add(box, new THREE.Mesh(RIBBON_A, ribbon), new THREE.Mesh(RIBBON_B, ribbon), bow);
    this.box.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    addOutlines(this.box);
    this.icon = createIcon(def.icon);
    this.icon.position.y = golden ? 1.6 : 1.25;
    this.group.add(this.box, this.icon);
    this.sparks = [];
    if (golden) {
      this.box.scale.setScalar(1.35);
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

  update(now) {
    const t = (now - this.bornAt) / 1000;
    const appear = Math.min(1, t * 3); // aparece creciendo
    this.box.position.y = 0.5 + Math.sin(t * 3) * 0.08;
    this.box.rotation.y = t * 1.6;
    this.box.scale.setScalar(appear * (this.def.super ? 1.35 : 1));
    this.icon.material.opacity = appear;
    if (this.glow) {
      this.glow.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
      this.glow.material.opacity = 0.35 + Math.sin(t * 4) * 0.2;
      this.sparks.forEach((spark, i) => {
        const a = t * 2.2 + (i * Math.PI * 2) / this.sparks.length;
        spark.position.set(Math.cos(a) * 0.95, 0.5 + Math.sin(t * 3 + i) * 0.35, Math.sin(a) * 0.95);
        spark.rotation.y = t * 4;
      });
    }
  }

  destroy() {
    this.stage.scene.remove(this.group);
    if (this.glow) { this.glow.material.dispose(); this.sparks[0]?.material.dispose(); }
    this.icon.material.map.dispose();
    this.icon.material.dispose();
  }
}
