/**
 * Catálogo de armas. `type` elige la clase que la implementa (ver WEAPON_CLASSES en ArenaScene).
 */
export const WEAPONS = Object.freeze({
  boomerang: Object.freeze({
    id: 'boomerang',
    type: 'boomerang',
    texture: 'boomerang',
    radius: 11,
    // Lanzamiento: la velocidad inicial depende de la carga (0..1).
    minSpeed: 520,
    maxSpeed: 1050,
    chargeMs: 700, // tiempo de carga completa
    deceleration: 1000, // px/s² en el tramo de ida
    turnSpeed: 90, // por debajo de esta velocidad empieza la vuelta
    returnSpeed: 780,
    returnSteer: 5.5, // cuánto corrige el rumbo hacia el dueño (1/s)
    catchDelayMs: 250, // no se puede recoger justo al lanzarlo
    maxFlightMs: 4000, // si no vuelve en este tiempo, cae al suelo
    groundDrag: 0.03, // frenado en el suelo (fracción de velocidad que queda por segundo)
    // Golpe cuerpo a cuerpo con el arma en la mano.
    meleeRange: 56,
    meleeArc: 0.3, // coseno mínimo respecto a la mirada (0.3 ≈ ±72°)
    meleeCooldownMs: 380,
  }),
});
