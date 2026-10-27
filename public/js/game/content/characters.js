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
    aimSpeedFactor: 0.2, // mientras se apunta con el joystick de ataque se avanza muy despacio
    aimDeadZone: 0.2, // arrastre mínimo del joystick de ataque para apuntar (menos = toque = cuchillada)
    tapMs: 170, // pulsación sin apuntar más corta que esto = cuchillada; más larga = lanzar hacia delante
    spawnInvulnerableMs: 1200,
    dash: Object.freeze({
      speed: 14, // unidades/s durante el impulso
      durationMs: 170, // ≈ 2,4 unidades de recorrido
      cooldownMs: 700,
      hopHeight: 0.5, // altura del saltito (solo visual)
    }),
    // Cuchillada con embestida: si hay un rival a este alcance (y sin pared en medio), se lanza hacia él.
    lunge: Object.freeze({
      range: 2.6,
      speed: 17,
      maxMs: 220,
    }),
    weapon: 'boomerang',
  }),
});

export const DEFAULT_CHARACTER = 'peon';
