/**
 * Protocolo Socket.io compartido por servidor, pantalla de juego y mandos.
 * Se carga con require() en Node y como <script> clásico en el navegador (window.Protocol).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Protocol = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROLES = Object.freeze({
    SCREEN: 'screen',
    CONTROLLER: 'controller',
  });

  // Prefijo c: = lo envía un mando; g: = lo envía la pantalla de juego; s: = lo envía el servidor.
  const EVENTS = Object.freeze({
    INPUT: 'c:input', // mando -> servidor: [seq, mx, my, ax, ay, botones]
    PING: 'c:ping', // mando -> servidor: (ultimoRttMs, ack)
    FEEDBACK_REPORT: 'g:feedback', // pantalla anfitriona -> servidor: [idJugador, estado]
    ABILITIES_REPORT: 'g:abilities', // pantalla anfitriona -> servidor: [idJugador, [idPowerup, ...]]
    ABILITIES: 's:abilities', // servidor -> mando: [idPowerup, ...] (de la más antigua a la más nueva)
    WELCOME: 's:welcome', // servidor -> mando: { id, number, name, color, token }
    REJECTED: 's:rejected', // servidor -> mando: { reason }
    KICKED: 's:kicked', // servidor -> mando: { reason }
    FEEDBACK: 's:feedback', // servidor -> mando: estado (máscara FEEDBACK)
    SCREEN_INIT: 's:screenInit', // servidor -> pantalla: { server, roster, state }
    ROSTER: 's:roster', // servidor -> pantalla: [PlayerInfo]
    STATE: 's:state', // servidor -> pantalla: { t, p: [[id, mx, my, ax, ay, botones, ataques, dashes, obsoleto]] }
  });

  const REASONS = Object.freeze({
    FULL: 'full',
    REPLACED: 'replaced',
  });

  // Máscara de bits de botones (extensible: 4, 8...).
  const BUTTONS = Object.freeze({
    ACTION: 1, // joystick de ataque pulsado: toque = golpe, arrastrar y soltar = lanzar
    DASH: 2, // salto rápido hacia delante
  });
  const BUTTON_MASK = BUTTONS.ACTION | BUTTONS.DASH;

  // Estado del personaje que se muestra en el mando (máscara de bits).
  const FEEDBACK = Object.freeze({
    ALIVE: 1,
    ARMED: 2,
    IN_MATCH: 4, // ronda en juego: quien cae no reaparece hasta la siguiente
    OUTSIDE: 8, // fuera de la línea roja: explota si no vuelve a tiempo
  });
  const FEEDBACK_MASK = FEEDBACK.ALIVE | FEEDBACK.ARMED | FEEDBACK.IN_MATCH | FEEDBACK.OUTSIDE;

  // Los ejes viajan como enteros en [-AXIS_MAX, AXIS_MAX] para que los mensajes sean compactos.
  const AXIS_MAX = 100;

  // Índices de cada jugador dentro de STATE.p
  const STATE_FIELDS = Object.freeze({
    ID: 0,
    X: 1, // joystick de movimiento
    Y: 2,
    AIM_X: 3, // joystick de ataque (puntería)
    AIM_Y: 4,
    BUTTONS: 5,
    PRESSES: 6, // pulsaciones acumuladas del ataque
    DASHES: 7, // pulsaciones acumuladas del dash
    STALE: 8,
  });

  function clampAxis(value) {
    return Math.max(-AXIS_MAX, Math.min(AXIS_MAX, Math.round(value)));
  }

  /** Vector en enteros [-AXIS_MAX, AXIS_MAX] con la magnitud limitada al círculo unidad. */
  function clampVector(rawX, rawY) {
    let x = clampAxis(rawX);
    let y = clampAxis(rawY);
    const length = Math.hypot(x, y);
    if (length > AXIS_MAX) {
      x = Math.round((x / length) * AXIS_MAX);
      y = Math.round((y / length) * AXIS_MAX);
    }
    return [x, y];
  }

  /**
   * @param {{x: number, y: number}} move joystick de movimiento, ejes en [-1, 1]
   * @param {{x: number, y: number}} aim joystick de ataque, ejes en [-1, 1]
   * @returns paquete compacto [seq, mx, my, ax, ay, botones]
   */
  function encodeInput(seq, move, aim, buttons) {
    return [seq, ...clampVector(move.x * AXIS_MAX, move.y * AXIS_MAX), ...clampVector(aim.x * AXIS_MAX, aim.y * AXIS_MAX), buttons & BUTTON_MASK];
  }

  /** Valida un paquete recibido. Devuelve { seq, x, y, aimX, aimY, buttons } o null si es inválido. */
  function decodeInput(packet) {
    if (!Array.isArray(packet) || packet.length !== 6) return null;
    const [seq, rawX, rawY, rawAimX, rawAimY, rawButtons] = packet;
    if (!Number.isInteger(seq) || seq < 0 || !Number.isInteger(rawButtons)) return null;
    if (![rawX, rawY, rawAimX, rawAimY].every(Number.isFinite)) return null;
    const [x, y] = clampVector(rawX, rawY);
    const [aimX, aimY] = clampVector(rawAimX, rawAimY);
    return { seq, x, y, aimX, aimY, buttons: rawButtons & BUTTON_MASK };
  }

  /** Valida un informe de estado de la pantalla. Devuelve { id, flags } o null. */
  function decodeFeedbackReport(packet) {
    if (!Array.isArray(packet) || packet.length !== 2) return null;
    const [id, flags] = packet;
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(flags)) return null;
    return { id, flags: flags & FEEDBACK_MASK };
  }

  /** Valida un informe de power-ups. Devuelve { id, abilities } o null; `isValid` comprueba cada id. */
  function decodeAbilitiesReport(packet, isValid, max) {
    if (!Array.isArray(packet) || packet.length !== 2) return null;
    const [id, abilities] = packet;
    if (!Number.isInteger(id) || id < 1 || !Array.isArray(abilities) || abilities.length > max) return null;
    if (!abilities.every(isValid)) return null;
    return { id, abilities: [...abilities] };
  }

  return Object.freeze({
    decodeAbilitiesReport,
    ROLES,
    EVENTS,
    REASONS,
    BUTTONS,
    FEEDBACK,
    AXIS_MAX,
    STATE_FIELDS,
    encodeInput,
    decodeInput,
    decodeFeedbackReport,
  });
});
