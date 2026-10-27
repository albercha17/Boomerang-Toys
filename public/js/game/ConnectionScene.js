import { PlayerCard, CARD_WIDTH, CARD_HEIGHT } from './PlayerCard.js';

const MAX_SLOTS = 8;
const COLUMNS = 4;
const GAP = 20;

/**
 * Escena de la Fase 1: muestra cómo conectarse y, en tiempo real, el estado y las entradas de cada mando.
 */
export class ConnectionScene extends Phaser.Scene {
  constructor(store) {
    super('connection');
    this.store = store;
    this.cards = [];
    this.renderedInfoVersion = -1;
  }

  create() {
    const { width } = this.scale;
    this.drawTable();

    const font = 'Trebuchet MS, Arial, sans-serif';
    this.add.text(40, 26, 'BUMERÁN DE JUGUETE', { fontFamily: font, fontSize: '44px', fontStyle: 'bold', color: '#fff4e0' })
      .setShadow(0, 5, '#000000', 0, false, true);
    this.add.text(42, 80, 'Fase 1 · prueba de mandos', { fontFamily: font, fontSize: '18px', color: '#e8c9a0' });

    this.serverText = this.add.text(width - 40, 30, '', { fontFamily: font, fontSize: '18px', fontStyle: 'bold' }).setOrigin(1, 0);
    this.countText = this.add.text(width - 40, 56, '', { fontFamily: font, fontSize: '16px', color: '#e8c9a0' }).setOrigin(1, 0);

    this.joinText = this.add.text(40, 112, '', { fontFamily: font, fontSize: '19px', color: '#fff4e0' });
    this.urlText = this.add.text(width - 40, 104, '', { fontFamily: font, fontSize: '28px', fontStyle: 'bold', color: '#ffd166' }).setOrigin(1, 0);
    this.altText = this.add.text(width - 40, 138, '', { fontFamily: font, fontSize: '13px', color: '#c8ab88' }).setOrigin(1, 0);

    const totalWidth = COLUMNS * CARD_WIDTH + (COLUMNS - 1) * GAP;
    const startX = (width - totalWidth) / 2;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      this.cards.push(new PlayerCard(this, startX + col * (CARD_WIDTH + GAP), 172 + row * (CARD_HEIGHT + GAP + 8), i + 1));
    }
  }

  drawTable() {
    // Tablero de madera provisional: listones con vetas suaves.
    const { width, height } = this.scale;
    const g = this.add.graphics();
    const planks = [0x5a3e2b, 0x553a28, 0x5e412d];
    for (let y = 0, i = 0; y < height; y += 60, i++) {
      g.fillStyle(planks[i % planks.length]).fillRect(0, y, width, 60);
      g.fillStyle(0x000000, 0.12).fillRect(0, y + 58, width, 2);
    }
  }

  update(time) {
    const store = this.store;
    this.serverText
      .setText(store.serverConnected ? '● Servidor conectado' : '● Sin conexión con el servidor')
      .setColor(store.serverConnected ? '#7ee2a8' : '#ff8a8a');

    const max = store.serverInfo?.maxPlayers ?? MAX_SLOTS;
    this.countText.setText(`${store.playerCount} / ${max} jugadores`);

    if (store.serverInfoVersion !== this.renderedInfoVersion) {
      this.renderedInfoVersion = store.serverInfoVersion;
      this.renderJoinInfo(store.serverInfo);
    }

    const now = performance.now();
    this.cards.forEach((card) => {
      card.setVisible(card.number <= max);
      card.refresh(store.playerByNumber(card.number), now);
    });
  }

  renderJoinInfo(info) {
    if (!info) return;
    const urls = info.addresses.map(({ address }) => `http://${address}:${info.port}${info.controllerPath}`);
    if (urls.length === 0) {
      this.joinText.setText('No se detecta red local. Conecta el ordenador al Wi-Fi.');
      this.urlText.setText('');
      this.altText.setText('');
      return;
    }
    this.joinText.setText('Conecta el móvil al mismo Wi-Fi y abre en el navegador:');
    this.urlText.setText(urls[0]);
    this.altText.setText(urls.length > 1 ? `Si no funciona, prueba: ${urls.slice(1).join('   ')}` : '');
  }
}
