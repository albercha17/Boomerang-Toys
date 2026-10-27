import * as THREE from 'three';
import { plastic } from '../render/materials.js';

const BOX = new THREE.BoxGeometry(0.62, 0.62, 0.62);
const RIBBON_A = new THREE.BoxGeometry(0.66, 0.66, 0.16);
const RIBBON_B = new THREE.BoxGeometry(0.16, 0.66, 0.66);
const BOW = new THREE.TorusGeometry(0.12, 0.05, 8, 16);

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

/** Caja sorpresa en el suelo: flota y gira hasta que alguien pasa por encima. */
export class PowerUp {
  constructor(stage, def, x, z) {
    this.stage = stage;
    this.def = def;
    this.x = x;
    this.z = z;
    this.bornAt = performance.now();

    this.group = new THREE.Group();
    const box = new THREE.Mesh(BOX, plastic(def.color));
    const ribbon = plastic(0xfff4e0);
    const bow = new THREE.Mesh(BOW, ribbon);
    bow.position.y = 0.36;
    bow.rotation.x = Math.PI / 2;
    this.box = new THREE.Group();
    this.box.add(box, new THREE.Mesh(RIBBON_A, ribbon), new THREE.Mesh(RIBBON_B, ribbon), bow);
    this.box.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.icon = createIcon(def.icon);
    this.icon.position.y = 1.25;
    this.group.add(this.box, this.icon);
    this.group.position.set(x, 0, z);
    stage.scene.add(this.group);
  }

  update(now) {
    const t = (now - this.bornAt) / 1000;
    const appear = Math.min(1, t * 3); // aparece creciendo
    this.box.position.y = 0.5 + Math.sin(t * 3) * 0.08;
    this.box.rotation.y = t * 1.6;
    this.box.scale.setScalar(appear);
    this.icon.material.opacity = appear;
  }

  destroy() {
    this.stage.scene.remove(this.group);
    this.icon.material.map.dispose();
    this.icon.material.dispose();
  }
}
