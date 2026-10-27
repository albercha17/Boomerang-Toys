const { ROLES, EVENTS, REASONS } = require('../shared/protocol');

const SCREENS_ROOM = 'screens';

/**
 * Conecta Socket.io con el PlayerManager: identifica cada socket por su rol,
 * reenvía las entradas validadas a las pantallas y emite el estado a ritmo fijo.
 */
function registerSocketHandlers(io, players, config, serverInfo) {
  let lastRosterAt = 0;

  function emitRoster() {
    io.to(SCREENS_ROOM).emit(EVENTS.ROSTER, players.roster());
    players.rosterDirty = false;
    lastRosterAt = Date.now();
  }

  function handleScreen(socket) {
    socket.join(SCREENS_ROOM);
    socket.emit(EVENTS.SCREEN_INIT, {
      server: serverInfo,
      roster: players.roster(),
      state: { t: Date.now(), p: players.snapshot() },
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
