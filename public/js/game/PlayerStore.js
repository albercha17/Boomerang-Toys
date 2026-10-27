const { STATE_FIELDS: F, AXIS_MAX } = window.Protocol;

/**
 * Copia local (solo lectura) del estado que envía el servidor.
 * Las escenas de Phaser la consultan en cada fotograma.
 */
export class PlayerStore {
  constructor() {
    this.serverConnected = false;
    this.serverInfo = null;
    this.serverInfoVersion = 0; // aumenta en cada (re)conexión con el servidor
    this.roster = new Map(); // id -> { id, number, name, color, connected, rtt }
    this.inputs = new Map(); // id -> { x, y, buttons, presses, stale }
  }

  setServerConnected(connected) {
    this.serverConnected = connected;
  }

  setServerInfo(info) {
    this.serverInfo = info;
    this.serverInfoVersion++;
  }

  setRoster(list) {
    this.roster = new Map(list.map((player) => [player.id, player]));
  }

  applyState(state) {
    const next = new Map();
    for (const entry of state.p) {
      next.set(entry[F.ID], {
        x: entry[F.X] / AXIS_MAX,
        y: entry[F.Y] / AXIS_MAX,
        buttons: entry[F.BUTTONS],
        presses: entry[F.PRESSES], // contadas en el servidor: no se pierden toques más cortos que un envío
        stale: entry[F.STALE] === 1,
      });
    }
    this.inputs = next;
  }

  /** Jugador e input por número de plaza (1..max). */
  playerByNumber(number) {
    for (const player of this.roster.values()) {
      if (player.number === number) return { player, input: this.inputs.get(player.id) ?? null };
    }
    return null;
  }
}
