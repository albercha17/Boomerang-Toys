const { POWERUPS, MAX_ABILITIES } = window.PowerupCatalog;

const INFO_MS = 4500;
const TOAST_MS = 2600;

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Power-ups del jugador en su mando: iconos en la barra superior (al tocarlos se explica qué hace cada uno)
 * y un aviso cuando se coge uno nuevo.
 */
export class AbilitiesPanel {
  constructor({ list, info, toast }) {
    this.list = list;
    this.info = info;
    this.toast = toast;
    this.abilities = [];
    this.infoTimer = null;
    this.toastTimer = null;

    list.addEventListener('click', (event) => {
      const id = event.target.closest('[data-ability]')?.dataset.ability;
      if (id) this.explain(id);
    });
    info.addEventListener('click', () => { info.hidden = true; });
  }

  /** Lista nueva desde la pantalla de juego (de la más antigua a la más nueva). */
  set(abilities) {
    const valid = abilities.filter((id) => POWERUPS[id]).slice(-MAX_ABILITIES);
    const added = valid.filter((id) => !this.abilities.includes(id));
    this.abilities = valid;
    this.list.innerHTML = valid.map((id) => {
      const p = POWERUPS[id];
      return `<button type="button" class="ability" data-ability="${id}" style="--ability-color:#${p.color.toString(16).padStart(6, '0')}" aria-label="${escape(p.name)}">${p.icon}</button>`;
    }).join('');
    this.list.hidden = valid.length === 0;
    if (added.length) this.announce(added[added.length - 1]);
    if (!this.info.hidden && !valid.includes(this.info.dataset.ability)) this.info.hidden = true;
  }

  announce(id) {
    const p = POWERUPS[id];
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    this.toast.innerHTML = `<b>${p.icon} ${escape(p.name)}</b> · toca el icono de arriba para ver qué hace`;
    this.toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast.hidden = true; }, TOAST_MS);
  }

  explain(id) {
    const p = POWERUPS[id];
    this.info.dataset.ability = id;
    this.info.innerHTML = `<div class="ability-title">${p.icon} ${escape(p.name)}</div><p>${escape(p.description)}</p><small>Llevas ${this.abilities.length} de ${MAX_ABILITIES}: al coger otra se pierde la más antigua.</small>`;
    this.info.hidden = false;
    this.toast.hidden = true;
    clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => { this.info.hidden = true; }, INFO_MS);
  }
}
