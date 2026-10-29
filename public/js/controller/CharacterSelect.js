const { CHARACTERS } = window.CharacterCatalog;

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Pantalla de elección de personaje en el móvil. Los que ya tiene otro jugador salen tachados y no se pueden
 * elegir. «JUGAR» pide el personaje al servidor, que es quien decide (dos jugadores no pueden quedarse el mismo).
 */
export class CharacterSelect {
  constructor({ root, grid, playButton, message, onPlay }) {
    this.root = root;
    this.grid = grid;
    this.playButton = playButton;
    this.message = message;
    this.onPlay = onPlay;
    this.taken = {}; // idPersonaje -> número del jugador que lo tiene
    this.myNumber = null;
    this.current = null; // personaje con el que ya juega (al cambiar)
    this.selected = null;
    this.portraits = {};

    grid.addEventListener('click', (event) => {
      const card = event.target.closest('[data-character]');
      if (!card || card.classList.contains('taken')) return;
      this.selected = card.dataset.character;
      this.message.textContent = '';
      this.render();
    });
    playButton.addEventListener('click', () => {
      if (this.canPlay()) onPlay(this.selected);
    });
    this.render();
    this.loadPortraits();
  }

  /**
   * Retratos: los ya dibujados (public/models/ia/retratos, herramienta retratos.js) como imagen; los que falten se
   * dibujan en 3D en el propio móvil con los mismos muñecos (mientras, se ve un emoji).
   */
  async loadPortraits() {
    let ready = [];
    try {
      const res = await fetch('/models/ia/retratos/manifest.json', { cache: 'no-cache' });
      if (res.ok) ready = await res.json();
    } catch { /* sin retratos guardados */ }
    for (const id of ready) this.portraits[id] = `/models/ia/retratos/${id}.png`;
    this.render();
    const missing = CHARACTERS.map((c) => c.id).filter((id) => !ready.includes(id));
    if (!missing.length) return;
    try {
      const { renderPortraits } = await import('/js/game/entities/portraits.js');
      Object.assign(this.portraits, await renderPortraits(missing));
      this.render();
    } catch (error) {
      console.warn('Sin retratos 3D:', error);
    }
  }

  /** Cogido por otro jugador; si ya están todos cogidos, se puede repetir (nada sale tachado). */
  isTakenByOther(id) {
    const byOther = (cid) => this.taken[cid] !== undefined && this.taken[cid] !== this.myNumber;
    return byOther(id) && !CHARACTERS.every((c) => byOther(c.id));
  }

  canPlay() {
    return Boolean(this.selected) && !this.isTakenByOther(this.selected);
  }

  setTaken(taken, myNumber) {
    this.taken = taken;
    this.myNumber = myNumber;
    if (this.selected && this.isTakenByOther(this.selected)) {
      this.selected = null;
      this.message.textContent = 'Ese personaje lo acaba de coger otro jugador. Elige otro.';
    }
    this.render();
  }

  show(current) {
    this.current = current;
    this.selected = current;
    this.root.hidden = false;
    this.render();
  }

  hide() {
    this.root.hidden = true;
  }

  reject(reason) {
    this.message.textContent = reason === 'taken'
      ? 'Ese personaje ya lo tiene otro jugador. Elige otro.'
      : reason === 'locked' ? 'La partida ya ha empezado: podrás cambiar de personaje en la sala.' : 'No se ha podido elegir ese personaje.';
  }

  render() {
    this.grid.innerHTML = CHARACTERS.map((c) => {
      const owner = this.isTakenByOther(c.id) ? this.taken[c.id] : null;
      const classes = ['char-card', owner ? 'taken' : '', this.selected === c.id ? 'selected' : ''].join(' ');
      const art = this.portraits[c.id] ? `<img src="${this.portraits[c.id]}" alt="">` : `<span class="char-emoji">${c.emoji}</span>`;
      return `<button type="button" class="${classes}" data-character="${c.id}" ${owner ? 'disabled' : ''}>
        <span class="char-art">${art}</span>
        <span class="char-name">${escape(c.name)}</span>
        ${owner ? `<span class="char-owner">Elegido por J${owner}</span>` : ''}
      </button>`;
    }).join('');
    const chosen = CHARACTERS.find((c) => c.id === this.selected);
    this.playButton.disabled = !this.canPlay();
    this.playButton.textContent = chosen ? `▶ JUGAR CON ${chosen.name.toUpperCase()}` : 'Elige un personaje';
  }
}
