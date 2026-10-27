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
    INPUT: 'c:input', // mando -> servidor: [seq, x, y, botones]
    PING: 'c:ping', // mando -> servidor: (ultimoRttMs, ack)
    FEEDBACK_REPORT: 'g:feedback', // pantalla anfitriona -> servidor: [idJugador, estado]
    WELCOME: 's:welcome', // servidor -> mando: { id, number, name, color, token }
    REJECTED: 's:rejected', // servidor -> mando: { reason }
    KICKED: 's:kicked', // servidor -> mando: { reason }
    FEEDBACK: 's:feedback', // servidor -> mando: estado (máscara FEEDBACK)
    SCREEN_INIT: 's:screenInit', // servidor -> pantalla: { server, roster, state }
    ROSTER: 's:roster', // servidor -> pantalla: [PlayerInfo]
    STATE: 's:state', // servidor -> pantalla: { t, p: [[id, x, y, botones, pulsaciones, obsoleto]] }
  });

  const REASONS = Object.freeze({
    FULL: 'full',
    REPLACED: 'replaced',
  });

  // Máscara de bits de botones (extensible: 2, 4, 8...).
  const BUTTONS = Object.freeze({
    ACTION: 1,
  });
  const BUTTON_MASK = BUTTONS.ACTION;

  // Estado del personaje que se muestra en el mando (máscara de bits).
  const FEEDBACK = Object.freeze({
    ALIVE: 1,
    ARMED: 2,
  });
  const FEEDBACK_MASK = FEEDBACK.ALIVE | FEEDBACK.ARMED;

  // Los ejes viajan como enteros en [-AXIS_MAX, AXIS_MAX] para que los mensajes sean compactos.
  const AXIS_MAX = 100;

  // Índices de cada jugador dentro de STATE.p
  const STATE_FIELDS = Object.freeze({
    ID: 0,
    X: 1,
    Y: 2,
    BUTTONS: 3,
    PRESSES: 4,
    STALE: 5,
  });

  function clampAxis(value) {
    return Math.max(-AXIS_MAX, Math.min(AXIS_MAX, Math.round(value)));
  }

  /** x e y en [-1, 1]. Devuelve el paquete compacto que viaja por la red. */
  function encodeInput(seq, x, y, buttons) {
    return [seq, clampAxis(x * AXIS_MAX), clampAxis(y * AXIS_MAX), buttons & BUTTON_MASK];
  }

  /** Valida un paquete recibido. Devuelve { seq, x, y, buttons } o null si es inválido. */
  function decodeInput(packet) {
    if (!Array.isArray(packet) || packet.length !== 4) return null;
    const [seq, rawX, rawY, rawButtons] = packet;
    if (!Number.isInteger(seq) || seq < 0) return null;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isInteger(rawButtons)) return null;

    let x = clampAxis(rawX);
    let y = clampAxis(rawY);
    // Limita la magnitud del vector al círculo unidad (evita diagonales más rápidas).
    const length = Math.hypot(x, y);
    if (length > AXIS_MAX) {
      x = Math.round((x / length) * AXIS_MAX);
      y = Math.round((y / length) * AXIS_MAX);
    }
    return { seq, x, y, buttons: rawButtons & BUTTON_MASK };
  }

  /** Valida un informe de estado de la pantalla. Devuelve { id, flags } o null. */
  function decodeFeedbackReport(packet) {
    if (!Array.isArray(packet) || packet.length !== 2) return null;
    const [id, flags] = packet;
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(flags)) return null;
    return { id, flags: flags & FEEDBACK_MASK };
  }

  return Object.freeze({
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
