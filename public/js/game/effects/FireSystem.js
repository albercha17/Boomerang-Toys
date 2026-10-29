import * as THREE from 'three';
import { POWERUPS } from '../content/powerups.js';

const MAX_PATCHES = 140;
const FLAMES = 3; // llamas por mancha
const CAPACITY = MAX_PATCHES * FLAMES;

/**
 * Rastro de fuego del power-up Fuego: manchas de llamas en el suelo que eliminan a quien las pisa (salvo a quien
 * lanzó el búmerang) hasta que se apagan. Cada mancha son unas llamas que bailan (dibujadas con ruido en un shader,
 * siempre de cara a la cámara) y un resplandor en el suelo. Todo instanciado: dos mallas para todo el fuego.
 */
const FLAME_VERTEX = /* glsl */ `
  attribute vec4 aData; // semilla, nacimiento (ms), tamaño, activa (0/1)
  uniform float uTime;
  uniform float uLife;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  void main() {
    vUv = uv;
    vSeed = aData.x;
    float age = (uTime - aData.y) / uLife;
    float grow = smoothstep(0.0, 0.08, age);
    vFade = aData.w * grow * (1.0 - smoothstep(0.65, 1.0, age));
    float size = aData.z * (0.3 + 0.7 * grow) * (1.0 - 0.5 * smoothstep(0.55, 1.0, age));
    vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); // de cara a la cámara, pero de pie
    vec3 p = base + right * position.x * size + vec3(0.0, 1.0, 0.0) * position.y * size * 1.5;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    if (vFade < 0.01) discard;
    float t = uTime * 0.001 + vSeed * 13.0;
    float y = vUv.y;
    float n = fbm(vec2(vUv.x * 3.0 + vSeed * 7.0, y * 2.4 - t * 2.8));
    // Silueta: ancha abajo, en punta arriba, ondulando más cuanto más arriba
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.1 * y;
    float w = mix(0.9, 0.04, pow(y, 0.75));
    float body = 1.0 - smoothstep(w * 0.45, w, abs(x));
    float top = 1.0 - smoothstep(0.3, 0.95, y + (n - 0.5) * 0.55);
    float mask = body * top * smoothstep(0.0, 0.06, y);
    // Calor: más en el centro y abajo; del rojo al naranja, al amarillo y casi blanco
    float heat = mask * (1.25 - y) * (0.55 + n * 0.9) * (1.0 - abs(x) * 0.6);
    vec3 col = mix(vec3(0.85, 0.12, 0.02), vec3(1.0, 0.5, 0.04), smoothstep(0.1, 0.45, heat));
    col = mix(col, vec3(1.0, 0.86, 0.3), smoothstep(0.45, 0.8, heat));
    col = mix(col, vec3(1.0, 0.98, 0.85), smoothstep(0.85, 1.15, heat));
    float a = clamp(mask * 1.4, 0.0, 1.0) * vFade;
    if (a < 0.02) discard;
    gl_FragColor = vec4(col, a);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  attribute vec4 aData;
  uniform float uTime;
  uniform float uLife;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aData.x;
    float age = (uTime - aData.y) / uLife;
    vFade = aData.w * smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.0, age));
    vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 p = base + vec3(position.x, 0.0, -position.y) * aData.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float flicker = 0.8 + 0.2 * sin(uTime * 0.02 + vSeed * 40.0);
    float a = (1.0 - smoothstep(0.0, 1.0, d)) * 0.55 * vFade * flicker;
    if (a < 0.01) discard;
    gl_FragColor = vec4(1.0, 0.45, 0.08, a);
  }
`;

function instanced(geometry, vertexShader, fragmentShader, count, blending) {
  const uniforms = { uTime: { value: 0 }, uLife: { value: POWERUPS.fuego.lifeMs } };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const data = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
  data.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aData', data);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return { mesh, data, uniforms };
}

export class FireSystem {
  constructor(stage) {
    this.stage = stage;
    this.patches = [];
    this.next = 0; // siguiente hueco (en anillo)
    const flame = new THREE.PlaneGeometry(1, 1);
    flame.translate(0, 0.5, 0); // la base de la llama, en el suelo
    this.flames = instanced(flame, FLAME_VERTEX, FLAME_FRAGMENT, CAPACITY, THREE.NormalBlending);
    this.glows = instanced(new THREE.PlaneGeometry(2, 2), GLOW_VERTEX, GLOW_FRAGMENT, MAX_PATCHES, THREE.AdditiveBlending);
    this.glows.mesh.renderOrder = 4;
    stage.scene.add(this.glows.mesh, this.flames.mesh);
    this.matrix = new THREE.Matrix4();
  }

  add(x, z, owner, now) {
    const { radius } = POWERUPS.fuego;
    const slot = this.next;
    this.next = (this.next + 1) % MAX_PATCHES;
    const old = this.patches.findIndex((p) => p.slot === slot);
    if (old >= 0) this.patches.splice(old, 1);
    // Tres llamas de tamaños distintos, un poco repartidas, y el resplandor debajo
    for (let k = 0; k < FLAMES; k++) {
      const i = slot * FLAMES + k;
      const ang = Math.random() * Math.PI * 2;
      const off = k === 0 ? 0 : radius * (0.35 + Math.random() * 0.25);
      this.matrix.makeTranslation(x + Math.cos(ang) * off, 0.02, z + Math.sin(ang) * off);
      this.flames.mesh.setMatrixAt(i, this.matrix);
      this.flames.data.setXYZW(i, Math.random(), now, radius * [2.6, 1.9, 1.5][k], 1);
    }
    this.matrix.makeTranslation(x, 0.03, z);
    this.glows.mesh.setMatrixAt(slot, this.matrix);
    this.glows.data.setXYZW(slot, Math.random(), now, radius * 2.2, 1);
    for (const g of [this.flames, this.glows]) { g.mesh.instanceMatrix.needsUpdate = true; g.data.needsUpdate = true; }
    this.patches.push({ x, z, owner, bornAt: now, slot });
  }

  /** Llama a onBurn(objetivo) para cada personaje o señuelo vivo que pise el fuego de otro. */
  update(now, targets, onBurn) {
    const { lifeMs, radius } = POWERUPS.fuego;
    this.flames.uniforms.uTime.value = now;
    this.glows.uniforms.uTime.value = now;
    this.patches = this.patches.filter((patch) => {
      if (now - patch.bornAt >= lifeMs) {
        this.remove(patch);
        return false;
      }
      for (const target of targets) {
        if (target.alive && target !== patch.owner && target.owner !== patch.owner
          && Math.hypot(target.x - patch.x, target.z - patch.z) < radius + target.def.radius * 0.6) {
          onBurn(target);
        }
      }
      return true;
    });
  }

  clear() {
    for (const patch of this.patches) this.remove(patch);
    this.patches = [];
  }

  /** Apaga su hueco (las llamas dejan de dibujarse). */
  remove(patch) {
    for (let k = 0; k < FLAMES; k++) this.flames.data.setW(patch.slot * FLAMES + k, 0);
    this.glows.data.setW(patch.slot, 0);
    this.flames.data.needsUpdate = true;
    this.glows.data.needsUpdate = true;
  }
}
