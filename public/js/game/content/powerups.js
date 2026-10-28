/**
 * Power-ups: el catálogo (nombre, icono, explicación y parámetros) está en shared/powerups.js,
 * compartido con el móvil. Aquí solo se configura cómo aparecen en el mapa.
 * Los efectos se aplican donde se usan (Character, Boomerang, ArenaGame) con character.hasAbility(id).
 */
export const { POWERUPS, SUPERS, ALL, MAX_ABILITIES } = window.PowerupCatalog;

export const POWERUP_SPAWN = Object.freeze({
  firstDelayMs: [2500, 4500], // primera caja tras empezar la ronda o la sala
  intervalMs: [6000, 10000], // tiempo entre cajas
  maxOnMap: 3,
  minDistanceToPlayers: 3, // no aparece encima de nadie
  pickupRadius: 0.85,
});

/** Cajas doradas de superhabilidad: raras y como mucho una en el mapa. */
export const SUPER_SPAWN = Object.freeze({
  firstDelayMs: [12000, 20000],
  intervalMs: [22000, 34000],
  maxOnMap: 1,
});

export const ICONS_ON_PICKUP_MS = 2500; // iconos sobre la cabeza al coger uno (y en la cuenta atrás)
