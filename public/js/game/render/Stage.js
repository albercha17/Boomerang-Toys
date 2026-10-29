import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FinishShader } from './finishShader.js';
import { NEW_LIGHT, LIGHT } from './lightMode.js';

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

const CAMERA_TILT = THREE.MathUtils.degToRad(48); // inclinación sobre el suelo: más baja que Boomerang Fu (60°), con más profundidad
const HUD_PX = 56; // alto de la barra superior del juego: la arena se encuadra por debajo
const MARGIN_PX = 18; // margen libre alrededor de la arena (también abajo: que se vea el canto de la mesa)

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
    this.container = container;
    this.freeCamera = false; // el editor de mapas mueve la cámara a su aire (OrbitControls)

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a1d14);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.target = new THREE.Vector3();
    this.basePosition = new THREE.Vector3();
    this.frameSize = { width: 20, depth: 12 };
    this.shakeUntil = 0;
    this.shakeStrength = 0;

    // Luz nueva: un estudio luminoso de fondo (brillos y reflejos en los materiales) + sol + cielo suave, con mapeo
    // de tonos cinematográfico; la vieja (/?luz=vieja): solo cielo fuerte y sol
    this.lightScale = NEW_LIGHT ? { hemi: LIGHT.hemi, sun: LIGHT.sun } : { hemi: 1, sun: 1 };
    if (NEW_LIGHT) {
      if (LIGHT.aces) this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = LIGHT.exposure;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
      pmrem.dispose();
    }
    this.hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b4a2e, 1.1 * this.lightScale.hemi);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.7 * this.lightScale.sun);
    this.sun.position.set(-8, 18, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(NEW_LIGHT ? 4096 : 2048, NEW_LIGHT ? 4096 : 2048); // más nítidas en mapas grandes
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = NEW_LIGHT ? 4 : 3;
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
    if (NEW_LIGHT) this.finish.uniforms.saturation.value = LIGHT.saturation;
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

  /** Con la luz nueva, cuánto reflejan el entorno los materiales de estos objetos (los modelos traen 1: demasiado). */
  tuneMaterials(root) {
    if (!NEW_LIGHT) return;
    root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && 'envMapIntensity' in m && !m.userData.envTuned) { m.envMapIntensity = LIGHT.env; m.userData.envTuned = true; }
    });
  }

  /** Ambiente de la zona de la casa: color de fondo y luz. */
  setMood({ background, sky, ground, sun }) {
    this.scene.background = new THREE.Color(background);
    this.hemi.color.setHex(sky);
    this.hemi.groundColor.setHex(ground);
    this.hemi.intensity = 1.1 * this.lightScale.hemi;
    this.sun.intensity = sun * this.lightScale.sun;
  }

  /**
   * Ajusta cámara y sombras para que se vea entero un rectángulo del suelo centrado en el origen.
   * `drop`: lo que baja el canto delantero (el grosor de la mesa), que también tiene que caber abajo;
   * `rise`: lo alto de la pared del fondo (habitaciones), que tiene que caber arriba.
   */
  frame(width, depth, { drop = 0, rise = 0 } = {}) {
    this.frameSize = { width, depth, drop, rise };
    const shadow = this.sun.shadow.camera;
    shadow.left = -width / 2 - 2;
    shadow.right = width / 2 + 2;
    shadow.top = depth / 2 + 2;
    shadow.bottom = -depth / 2 - 2;
    shadow.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
      this.finish.uniforms.blur.value = [TILT_BLUR / width, TILT_BLUR / height];
    }
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.fitCamera(width, height);
  }

  /**
   * Busca la distancia y el centro de la cámara para que las esquinas de la arena (y el canto delantero) queden
   * dentro de la pantalla con margen, por debajo de la barra superior. Con la cámara inclinada lo de delante se ve
   * más grande, así que se prueba proyectando las esquinas de verdad.
   */
  fitCamera(width, height) {
    const { width: w, depth: d, drop = 0, rise = 0 } = this.frameSize;
    const hud = this.freeCamera ? 0 : HUD_PX;
    const limits = { top: 1 - ((hud + MARGIN_PX) / height) * 2, bottom: -1 + (MARGIN_PX / height) * 2, side: 1 - (MARGIN_PX / width) * 2 };
    const corners = [[-w / 2, rise, -d / 2], [w / 2, rise, -d / 2], [-w / 2, 0, d / 2], [w / 2, 0, d / 2], [-w / 2, -drop, d / 2], [w / 2, -drop, d / 2]]
      .map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const camera = this.camera.clone();
    const v = new THREE.Vector3();
    const place = (distance, tz) => {
      camera.position.set(0, Math.sin(CAMERA_TILT) * distance, tz + Math.cos(CAMERA_TILT) * distance);
      camera.lookAt(0, 0, tz);
      camera.updateMatrixWorld();
      let minY = Infinity;
      let maxY = -Infinity;
      let maxX = 0;
      for (const c of corners) {
        v.copy(c).project(camera);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
        maxX = Math.max(maxX, Math.abs(v.x));
      }
      return { minY, maxY, maxX };
    };
    let tz = 0;
    let distance = 40;
    for (let round = 0; round < 4; round++) {
      // Distancia mínima con la que cabe (búsqueda binaria)
      let lo = 2;
      let hi = 400;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const p = place(mid, tz);
        if (p.maxX <= limits.side && p.maxY - p.minY <= limits.top - limits.bottom) hi = mid; else lo = mid;
      }
      distance = hi;
      // Centrar en vertical entre la barra y el borde de abajo (mover el centro hacia delante o hacia atrás)
      const p = place(distance, tz);
      const excess = (p.maxY + p.minY) / 2 - (limits.top + limits.bottom) / 2;
      tz -= excess * d * 0.5;
    }
    this.target.set(0, 0, tz);
    this.basePosition.set(0, Math.sin(CAMERA_TILT) * distance, tz + Math.cos(CAMERA_TILT) * distance);
  }

  shake(durationMs, strength) {
    this.shakeUntil = performance.now() + durationMs;
    this.shakeStrength = strength;
  }

  render(now) {
    this.adaptQuality(now);
    if (this.freeCamera) return this.draw();
    this.camera.position.copy(this.basePosition);
    if (now < this.shakeUntil) {
      const s = this.shakeStrength;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
    this.draw();
  }

  draw() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
