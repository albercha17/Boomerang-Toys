const crypto = require('crypto');
const { decodeInput, REASONS, BUTTONS } = require('../shared/protocol');

// Colores de juguete por número de plaza (1..8).
const PLAYER_COLORS = [
  '#e63946', // rojo
  '#1d7cf2', // azul
  '#f4b400', // amarillo
  '#2bb673', // verde
  '#9b5de5', // morado
  '#ff7f11', // naranja
  '#ff5fa2', // rosa
  '#00b4c6', // turquesa
];

/**
 * Estado autoritativo de los jugadores conectados: plazas, identidad, reconexión y entradas.
 * No conoce Socket.io: recibe ids de socket y datos ya extraídos.
 */
class PlayerManager {
  constructor({ maxPlayers, reconnectGraceMs, inputStaleMs, maxInputsPerSecond }) {
    this.maxPlayers = maxPlayers;
    this.reconnectGraceMs = reconnectGraceMs;
    this.inputStaleMs = inputStaleMs;
    this.maxInputsPerSecond = maxInputsPerSecond;

    this.players = new Map(); // id -> jugador
    this.byToken = new Map(); // token secreto -> jugador
    this.nextId = 1;

    this.stateDirty = false; // hay entradas nuevas que enviar a la pantalla
    this.rosterDirty = false; // hay cambios menores (latencia) en la lista de jugadores
  }

  /**
   * Une un mando. Si trae un token válido recupera su plaza (reconexión).
   * @returns {{ player, resumed: boolean, replacedSocketId: string|null } | { error: string }}
   */
  join(socketId, token, now) {
    const existing = token ? this.byToken.get(token) : null;
    if (existing) {
      const replacedSocketId = existing.connected ? existing.socketId : null;
      existing.socketId = socketId;
      existing.connected = true;
      existing.disconnectedAt = 0;
      this.resetConnectionState(existing, now);
      return { player: existing, resumed: true, replacedSocketId };
    }

    const number = this.findFreeNumber();
    if (number === null) return { error: REASONS.FULL };

    const player = {
      id: this.nextId++,
      number,
      name: `Jugador ${number}`,
      color: PLAYER_COLORS[number - 1],
      token: crypto.randomUUID(),
      socketId,
      connected: true,
      disconnectedAt: 0,
      input: { x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0 },
      presses: 0, // pulsaciones del ataque (contadas aquí para no perder toques cortos)
      dashes: 0, // pulsaciones del dash
      lastSeq: -1,
      lastPacketAt: now,
      stale: false,
      rtt: null,
      rateWindowStart: now,
      rateCount: 0,
      feedback: null, // último estado de juego que mostrar en el mando (FEEDBACK)
      abilities: [], // power-ups que lleva (los informa la pantalla anfitriona)
      character: null, // personaje elegido en el mando (no se puede repetir)
    };
    this.players.set(player.id, player);
    this.byToken.set(player.token, player);
    this.stateDirty = true;
    return { player, resumed: false, replacedSocketId: null };
  }

  get(id) {
    return this.players.get(id) ?? null;
  }

  /** { idPersonaje: número del jugador que lo tiene } (las plazas reservadas por desconexión también cuentan). */
  takenCharacters() {
    const taken = {};
    for (const p of this.players.values()) if (p.character) taken[p.character] = p.number;
    return taken;
  }

  /**
   * Elige personaje. En partida solo puede elegir quien aún no tiene (entra en la siguiente ronda).
   * @returns {{ ok: true } | { error: 'invalid'|'taken'|'locked' }}
   */
  chooseCharacter(player, characterId, isValid, phase) {
    if (!isValid(characterId)) return { error: 'invalid' };
    if (phase !== 'lobby' && player.character) return { error: 'locked' };
    const owner = [...this.players.values()].find((p) => p.character === characterId);
    if (owner && owner !== player) return { error: 'taken' };
    player.character = characterId;
    return { ok: true };
  }

  /** Guarda el estado de juego del jugador. Devuelve true si cambió. */
  setFeedback(player, flags) {
    if (player.feedback === flags) return false;
    player.feedback = flags;
    return true;
  }

