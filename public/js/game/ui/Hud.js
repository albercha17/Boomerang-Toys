import { PHASE } from '../match/Match.js';

const MAX_SLOTS = 8;

/**
 * Barra superior (HTML sobre la escena 3D): jugadores y puntos, botones y dirección para los mandos.
 * En la sala: «Nuevo mapa» (M) y bot (B). En la partida: «Pausa» (P o Esc). Intro empieza la partida.
 * Solo toca el DOM cuando algo cambia.
 */
export class Hud {
  constructor(store, game, match) {
    this.store = store;
    this.game = game;
    this.match = match;
    this.url = document.getElementById('hud-url');
    this.botButton = document.getElementById('bot-btn');
    this.mapButton = document.getElementById('map-btn');
    this.pauseButton = document.getElementById('pause-btn');

    const inLobby = () => match.phase === PHASE.LOBBY;
    const actions = {
      bot: () => inLobby() && game.toggleBot(performance.now()),
      map: () => {
        if (!inLobby()) return;
        game.newArena(performance.now());
        this.showArenaInfo();
      },
      pause: () => match.togglePause(performance.now()),
      start: () => match.start(performance.now()),
    };
    const bind = (button, action) => button.addEventListener('click', () => {
      action();
      button.blur(); // que Intro o espacio no lo vuelvan a pulsar
    });
    bind(this.botButton, actions.bot);
    bind(this.mapButton, actions.map);
    bind(this.pauseButton, actions.pause);
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'b') actions.bot();
      if (key === 'm') actions.map();
      if (key === 'p' || key === 'escape') actions.pause();
      if (key === 'enter') actions.start();
    });

    const container = document.getElementById('hud-players');
    this.chips = Array.from({ length: MAX_SLOTS }, (_, i) => {
      const chip = document.createElement('span');
      chip.className = 'hud-chip';
      chip.innerHTML = `<span class="hud-dot"></span><span>J${i + 1}</span>`;
      container.appendChild(chip);
      return { chip, dot: chip.firstChild, label: chip.lastChild };
    });
    this.renderedKey = '';
    this.showArenaInfo();
  }

  /** Semilla y tamaño de la arena actual en la ayuda del botón (para repetir un mapa con ?semilla=). */
  showArenaInfo() {
    const { seed, cols, rows } = this.game.arenaConfig;
    this.mapButton.title = `Tecla M · semilla ${seed} · ${cols}×${rows}`;
  }

  update() {
    const { store, match, game } = this;
    const slots = this.chips.map((_, i) => store.playerByNumber(i + 1));
    const showScores = match.phase !== PHASE.LOBBY;
    const key = JSON.stringify([
      store.serverConnected,
      store.serverInfoVersion,
      match.phase,
      match.paused,
      game.bots.size,
      slots.map((s) => s && [s.player.color, s.player.connected, Boolean(s.input?.stale), match.scoreOf(s.player.id)]),
    ]);
    if (key === this.renderedKey) return;
    this.renderedKey = key;

    const lobby = match.phase === PHASE.LOBBY;
    this.mapButton.hidden = !lobby;
    this.botButton.hidden = !lobby;
    this.pauseButton.hidden = !match.inMatch;
    this.pauseButton.textContent = match.paused ? '▶ Continuar' : 'Ⅱ Pausa';
    this.botButton.textContent = game.bots.size ? '− Quitar bot' : '+ Añadir bot';
    this.botButton.classList.toggle('on', game.bots.size > 0);

    if (!store.serverConnected) {
      this.url.textContent = '● Sin conexión con el servidor';
      this.url.classList.add('error');
    } else if (store.serverInfo) {
      const { addresses, port, controllerPath } = store.serverInfo;
      this.url.textContent = addresses.length ? `Mando: http://${addresses[0].address}:${port}${controllerPath}` : 'Sin red local';
      this.url.classList.remove('error');
    }

    slots.forEach((slot, i) => {
      const { chip, dot, label } = this.chips[i];
      chip.classList.toggle('on', Boolean(slot?.player.connected));
      chip.classList.toggle('off', Boolean(slot && !slot.player.connected));
      dot.style.background = slot ? slot.player.color : 'transparent';
      const status = !slot ? '' : !slot.player.connected ? ' ✕' : slot.input?.stale ? ' …' : '';
      const score = slot && showScores ? ` · ${match.scoreOf(slot.player.id)}` : '';
      label.textContent = `J${i + 1}${score}${status}`;
    });
  }
}
