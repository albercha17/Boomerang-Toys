/**
 * Tamaños de arena y límites de configuración (en casillas, borde incluido; 1 casilla = 1 unidad).
 * Se pueden elegir desde la dirección de la pantalla, por ejemplo:
 *   /?mapa=grande            /?mapa=pequena&semilla=42
 *   /?ancho=30&alto=16&densidad=0.2&simetria=no
 */
export const ARENA_PRESETS = Object.freeze({
  pequena: { cols: 22, rows: 13, density: 0.2 },
  mediana: { cols: 28, rows: 16, density: 0.2 },
  grande: { cols: 38, rows: 22, density: 0.2 },
});

export const ARENA_LIMITS = Object.freeze({
  cols: [12, 64],
  rows: [10, 40],
  density: [0, 0.3],
});

const DEFAULTS = Object.freeze({
  preset: 'mediana',
  chunkSize: 7, // tamaño de cada zona de generación
  rooms: true, // muebles de la habitación en conjuntos (sofá con mesita, isla de cocina...); /?habitacion=no = bloques
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
    rooms: params.get('habitacion') !== 'no',
    // Zona de la casa: /?zona=cocina (salon, cocina, patio, dormitorio, bano); si no, una al azar por mapa.
    theme: ['salon', 'cocina', 'patio', 'dormitorio', 'bano'].includes(params.get('zona')) ? params.get('zona') : null,
    wallChance: params.has('paredes') ? (params.get('paredes') === 'si' ? 1 : 0) : DEFAULTS.wallChance,
    seed: Math.floor(number('semilla', randomSeed())),
  };
}

export function withNewSeed(config) {
  return { ...config, seed: randomSeed() };
}
