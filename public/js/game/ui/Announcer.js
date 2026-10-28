/**
 * Aviso grande en el centro de la pantalla (superhabilidades: al cogerlas y al usarlas). Entra con un golpe,
 * se queda un momento y se va; si llega otro, sustituye al anterior.
 */
const SHOW_MS = 1900;

export class Announcer {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'announce';
    this.el.hidden = true;
    document.body.append(this.el);
    this.timer = null;
  }

  show(def, title, subtitle = '') {
    const color = `#${def.color.toString(16).padStart(6, '0')}`;
    this.el.style.setProperty('--announce-color', color);
    this.el.innerHTML = `<span class="announce-icon">${def.icon}</span><span class="announce-text"><b></b><small></small></span>`;
    this.el.querySelector('b').textContent = title;
    this.el.querySelector('small').textContent = subtitle;
    this.el.hidden = false;
    this.el.classList.remove('pop');
    void this.el.offsetWidth; // reinicia la animación
    this.el.classList.add('pop');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.el.hidden = true; }, SHOW_MS);
  }
}
