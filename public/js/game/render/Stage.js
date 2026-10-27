import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { HueSaturationShader } from 'three/addons/shaders/HueSaturationShader.js';

// Acabado de maqueta (oclusión ambiental, desenfoque de miniatura, viñeta); /?calidad=baja lo quita
const FANCY = new URLSearchParams(location.search).get('calidad') !== 'baja';
const TILT_FOCUS = 0.52; // altura de la pantalla que queda nítida (0 abajo, 1 arriba)
const TILT_BLUR = 2.2; // fuerza del desenfoque hacia arriba y abajo

const CAMERA_TILT = THREE.MathUtils.degToRad(60); // inclinación sobre el suelo, como en Boomerang Fu
const HUD_ROOM = 0.6; // margen (en unidades) para que la barra superior no tape la arena

/**
 * Escena 3D: renderizador, cámara cenital inclinada, luces con sombras y temblor de cámara.
 * El suelo es el plano XZ: x a la derecha, z hacia la cámara (abajo en pantalla).
 */
export class Stage {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  /** Cadena de efectos: escena -> oclusión ambiental -> color -> desenfoque de miniatura -> viñeta -> salida. */
  setupEffects() {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, 1, 1);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    ao.blendIntensity = 0.85;
    composer.addPass(ao);
    const color = new ShaderPass(HueSaturationShader);
    color.uniforms.saturation.value = 0.12;
    composer.addPass(color);
    this.tiltH = new ShaderPass(HorizontalTiltShiftShader);
    this.tiltV = new ShaderPass(VerticalTiltShiftShader);
    for (const pass of [this.tiltH, this.tiltV]) {
      pass.uniforms.r.value = TILT_FOCUS;
      composer.addPass(pass);
    }
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.95;
    vignette.uniforms.darkness.value = 1.05;
    composer.addPass(vignette);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.ao = ao;
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
      this.tiltH.uniforms.h.value = TILT_BLUR / width;
      this.tiltV.uniforms.v.value = TILT_BLUR / height;
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
