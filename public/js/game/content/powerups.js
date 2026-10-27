/**
 * Catálogo de power-ups. Cada uno da una habilidad que dura hasta morir o hasta la siguiente ronda.
 * Se pueden llevar MAX_ABILITIES a la vez: al coger otra, se pierde la más antigua.
 * Los efectos se aplican donde se usan (Character, Boomerang, ArenaGame) con character.hasAbility(id).
 */
export const MAX_ABILITIES = 3;

export const POWERUPS = Object.freeze({
  zapatillas: { id: 'zapatillas', name: 'Zapatillas', icon: '👟', color: 0x1d7cf2, speedFactor: 1.35 },
  escudo: { id: 'escudo', name: 'Escudo', icon: '🛡️', color: 0x2bb673, graceMs: 700 }, // aguanta un golpe
  gigante: { id: 'gigante', name: 'Búmerang gigante', icon: '🔶', color: 0xff7f11, scale: 1.9, hitFactor: 1.9 },
  teledirigido: { id: 'teledirigido', name: 'Teledirigido', icon: '🎯', color: 0xe63946, range: 9, steer: 3.2 },
  rebote: { id: 'rebote', name: 'Súper rebote', icon: '🔁', color: 0x9b5de5, extraBounces: 3, speedFactor: 1.15, decelerationFactor: 0.6 },
  turbo: { id: 'turbo', name: 'Turbo', icon: '💨', color: 0xf4b400, cooldownFactor: 0.4, speedFactor: 1.25 },
});

export const POWERUP_SPAWN = Object.freeze({
  firstDelayMs: [2500, 4500], // primera caja tras empezar la ronda o la sala
  intervalMs: [6000, 10000], // tiempo entre cajas
  maxOnMap: 3,
  minDistanceToPlayers: 3, // no aparece encima de nadie
  pickupRadius: 0.85,
});
