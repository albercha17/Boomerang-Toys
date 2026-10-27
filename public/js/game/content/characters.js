/**
 * Catálogo de personajes. Para añadir uno nuevo basta con otra entrada
 * (y, si cambia de aspecto, sus texturas en ToyTextures.js).
 */
export const CHARACTERS = Object.freeze({
  peon: Object.freeze({
    id: 'peon',
    name: 'Peón de madera',
    radius: 16, // radio del cuerpo físico (px)
    speed: 240, // px/s a joystick completo
    turnRate: 16, // rad/s al girar hacia la dirección del joystick
    chargeSpeedFactor: 0.4, // velocidad mientras se apunta un lanzamiento
    tapMs: 170, // pulsación más corta que esto = golpe; más larga = cargar lanzamiento
    spawnInvulnerableMs: 1200,
    weapon: 'boomerang',
  }),
});

export const DEFAULT_CHARACTER = 'peon';