  findFreeNumber() {
    const used = new Set([...this.players.values()].map((p) => p.number));
    for (let n = 1; n <= this.maxPlayers; n++) if (!used.has(n)) return n;
    return null;
  }

  resetConnectionState(player, now) {
    player.input = { x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0 };
    player.lastSeq = -1; // el mando reinicia su secuencia al reconectar
    player.lastPacketAt = now;
    player.stale = false;
    player.rateWindowStart = now;
    player.rateCount = 0;
    this.stateDirty = true;
  }

  /** Valida y aplica un paquete de entrada. Devuelve true si se aceptó. */
  handleInput(player, packet, now) {
    if (!player.connected) return false;

    if (now - player.rateWindowStart >= 1000) {
      player.rateWindowStart = now;
      player.rateCount = 0;
    }
    if (++player.rateCount > this.maxInputsPerSecond) return false;

    const input = decodeInput(packet);
    if (!input || input.seq <= player.lastSeq) return false;

    player.lastSeq = input.seq;
    player.lastPacketAt = now;

    const pressedNow = input.buttons & ~player.input.buttons;
    if (pressedNow & BUTTONS.ACTION) player.presses++;
    if (pressedNow & BUTTONS.DASH) player.dashes++;

    const old = player.input;
    const changed = input.x !== old.x || input.y !== old.y || input.aimX !== old.aimX || input.aimY !== old.aimY || input.buttons !== old.buttons;
    if (changed || player.stale) {
      player.input = { x: input.x, y: input.y, aimX: input.aimX, aimY: input.aimY, buttons: input.buttons };
      player.stale = false;
      this.stateDirty = true;
    }
    return true;
  }

  /** Registra la latencia que mide el propio mando (ida y vuelta). */
  setRtt(player, rtt, now) {
    player.lastPacketAt = now; // el ping también cuenta como señal de vida
    if (player.stale) {
      player.stale = false;
      this.stateDirty = true;
    }
    if (!Number.isFinite(rtt) || rtt < 0 || rtt > 10000) return;
    const rounded = Math.round(rtt);
    if (rounded !== player.rtt) {
      player.rtt = rounded;
      this.rosterDirty = true;
    }
  }

  disconnect(player, now) {
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = now;
    player.input = { x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0 };
    player.rtt = null;
    this.stateDirty = true;
  }

  /**
   * Mantenimiento periódico: entradas obsoletas y plazas caducadas.
   * @returns {boolean} true si cambió la lista de jugadores (alguno eliminado).
   */
  update(now) {
    let rosterChanged = false;
    for (const player of this.players.values()) {
      if (!player.connected) {
        if (now - player.disconnectedAt >= this.reconnectGraceMs) {
          this.players.delete(player.id);
          this.byToken.delete(player.token);
          this.stateDirty = true;
          rosterChanged = true;
        }
        continue;
      }
      if (!player.stale && now - player.lastPacketAt > this.inputStaleMs) {
        player.stale = true;
        player.input = { x: 0, y: 0, aimX: 0, aimY: 0, buttons: 0 };
        this.stateDirty = true;
      }
    }
    return rosterChanged;
  }

  /** Datos públicos de un jugador (sin token). */
  publicInfo(player) {
    return {
      id: player.id,
      number: player.number,
      name: player.name,
      color: player.color,
      character: player.character,
      connected: player.connected,
      rtt: player.rtt,
    };
  }

  roster() {
    return [...this.players.values()].sort((a, b) => a.number - b.number).map((p) => this.publicInfo(p));
  }

  /** Estado compacto de entradas (orden de Protocol.STATE_FIELDS). */
  snapshot() {
    const result = [];
    for (const p of this.players.values()) {
      const i = p.input;
      result.push([p.id, i.x, i.y, i.aimX, i.aimY, i.buttons, p.presses, p.dashes, p.stale ? 1 : 0]);
    }
    return result;
  }
}

module.exports = { PlayerManager };
