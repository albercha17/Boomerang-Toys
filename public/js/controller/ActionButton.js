/**
 * Botón táctil multitoque. Llama a onChange(pressed) solo cuando cambia el estado.
 */
export class ActionButton {
  constructor(element, onChange) {
    this.element = element;
    this.onChange = onChange;
    this.pointerId = null;

    element.addEventListener('pointerdown', (e) => this.press(e));
    element.addEventListener('pointerup', (e) => this.unpress(e));
    element.addEventListener('pointercancel', (e) => this.unpress(e));
    element.addEventListener('lostpointercapture', (e) => this.unpress(e));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(event) {
    event.preventDefault();
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('pressed');
    if (navigator.vibrate) navigator.vibrate(15);
    this.onChange(true);
  }

  unpress(event) {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.element.classList.remove('pressed');
    this.onChange(false);
  }

  release() {
    if (this.pointerId !== null) this.unpress({ pointerId: this.pointerId });
  }
}
