const { POWERUPS, SUPERS, ALL, MAX_ABILITIES } = window.PowerupCatalog;

const INFO_MS = 4500;
const NEW_MS = 6000; // al cogerlo, la explicación se queda algo más

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Power-ups del jugador en su mando: iconos en la barra superior (al tocarlos se explica qué hace cada uno);
 * al coger uno nuevo, sale la misma explicación sola (con «¡Nuevo!»). La superhabilidad (caja dorada, un solo uso) va aparte, en dorado.
 */
const WHEN = { dash: 'en tu próximo DASH', throw: 'en tu próximo LANZAMIENTO' };
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
    const superPower = abilities.find((id) => SUPERS[id]) ?? null;
    const all = superPower ? [...valid, superPower] : valid;
    const added = all.filter((id) => !this.abilities.includes(id));
    this.abilities = all;
    this.list.innerHTML = all.map((id) => {
      const p = ALL[id];
      return `<button type="button" class="ability${p.super ? ' super' : ''}" data-ability="${id}" style="--ability-color:#${p.color.toString(16).padStart(6, '0')}" aria-label="${escape(p.name)}">${p.icon}</button>`;
    }).join('');
    this.list.hidden = all.length === 0;
    if (added.length) this.announce(added.includes(superPower) ? superPower : added[added.length - 1]);
    if (!this.info.hidden && !all.includes(this.info.dataset.ability)) this.info.hidden = true;
  }

  /** Recién cogido: vibra y explica qué hace. */
  announce(id) {
    const p = ALL[id];
    if (navigator.vibrate) navigator.vibrate(p.super ? [60, 40, 60, 40, 120] : [30, 40, 30]);
    this.explain(id, { fresh: true });
  }

  explain(id, { fresh = false } = {}) {
    const p = ALL[id];
    this.info.dataset.ability = id;
    this.info.classList.toggle('super', Boolean(p.super));
    this.info.classList.toggle('fresh', fresh);
    const note = p.super
      ? `Superhabilidad de un solo uso: se dispara sola ${WHEN[p.trigger]}. Solo llevas una; si coges otra caja dorada, la cambias.`
      : `Llevas ${this.abilities.filter((a) => POWERUPS[a]).length} de ${MAX_ABILITIES}: al coger otra se pierde la más antigua.`;
    const badge = fresh ? `<span class="ability-new">${p.super ? '¡Súper nueva!' : '¡Nuevo!'}</span>` : '';
    this.info.innerHTML = `${badge}<div class="ability-title">${p.super ? '★ ' : ''}${p.icon} ${escape(p.name)}</div><p>${escape(p.description)}</p><small>${note}</small>`;
    this.info.hidden = false;
    this.toast.hidden = true;
    clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => { this.info.hidden = true; }, fresh ? NEW_MS : INFO_MS);
  }
}
