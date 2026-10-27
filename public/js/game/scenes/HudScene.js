const MAX_SLOTS = 8;
const FONT = 'Trebuchet MS, Arial, sans-serif';

/**
 * Barra superior sobre la arena: título, jugadores conectados y dirección para los mandos.
 */
export class HudScene extends Phaser.Scene {
  constructor(store) {
    super('hud');
    this.store = store;
    this.renderedInfoVersion = -1;
  }

  create() {
    const { width } = this.scale;
    this.add.rectangle(0, 0, width, 48, 0x2a1d14).setOrigin(0);
    this.add.text(16, 10, 'BUMERÁN DE JUGUETE', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#fff4e0' });
    this.urlText = this.add.text(width - 16, 15, '', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold' }).setOrigin(1, 0);

    this.chips = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
      const x = 300 + i * 80;
      this.chips.push({
        dot: this.add.circle(x, 24, 9, 0xffffff).setStrokeStyle(2, 0xfff4e0),
        label: this.add.text(x + 14, 14, '', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#fff4e0' }),
      });
    }
  }

  update() {
    const store = this.store;
    if (!store.serverConnected) {
      this.urlText.setText('● Sin conexión con el servidor').setColor('#ff8a8a');
      this.renderedInfoVersion = -1;
    } else if (store.serverInfoVersion !== this.renderedInfoVersion && store.serverInfo) {
      this.renderedInfoVersion = store.serverInfoVersion;
      const { addresses, port, controllerPath } = store.serverInfo;
      const text = addresses.length ? `Mando: http://${addresses[0].address}:${port}${controllerPath}` : 'Sin red local';
      this.urlText.setText(text).setColor('#ffd166');
    }

    this.chips.forEach((chip, i) => {
      const slot = store.playerByNumber(i + 1);
      if (!slot) {
        chip.dot.setFillStyle(0xffffff, 0.08).setStrokeStyle(2, 0xfff4e0, 0.2);
        chip.label.setText(`J${i + 1}`).setAlpha(0.25);
        return;
      }
      const { player, input } = slot;
      const color = Phaser.Display.Color.HexStringToColor(player.color).color;
      const status = !player.connected ? ' ✕' : input?.stale ? ' …' : '';
      chip.dot.setFillStyle(color, player.connected ? 1 : 0.35).setStrokeStyle(2, 0xfff4e0, 1);
      chip.label.setText(`J${i + 1}${status}`).setAlpha(player.connected ? 1 : 0.5);
    });
  }
}
