/**
 * Configuración del servidor. El puerto se puede cambiar con:
 *   npm start -- --port 4000
 *   PORT=4000 npm start            (bash)
 *   $env:PORT=4000; npm start      (PowerShell)
 */
function readArg(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function readInt(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

module.exports = Object.freeze({
  PORT: readInt(readArg('port') ?? process.env.PORT, 3000, 1, 65535),
  HOST: process.env.HOST || '0.0.0.0',
  MAX_PLAYERS: readInt(readArg('max-players') ?? process.env.MAX_PLAYERS, 8, 1, 8),

  // Frecuencia de envío de estado a la pantalla (solo se envía si algo cambió).
  TICK_RATE: 20,
  // Cada cuánto, como máximo, se reenvía la lista de jugadores por cambios menores (latencia).
  ROSTER_MIN_INTERVAL_MS: 1000,
  // Si un mando conectado no envía nada en este tiempo, su entrada se pone a neutro.
  INPUT_STALE_MS: 1500,
  // Tiempo que se reserva la plaza de un jugador desconectado para que pueda reconectarse.
  RECONNECT_GRACE_MS: 60000,
  // Límite de paquetes de entrada por segundo y mando (los sobrantes se descartan).
  MAX_INPUTS_PER_SECOND: 60,
});
