const { BUTTONS } = window.Protocol;

export const CARD_WIDTH = 290;
export const CARD_HEIGHT = 250;

const CREAM = 0xfff4e0;
const INK = 0x2a1d14;
const IDLE_GREY = 0xb9ab98;
const STICK_RANGE = 34;
const FLASH_MS = 350;

const toColor = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

/**
 * Tarjeta de una plaza de jugador: estado de conexión, joystick y botón en tiempo real.
 */
export class PlayerCard extends Phaser.GameObjects.Container {
  constructor(scene, x, y, number) {
    super(scene, x, y);
    this.number = number;
    this.renderKey = null;

    const w = CARD_WIDTH;
    const textStyle = { fontFamily: 'Trebuchet MS, Arial, sans-serif', color: '#2a1d14' };

    this.background = scene.add.graphics();
    this.numberText = scene.add.text(18, 10, String(number), { ...textStyle, fontSize: '34px', fontStyle: 'bold', color: '#fff4e0' });
    this.nameText = scene.add.text(62, 14, '', { ...textStyle, fontSize: '22px', fontStyle: 'bold', color: '#fff4e0' });
    this.statusText = scene.add.text(18, 66, '', { ...textStyle, fontSize: '17px', fontStyle: 'bold' });
    this.pingText = scene.add.text(w - 18, 66, '', { ...textStyle, fontSize: '15px' }).setOrigin(1, 0);

    // Joystick
    this.stickBase = scene.add.circle(80, 160, 48, INK, 0.12).setStrokeStyle(4, INK, 0.35);
    this.stickKnob = scene.add.circle(80, 160, 18, IDLE_GREY).setStrokeStyle(3, CREAM);
    this.axisText = scene.add.text(80, 222, '', { ...textStyle, fontSize: '13px' }).setOrigin(0.5, 0);

    // Botón de acción
    this.flashRing = scene.add.circle(210, 160, 36).setStrokeStyle(6, INK).setAlpha(0);
    this.actionDot = scene.add.circle(210, 160, 34, IDLE_GREY).setStrokeStyle(4, CREAM);
    this.actionLabel = scene.add.text(210, 160, 'A', { ...textStyle, fontSize: '26px', fontStyle: 'bold', color: '#fff4e0' }).setOrigin(0.5);
    this.pressesText = scene.add.text(210, 222, '', { ...textStyle, fontSize: '13px' }).setOrigin(0.5, 0);

    this.add([
      this.background, this.numberText, this.nameText, this.statusText, this.pingText,
      this.stickBase, this.stickKnob, this.axisText,
      this.flashRing, this.actionDot, this.actionLabel, this.pressesText,
    ]);
    scene.add.existing(this);
  }

  /** @param {{ player, input } | null} slot */
  refresh(slot, now) {
    const player = slot?.player ?? null;
    const input = slot?.input ?? null;
    this.drawFrame(player, input);
    if (!player) return;

    const x = input?.x ?? 0;
    const y = input?.y ?? 0;
    const pressed = ((input?.buttons ?? 0) & BUTTONS.ACTION) !== 0;
    const color = toColor(player.color);

    // Suaviza el movimiento del punto entre ticks del servidor (20 Hz).
    const targetX = 80 + x * STICK_RANGE;
    const targetY = 160 + y * STICK_RANGE;
    this.stickKnob.x += (targetX - this.stickKnob.x) * 0.5;
    this.stickKnob.y += (targetY - this.stickKnob.y) * 0.5;
    this.stickKnob.setFillStyle(x || y ? color : IDLE_GREY);
    this.axisText.setText(`x ${x.toFixed(2)}   y ${y.toFixed(2)}`);

    this.actionDot.setFillStyle(pressed ? color : IDLE_GREY);
    this.actionDot.setScale(pressed ? 0.9 : 1);
    this.pressesText.setText(`pulsaciones: ${input?.presses ?? 0}`);

    const sincePress = now - (input?.lastPressAt ?? 0);
    if (sincePress < FLASH_MS) {
      const t = sincePress / FLASH_MS;
      this.flashRing.setAlpha(1 - t).setScale(1 + t * 0.6);
    } else {
      this.flashRing.setAlpha(0);
    }

    this.pingText.setText(player.connected && player.rtt != null ? `${player.rtt} ms` : '');
  }

  /** Redibuja fondo y textos solo cuando cambia el estado de la plaza. */
  drawFrame(player, input) {
    const status = !player ? 'free' : !player.connected ? 'offline' : input?.stale ? 'stale' : 'ok';
    const key = player ? `${status}|${player.name}|${player.color}` : 'free';
    if (key === this.renderKey) return;
    this.renderKey = key;

    const g = this.background;
    g.clear();
    const showDetails = Boolean(player);
    [this.stickBase, this.stickKnob, this.axisText, this.flashRing, this.actionDot, this.actionLabel, this.pressesText]
      .forEach((obj) => obj.setVisible(showDetails));

    if (!player) {
      this.setAlpha(1);
      g.fillStyle(CREAM, 0.08).fillRoundedRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 22);
      g.lineStyle(3, CREAM, 0.25).strokeRoundedRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 22);
      this.numberText.setColor('#fff4e0').setAlpha(0.35);
      this.nameText.setText('Libre').setAlpha(0.35);
      this.statusText.setText('');
      this.pingText.setText('');
      return;
    }

    const color = toColor(player.color);
    const dim = status === 'offline' ? 0.45 : 1;
    // Sombra de "pieza de juguete", cuerpo crema y franja superior del color del jugador.
    g.fillStyle(0x000000, 0.35).fillRoundedRect(0, 8, CARD_WIDTH, CARD_HEIGHT, 22);
    g.fillStyle(CREAM, dim).fillRoundedRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 22);
    g.fillStyle(color, dim).fillRoundedRect(0, 0, CARD_WIDTH, 56, { tl: 22, tr: 22, bl: 0, br: 0 });

    this.numberText.setAlpha(1);
    this.nameText.setText(player.name).setAlpha(1);
    this.setAlpha(dim === 1 ? 1 : 0.8);

    const labels = {
      ok: ['● Conectado', '#1f8a55'],
      stale: ['● Sin señal del mando', '#b07d00'],
      offline: ['● Desconectado (esperando…)', '#c0303b'],
    };
    const [text, textColor] = labels[status];
    this.statusText.setText(text).setColor(textColor);
    if (status === 'offline') {
      this.stickKnob.setPosition(80, 160);
    }
  }
}
