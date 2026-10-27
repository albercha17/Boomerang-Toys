const MAX_SLOTS = 8;

/**
 * Barra superior (HTML sobre la escena 3D): jugadores conectados, botón de bot y dirección para los mandos.
 * Solo toca el DOM cuando algo cambia.
 */
export class Hud {
  constructor(store, game) {
    this.store = store;
    this.game = game;
    this.url = document.getElementById('hud-url');

    // Bot para jugar contra la máquina (botón o tecla B) y arena nueva (botón o tecla M).
    this.botButton = document.getElementById('bot-btn');
    this.mapButton = document.getElementById('map-btn');
    const newMap = () => {
      game.newArena(performance.now());
      this.showArenaInfo();
    };
    this.botButton.addEventListener('click', () => {
      game.toggleBot(performance.now());
      this.botButton.blur();
    });
    this.mapButton.addEventListener('click', () => {
      newMap();
      this.mapButton.blur();
    });
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'b') game.toggleBot(performance.now());
      if (key === 'm') newMap();
    });
    this.botsShown = -1;
    this.showArenaInfo();

    const container = document.getElementById('hud-players');
    this.chips = Array.from({ length: MAX_SLOTS }, (_, i) => {
      const chip = document.createElement('span');
      chip.className = 'hud-chip';
      chip.innerHTML = `<span class="hud-dot"></span><span>J${i + 1}</span>`;
      container.appendChild(chip);
      return { chip, dot: chip.firstChild, label: chip.lastChild };
    });
    this.renderedKey = '';
  }

  /** Semilla y tamaño de la arena actual en la ayuda del botón (para repetir un mapa con ?semilla=). */
  showArenaInfo() {
    const { seed, cols, rows } = this.game.arenaConfig;
    this.mapButton.title = `Tecla M · semilla ${seed} · ${cols}×${rows}`;
  }

  update() {
    const bots = this.game.bots.size;
    if (bots !== this.botsShown) {
      this.botsShown = bots;
      this.botButton.textContent = bots ? '− Quitar bot' : '+ Añadir bot';
      this.botButton.classList.toggle('on', bots > 0);
    }

    const store = this.store;
    const slots = this.chips.map((_, i) => store.playerByNumber(i + 1));
    const key = JSON.stringify([
      store.serverConnected,
      store.serverInfoVersion,
      slots.map((s) => s && [s.player.color, s.player.connected, Boolean(s.input?.stale)]),
    ]);
    if (key === this.renderedKey) return;
    this.renderedKey = key;

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
      label.textContent = `J${i + 1}${status}`;
    });
  }
}
