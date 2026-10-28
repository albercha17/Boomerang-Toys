/**
 * Catálogo de power-ups (inspirados en Boomerang Fu), compartido por servidor, pantalla y mandos:
 * nombre, icono y explicación para el móvil, y los parámetros de su efecto en la partida.
 * Se carga con require() en Node y como <script> clásico en el navegador (window.PowerupCatalog).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PowerupCatalog = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ABILITIES = 3; // al coger una cuarta se pierde la más antigua

  const POWERUPS = Object.freeze({
    teletransporte: {
      id: 'teletransporte', name: 'Teletransporte', icon: '🌀', color: 0x00b4c6,
      description: 'Con tu búmerang lanzado, toca el joystick de ataque: apareces donde está y lo recoges.',
      cooldownMs: 800,
    },
    multi: {
      id: 'multi', name: 'Multibúmerang', icon: '🔱', color: 0xff7f11,
      description: 'Al lanzar, tu búmerang se divide en tres que salen en abanico.',
      extra: 2, spread: 0.32,
    },
    senuelo: {
      id: 'senuelo', name: 'Señuelo', icon: '🎭', color: 0xff5fa2,
      description: 'En tu próximo dash dejas una copia tuya que sigue corriendo y engaña a los rivales (una vez).',
      runMs: 1300, lifeMs: 6000, speed: 5,
    },
    explosivo: {
      id: 'explosivo', name: 'Explosivo', icon: '💥', color: 0xe63946,
      description: 'Tu búmerang explota al chocar contra algo y elimina a los que estén cerca (a ti no).',
      radius: 2.1,
    },
    escudo: {
      id: 'escudo', name: 'Escudo', icon: '🛡️', color: 0x2bb673,
      description: 'Aguanta un golpe. Se rompe al recibirlo.',
      graceMs: 700,
    },
    telequinesis: {
      id: 'telequinesis', name: 'Telequinesis', icon: '🧠', color: 0x9b5de5,
      description: 'Mientras tu búmerang va de ida, guíalo con el joystick de movimiento.',
      steer: 5,
    },
    fuego: {
      id: 'fuego', name: 'Fuego', icon: '🔥', color: 0xf4b400,
      description: 'Tu búmerang deja un rastro de fuego que elimina a los rivales que lo pisan.',
      intervalMs: 70, lifeMs: 2600, radius: 0.5,
    },
  });

  /**
   * Superhabilidades: salen de las cajas doradas (raras), se lleva una sola a la vez y se gastan al usarla.
   * `trigger`: se dispara sola en el próximo 'dash' o en el próximo lanzamiento ('throw'), sin botones nuevos.
   */
  const SUPERS = Object.freeze({
    hipermultiplicacion: {
      id: 'hipermultiplicacion', name: 'Hipermultiplicación', icon: '👥', color: 0xff5fa2, super: true, trigger: 'dash',
      description: 'En tu próximo dash te clonas 10 veces: los clones salen corriendo en abanico y engañan a todos.',
      clones: 10, fan: 2.6, runMs: 1500, lifeMs: 7000, speed: 5.5,
    },
    tormenta: {
      id: 'tormenta', name: 'Tormenta de búmerangs', icon: '🌪️', color: 0x00b4c6, super: true, trigger: 'throw',
      description: 'Tu próximo lanzamiento suelta 12 búmerangs en todas las direcciones.',
      count: 12,
    },
    mega: {
      id: 'mega', name: 'Megabúmerang', icon: '🪃', color: 0xf4b400, super: true, trigger: 'throw',
      description: 'Tu próximo búmerang es gigante: el triple de grande y atraviesa a todos los que toca.',
      scale: 2.6, hitRadius: 0.95,
    },
    supersalto: {
      id: 'supersalto', name: 'Supersalto', icon: '🚀', color: 0xe63946, super: true, trigger: 'dash',
      description: 'Tu próximo dash es un salto enorme por encima de todo; al caer, una onda tumba a los que estén cerca.',
      distance: 9, height: 4.5, durationMs: 850, radius: 2.6,
    },
    helada: {
      id: 'helada', name: 'Onda helada', icon: '❄️', color: 0x4fc3f7, super: true, trigger: 'dash',
      description: 'En tu próximo dash sueltas una onda de frío que congela a los rivales cercanos 3 segundos.',
      radius: 7, freezeMs: 3000,
    },
    fantasma: {
      id: 'fantasma', name: 'Fantasma', icon: '👻', color: 0x9b5de5, super: true, trigger: 'dash',
      description: 'En tu próximo dash te vuelves invisible 6 segundos (también para los bots).',
      invisibleMs: 6000,
    },
  });

  const ALL = Object.freeze({ ...POWERUPS, ...SUPERS });
  const isPowerupId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ALL, id);
  const isSuperId = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(SUPERS, id);

  return Object.freeze({ MAX_ABILITIES, POWERUPS, SUPERS, ALL, isPowerupId, isSuperId });
});
