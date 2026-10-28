/**
 * Acabado de maqueta en un solo paso (antes eran cinco a pantalla completa): un poco más de color, desenfoque de
 * miniatura arriba y abajo, viñeta y paso a sRGB para la pantalla. Mismos valores que los shaders de three que
 * sustituye (HueSaturation, Horizontal/VerticalTiltShift, Vignette y OutputPass).
 */
export const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 0.12 },
    focus: { value: 0.5 }, // altura de la pantalla que queda nítida (0 abajo, 1 arriba)
    blur: { value: [0, 0] }, // tamaño del desenfoque en uv (x, y), ya dividido por el tamaño de la pantalla
    vignetteOffset: { value: 0.95 },
    vignetteDarkness: { value: 1.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform float focus;
    uniform vec2 blur;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    varying vec2 vUv;

    void main() {
      // Desenfoque de miniatura: 3×3 muestras, más separadas cuanto más lejos de la franja nítida
      vec2 step = blur * abs(focus - vUv.y) * 2.0;
      vec4 c = texture2D(tDiffuse, vUv) * 0.25;
      c += (texture2D(tDiffuse, vUv + vec2(step.x, 0.0)) + texture2D(tDiffuse, vUv - vec2(step.x, 0.0))
          + texture2D(tDiffuse, vUv + vec2(0.0, step.y)) + texture2D(tDiffuse, vUv - vec2(0.0, step.y))) * 0.125;
      c += (texture2D(tDiffuse, vUv + step) + texture2D(tDiffuse, vUv - step)
          + texture2D(tDiffuse, vUv + vec2(step.x, -step.y)) + texture2D(tDiffuse, vUv + vec2(-step.x, step.y))) * 0.0625;

      // Color algo más vivo
      float average = (c.r + c.g + c.b) / 3.0;
      c.rgb += (average - c.rgb) * (1.0 - 1.0 / (1.001 - saturation));

      // Viñeta
      vec2 uv = (vUv - vec2(0.5)) * vec2(vignetteOffset);
      c.rgb = mix(c.rgb, vec3(1.0 - vignetteDarkness), dot(uv, uv));

      #ifdef TONE_MAPPING
        c.rgb = toneMapping(c.rgb); // la escena va a una imagen intermedia: el mapeo de tonos se hace aquí
      #endif
      gl_FragColor = linearToOutputTexel(c);
    }`,
};
