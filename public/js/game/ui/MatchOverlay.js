import { PHASE } from '../match/Match.js';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Pantallas de la partida sobre la escena 3D: sala de pruebas (con «Empezar»), cuenta atrás,
 * resultado de ronda, victoria y pausa. Solo se redibuja cuando cambia lo que muestra.
 */
export class MatchOverlay {
  constructor(root, match) {
    this.root = root;
    this.match = match;
    this.renderedKey = '';
    root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      const now = performance.now();
      if (action === 'start') match.start(now);
      if (action === 'resume') match.togglePause(now);
      if (action === 'lobby') match.backToLobby(now);
    });
  }

  update(now) {
    const match = this.match;
    const players = match.participants.length;
    const key = JSON.stringify([match.phase, match.paused, match.round, match.countdownValue(now), players, match.roundWinner?.id, match.scoreboard().map((s) => [s.id, s.score, s.label])]);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.root.innerHTML = this.render(now, players);
  }

  render(now, players) {
    const match = this.match;
    if (match.paused) {
      return card(`
        <h2>PAUSA</h2>
        <p>Ronda ${match.round} · gana quien llegue a ${match.targetScore}</p>
        ${this.scoreboardHtml()}
        <div class="mo-buttons">
          <button data-action="resume" class="mo-primary">▶ Continuar</button>
          <button data-action="lobby">Terminar partida</button>
        </div>`);
    }
    switch (match.phase) {
      case PHASE.LOBBY: {
        // Solo una etiqueta pequeña: la sala es para practicar y no se tapa el mapa (el botón está en la barra).
        const hint = match.canStart() ? 'pulsa «Empezar» (o Intro) cuando estéis' : 'hacen falta 2 jugadores para empezar (vale el bot)';
        return `<div class="mo-tag">Sala de pruebas · vidas infinitas · gana quien llegue a ${match.targetScore} · ${hint}</div>`;
      }
      case PHASE.COUNTDOWN:
        return `<div class="mo-center"><div class="mo-round">Ronda ${match.round}</div><div class="mo-count">${match.countdownValue(now)}</div></div>`;
      case PHASE.PLAYING:
        return `<div class="mo-tag">Ronda ${match.round} · a ${match.targetScore} puntos</div>`;
      case PHASE.ROUND_END: {
        const w = match.roundWinner;
        const title = w ? `<span style="color:${escape(w.color)}">${escape(w.label)}</span> gana la ronda ${match.round}` : `Ronda ${match.round}: ¡empate!`;
        return card(`<h2>${title}</h2>${this.scoreboardHtml(w?.id)}`);
      }
      case PHASE.MATCH_END: {
        const w = match.matchWinner;
        return card(`
          <div class="mo-trophy">🏆</div>
          <h2><span style="color:${escape(w.color)}">${escape(w.label)}</span> gana la partida</h2>
          ${this.scoreboardHtml(w.id)}
          <button data-action="lobby" class="mo-primary">Volver a la sala</button>`);
      }
      default:
        return '';
    }
  }

  scoreboardHtml(highlightId) {
    const rows = this.match.scoreboard().map((s) => `
      <li class="${s.id === highlightId ? 'mo-win' : ''}">
        <span class="mo-dot" style="background:${escape(s.color)}"></span>
        <span class="mo-name">${escape(s.label)}${s.connected ? '' : ' ✕'}</span>
        <span class="mo-bar"><span style="width:${(100 * s.score) / this.match.targetScore}%;background:${escape(s.color)}"></span></span>
        <b>${s.score}</b>
      </li>`).join('');
    return `<ol class="mo-scores">${rows}</ol>`;
  }
}

function card(content, extraClass = '') {
  return `<div class="mo-card ${extraClass}">${content}</div>`;
}
