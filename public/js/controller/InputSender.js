const { encodeInput } = window.Protocol;

const MIN_SEND_INTERVAL_MS = 33; // ~30 Hz máximo para los joysticks
const KEEPALIVE_MS = 500; // reenvía el estado aunque no cambie, para que el servidor no lo dé por obsoleto

/**
 * Acumula el estado del mando (dos joysticks y botones) y lo envía de forma compacta:
 * al instante si cambia un botón, limitado a ~30 Hz si cambia un joystick,
 * y cada 500 ms como señal de vida.
 */
export class InputSender {
  constructor(socket, event) {
    this.socket = socket;
    this.event = event;
    this.active = false;
    this.seq = 0;
    this.move = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
    this.buttons = 0;
    this.lastPacket = null;
    this.lastSentAt = 0;
    this.pendingTimer = null;

    setInterval(() => {
      if (performance.now() - this.lastSentAt >= KEEPALIVE_MS) this.flush(true);
    }, KEEPALIVE_MS / 2);
  }

  setMove(x, y) {
    this.move = { x, y };
    this.schedule();
  }

  setAim(x, y) {
    this.aim = { x, y };
    this.schedule();
  }

  /** @param {number} bit Protocol.BUTTONS.* */
  setButton(bit, pressed) {
    this.buttons = pressed ? this.buttons | bit : this.buttons & ~bit;
    this.flush(false);
  }

  /** Pone el mando en neutro (al ocultar la página o perder la conexión). */
  reset() {
    this.clear();
    this.flush(false);
  }

  /** Empieza a enviar tras la bienvenida del servidor, que espera una secuencia nueva desde 0. */
  start() {
    this.active = true;
    this.seq = 0;
    this.lastPacket = null;
    this.flush(true);
  }

  /** Deja de enviar hasta la próxima bienvenida (desconexión). */
  stop() {
    this.active = false;
    this.clear();
  }

  clear() {
    this.move = { x: 0, y: 0 };
    this.aim = { x: 0, y: 0 };
    this.buttons = 0;
  }

  schedule() {
    const wait = MIN_SEND_INTERVAL_MS - (performance.now() - this.lastSentAt);
    if (wait <= 0) {
      this.flush(false);
    } else if (!this.pendingTimer) {
      this.pendingTimer = setTimeout(() => this.flush(false), wait);
    }
  }

  flush(force) {
    clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if (!this.active || !this.socket.connected) return;

    const packet = encodeInput(this.seq, this.move, this.aim, this.buttons);
    const last = this.lastPacket;
    const same = last && packet.every((value, i) => i === 0 || value === last[i]);
    if (same && !force) return;

    this.socket.emit(this.event, packet);
    this.seq++;
    this.lastPacket = packet;
    this.lastSentAt = performance.now();
  }
}
