/*
 * Carte Linky Appareils — coûts d'électricité par circuit et par appareil pour Home Assistant.
 * Même style que la carte Enedis Linky New (content-card-linky-new), mais indépendante :
 * elle s'installe comme une ressource à part et ne remplace pas la carte Linky.
 *
 *   type: custom:linky-appareils-card
 *
 * Un circuit (ou un appareil) peut contenir ses propres appareils (devices:), sur plusieurs niveaux :
 * ils s'affichent en dessous, avec une flèche pour plier ou déplier le groupe.
 */

(() => {
const CARD_VERSION = "0.2.2";

/* ------------------------------------------------------------- affichage */

const fmt = (n, digits = 1) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const euro = (n) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const TEMPO = {
  blue: { label: "Bleu", cls: "t-blue" },
  white: { label: "Blanc", cls: "t-white" },
  red: { label: "Rouge", cls: "t-red" },
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Classe de thème de la carte :
 *  v2   : style MyElectricalData, toujours bleu nuit ;
 *  auto : style MyElectricalData, bleu nuit si Home Assistant est en mode sombre, clair sinon ;
 *  ha   : couleurs du thème Home Assistant (clair ou sombre). */
const themeClass = (theme, hass) => {
  const light = hass?.themes?.darkMode === false;
  if (theme === "ha") return `th-ha${light ? " light" : ""}`;
  if (theme === "auto") return `th-v2${light ? " light" : ""}`;
  return "th-v2";
};

/** Groupes pliés ou dépliés, retenus sur l'appareil : facultatif, jamais bloquant. */
const store = {
  get(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || "null"); } catch (e) { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* stockage indisponible */ }
  },
};

/** Appareils rangés sous un circuit ou un appareil (devices:, ou children:). */
const kidsOf = (d) => (Array.isArray(d?.devices) ? d.devices : Array.isArray(d?.children) ? d.children : []);
const flatten = (list) => list.flatMap((d) => [d, ...flatten(kidsOf(d))]);

/* ------------------------------------------------- carte coûts par appareil */

const DEV_DEFAULTS = {
  title: "Coûts par appareil",
  period: "mois",
  tarif: "sensor.lixee_current_price",
  price: "sensor.tempo_tarif_ttc_actuel",
  power: "sensor.lixee_sinsts",
  cost_day: "sensor.tempo_cout_total_aujourd_hui",
  cost_month: "sensor.tempo_cout_total_ce_mois",
  cost_cycle: "sensor.tempo_cout_total_cycle_en_cours",
  energy_day: "sensor.tempo_cout_energie_aujourd_hui",
  energy_month: "sensor.tempo_cout_energie_ce_mois",
  energy_cycle: "sensor.tempo_cout_energie_cycle_en_cours",
  kwh_prefix: "sensor.tempo_",
  show_zero: false,
  show_split: true,
  expanded: false,
  theme: "v2",
};

const DEV_PERIODS = [
  { key: "jour", alt: "day", label: "Jour", total: "cost_day", energy: "energy_day" },
  { key: "mois", alt: "month", label: "Mois", total: "cost_month", energy: "energy_month" },
  { key: "cycle", alt: "cycle", label: "Cycle", total: "cost_cycle", energy: "energy_cycle" },
];

/** Postes Tempo : index des capteurs <prefixe><couleur>_<hc|hp>_energie_ce_mois. */
const DEV_POSTES = [
  { k: "bleu_hc", c: "blue", h: "HC" }, { k: "bleu_hp", c: "blue", h: "HP" },
  { k: "blanc_hc", c: "white", h: "HC" }, { k: "blanc_hp", c: "white", h: "HP" },
  { k: "rouge_hc", c: "red", h: "HC" }, { k: "rouge_hp", c: "red", h: "HP" },
];

/** Montant en euros, avec 3 décimales sous 10 centimes (les petits appareils). */
const euroSmall = (n) => {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "0 €";
  if (Math.abs(n) < 0.001) return "< 0,001 €";
  const d = Math.abs(n) < 0.1 ? 3 : 2;
  return n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
};

/** Sans liste configurée : regroupe les capteurs sensor.cout_<nom>_<jour|mois|cycle> ;
 *  ceux en sensor.cout_disjoncteur_* vont dans les circuits. */
const autoDevices = (states) => {
  const groups = {};
  for (const id of Object.keys(states)) {
    const m = /^sensor\.cout_(.+)_(jour|mois|cycle)$/.exec(id);
    if (!m) continue;
    const g = (groups[m[1]] = groups[m[1]] || { slug: m[1] });
    g[m[2]] = id;
    if (!g.name) {
      const fn = String(states[id].attributes?.friendly_name || m[1]);
      g.name = fn.replace(/^Coût\s+/i, "").replace(/^Disjoncteur\s+/i, "").replace(/\s+(jour|mois|cycle)$/i, "");
    }
  }
  const circuits = [];
  const devices = [];
  for (const g of Object.values(groups)) {
    const power = `sensor.${g.slug}_power`;
    if (states[power]) g.power = power;
    (g.slug.startsWith("disjoncteur_") ? circuits : devices).push(g);
  }
  return { circuits, devices };
};

class LinkyAppareilsCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("linky-appareils-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { ...DEV_DEFAULTS, ...(config || {}) };
    if (!this._tab) this._tab = DEV_PERIODS.some((p) => p.key === this._config.period) ? this._config.period : "mois";
    this._sig = null;
    this._openKey = `linky-appareils-card:${this._config.title}`;
    this._open = store.get(this._openKey) || {};
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const tg = ev.target.closest?.("[data-toggle]");
        if (tg) {
          const k = tg.dataset.toggle;
          this._open = { ...this._open, [k]: tg.getAttribute("aria-expanded") !== "true" };
          store.set(this._openKey, this._open);
          this._render(true);
          return;
        }
        const tab = ev.target.closest?.("[data-tab]");
        if (tab) {
          this._tab = tab.dataset.tab;
          this._render(true);
          return;
        }
        const more = ev.target.closest?.("[data-entity]");
        if (more) {
          const e = new Event("hass-more-info", { bubbles: true, composed: true });
          e.detail = { entityId: more.dataset.entity };
          this.dispatchEvent(e);
        }
      });
    }
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._render(false);
  }

  getCardSize() {
    return 8;
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _num(id) {
    const st = this._state(id);
    if (!st) return null;
    const n = Number(st.state);
    return Number.isFinite(n) ? n : null;
  }

  _lists() {
    const c = this._config;
    if (Array.isArray(c.circuits) || Array.isArray(c.devices)) {
      return { circuits: c.circuits || [], devices: c.devices || [] };
    }
    return autoDevices(this._hass.states || {});
  }

  _render(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const lists = this._lists();
    const period = DEV_PERIODS.find((p) => p.key === this._tab) || DEV_PERIODS[1];
    const pick = (d, p) => d[p.key] || d[p.alt];
    const all = flatten([...lists.circuits, ...lists.devices]);
    const ids = [
      c.tarif, c.price, c.power,
      ...DEV_PERIODS.flatMap((p) => [c[p.total], c[p.energy]]),
      ...(c.show_split !== false ? DEV_POSTES.map((p) => `${c.kwh_prefix}${p.k}_energie_ce_mois`) : []),
      ...all.flatMap((d) => [pick(d, period), d.power]),
    ];
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|${this._tab}|${JSON.stringify(this._open)}|` + ids.map((id) => this._state(id)?.last_updated || "-").join("|");
    if (!force && sig === this._sig) return;
    this._sig = sig;

    // En-tête : poste Tempo en cours (« HP BLEU »), prix du kWh, puissance instantanée
    const tarif = String(this._state(c.tarif)?.state || "").toUpperCase();
    const color = /ROUGE|RED/.test(tarif) ? "red" : /BLANC|WHITE/.test(tarif) ? "white" : /BLEU|BLUE/.test(tarif) ? "blue" : null;
    const hchp = /HC/.test(tarif) ? "HC" : /HP/.test(tarif) ? "HP" : "";
    const price = this._num(c.price);
    const pw = this._state(c.power);
    const pills = [
      color || hchp
        ? `<div class="pill ${color ? TEMPO[color].cls : "t-none"}" data-entity="${esc(c.tarif)}"><span class="dot"></span><span class="pill-l">En cours</span><span class="pill-v">${hchp} ${color ? TEMPO[color].label : ""}</span></div>`
        : "",
      price !== null
        ? `<div class="pill" data-entity="${esc(c.price)}"><span class="pill-l">kWh</span><span class="pill-v">${price.toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} €</span></div>`
        : "",
      pw && Number.isFinite(Number(pw.state))
        ? `<div class="pill" data-entity="${esc(c.power)}"><span class="pill-l">Puissance</span><span class="pill-v">${fmt(Number(pw.state), 0)} ${esc(pw.attributes?.unit_of_measurement || "W")}</span></div>`
        : "",
    ].join("");

    // Tuiles : coût total (abonnement compris) et part énergie, par période
    const tiles = DEV_PERIODS.map((p) => {
      const total = this._num(c[p.total]);
      const energy = this._num(c[p.energy]);
      if (total === null && energy === null) return "";
      const lbl = { jour: "Aujourd'hui", mois: "Ce mois", cycle: "Cycle en cours" }[p.key];
      return `<div class="tile${p.key === period.key ? " sel" : ""}" data-tab="${p.key}">
        <div class="tile-l">${lbl}</div>
        <div class="tile-v">${euro(total ?? energy)}</div>
        ${total !== null && energy !== null ? `<div class="tile-n">dont énergie ${euro(energy)}</div>` : ""}
      </div>`;
    }).join("");

    // Répartition du mois par poste Tempo (kWh)
    let split = "";
    if (c.show_split !== false) {
      const parts = DEV_POSTES.map((p) => ({ ...p, v: this._num(`${c.kwh_prefix}${p.k}_energie_ce_mois`) || 0 }));
      const sum = parts.reduce((a, p) => a + p.v, 0);
      if (sum > 0) {
        const shown = parts.filter((p) => p.v / sum >= 0.001);
        split = `<div class="split dv">
          <div class="chart-h"><span>Énergie du mois par poste Tempo</span><span>${fmt(sum, 1)} kWh</span></div>
          <div class="bar">${shown.map((p) => `<i class="s-${p.c} s-${p.h}" style="width:${(p.v / sum) * 100}%" title="${TEMPO[p.c].label} ${p.h} : ${fmt(p.v, 1)} kWh"></i>`).join("")}</div>
          <div class="dv-leg">${shown.map((p) => `<span><i class="s-${p.c} s-${p.h}"></i>${TEMPO[p.c].label} ${p.h} <b>${fmt(p.v, p.v < 10 ? 1 : 0)}</b></span>`).join("")}</div>
        </div>`;
      }
    }

    // Classements
    const showZero = c.show_zero === true;
    const energy = this._num(c[period.energy]);
    // Groupe déplié : choix fait dans la carte, sinon expanded: de l'élément, sinon de la carte
    const isOpen = (r) => (this._open[r.key] ?? r.d.expanded ?? c.expanded) === true;
    // Lignes d'une liste, avec leurs sous-appareils (le coût d'un groupe sans capteur = somme de ses appareils)
    const build = (list, path) => list.map((d, i) => {
      // Clé stable par nom (ou capteur) : réordonner la config ne mélange pas les groupes pliés
      const key = `${path}${d.name || d.jour || d.day || d.mois || d.month || i}`;
      const ch = build(kidsOf(d), `${key}/`);
      const id = pick(d, period);
      let v = this._num(id);
      if ((!id || !this._state(id)) && ch.length) v = ch.reduce((a, x) => a + (x.v || 0), 0);
      return { d, id: id && this._state(id) ? id : null, v, key, ch };
    }).filter((r) => r.id || r.ch.length);
    const line = (r, depth, max, tree) => {
      const pst = this._state(r.d.power);
      const pv = pst && Number.isFinite(Number(pst.state)) ? Number(pst.state) : null;
      const open = isOpen(r);
      const tg = r.ch.length
        ? `<button class="dv-tg${open ? " open" : ""}" data-toggle="${esc(r.key)}" aria-expanded="${open}" aria-label="${open ? "Plier" : "Déplier"} ${esc(r.d.name || "")}"><ha-icon icon="mdi:chevron-right"></ha-icon></button>`
        : tree ? `<span class="dv-tg sp"></span>` : "";
      const n = r.ch.length ? `<span class="dv-k">${r.ch.length}</span>` : "";
      return `<div class="dv-row${depth ? " sub" : ""}" style="--dv-d:${depth}"${r.id ? ` data-entity="${esc(r.id)}"` : ""}>
        ${tg}<ha-icon icon="${esc(r.d.icon || "mdi:flash")}"></ha-icon>
        <div class="dv-main">
          <div class="dv-top"><span class="dv-n">${esc(r.d.name || r.id || "")}</span>${n}${pv !== null ? `<span class="dv-p${pv > 0 ? " on" : ""}">${fmt(pv, pv < 10 && pv % 1 ? 1 : 0)} W</span>` : ""}<span class="dv-v">${euroSmall(r.v)}</span></div>
          <div class="dv-bar"><i style="width:${Math.max(0, Math.min(100, ((r.v || 0) / max) * 100))}%"></i></div>
        </div>
      </div>`;
    };
    // Une liste : triée, appareils à 0 € regroupés ; un groupe déplié montre ses appareils (barres en part du groupe)
    const rowsHtml = (rows, depth, max) => {
      rows.sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
      const visible = showZero ? rows : rows.filter((r) => r.v);
      const hidden = rows.length - visible.length;
      const top = max ?? Math.max(...visible.map((r) => r.v || 0), 1e-9);
      const tree = rows.some((r) => r.ch.length) || depth > 0;
      return visible.map((r) => {
        let out = line(r, depth, top, tree);
        if (r.ch.length && isOpen(r)) {
          const known = r.ch.reduce((a, x) => a + (x.v || 0), 0);
          const scale = Math.max(r.v || 0, known, 1e-9);
          out += `<div class="dv-kids">${rowsHtml(r.ch, depth + 1, scale)}`;
          const other = (r.v || 0) - known;
          if (r.id && other > 0.005) out += `<div class="dv-rest" style="--dv-d:${depth + 1}" title="Coût du groupe moins la somme de ses appareils">Autres (non mesuré) : <b>${euroSmall(other)}</b> (${fmt((other / scale) * 100, 0)} %)</div>`;
          out += `</div>`;
        }
        return out;
      }).join("") + (hidden ? `<div class="dv-zero" style="--dv-d:${depth}">+ ${hidden} à 0 € sur la période</div>` : "");
    };
    const section = (title, list, rest) => {
      const rows = build(list, `${title}:`);
      if (!rows.length) return "";
      const sum = rows.reduce((a, r) => a + (r.v || 0), 0);
      return `<div class="dv-sec">
        <div class="chart-h"><span>${title}</span><span>${euroSmall(sum)}</span></div>
        ${rowsHtml(rows, 0)}
        ${rest > 0.005 ? `<div class="dv-rest" title="Coût énergie de la période moins la somme des circuits">Non mesuré par les circuits : <b>${euroSmall(rest)}</b>${energy > 0 ? ` (${fmt((rest / energy) * 100, 0)} %)` : ""}</div>` : ""}
      </div>`;
    };
    // Un circuit sans capteur qui ne fait que regrouper des appareils compte pour la somme de ses enfants
    const costOf = (d) => { const id = pick(d, period); return id && this._state(id) ? this._num(id) || 0 : kidsOf(d).reduce((a, x) => a + costOf(x), 0); };
    const circuitSum = lists.circuits.reduce((a, d) => a + costOf(d), 0);
    const rest = energy !== null && lists.circuits.length ? energy - circuitSum : 0;
    const secs = section("Circuits", lists.circuits, rest) + section("Appareils", lists.devices, 0);

    const tabs = `<div class="dv-tabs">${DEV_PERIODS.map((p) => `<button data-tab="${p.key}" class="${p.key === period.key ? "on" : ""}">${p.label}</button>`).join("")}</div>`;
    const note = lists.circuits.length && lists.devices.length
      ? `<footer>Les appareils sont déjà comptés dans leur circuit : ne pas additionner les deux listes.</footer>`
      : `<div style="height:12px"></div>`;

    this.shadowRoot.innerHTML = `${STYLE}${DEV_STYLE}<ha-card class="${themeClass(c.theme, this._hass)}">
      <header>
        <div class="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true"><path class="house" d="M4 14.5 16 4l12 10.5V27a1.5 1.5 0 0 1-1.5 1.5h-5M10.5 28.5h-5A1.5 1.5 0 0 1 4 27V14.5"/><path class="bolt" d="M17.5 9 11 18h4.5l-1.5 8 7-10h-4.6z"/></svg>
          <div><div class="title">${esc(c.title)}</div><div class="sub">Coûts au tarif en cours</div></div>
        </div>
        <div class="tempo">${pills}</div>
      </header>
      ${tiles ? `<div class="tiles dv-tiles">${tiles}</div>` : ""}
      ${split}
      ${secs ? tabs + secs : `<div class="empty">Aucun capteur de coût trouvé<span>Ajoutez des capteurs sensor.cout_&lt;appareil&gt;_jour / _mois / _cycle, ou listez-les dans circuits: et devices: (voir le README).</span></div>`}
      ${note}
    </ha-card>`;
  }
}

const DEV_STYLE = `<style>
.dv-tiles { grid-template-columns: repeat(3, 1fr) !important; }
.dv-tiles .tile { cursor: pointer; }
.dv-tiles .tile.sel { border-color: var(--med-accent, var(--med-blue)); background: var(--med-surface); }
.dv-tiles .tile-v { font-size: 1.2rem; }
.split.dv { margin: 12px 12px 0; }
.split.dv .chart-h { margin: 0 2px 6px; }
.bar .s-blue.s-HC { background: #8fb0f0; } .bar .s-blue.s-HP { background: var(--t-blue); }
.bar .s-white.s-HC { background: #f2f5f9; } .bar .s-white.s-HP { background: #aab3c0; }
.bar .s-red.s-HC { background: #f39a9a; } .bar .s-red.s-HP { background: var(--t-red); }
.dv-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .74rem; color: var(--med-muted); margin-top: 6px; }
.dv-leg span { display: inline-flex; align-items: center; gap: 5px; }
.dv-leg b { color: var(--med-text); font-weight: 600; }
.dv-leg i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.dv-leg .s-blue.s-HC { background: #8fb0f0; } .dv-leg .s-blue.s-HP { background: var(--t-blue); }
.dv-leg .s-white.s-HC { background: #f2f5f9; } .dv-leg .s-white.s-HP { background: #aab3c0; }
.dv-leg .s-red.s-HC { background: #f39a9a; } .dv-leg .s-red.s-HP { background: var(--t-red); }
.dv-tabs { display: flex; gap: 4px; margin: 14px 12px 0; padding: 3px; border-radius: 10px; background: var(--med-surface); border: 1px solid var(--med-line); }
.dv-tabs button { flex: 1; border: 0; background: none; color: var(--med-muted); font: inherit; font-size: .8rem; padding: 6px 0; border-radius: 8px; cursor: pointer; }
.dv-tabs button.on { background: var(--med-accent, var(--med-blue)); color: var(--med-on-accent, #fff); font-weight: 600; }
.dv-sec { margin: 12px 12px 0; }
.dv-sec .chart-h { margin: 0 2px 4px; }
.dv-row { display: flex; align-items: center; gap: 10px; padding: 6px 4px; border-radius: 10px; cursor: pointer; }
.dv-row:hover { background: var(--med-surface); }
.dv-row ha-icon { --mdc-icon-size: 20px; color: var(--med-muted); flex: none; }
.dv-main { flex: 1; min-width: 0; }
.dv-top { display: flex; align-items: baseline; gap: 8px; font-size: .86rem; }
.dv-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-p { font-size: .72rem; color: var(--med-muted); }
.dv-p.on { color: var(--med-green); }
.dv-v { font-weight: 700; min-width: 64px; text-align: right; }
.dv-bar { height: 5px; border-radius: 4px; background: var(--med-line); margin-top: 4px; overflow: hidden; }
.dv-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--med-blue), var(--med-green)); }
.dv-row.sub { padding-left: 10px; }
.dv-row.sub ha-icon { --mdc-icon-size: 18px; }
.dv-row.sub .dv-top { font-size: .82rem; }
.dv-row.sub .dv-bar { height: 4px; }
.dv-row.sub .dv-bar i { background: linear-gradient(90deg, var(--med-blue), color-mix(in srgb, var(--med-blue) 45%, var(--med-green))); }
.dv-tg { all: unset; flex: none; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; cursor: pointer; margin-right: -4px; }
.dv-tg:hover { background: var(--med-line); }
.dv-tg:focus-visible { outline: 2px solid var(--med-accent, var(--med-blue)); }
.dv-tg ha-icon { --mdc-icon-size: 18px !important; color: var(--med-muted); transition: transform .15s; }
.dv-tg.open ha-icon { transform: rotate(90deg); }
.dv-tg.sp { cursor: default; } .dv-tg.sp:hover { background: none; }
.dv-k { font-size: .68rem; color: var(--med-muted); border: 1px solid var(--med-line); border-radius: 999px; padding: 0 6px; }
.dv-kids { border-left: 1px dashed var(--med-line); margin-left: 15px; }
.dv-rest { font-size: .76rem; color: var(--med-muted); padding: 4px 4px 0 34px; }
.dv-rest b { color: var(--med-text); }
.dv-zero { font-size: .74rem; color: var(--med-muted); padding: 2px 4px 0 34px; }
ha-card.light .dv-tabs button.on { background: var(--med-accent, var(--med-blue)); }
ha-card.light .bar .s-white.s-HC, ha-card.light .dv-leg .s-white.s-HC { background: #dbe2ec; }
@container (max-width: 380px) { .dv-tiles { grid-template-columns: 1fr !important; } }
</style>`;

/* ------------------------------------------------------------------ style */

const STYLE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55;
  --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-green: #96d21f; --med-blue: #1d93e3;
  --med-hc: #4a7bd8; --med-hp: #d27333;
  --t-blue: #3f7ff0; --t-white: #e9eef4; --t-red: #ee4a4a;
  --med-up: #f08a4b; --med-down: #5fcf8a;
}
ha-card { background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line);
  border-radius: 18px; overflow: hidden; font-variant-numeric: tabular-nums; container-type: inline-size; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand svg { width: 34px; height: 34px; fill: none; }
.brand .house { stroke: var(--med-green); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.brand .bolt { fill: var(--med-blue); }
.title { font-size: 1.15rem; font-weight: 700; letter-spacing: .2px; }
.sub { font-size: .78rem; color: var(--med-muted); }
.tempo { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; white-space: nowrap;
  background: var(--med-surface); border: 1px solid var(--med-line); font-size: .78rem; }
.pill-l { color: var(--med-muted); }
.pill-v { font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--med-muted); flex: none; }
.t-blue .dot { background: var(--t-blue); } .t-white .dot { background: var(--t-white); } .t-red .dot { background: var(--t-red); }
.t-none .pill-v { color: var(--med-muted); font-weight: 400; }
.quotas { display: flex; align-items: center; gap: 14px; padding: 0 18px 10px; font-size: .82rem; }
.quota { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
.quota small { color: var(--med-muted); font-weight: 400; }
.quota-l { color: var(--med-muted); }

.hero { margin: 4px 12px 0; padding: 16px; border-radius: 14px; background: var(--med-surface);
  border: 1px solid var(--med-line); display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; }
.hero-l { color: var(--med-muted); font-size: .85rem; }
.hero-v { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
.hero-v span, .tile-v span { font-size: .9rem; font-weight: 500; color: var(--med-muted); margin-left: 4px; }
.hero-r { text-align: right; align-self: center; }
.cost { font-size: 1.6rem; font-weight: 700; color: var(--med-green); }
.cost.none { color: var(--med-muted); }
.cost.est { color: var(--med-text); opacity: .85; }
.hero-p { font-size: .75rem; color: var(--med-muted); margin-top: 6px; }
.cost-l { font-size: .75rem; color: var(--med-muted); max-width: 160px; }
.evo { font-size: .8rem; font-weight: 600; margin-top: 2px; }
.evo.up { color: var(--med-up); } .evo.down { color: var(--med-down); }
.split { grid-column: 1 / -1; margin-top: 6px; }
.split.wait { font-size: .8rem; color: var(--med-muted); border-top: 1px dashed var(--med-line); padding-top: 8px; }
.bar { display: flex; height: 8px; border-radius: 6px; overflow: hidden; background: var(--med-line); }
.bar i { display: block; } .bar .hc { background: var(--med-hc); } .bar .hp { background: var(--med-hp); }
.split-l { display: flex; justify-content: space-between; font-size: .78rem; margin-top: 6px; }
.k-hc { color: #8fb0f0; } .k-hp { color: #eaa070; }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 12px 0; }
@container (min-width: 620px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
@container (min-width: 620px) { .tiles.six { grid-template-columns: repeat(3, 1fr); } }
.tile { padding: 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.tile-l { font-size: .78rem; color: var(--med-muted); }
.tile-v { font-size: 1.35rem; font-weight: 700; margin-top: 2px; }
.tile-n { font-size: .72rem; color: var(--med-muted); margin-top: 4px; }

.chart { margin: 14px 12px 0; }
.chart-h { display: flex; justify-content: space-between; font-size: .82rem; color: var(--med-muted); margin: 0 4px 6px; }
.legend { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-left: 6px; }
.legend .k-hc { background: var(--med-hc); } .legend .k-hp { background: var(--med-hp); }
.chart svg { width: 100%; height: 130px; display: block; }
.chart rect.hc { fill: var(--med-hc); } .chart rect.hp { fill: var(--med-hp); }
.chart rect.partial { fill: var(--med-muted); opacity: .35; }
.chart g.est { opacity: .45; }
.chart rect.sel { fill: rgba(255,255,255,.06); }
.chart rect.hit { fill: transparent; cursor: pointer; }
.days { display: grid; margin-top: 4px; }
.day { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 0; border-radius: 8px; font-size: .68rem; color: var(--med-muted); text-transform: capitalize; }
.day b { color: var(--med-text); font-size: .78rem; }
.day .dot { width: 6px; height: 6px; margin-top: 2px; }
.day.on { background: var(--med-surface); }
.day:focus-visible { outline: 2px solid var(--med-accent, var(--med-blue)); }

.detail { margin: 8px 12px 0; padding: 10px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.detail-h { display: flex; align-items: center; gap: 8px; font-size: .8rem; color: var(--med-muted); }
.tag { padding: 1px 8px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #0f1724; }
.tag.t-blue { background: var(--t-blue); color: #fff; } .tag.t-white { background: var(--t-white); } .tag.t-red { background: var(--t-red); color: #fff; }
.detail-v { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; font-size: .9rem; }
.sep { width: 1px; height: 12px; background: var(--med-line); }
.detail-p { font-size: .78rem; color: var(--med-muted); margin-top: 4px; }
.warn { color: var(--t-red); font-style: normal; font-weight: 600; }

.power { margin: 10px 12px 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.power.is-over { border-color: var(--t-red); }
.power-t { display: flex; justify-content: space-between; font-size: .85rem; }
.gauge { height: 6px; border-radius: 6px; background: var(--med-line); margin: 8px 0 6px; overflow: hidden; }
.gauge i { display: block; height: 100%; background: linear-gradient(90deg, var(--med-green), var(--med-blue)); }
.is-over .gauge i { background: var(--t-red); }
.power-n { font-size: .75rem; color: var(--med-muted); }

.eco { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--med-line); font-size: .82rem; display: flex; align-items: center; gap: 8px; }
.eco.e-ok .dot { background: var(--med-down); }
.eco.e-warn { border-color: #f0a33a; } .eco.e-warn .dot { background: #f0a33a; }
.eco.e-alert { border-color: var(--t-red); } .eco.e-alert .dot { background: var(--t-red); }
.eco-l { color: var(--med-muted); }
footer { padding: 10px 18px 14px; font-size: .7rem; color: var(--med-muted); }
.empty { padding: 18px; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
.empty span { color: var(--med-muted); }
/* Thème Home Assistant : fond, textes et bordures suivent le thème clair ou sombre */
ha-card.th-ha {
  --med-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 5%, transparent);
  --med-line: var(--divider-color, rgba(127, 127, 127, .25));
  --med-text: var(--primary-text-color, #1f2937);
  --med-muted: var(--secondary-text-color, #6b7280);
  /* sélection (onglet actif, tuile choisie, focus) : couleur principale du thème */
  --med-accent: var(--primary-color, #1d93e3);
  --med-on-accent: var(--text-primary-color, #fff);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card.th-ha.light { --med-green: #4c8a0b; --med-up: #c2560f; --med-down: #1d8a4b; }
/* Style MyElectricalData en version claire (theme: auto quand Home Assistant est en mode clair) */
ha-card.th-v2.light {
  --med-bg: #ffffff; --med-surface: #f2f5f9; --med-line: #dbe2ec;
  --med-text: #1a2434; --med-muted: #5b6b82;
  --med-green: #4c8a0b; --med-blue: #1673b8; --med-up: #c2560f; --med-down: #1d8a4b;
  box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
ha-card.light .k-hc { color: #2f5fb8; }
ha-card.light .k-hp { color: #b35619; }
ha-card.light .t-white .dot, ha-card.light .tag.t-white { box-shadow: inset 0 0 0 1px #aab3c0; }
ha-card.light .chart rect.sel { fill: rgba(0, 0, 0, .05); }
ha-card.light .tag.t-white { color: #1f2937; }
@media (max-width: 420px) { .hero-v { font-size: 2rem; } .tempo { width: 100%; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>`;

/* ----------------------------------------------------------------- éditeur */

const THEME_SELECT = {
  name: "theme",
  selector: {
    select: {
      mode: "dropdown",
      options: [
        { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
        { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
        { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
      ],
    },
  },
};

/** Éditeur visuel : formulaire Home Assistant construit à partir du schéma. */
function makeEditor(schema, labels, defaults) {
  const hasDays = schema.some((s) => s.name === "days");
  return class extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._draw();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
      else this._draw();
    }

    _draw() {
      if (!this._hass || !this._config) return;
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          const v = { ...ev.detail.value };
          if (hasDays && v.days !== undefined) v.days = Number(v.days);
          this._config = v;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = schema;
      this._form.data = hasDays
        ? { ...defaults, ...this._config, days: String(this._config.days || defaults.days) }
        : { ...defaults, ...this._config };
    }
  };
}

const DEV_SCHEMA = [
  { name: "title", selector: { text: {} } },
  {
    name: "period",
    selector: { select: { mode: "dropdown", options: [{ value: "jour", label: "Jour" }, { value: "mois", label: "Mois" }, { value: "cycle", label: "Cycle" }] } },
  },
  { name: "tarif", selector: { entity: { domain: "sensor" } } },
  { name: "price", selector: { entity: { domain: "sensor" } } },
  { name: "power", selector: { entity: { domain: "sensor" } } },
  { name: "cost_day", selector: { entity: { domain: "sensor" } } },
  { name: "cost_month", selector: { entity: { domain: "sensor" } } },
  { name: "cost_cycle", selector: { entity: { domain: "sensor" } } },
  { name: "energy_day", selector: { entity: { domain: "sensor" } } },
  { name: "energy_month", selector: { entity: { domain: "sensor" } } },
  { name: "energy_cycle", selector: { entity: { domain: "sensor" } } },
  { name: "show_split", selector: { boolean: {} } },
  { name: "kwh_prefix", selector: { text: {} } },
  { name: "show_zero", selector: { boolean: {} } },
  { name: "expanded", selector: { boolean: {} } },
  THEME_SELECT,
];
const DEV_LABELS = {
  title: "Titre",
  period: "Période affichée à l'ouverture",
  tarif: "Poste Tempo en cours (ex. « HP BLEU »)",
  price: "Prix du kWh en cours",
  power: "Puissance instantanée du logement",
  cost_day: "Coût total aujourd'hui (abonnement compris)",
  cost_month: "Coût total du mois",
  cost_cycle: "Coût total du cycle de facturation",
  energy_day: "Coût énergie aujourd'hui",
  energy_month: "Coût énergie du mois",
  energy_cycle: "Coût énergie du cycle",
  show_split: "Afficher l'énergie du mois par poste Tempo",
  kwh_prefix: "Préfixe des capteurs <couleur>_<hc|hp>_energie_ce_mois",
  show_zero: "Afficher les appareils à 0 €",
  expanded: "Groupes dépliés à l'ouverture (circuits contenant des appareils)",
  theme: "Couleurs de la carte",
};
const LinkyAppareilsCardEditor = makeEditor(DEV_SCHEMA, DEV_LABELS, DEV_DEFAULTS);

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("linky-appareils-card", LinkyAppareilsCard);
  define("linky-appareils-card-editor", LinkyAppareilsCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "linky-appareils-card")) {
    window.customCards.push({
      type: "linky-appareils-card",
      name: "Carte Linky Appareils",
      description: "Coûts par circuit et par appareil (jour, mois, cycle), prix du kWh et poste Tempo en cours.",
      preview: true,
    });
  }
  console.info(`%c LINKY-APPAREILS-CARD %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}
})();
