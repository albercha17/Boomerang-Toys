const { STATE_FIELDS: F, AXIS_MAX } = window.Protocol;

/**
 * Copia local (solo lectura) del estado que envía el servidor.
 * Las escenas de Phaser la consultan en cada fotograma.
 */
export class PlayerStore {
  constructor() {
    this.serverConnected = false;
    this.serverInfo = null;
    this.serverInfoVersion = 0;
    this.roster = new Map(); // id -> { id, number, name, color, connected, rtt }
    this.inputs = new Map(); // id -> { x, y, buttons, presses, stale, lastPressAt }
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
      const id = entry[F.ID];
      const previous = this.inputs.get(id);
      const presses = entry[F.PRESSES];
      next.set(id, {
        x: entry[F.X] / AXIS_MAX,
        y: entry[F.Y] / AXIS_MAX,
        buttons: entry[F.BUTTONS],
        presses,
        stale: entry[F.STALE] === 1,
        // Las pulsaciones se cuentan en el servidor: así no se pierde un toque más corto que un tick.
        lastPressAt: previous && presses > previous.presses ? performance.now() : previous?.lastPressAt ?? 0,
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

  get playerCount() {
    return this.roster.size;
  }
}
