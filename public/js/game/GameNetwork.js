const { ROLES, EVENTS } = window.Protocol;

/**
 * Conexión de la pantalla de juego con el servidor.
 * Recibe jugadores y entradas (los vuelca en el PlayerStore) y envía el estado de cada personaje para su mando.
 */
export class GameNetwork {
  constructor(store) {
    this.store = store;
    this.socket = io({ auth: { role: ROLES.SCREEN }, transports: ['websocket', 'polling'] });

    this.socket.on('connect', () => store.setServerConnected(true));
    this.socket.on('disconnect', () => store.setServerConnected(false));

    // Al (re)conectar el servidor manda el estado completo, así la pantalla se puede recargar sin problema.
    this.socket.on(EVENTS.SCREEN_INIT, ({ server, roster, state }) => {
      store.setServerInfo(server);
      store.setRoster(roster);
      store.applyState(state);
    });
    this.socket.on(EVENTS.ROSTER, (roster) => store.setRoster(roster));
    this.socket.on(EVENTS.STATE, (state) => store.applyState(state));
  }

  /** @param {number} flags máscara Protocol.FEEDBACK */
  sendFeedback(playerId, flags) {
    this.socket.emit(EVENTS.FEEDBACK_REPORT, [playerId, flags]);
  }

  /** @param {'lobby'|'match'} phase en la sala se puede cambiar de personaje desde el móvil */
  sendPhase(phase) {
    this.socket.emit(EVENTS.PHASE_REPORT, phase);
  }

  /** @param {string[]} abilities ids de power-up que lleva el jugador */
  sendAbilities(playerId, abilities) {
    this.socket.emit(EVENTS.ABILITIES_REPORT, [playerId, abilities]);
  }
}
