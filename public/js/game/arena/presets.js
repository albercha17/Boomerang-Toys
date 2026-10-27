/**
 * Tamaños de arena y límites de configuración (en casillas, borde incluido; 1 casilla = 1 unidad).
 * Se pueden elegir desde la dirección de la pantalla, por ejemplo:
 *   /?mapa=grande            /?mapa=pequena&semilla=42
 *   /?ancho=30&alto=16&densidad=0.2&simetria=no
 */
export const ARENA_PRESETS = Object.freeze({
  pequena: { cols: 24, rows: 14, density: 0.13 },
  mediana: { cols: 32, rows: 18, density: 0.14 },
  grande: { cols: 40, rows: 24, density: 0.15 },
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
  wallChance: 0.2, // mapas con paredes en el borde; el resto tiene línea roja (salir 5 s = explotar)
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
    // Zona de la casa: /?zona=cocina (salon, cocina, patio, dormitorio, bano); si no, una al azar por mapa.
    theme: ['salon', 'cocina', 'patio', 'dormitorio', 'bano'].includes(params.get('zona')) ? params.get('zona') : null,
    wallChance: params.has('paredes') ? (params.get('paredes') === 'si' ? 1 : 0) : DEFAULTS.wallChance,
    seed: Math.floor(number('semilla', randomSeed())),
  };
}

export function withNewSeed(config) {
  return { ...config, seed: randomSeed() };
}
