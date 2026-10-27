/**
 * Catálogo de personajes (distancias en unidades del mundo: 1 = un bloque).
 * Para añadir uno nuevo basta con otra entrada (y, si cambia de aspecto, su figura en entities/).
 */
export const CHARACTERS = Object.freeze({
  peon: Object.freeze({
    id: 'peon',
    name: 'Peón de madera',
    scale: 1.4, // tamaño del muñeco (1 = 1,1 unidades de alto)
    radius: 0.45, // radio del cuerpo físico
    speed: 5, // unidades/s a joystick completo
    turnRate: 16, // rad/s al girar hacia la dirección del joystick
    aimSpeedFactor: 0.15, // mientras se carga un lanzamiento: casi quieto y apuntando con el joystick
    aimDeadZone: 0.15, // inclinación mínima del joystick para cambiar la puntería
    tapMs: 170, // pulsación más corta que esto = golpe; más larga = cargar lanzamiento
    spawnInvulnerableMs: 1200,
    weapon: 'boomerang',
  }),
});

export const DEFAULT_CHARACTER = 'peon';
