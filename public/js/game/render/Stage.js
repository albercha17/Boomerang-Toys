import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FinishShader } from './finishShader.js';

// Calidad: por defecto se adapta sola (baja un escalón si no llega a MIN_FPS); /?calidad=alta la fija al máximo y
// /?calidad=baja quita el acabado de maqueta (desenfoque de miniatura, color y viñeta) desde el principio.
const QUALITY = new URLSearchParams(location.search).get('calidad');
const FANCY = QUALITY !== 'baja';
const ADAPTIVE = QUALITY !== 'alta' && QUALITY !== 'baja';
const MIN_FPS = 45; // por debajo de esto se baja un escalón (así no se queda por debajo de 30 en los momentos duros)
const WARMUP_MS = 3000; // al cargar, los primeros fotogramas son lentos (se suben texturas y se preparan shaders)
const SAMPLE_MS = 2000;
// Escalones, de mejor a peor: resolución (×devicePixelRatio) y si se usa el acabado de maqueta
const LEVELS = [
  { ratio: 2, effects: true },
  { ratio: 1, effects: true },
  { ratio: 1, effects: false },
  { ratio: 0.75, effects: false },
];
const TILT_FOCUS = 0.5; // altura de la pantalla que queda nítida (0 abajo, 1 arriba)
const TILT_BLUR = 0.7; // fuerza del desenfoque hacia arriba y abajo (suave: solo los bordes)

const CAMERA_TILT = THREE.MathUtils.degToRad(60); // inclinación sobre el suelo, como en Boomerang Fu
const HUD_ROOM = 0.6; // margen (en unidades) para que la barra superior no tape la arena

/**
 * Escena 3D: renderizador, cámara cenital inclinada, luces con sombras y temblor de cámara.
 * El suelo es el plano XZ: x a la derecha, z hacia la cámara (abajo en pantalla).
 */
export class Stage {
  constructor(container) {
    // En portátiles con dos tarjetas, pide la potente (Chrome lo tiene en cuenta si puede)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.level = FANCY ? 0 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, LEVELS[this.level].ratio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a1d14);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    this.target = new THREE.Vector3();
    this.basePosition = new THREE.Vector3();
    this.frameSize = { width: 20, depth: 12 };
    this.shakeUntil = 0;
    this.shakeStrength = 0;

    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b4a2e, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    this.sun.position.set(-8, 18, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);

    if (FANCY) this.setupEffects();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Escena (con suavizado de bordes) -> acabado de maqueta en un solo paso -> pantalla. */
  setupEffects() {
    // Imagen intermedia con multimuestreo: sin esto salen dientes de sierra
    const target = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.finish = new ShaderPass(FinishShader);
    this.finish.uniforms.focus.value = TILT_FOCUS;
    composer.addPass(this.finish);
    this.composer = composer;
  }

  /** Calidad automática: si en SAMPLE_MS no llega a MIN_FPS, baja un escalón (nunca vuelve a subir: no parpadea). */
  adaptQuality(now) {
    if (!ADAPTIVE || this.level >= LEVELS.length - 1) return;
    const q = (this.quality ??= { since: now + WARMUP_MS, frames: 0, last: now });
    const gap = now - q.last;
    q.last = now;
    if (now < q.since) return;
    if (gap > 250) { // pestaña oculta o parón puntual: no cuenta
      Object.assign(q, { since: now, frames: 0 });
      return;
    }
    q.frames++;
    if (now - q.since < SAMPLE_MS) return;
    const fps = (q.frames * 1000) / (now - q.since);
    Object.assign(q, { since: now + 500, frames: 0 });
    if (fps >= MIN_FPS) return;
    // Se salta el escalón que no cambia nada (p. ej. resolución ×2 y ×1 en una pantalla sin escalado)
    const same = (a, b) => a.effects === b.effects && Math.min(window.devicePixelRatio, a.ratio) === Math.min(window.devicePixelRatio, b.ratio);
    let next = this.level + 1;
    while (next < LEVELS.length - 1 && same(LEVELS[next], LEVELS[this.level])) next++;
    this.setLevel(next);
    console.info(`Calidad: ${fps.toFixed(0)} fps -> escalón ${this.level} (${JSON.stringify(LEVELS[this.level])})`);
  }

  setLevel(level) {
    this.level = level;
    const { ratio, effects } = LEVELS[level];
    const pixelRatio = Math.min(window.devicePixelRatio, ratio);
    this.renderer.setPixelRatio(pixelRatio);
    if (!effects && this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.composer?.setPixelRatio(pixelRatio);
    this.resize();
  }

  /** Ambiente de la zona de la casa: color de fondo y luz. */
  setMood({ background, sky, ground, sun }) {
    this.scene.background = new THREE.Color(background);
    this.hemi.color.setHex(sky);
    this.hemi.groundColor.setHex(ground);
    this.sun.intensity = sun;
  }

  /** Ajusta cámara y sombras para que se vea entero un rectángulo del suelo centrado en el origen. */
  frame(width, depth) {
    this.frameSize = { width, depth };
    const shadow = this.sun.shadow.camera;
    shadow.left = -width / 2 - 2;
    shadow.right = width / 2 + 2;
    shadow.top = depth / 2 + 2;
    shadow.bottom = -depth / 2 - 2;
    shadow.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
      this.finish.uniforms.blur.value = [TILT_BLUR / width, TILT_BLUR / height];
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const fitWidth = (this.frameSize.width / 2) * 1.04 / Math.tan(hHalf);
    const fitDepth = ((this.frameSize.depth / 2) * Math.sin(CAMERA_TILT) * 1.12 + HUD_ROOM) / Math.tan(vHalf);
    const distance = Math.max(fitWidth, fitDepth);

    this.target.set(0, 0, -HUD_ROOM * 0.6 - 1.1); // algo más arriba: asoma el decorado del fondo
    this.basePosition.set(0, Math.sin(CAMERA_TILT) * distance, Math.cos(CAMERA_TILT) * distance).add(this.target);
  }

  shake(durationMs, strength) {
    this.shakeUntil = performance.now() + durationMs;
    this.shakeStrength = strength;
  }

  render(now) {
    this.adaptQuality(now);
    this.camera.position.copy(this.basePosition);
    if (now < this.shakeUntil) {
      const s = this.shakeStrength;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
