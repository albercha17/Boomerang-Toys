/**
 * Catálogo de armas (unidades del mundo). `type` elige la clase que la implementa (WEAPON_CLASSES en ArenaGame).
 */
export const WEAPONS = Object.freeze({
  boomerang: Object.freeze({
    id: 'boomerang',
    type: 'boomerang',
    radius: 0.28,
    scale: 1.3, // tamaño de la malla
    flightHeight: 0.6,
    // Lanzamiento: la velocidad inicial depende de la carga (0..1).
    minSpeed: 10.8,
    maxSpeed: 22,
    chargeMs: 700, // tiempo de carga completa
    deceleration: 21, // unidades/s² en el tramo de ida
    turnSpeed: 1.9, // por debajo de esta velocidad empieza la vuelta
    returnSpeed: 16.3,
    returnSteer: 5.5, // cuánto corrige el rumbo hacia el dueño (1/s)
    catchDelayMs: 250, // no se puede recoger justo al lanzarlo
    maxFlightMs: 4000, // si no vuelve en este tiempo, cae al suelo
    groundDamping: 0.97, // frenado en el suelo
    // Golpe cuerpo a cuerpo con el arma en la mano.
    meleeRange: 1.3,
    meleeArc: 0.3, // coseno mínimo respecto a la mirada (0.3 ≈ ±72°)
    meleeCooldownMs: 380,
  }),
});
