const { BUTTONS } = window.Protocol;

/**
 * Convierte el estado del botón (que llega a 20 Hz) en gestos: toque, mantener y soltar.
 * Usa el contador de pulsaciones del servidor para no perder toques más cortos que un envío.
 */
export class ButtonGesture {
  constructor(tapMs) {
    this.tapMs = tapMs;
    this.presses = null;
    this.down = false;
    this.downAt = 0;
    this.blocked = false; // pulsación que ya estaba en curso al empezar a escuchar: se ignora
  }

  /**
   * @param {{ buttons: number, presses: number } | null} input  null = mando sin señal
   * @returns {{ tap: boolean, release: boolean, holding: boolean, holdTime: number }}
   */
  update(input, now) {
    const result = { tap: false, release: false, holding: false, holdTime: 0 };
    if (!input) {
      this.presses = null;
      this.down = false;
      return result;
    }

    const pressed = (input.buttons & BUTTONS.ACTION) !== 0;
    if (this.presses === null) {
      this.presses = input.presses;
      this.down = pressed;
      this.blocked = pressed;
      this.downAt = now;
      return result;
    }

    const newPresses = input.presses - this.presses;
    this.presses = input.presses;

    if (newPresses > 0) {
      if (this.down) this.finish(now, result); // se soltó y se volvió a pulsar entre dos envíos
      if (newPresses > 1 || !pressed) result.tap = true; // pulsaciones completas entre dos envíos
      this.down = pressed;
      this.downAt = now;
      this.blocked = false;
    } else if (this.down && !pressed) {
      this.finish(now, result);
      this.down = false;
    }

    if (this.down && !this.blocked) {
      result.holdTime = now - this.downAt;
      result.holding = result.holdTime >= this.tapMs;
    }
    return result;
  }

  finish(now, result) {
    if (this.blocked) {
      this.blocked = false;
      return;
    }
    if (now - this.downAt < this.tapMs) result.tap = true;
    else result.release = true;
  }
}
