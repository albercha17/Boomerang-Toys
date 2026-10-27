const { ROLES, EVENTS, REASONS, decodeFeedbackReport, decodeAbilitiesReport } = require('../shared/protocol');
const { isPowerupId, MAX_ABILITIES } = require('../shared/powerups');

const SCREENS_ROOM = 'screens';

/**
 * Conecta Socket.io con el PlayerManager: identifica cada socket por su rol,
 * reenvía las entradas validadas a las pantallas y emite el estado a ritmo fijo.
 */
function registerSocketHandlers(io, players, config, serverInfo) {
  let lastRosterAt = 0;
  // La primera pantalla conectada es la anfitriona: la única cuyos informes llegan a los mandos.
  const screenIds = [];

  function emitRoster() {
    io.to(SCREENS_ROOM).emit(EVENTS.ROSTER, players.roster());
    players.rosterDirty = false;
    lastRosterAt = Date.now();
  }

  function handleScreen(socket) {
    socket.join(SCREENS_ROOM);
    screenIds.push(socket.id);
    socket.emit(EVENTS.SCREEN_INIT, {
      server: serverInfo,
      roster: players.roster(),
      state: { t: Date.now(), p: players.snapshot() },
    });

    socket.on(EVENTS.FEEDBACK_REPORT, (packet) => {
      if (screenIds[0] !== socket.id) return;
      const report = decodeFeedbackReport(packet);
      const player = report && players.get(report.id);
      if (!player || !players.setFeedback(player, report.flags)) return;
      if (player.connected) io.to(player.socketId).emit(EVENTS.FEEDBACK, report.flags);
    });

    socket.on(EVENTS.ABILITIES_REPORT, (packet) => {
      if (screenIds[0] !== socket.id) return;
      const report = decodeAbilitiesReport(packet, isPowerupId, MAX_ABILITIES);
      const player = report && players.get(report.id);
      if (!player) return;
      player.abilities = report.abilities;
      if (player.connected) io.to(player.socketId).emit(EVENTS.ABILITIES, player.abilities);
    });

    socket.on('disconnect', () => {
      screenIds.splice(screenIds.indexOf(socket.id), 1);
    });
  }

  function handleController(socket, token) {
    const result = players.join(socket.id, typeof token === 'string' ? token : null, Date.now());
    if (result.error) {
      socket.emit(EVENTS.REJECTED, { reason: result.error });
      socket.disconnect(true);
      return;
    }

    const { player, replacedSocketId } = result;
    // El mismo jugador abierto en otra pestaña/dispositivo: gana la conexión nueva.
    if (replacedSocketId) {
      const oldSocket = io.sockets.sockets.get(replacedSocketId);
      if (oldSocket) {
        oldSocket.emit(EVENTS.KICKED, { reason: REASONS.REPLACED });
        oldSocket.disconnect(true);
      }
    }

    socket.emit(EVENTS.WELCOME, { ...players.publicInfo(player), token: player.token });
    if (player.feedback !== null) socket.emit(EVENTS.FEEDBACK, player.feedback);
    socket.emit(EVENTS.ABILITIES, player.abilities);
    emitRoster();

    const isCurrent = () => player.socketId === socket.id;

    socket.on(EVENTS.INPUT, (packet) => {
      if (isCurrent()) players.handleInput(player, packet, Date.now());
    });

    socket.on(EVENTS.PING, (rtt, ack) => {
      if (isCurrent()) players.setRtt(player, rtt, Date.now());
      if (typeof ack === 'function') ack();
    });

    socket.on('disconnect', () => {
      if (!isCurrent()) return;
      players.disconnect(player, Date.now());
      emitRoster();
    });
  }

  io.on('connection', (socket) => {
    const { role, token } = socket.handshake.auth || {};
    if (role === ROLES.SCREEN) handleScreen(socket);
    else if (role === ROLES.CONTROLLER) handleController(socket, token);
    else socket.disconnect(true);
  });

  setInterval(() => {
    const now = Date.now();
    if (players.update(now)) emitRoster();

    if (players.stateDirty) {
      io.to(SCREENS_ROOM).emit(EVENTS.STATE, { t: now, p: players.snapshot() });
      players.stateDirty = false;
    }
    if (players.rosterDirty && now - lastRosterAt >= config.ROSTER_MIN_INTERVAL_MS) emitRoster();
  }, 1000 / config.TICK_RATE);
}

module.exports = { registerSocketHandlers };
