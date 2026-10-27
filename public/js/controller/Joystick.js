/**
 * Joystick táctil flotante: aparece donde se apoya el dedo dentro de la zona.
 * Llama a onChange(x, y) con valores en [-1, 1] (y positiva hacia abajo, como la pantalla).
 */
export class Joystick {
  constructor({ zone, base, knob, onChange, radius = 60, deadZone = 0.15 }) {
    this.zone = zone;
    this.base = base;
    this.knob = knob;
    this.onChange = onChange;
    this.radius = radius;
    this.deadZone = deadZone;
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };

    zone.addEventListener('pointerdown', (e) => this.start(e));
    zone.addEventListener('pointermove', (e) => this.move(e));
    zone.addEventListener('pointerup', (e) => this.end(e));
    zone.addEventListener('pointercancel', (e) => this.end(e));
    zone.addEventListener('lostpointercapture', (e) => this.end(e));
  }

  start(event) {
    if (this.pointerId !== null) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.zone.setPointerCapture(event.pointerId);

    const rect = this.zone.getBoundingClientRect();
    this.origin = { x: event.clientX, y: event.clientY };
    this.base.style.left = `${event.clientX - rect.left}px`;
    this.base.style.top = `${event.clientY - rect.top}px`;
    this.base.classList.add('active');
    this.update(event);
  }

  move(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.update(event);
  }

  end(event) {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.base.classList.remove('active');
    this.base.style.left = '50%';
    this.base.style.top = '50%';
    this.knob.style.transform = '';
    this.onChange(0, 0);
  }

  /** Suelta el joystick por código (p. ej. al ocultar la página). */
  release() {
    if (this.pointerId !== null) this.end({ pointerId: this.pointerId });
  }

  update(event) {
    let dx = event.clientX - this.origin.x;
    let dy = event.clientY - this.origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > this.radius) {
      dx = (dx / distance) * this.radius;
      dy = (dy / distance) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;

    // Zona muerta reescalada: el valor crece suave desde el borde de la zona muerta.
    const magnitude = Math.min(distance, this.radius) / this.radius;
    if (magnitude < this.deadZone) {
      this.onChange(0, 0);
      return;
    }
    const scaled = (magnitude - this.deadZone) / (1 - this.deadZone);
    this.onChange((dx / this.radius / magnitude) * scaled, (dy / this.radius / magnitude) * scaled);
  }
}
