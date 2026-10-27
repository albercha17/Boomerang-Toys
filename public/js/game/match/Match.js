export const PHASE = Object.freeze({
  LOBBY: 'lobby', // sala de pruebas: mapa aleatorio y vidas infinitas
  COUNTDOWN: 'countdown', // 3, 2, 1... (todos quietos)
  PLAYING: 'playing', // ronda en juego: sin reapariciones
  ROUND_END: 'roundEnd', // resultado de la ronda
  MATCH_END: 'matchEnd', // alguien llegó a los puntos necesarios
});

const COUNTDOWN_MS = 2400;
const LAST_STANDING_DELAY_MS = 1200; // margen para ver caer al último y por si muere también el superviviente
const ROUND_RESULT_MS = 2800;

/**
 * Partida por rondas. En cada ronda gana un punto el último que queda vivo y se cambia de mapa;
 * gana la partida quien llega a `targetScore`. Entre partidas, sala de pruebas con vidas infinitas.
 *
 * Corre en la pantalla anfitriona junto con la simulación (ArenaGame).
 */
export class Match {
  constructor(game, { targetScore }) {
    this.game = game;
    this.targetScore = targetScore;
    this.phase = PHASE.LOBBY;
    this.round = 0;
    this.scores = new Map(); // idPersonaje -> puntos
    this.phaseStart = 0;
    this.lastStandingAt = 0;
    this.roundWinner = null; // { id, label, color } o null si fue empate
    this.matchWinner = null;
    this.paused = false;
    this.pausedAt = 0;
    game.respawnEnabled = true;
  }

  get inMatch() {
    return this.phase !== PHASE.LOBBY && this.phase !== PHASE.MATCH_END;
  }

  get participants() {
    return [...this.game.characters.values()];
  }

  canStart() {
    return this.phase === PHASE.LOBBY && this.participants.length >= 2;
  }

  start(now) {
    if (!this.canStart()) return;
    this.scores.clear();
    this.round = 0;
    this.matchWinner = null;
    this.game.clearAllAbilities(); // todos empiezan la partida sin power-ups
    this.nextRound(now);
  }

  nextRound(now) {
    this.round++;
    this.roundWinner = null;
    this.lastStandingAt = 0;
    this.game.respawnEnabled = false;
    this.game.frozen = true;
    this.game.newArena(now);
    this.setPhase(PHASE.COUNTDOWN, now);
  }

  /** Vuelve a la sala de pruebas (fin de partida o partida abandonada desde la pausa). */
  backToLobby(now) {
    this.paused = false;
    this.scores.clear();
    this.round = 0;
    this.roundWinner = null;
    this.matchWinner = null;
    this.game.frozen = false;
    this.game.respawnEnabled = true;
    this.game.clearAllAbilities();
    this.game.newArena(now);
    this.setPhase(PHASE.LOBBY, now);
  }

  togglePause(now) {
    if (!this.inMatch) return;
    if (this.paused) {
      // Los tiempos de la partida no corren durante la pausa.
      const pausedFor = now - this.pausedAt;
      this.phaseStart += pausedFor;
      if (this.lastStandingAt) this.lastStandingAt += pausedFor;
    } else {
      this.pausedAt = now;
    }
    this.paused = !this.paused;
  }

  setPhase(phase, now) {
    this.phase = phase;
    this.phaseStart = now;
  }

  /** Segundos que faltan de la cuenta atrás (3, 2, 1) o 0 cuando ya ha empezado. */
  countdownValue(now) {
    if (this.phase !== PHASE.COUNTDOWN) return 0;
    return Math.max(1, Math.ceil((COUNTDOWN_MS - (now - this.phaseStart)) / (COUNTDOWN_MS / 3)));
  }

  update(now) {
    if (this.paused) return;
    switch (this.phase) {
      case PHASE.COUNTDOWN:
        if (now - this.phaseStart >= COUNTDOWN_MS) {
          this.game.frozen = false;
          this.setPhase(PHASE.PLAYING, now);
        }
        break;
      case PHASE.PLAYING: {
        if (this.game.aliveCharacters().length > 1) {
          this.lastStandingAt = 0;
        } else if (!this.lastStandingAt) {
          this.lastStandingAt = now;
        } else if (now - this.lastStandingAt >= LAST_STANDING_DELAY_MS) {
          this.finishRound(now, this.game.aliveCharacters()[0] ?? null);
        }
        break;
      }
      case PHASE.ROUND_END:
        if (now - this.phaseStart >= ROUND_RESULT_MS) {
          if (this.matchWinner) this.setPhase(PHASE.MATCH_END, now);
          else this.nextRound(now);
        }
        break;
      default:
        break;
    }
  }

  finishRound(now, winner) {
    this.roundWinner = winner ? describe(winner) : null;
    if (winner) {
      const score = (this.scores.get(winner.id) ?? 0) + 1;
      this.scores.set(winner.id, score);
      if (score >= this.targetScore) this.matchWinner = this.roundWinner;
    }
    this.setPhase(PHASE.ROUND_END, now);
  }

  scoreOf(id) {
    return this.scores.get(id) ?? 0;
  }

  /** Personajes presentes con sus puntos, de más a menos. */
  scoreboard() {
    return this.participants
      .map((c) => ({ ...describe(c), score: this.scoreOf(c.id), connected: c.connected }))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }
}

function describe(character) {
  return { id: character.id, label: character.label, color: character.cssColor };
}
