const MAX_SLOTS = 8;

/**
 * Barra superior (HTML sobre la escena 3D): jugadores conectados y dirección para los mandos.
 * Solo toca el DOM cuando algo cambia.
 */
export class Hud {
  constructor(store) {
    this.store = store;
    this.url = document.getElementById('hud-url');
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
