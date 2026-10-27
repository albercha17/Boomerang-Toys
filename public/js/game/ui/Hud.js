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

    // Bot para jugar contra la máquina: botón o tecla B.
    this.botButton = document.getElementById('bot-btn');
    this.botButton.addEventListener('click', () => {
      game.toggleBot(performance.now());
      this.botButton.blur();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'b' && !event.repeat) game.toggleBot(performance.now());
    });
    this.botsShown = -1;

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
