const { encodeInput, BUTTONS } = window.Protocol;

const MIN_SEND_INTERVAL_MS = 33; // ~30 Hz máximo para el movimiento
const KEEPALIVE_MS = 500; // reenvía el estado aunque no cambie, para que el servidor no lo dé por obsoleto

/**
 * Acumula el estado del mando y lo envía de forma compacta:
 * al instante si cambia un botón, limitado a ~30 Hz si cambia el joystick,
 * y cada 500 ms como señal de vida.
 */
export class InputSender {
  constructor(socket, event) {
    this.socket = socket;
    this.event = event;
    this.active = false;
    this.seq = 0;
    this.x = 0;
    this.y = 0;
    this.buttons = 0;
    this.lastPacket = null;
    this.lastSentAt = 0;
    this.pendingTimer = null;

    setInterval(() => {
      if (performance.now() - this.lastSentAt >= KEEPALIVE_MS) this.flush(true);
    }, KEEPALIVE_MS / 2);
  }

  setMove(x, y) {
    this.x = x;
    this.y = y;
    this.schedule();
  }

  setAction(pressed) {
    this.buttons = pressed ? this.buttons | BUTTONS.ACTION : this.buttons & ~BUTTONS.ACTION;
    this.flush(false);
  }

  /** Pone el mando en neutro (al ocultar la página o perder la conexión). */
  reset() {
    this.x = 0;
    this.y = 0;
    this.buttons = 0;
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
    this.x = 0;
    this.y = 0;
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

    const packet = encodeInput(this.seq, this.x, this.y, this.buttons);
    const last = this.lastPacket;
    const same = last && last[1] === packet[1] && last[2] === packet[2] && last[3] === packet[3];
    if (same && !force) return;

    this.socket.emit(this.event, packet);
    this.seq++;
    this.lastPacket = packet;
    this.lastSentAt = performance.now();
  }
}
