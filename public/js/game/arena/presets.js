/**
 * Tamaños de arena y límites de configuración (en casillas, borde incluido; 1 casilla = 1 unidad).
 * Se pueden elegir desde la dirección de la pantalla, por ejemplo:
 *   /?mapa=grande            /?mapa=pequena&semilla=42
 *   /?ancho=30&alto=16&densidad=0.2&simetria=no
 */
export const ARENA_PRESETS = Object.freeze({
  pequena: { cols: 20, rows: 12, density: 0.13 },
  mediana: { cols: 26, rows: 14, density: 0.15 },
  grande: { cols: 34, rows: 20, density: 0.16 },
});

export const ARENA_LIMITS = Object.freeze({
  cols: [12, 64],
  rows: [10, 40],
  density: [0, 0.3],
});

const DEFAULTS = Object.freeze({
  preset: 'mediana',
  chunkSize: 8, // tamaño de cada zona de generación
  symmetry: 'mirror-x', // 'mirror-x' (izquierda = derecha) o 'none'
  spawnCount: 8,
  propDensity: 0.02, // juguetes sueltos por casilla libre
  minOpenRatio: 0.6, // si queda menos suelo accesible, se repite con otra variante
  maxAttempts: 8,
});

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));

export const randomSeed = () => Math.floor(Math.random() * 1e6);

/** Configuración completa a partir de los parámetros de la dirección (todos opcionales). */
export function readArenaConfig(search = '') {
  const params = new URLSearchParams(search);
  const presetName = ARENA_PRESETS[params.get('mapa')] ? params.get('mapa') : DEFAULTS.preset;
  const preset = ARENA_PRESETS[presetName];
  const number = (key, fallback) => {
    const value = Number(params.get(key));
    return params.has(key) && Number.isFinite(value) ? value : fallback;
  };
  return {
    ...DEFAULTS,
    preset: presetName,
    cols: Math.round(clamp(number('ancho', preset.cols), ARENA_LIMITS.cols)),
    rows: Math.round(clamp(number('alto', preset.rows), ARENA_LIMITS.rows)),
    density: clamp(number('densidad', preset.density), ARENA_LIMITS.density),
    symmetry: params.get('simetria') === 'no' ? 'none' : DEFAULTS.symmetry,
    seed: Math.floor(number('semilla', randomSeed())),
  };
}

export function withNewSeed(config) {
  return { ...config, seed: randomSeed() };
}
