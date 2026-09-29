/**
 * @file activites.js — Module Activités : événements, frais, paiements et calendrier.
 *
 * Ce que contient ce fichier
 * --------------------------
 * Le plus gros module de l'application (951 lignes), et le seul qui regroupe
 * plusieurs écrans dans un même fichier :
 *   - un hub d'activités, avec recherche et filtre sur les archives ;
 *   - le formulaire de création et de modification d'une activité ;
 *   - la fiche détaillée d'une activité (participants, frais, paiements) ;
 *   - le formulaire de frais et les écrans de paiement échelonné ;
 *   - le calendrier, en trois vues : mois, semaine, jour.
 *
 * Ce que cela permet à l'utilisateur
 * -----------------------------------
 * Organiser une sortie, une reunion ou un voyage : on décrit l'événement
 * (date, lieu, heure, responsable), on le découpe en frais distincts
 * (« Participation », « Transport », « Repas »), puis on encaisse chaque
 * membre en plusieurs fois s'il le souhaite. L'historique de chaque encaissement
 * est conservé, ce qui permet de relancer qui n'a pas fini de payer.
 *
 * Avec quoi ce module communique
 * ------------------------------
 * EN ENTRÉE : quatre tables, lues presque toutes via des fonctions de db.js
 *   (`listesAll`, `listeFrais`, `listePaiementsListe`, `listMembres`).
 *   Plus la session active et les fonctions utilitaires globales
 *   (`fmt`, `fmtDate`, `esc`, `isoToDate`, `todayISO`).
 * EN SORTIE : écrit dans `listes`, `liste_frais`, `liste_paiements`,
 *   `liste_membres`, et le journal d'activité `activity_log`. L'interface est
 *   reconstruite par Affectation de `app.innerHTML`, puis branchée.
 *
 * Choix de conception
 * -------------------
 * Une activité est un « conteneur » : elle ne porte pas de montant unique mais
 * une liste de `liste_frais`, et chaque membre a son propre historique dans
 * `liste_paiements`. C'est ce qui permet à un membre de payer 1000 F sur une
 * participation de 5000 F, en trois fois, sans que l'application ne perde la
 * trace des étapes intermédiaires. Voir docs/FLUX_METIER.md.
 */

// État de navigation et filtres des activités
// Ces variables portent l'état de l'interface entre deux rendus : la recherche
// en cours, le choix d'afficher ou non les archives, et la position dans le
// calendrier. Elles sont globales (et non passées en paramètre) parce que
// plusieurs fonctions distinctes doivent les lire et les modifier : le champ
// de recherche, le bouton « Archives » et les flèches du calendrier.
let listesQuery = "";
let listesShowArchivees = false;
let listeDetailQuery = "";

// Navigation du calendrier
// `calendrierVue` vaut "mois", "semaine" ou "jour" : c'est le même calendrier,
// affiché à trois niveaux de détail. `calendrierDateRef` est la date pivot
// (celle affichée, pas forcément celle sélectionnée) et
// `calendrierJourSelectionne` est le jour sur lequel l'utilisateur a cliqué.
// Les deux sont distincts : en vue « mois », on peut regarder novembre tout en
// gardant la sélection sur le 3 décembre.
let calendrierVue = "mois";
let calendrierDateRef = todayISO();
let calendrierJourSelectionne = todayISO();


// ============================================================================
// CALENDRIER (Vues Mois, Semaine, Jour)
// ============================================================================

/**
 * Calcule le libellé de la période temporelle affichée dans le calendrier.
 *
 * Objectif : produire le texte du bouton qui affiche la période en cours —
 * « Novembre 2026 », « 3 decembre 2026 », ou « 30 nov. - 6 dec. 2026 »
 * selon la vue active.
 *
 * @returns {string} Le libellé, déjà formaté en français.
 * @sideEffect Aucun. Ne modifie ni la date ni le DOM.
 *
 * Détail à comprendre : la ligne `const jSem = (lun.getDay() + 6) % 7;`
 * convertit le numéro de jour renvoyé par JavaScript en position dans une
 * semaine commençant au **lundi**.
 *
 *   - `getDay()` renvoie 0 pour dimanche, 1 pour lundi, ... 6 pour samedi.
 *     C'est une convention anglo-saxe, alors que l'année scolaire et
 *     professionnelle française commence le lundi.
 *   - Le `+ 6` décale tout d'un cran : dimanche (0) devient 6, lundi (1)
 *     devient 0, mardi (2) devient 1... et samedi (6) devient 5.
 *   - Le `% 7` ramène le dimanche de 6 à 6 : sans lui, dimanche vaudrait
 *     6 au lieu de 0 et la semaine serait décalée d'un jour.
 *
 * Après ce calcul, `jSem` vaut 0 si le jour est un lundi, et 6 s'il est un
 * dimanche : exactement le nombre de jours à reculer pour atteindre le lundi
 * de la semaine en cours. Le même calcul est repris dans `joursGrilleMois`.
 */
function calendrierLabelPeriode() {
  const d = isoToDate(calendrierDateRef);
  if (calendrierVue === "mois") return `${MOIS_NOMS[d.getMonth()]} ${d.getFullYear()}`;
  if (calendrierVue === "jour") {
    return `${d.getDate()} ${MOIS_NOMS[d.getMonth()]} ${d.getFullYear()}`;
  }
  const lun = new Date(d);
  const jSem = (lun.getDay() + 6) % 7;
  lun.setDate(lun.getDate() - jSem);
  const dim = new Date(lun);
  dim.setDate(dim.getDate() + 6);
  return `${lun.getDate()} ${MOIS_NOMS[lun.getMonth()].slice(0, 4)}. - ${dim.getDate()} ${MOIS_NOMS[dim.getMonth()].slice(0, 4)}. ${dim.getFullYear()}`;
}

/**
 * Décale la période du calendrier en avant ou en arrière.
 *
 * Objectif : réagir aux flèches « précédent » / « suivant » du calendrier.
 * Le pas dépend de la vue : un mois, une semaine, ou un jour.
 *
 * @param {number} direction - `-1` pour reculer, `+1` pour avancer. On passe
 *   un nombre et non un booléen parce que la même fonction sert aux deux
 *   flèches ; il ne faut donc pas deux fonctions quasi identiques.
 * @returns {void}
 * @sideEffect Oui. Modifie les variables globales `calendrierDateRef` (et
 *   `calendrierJourSelectionne` en vue « jour »), puis redessine le calendrier.
 *
 * Détail à comprendre : `d.setMonth(d.getMonth() + direction)` gère
 * automatiquement le passage d'un mois de 31 jours au suivant. Le 31 janvier
 * + 1 mois donne le 28 ou 29 février, sans code supplémentaire.
 *
 * Pourquoi la vue « jour » synchronise les deux dates : en vue jour, il n'y
 * a qu'une seule date affichée, donc avancer doit aussi déplacer la
 * sélection. Dans les autres vues, le jour sélectionné reste inchangé —
 * l'utilisateur parcourt des mois sans perdre le jour qu'il consultait.
 */
function calendrierNaviguer(direction) {
  const d = isoToDate(calendrierDateRef);
  if (calendrierVue === "mois") d.setMonth(d.getMonth() + direction);
  else if (calendrierVue === "semaine") d.setDate(d.getDate() + direction * 7);
  else d.setDate(d.getDate() + direction);

  calendrierDateRef = dateToIso(d);
  if (calendrierVue === "jour") {
    calendrierJourSelectionne = calendrierDateRef;
  }
  renderCalendrier();
}

/**
 * Calcule la grille de 42 jours (6 semaines fixes) pour l'affichage mensuel.
 * @param {string} dateISO
 * @returns {string[]} Tableau de 42 dates ISO.
 */
function joursGrilleMois(dateISO) {
  const ref = isoToDate(dateISO);
  const premierMois = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const shift = (premierMois.getDay() + 6) % 7;
  const premierGrille = new Date(premierMois);
  premierGrille.setDate(premierGrille.getDate() - shift);

  const jours = [];
  const cur = new Date(premierGrille);
  for (let i = 0; i < 42; i++) {
    jours.push(dateToIso(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return jours;
}

/**
 * Rendu principal du calendrier.
 */
async function renderCalendrier() {
  app.innerHTML = `
    <button class="btn-chip" id="calBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Calendrier</h2></div>
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${calendrierVue === "mois" ? "active" : ""}" id="cal_vue_mois">Mois</button>
      <button class="btn-chip ${calendrierVue === "semaine" ? "active" : ""}" id="cal_vue_semaine">Semaine</button>
      <button class="btn-chip ${calendrierVue === "jour" ? "active" : ""}" id="cal_vue_jour">Jour</button>
    </div>
    <div class="card" style="padding:12px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <button class="icon-btn" id="cal_prev" aria-label="Periode precedente">&larr;</button>
        <div style="text-align:center;">
          <div style="font-weight:700;font-size:14.5px;">${calendrierLabelPeriode()}</div>
          <button class="link" id="cal_today" style="margin-top:2px;">Aujourd'hui</button>
        </div>
        <button class="icon-btn" id="cal_next" aria-label="Periode suivante">&rarr;</button>
      </div>
      <div id="cal_body"></div>
    </div>
    <div id="cal_selection_details"></div>
  `;

  document.getElementById("calBackBtn").addEventListener("click", () => showTab("activites"));

  ["mois", "semaine", "jour"].forEach((v) => {
    document.getElementById(`cal_vue_${v}`).addEventListener("click", () => {
      calendrierVue = v;
      if (v === "jour") {
        calendrierDateRef = calendrierJourSelectionne;
      }
      renderCalendrier();
    });
  });

  document.getElementById("cal_prev").addEventListener("click", () => calendrierNaviguer(-1));
  document.getElementById("cal_next").addEventListener("click", () => calendrierNaviguer(1));
  document.getElementById("cal_today").addEventListener("click", () => {
    calendrierDateRef = todayISO();
    calendrierJourSelectionne = todayISO();
    renderCalendrier();
  });

  if (calendrierVue === "mois") await renderCalendrierMois();
  else await renderCalendrierAgenda();
}

/**
 * Vue mensuelle du calendrier sous forme de grille 7x6.
 */
async function renderCalendrierMois() {
  const jours = joursGrilleMois(calendrierDateRef);
  const debutISO = jours[0];
  const finISO = jours[jours.length - 1];
  const evenements = await evenementsEntreDates(debutISO, finISO);

  const parJour = {};
  for (const evt of evenements) {
    if (!parJour[evt.date]) parJour[evt.date] = [];
    parJour[evt.date].push(evt);
  }

  const moisCourant = isoToDate(calendrierDateRef).getMonth();
  const today = todayISO();

  const calBody = document.getElementById("cal_body");
  if (!calBody) return;

  const headerHTML = `<div class="cal-grid-header"><div>Lun</div><div>Mar</div><div>Mer</div><div>Jeu</div><div>Ven</div><div>Sam</div><div>Dim</div></div>`;

  const cellsHTML = jours.map((iso) => {
    const d = isoToDate(iso);
    const estAutreMois = d.getMonth() !== moisCourant;
    const estToday = iso === today;
    const evts = parJour[iso] || [];

    const classes = [
      "cal-day",
      estAutreMois ? "cal-day-autre-mois" : "",
      estToday ? "cal-day-today" : "",
      iso === calendrierJourSelectionne ? "cal-day-selected" : "",
    ].filter(Boolean).join(" ");

    const dotsHTML = evts.slice(0, 3).map((e) => {
      const color = e.type === "activite" ? "var(--accent)" : "var(--warning)";
      return `<span class="cal-dot" style="background:${color};"></span>`;
    }).join("");

    const plusHTML = evts.length > 3 ? `<span class="cal-day-more">+${evts.length - 3}</span>` : "";

    return `<button type="button" class="${classes}" data-jour="${iso}">
      <span class="cal-day-num">${d.getDate()}</span>
      <div class="cal-day-dots">${dotsHTML}${plusHTML}</div>
    </button>`;
  }).join("");

  calBody.innerHTML = `${headerHTML}<div class="cal-grid">${cellsHTML}</div>`;

  calBody.querySelectorAll(".cal-day").forEach((el) => {
    el.addEventListener("click", () => {
      calendrierJourSelectionne = /** @type {HTMLElement} */ (el).dataset.jour;
      renderCalendrierMois();
    });
  });

  const evtsSelection = parJour[calendrierJourSelectionne] || [];
  const detBox = document.getElementById("cal_selection_details");
  if (!detBox) return;

  detBox.innerHTML = `
    <div class="section-title" style="margin-top:18px;">
      <h2>${calendrierJourSelectionne === today ? "Aujourd'hui" : fmtDate(calendrierJourSelectionne)}</h2>
    </div>
    <div class="card list-card" style="margin-bottom:20px;">
      ${evenementsListHTML(evtsSelection)}
    </div>`;

  wireEvenementsClick(detBox);
}

/**
 * Vue agenda (semaine ou jour) du calendrier.
 */
async function renderCalendrierAgenda() {
  const d = isoToDate(calendrierDateRef);
  let debutISO, finISO;

  if (calendrierVue === "jour") {
    debutISO = finISO = calendrierDateRef;
  } else {
    const lun = new Date(d);
    const jSem = (lun.getDay() + 6) % 7;
    lun.setDate(lun.getDate() - jSem);
    debutISO = dateToIso(lun);
    const dim = new Date(lun);
    dim.setDate(dim.getDate() + 6);
    finISO = dateToIso(dim);
  }

  const evenements = await evenementsEntreDates(debutISO, finISO);
  const parJour = {};
  for (const evt of evenements) {
    if (!parJour[evt.date]) parJour[evt.date] = [];
    parJour[evt.date].push(evt);
  }

  const calBody = document.getElementById("cal_body");
  if (!calBody) return;

  const datesAffichees = [];
  const cur = isoToDate(debutISO);
  const finDate = isoToDate(finISO);

  while (cur <= finDate) {
    datesAffichees.push(dateToIso(cur));
    cur.setDate(cur.getDate() + 1);
  }

  const today = todayISO();
  calBody.innerHTML = datesAffichees.map((iso) => {
    const evts = parJour[iso] || [];
    const dt = isoToDate(iso);
    const estToday = iso === today;

    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:${estToday ? "var(--accent)" : "var(--text-2)"};margin-bottom:6px;">
          ${dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <div class="card list-card">${evenementsListHTML(evts)}</div>
      </div>`;
  }).join("");

  wireEvenementsClick(calBody);
}

/**
 * Construit la liste HTML des événements pour une date donnée.
 * @param {any[]} evts
 * @returns {string}
 */
function evenementsListHTML(evts) {
  if (!evts || !evts.length) return emptyHTML("Aucun evenement ce jour-la.");

  return evts.map((e) => {
    if (e.type === "activite") {
      const l = e.liste;
      const statutEvt = getStatutActivite(l);
      const heureLieu = [l.heure ? esc(l.heure) : "", l.lieu ? esc(l.lieu) : ""].filter(Boolean).join(" &middot; ");

      return `
        <div class="row" data-evt-type="activite" data-id="${l.id}">
          <div class="info">
            <div class="name">${esc(l.nom)} <span class="badge ${STATUT_ACTIVITE_BADGE[statutEvt]}" style="margin-left:4px;">${STATUT_ACTIVITE_LABEL[statutEvt]}</span></div>
            <div class="meta">${heureLieu || "Activite"}</div>
          </div>
        </div>`;
    }

    const m = e.membre;
    return `
      <div class="row" data-evt-type="anniversaire" data-id="${m.id}">
        <div class="avatar" style="background:var(--bg-warning);color:var(--warning);">${initials(m)}</div>
        <div class="info">
          <div class="name">Anniversaire de ${esc(fullName(m))}</div>
          <div class="meta">${esc(m.fonction || "Membre")}</div>
        </div>
      </div>`;
  }).join("");
}

/**
 * Connecte les événements de clic sur les listes d'événements du calendrier.
 * @param {HTMLElement} root
 */
function wireEvenementsClick(root) {
  root.querySelectorAll("[data-evt-type='activite']").forEach((el) => {
    el.addEventListener("click", () => {
      renderListes().then(() => openListeDetail(/** @type {HTMLElement} */ (el).dataset.id));
    });
  });

  root.querySelectorAll("[data-evt-type='anniversaire']").forEach((el) => {
    el.addEventListener("click", () => {
      openMemberDetail(/** @type {HTMLElement} */ (el).dataset.id);
    });
  });
}

// ============================================================================
// ACTIVITÉS PRINCIPALES
// ============================================================================

/**
 * Onglet Activités : regroupe les Listes/Activités et le Calendrier.
 */
async function renderActivites() {
  app.innerHTML = `
    <div class="section-title" style="margin-top:0;"><h2>Activites</h2></div>
    <div class="card list-card" id="activitesListesBox" style="margin-bottom:12px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg></span>
        <div class="info"><div class="name">Listes &amp; Activites</div><div class="meta">Sorties, reunions, camps, evenements...</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    <div class="card list-card" id="activitesDonsBox" style="margin-bottom:12px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v18M7 7h7.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H17"/></svg></span>
        <div class="info"><div class="name">Dons</div><div class="meta">Dons recus, rattaches ou non a une activite</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    <div class="card list-card" id="activitesCalendrierBox" style="margin-bottom:24px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v3M16 2v3M3 9h18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg></span>
        <div class="info"><div class="name">Calendrier</div><div class="meta">Vue mois, semaine et jour des activites et anniversaires</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
  `;

  document.getElementById("activitesListesBox").addEventListener("click", renderListes);
  document.getElementById("activitesDonsBox").addEventListener("click", renderDons);
  document.getElementById("activitesCalendrierBox").addEventListener("click", renderCalendrier);
}

/**
 * Rendu de la liste principale des activités.
 */
async function renderListes() {
  app.innerHTML = `
    <button class="btn-chip" id="listesBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Mes listes / Activites</h2></div>
    <input class="search" id="listesSearch" placeholder="Rechercher une liste..." value="${esc(listesQuery)}" autocomplete="off">
    <div class="row" style="border:none;padding:6px 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!listesShowArchivees ? "active" : ""}" id="lst_filtre_actives">Actives</button>
      <button class="btn-chip ${listesShowArchivees ? "active" : ""}" id="lst_filtre_archivees">Archivees</button>
    </div>
    <div id="listesBox"></div>
    <div class="fab-zone"><button class="fab" id="addListeBtn" aria-label="Creer une activite"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
  `;

  document.getElementById("listesBackBtn").addEventListener("click", () => showTab("activites"));
  document.getElementById("listesSearch").addEventListener("input", (e) => {
    listesQuery = /** @type {HTMLInputElement} */ (e.target).value;
    renderListesList();
  });
  document.getElementById("addListeBtn").addEventListener("click", () => openListeForm());
  document.getElementById("lst_filtre_actives").addEventListener("click", () => {
    listesShowArchivees = false;
    renderListes();
  });
  document.getElementById("lst_filtre_archivees").addEventListener("click", () => {
    listesShowArchivees = true;
    renderListes();
  });

  await renderListesList();
}

/**
 * Rendu des cartes d'activités filtrées.
 */
async function renderListesList() {
  const q = listesQuery.trim().toLowerCase();
  const all = await listesAll({ archiveesSeulement: listesShowArchivees });
  const filtered = all.filter((l) => l.nom.toLowerCase().includes(q));
  const box = document.getElementById("listesBox");
  if (!box) return;

  if (filtered.length === 0) {
    box.innerHTML = emptyHTML(listesShowArchivees ? "Aucune activite archivee." : "Aucune activite. Cree la premiere avec le bouton +.");
    return;
  }

  const cardsHtml = await Promise.all(
    filtered.map(async (l) => {
      const membres = await membresDeListe(l.id);
      const frais = await listeFraisAll(l.id);
      const stats = frais.length ? await statistiquesActivite(l.id) : null;
      const fermee = !activiteEstOuverte(l);
      const statutEvt = getStatutActivite(l);
      const lieuHeure = [l.heure ? esc(l.heure) : "", l.lieu ? esc(l.lieu) : ""].filter(Boolean).join(" &middot; ");

      return `<div class="card liste-card" data-id="${l.id}">
        <div class="info">
          <div class="name">${esc(l.nom)} <span class="badge ${STATUT_ACTIVITE_BADGE[statutEvt]}" style="margin-left:4px;">${STATUT_ACTIVITE_LABEL[statutEvt]}</span>${fermee ? ` <span class="badge badge-no">Cloturee</span>` : ""}</div>
          <div class="meta">${fmtDate(l.date)} &middot; ${membres.length} participant${membres.length > 1 ? "s" : ""}</div>
          ${lieuHeure ? `<div class="meta">${lieuHeure}</div>` : ""}
        </div>
        ${l.description ? `<div class="small-note" style="margin-top:6px;">${esc(l.description)}</div>` : ""}
        ${
          stats && stats.montantAttendu > 0
            ? `<div style="margin-top:10px;">
                <div class="progress-bar" style="margin-bottom:6px;"><div class="progress-bar-fill ${stats.tauxPaiement >= 100 ? "success" : ""}" style="width:${Math.min(100, stats.tauxPaiement)}%;"></div></div>
                <div class="detail-row" style="border:none;padding:0;font-size:var(--text-caption);">
                  <span class="k">${fmt(stats.montantEncaisse)} collecte${stats.resteAEncaisser > 0 ? ` &middot; ${stats.payes}/${membres.length} payes` : ""}</span>
                  <span class="v" style="color:${stats.resteAEncaisser > 0 ? "var(--warning)" : "var(--success)"};">${stats.resteAEncaisser > 0 ? `Reste ${fmt(stats.resteAEncaisser)}` : "Complet"}</span>
                </div>
              </div>`
            : ""
        }
      </div>`;
    }),
  );

  box.innerHTML = cardsHtml.join("");
  box.querySelectorAll(".liste-card").forEach((el) =>
    el.addEventListener("click", () => openListeDetail(/** @type {HTMLElement} */ (el).dataset.id)),
  );
}

// ============================================================================
// GESTION DES ACTIVITÉS
// ============================================================================

/**
 * Formulaire de création et d'édition d'une activité.
 * @param {any} [liste=null]
 */
async function openListeForm(liste = null) {
  const isEdit = !!liste;
  const responsableOptionsHTML = await optionsMembresActifs(isEdit ? liste.id_responsable : null);
  const typeOptionsHTML = TYPE_ACTIVITE_KEYS.map((k) => {
    const selected = isEdit ? liste.type === k : k === "evenement";
    return `<option value="${k}"${selected ? " selected" : ""}>${TYPE_ACTIVITE_LABELS[k]}</option>`;
  }).join("");

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${isEdit ? "Modifier l'activite" : "Nouvelle activite"}</h3>
    <div class="field"><label for="l_nom">Nom</label><input id="l_nom" type="text" placeholder="Ex. Sortie jeunesse, Camp 2026..." value="${isEdit ? esc(liste.nom) : ""}"></div>
    <div class="field"><label for="l_desc">Description</label><input id="l_desc" type="text" placeholder="Facultatif" value="${isEdit ? esc(liste.description || "") : ""}"></div>
    <div class="field"><label for="l_type">Type</label><select id="l_type">${typeOptionsHTML}</select></div>
    <div class="field-row">
      <div class="field"><label for="l_date">Date de l'activite</label><input id="l_date" type="date" value="${isEdit ? liste.date : todayISO()}"></div>
      <div class="field"><label for="l_heure">Heure (facultatif)</label><input id="l_heure" type="time" value="${isEdit && liste.heure ? liste.heure : ""}"></div>
    </div>
    <div class="field"><label for="l_lieu">Lieu (facultatif)</label><input id="l_lieu" type="text" placeholder="Ex. Salle des fetes, Plage de..." value="${isEdit ? esc(liste.lieu || "") : ""}"></div>
    <div class="field-row">
      <div class="field"><label for="l_responsable">Responsable (facultatif)</label><select id="l_responsable">${responsableOptionsHTML}</select></div>
      <div class="field"><label for="l_budget">Budget previsionnel (facultatif)</label><input id="l_budget" type="number" min="0" placeholder="FCFA" value="${isEdit && liste.budget != null ? liste.budget : ""}"></div>
    </div>
    <div class="field"><label for="l_date_limite">Date limite (facultatif)</label><input id="l_date_limite" type="date" value="${isEdit && liste.date_limite ? liste.date_limite : ""}"></div>
    <div class="field"><label for="l_notes">Notes</label><input id="l_notes" type="text" placeholder="Facultatif" value="${isEdit ? esc(liste.notes || "") : ""}"></div>
    ${!isEdit ? `<div class="small-note">Les frais (participation, transport...) se configurent depuis la fiche de l'activite. Une activite sans frais sert a suivre des participants.</div>` : ""}
    <button class="btn btn-primary" id="l_save" style="margin-top:12px;">${isEdit ? "Enregistrer" : "Creer l'activite"}</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#l_save").addEventListener("click", async () => {
    const nomInput = /** @type {HTMLInputElement} */ (ov.querySelector("#l_nom"));
    const nom = nomInput ? nomInput.value.trim() : "";
    if (!nom) {
      toast("Le nom est obligatoire", "error");
      return;
    }

    const dateLimiteInput = /** @type {HTMLInputElement} */ (ov.querySelector("#l_date_limite"));
    const dateInput = /** @type {HTMLInputElement} */ (ov.querySelector("#l_date"));
    const dateLimite = dateLimiteInput ? dateLimiteInput.value || null : null;
    const date = dateInput ? dateInput.value || todayISO() : todayISO();

    if (dateLimite && dateLimite > date) {
      toast("La date limite doit etre avant ou le jour de l'activite", "error");
      return;
    }

    const patch = {
      nom,
      description: /** @type {HTMLInputElement} */ (ov.querySelector("#l_desc")).value.trim(),
      date,
      date_limite: dateLimite,
      notes: /** @type {HTMLInputElement} */ (ov.querySelector("#l_notes")).value.trim(),
      heure: /** @type {HTMLInputElement} */ (ov.querySelector("#l_heure")).value || null,
      lieu: /** @type {HTMLInputElement} */ (ov.querySelector("#l_lieu")).value.trim(),
      id_responsable: /** @type {HTMLSelectElement} */ (ov.querySelector("#l_responsable")).value || null,
      budget: Number(/** @type {HTMLInputElement} */ (ov.querySelector("#l_budget")).value) || null,
      type: /** @type {HTMLSelectElement} */ (ov.querySelector("#l_type")).value,
    };

    if (isEdit) {
      await modifierListe(liste.id, patch);
      closeSheet();
      toast("Activite modifiee");
      renderListeDetailSheet(liste.id);
    } else {
      const id = await creerListe(patch);
      closeSheet();
      toast("Activite creee");
      renderListes();
      setTimeout(() => openListeDetail(id), 200);
    }
  });
}

/**
 * Ouvre la fiche d'une activité.
 * @param {string} id
 */
async function openListeDetail(id) {
  listeDetailQuery = "";
  await renderListeDetailSheet(id);
}

/**
 * Construit la feuille de détail d'une activité.
 * @param {string} id
 */
async function renderListeDetailSheet(id) {
  const l = await db.listes.get(id);
  if (!l) return;

  const ouverte = activiteEstOuverte(l);
  const frais = await listeFraisAll(id);
  const statutEvt = getStatutActivite(l);
  const responsable = l.id_responsable ? await db.membres.get(l.id_responsable) : null;

  const infosPratiquesHTML = [
    l.heure ? `<div class="detail-row"><span class="k">Heure</span><span class="v">${esc(l.heure)}</span></div>` : "",
    l.lieu ? `<div class="detail-row"><span class="k">Lieu</span><span class="v">${esc(l.lieu)}</span></div>` : "",
    responsable ? `<div class="detail-row"><span class="k">Responsable</span><span class="v">${esc(fullName(responsable))}</span></div>` : "",
    l.budget != null ? `<div class="detail-row"><span class="k">Budget previsionnel</span><span class="v">${fmt(l.budget)}</span></div>` : "",
  ].join("");

  const html = `
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <div class="liste-detail-head" style="border-left:4px solid var(--accent);padding-left:12px;">
      <div>
        <h3 style="margin:0;">${esc(l.nom)}</h3>
        <div class="small-note" style="margin:2px 0 0;">${fmtDate(l.date)}${l.date_limite ? " &middot; Limite : " + fmtDate(l.date_limite) : ""}${l.archivee ? " &middot; Archivee" : ""}</div>
        <div style="margin-top:6px;"><span class="badge badge-no">${TYPE_ACTIVITE_LABELS[l.type] || TYPE_ACTIVITE_LABELS.evenement}</span> <span class="badge ${STATUT_ACTIVITE_BADGE[statutEvt]}">${STATUT_ACTIVITE_LABEL[statutEvt]}</span></div>
      </div>
    </div>
    ${!ouverte ? `<div class="cloture-banner"><span>Activite cloturee -- inscriptions fermees, paiements modifiables.</span></div>` : ""}
    ${l.description ? `<p class="small-note">${esc(l.description)}</p>` : ""}
    ${infosPratiquesHTML}

    <div id="ld_stats"></div>

    <div class="section-title" style="margin-top:6px;"><h2>Frais de l'activite</h2><button class="link" id="ld_add_frais">+ Ajouter</button></div>
    <div id="ld_frais"></div>
    ${!frais.length ? `<div class="small-note">Aucun frais defini : fonctionne comme une simple liste de participants.</div>` : ""}
    ${l.notes ? `<div class="detail-row"><span class="k">Notes</span><span class="v">${esc(l.notes)}</span></div>` : ""}

    <div class="section-title" style="margin-top:16px;"><h2>Dons</h2><button class="link" id="ld_add_don">+ Ajouter</button></div>
    <div id="ld_dons"></div>

    <div class="section-title" style="margin-top:16px;"><h2>Participants</h2></div>
    <div class="small-note" style="margin-bottom:6px;">${frais.length ? "Coche les membres concernes, puis les frais associes." : "Coche les membres participants."}</div>
    <input class="search" id="ld_search" placeholder="Filtrer la liste des membres..." value="${esc(listeDetailQuery)}" autocomplete="off">
    <div id="ld_members"></div>

    <div class="sheet-actions" style="margin-top:16px;">
      <button class="btn btn-ghost" id="ld_edit" style="margin-bottom:8px;">Modifier l'activite</button>
      <button class="btn btn-ghost" id="ld_export_pdf" style="margin-bottom:8px;">Exporter en PDF</button>
      <button class="btn btn-ghost" id="ld_cloture" style="margin-bottom:8px;">${ouverte ? "Cloturer l'activite" : "Reouvrir l'activite"}</button>
      <button class="btn btn-ghost" id="ld_duplicate" style="margin-bottom:8px;">Dupliquer cette activite</button>
      <button class="btn btn-ghost" id="ld_archive" style="margin-bottom:8px;">${l.archivee ? "Desarchiver" : "Archiver"}</button>
      <button class="btn btn-ghost" id="ld_delete" style="color:var(--danger);">Supprimer l'activite</button>
    </div>
  `;

  let ov;
  const already = sheetStack[sheetStack.length - 1];
  const isRefresh = already && already.dataset && already.dataset.listeId === id;

  if (isRefresh) {
    already.querySelector(".sheet").innerHTML = html;
    ov = already;
  } else {
    ov = openSheet(html);
    ov.dataset.listeId = id;
  }

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#ld_search").addEventListener("input", (e) => {
    listeDetailQuery = /** @type {HTMLInputElement} */ (e.target).value;
    refreshListeDetailBody(id);
  });

  ov.querySelector("#ld_edit").addEventListener("click", () => openListeForm(l));
  ov.querySelector("#ld_add_frais").addEventListener("click", () => openFraisForm(id));
  ov.querySelector("#ld_add_don").addEventListener("click", () =>
    openDonForm(id, null, () => renderDonsActivite(id, ov.querySelector("#ld_dons"))),
  );
  ov.querySelector("#ld_export_pdf").addEventListener("click", () => exportListePDF(id));

  ov.querySelector("#ld_cloture").addEventListener("click", async () => {
    await clotureActivite(id, ouverte);
    toast(ouverte ? "Activite cloturee" : "Activite reouverte");
    renderListeDetailSheet(id);
  });

  ov.querySelector("#ld_duplicate").addEventListener("click", async () => {
    const newId = await dupliquerListe(id);
    closeSheet();
    toast("Activite dupliquee");
    renderListes();
    setTimeout(() => openListeDetail(newId), 200);
  });

  ov.querySelector("#ld_archive").addEventListener("click", async () => {
    await archiverListe(id, !l.archivee);
    toast(l.archivee ? "Activite desarchivee" : "Activite archivee");
    closeSheet();
    renderListes();
  });

  ov.querySelector("#ld_delete").addEventListener("click", async () => {
    const ok = await confirmWithPassword("Cette suppression est definitive. Confirme avec le mot de passe administrateur.");
    if (!ok) return;
    await supprimerListe(id);
    closeSheet();
    toast("Activite supprimee");
    renderListes();
  });

  await refreshListeDetailBody(id);
}

/**
 * Rafraîchit les sous-zones dynamiques de la fiche sans perdre le focus de recherche.
 * @param {string} id
 */
async function refreshListeDetailBody(id) {
  const ov = sheetStack[sheetStack.length - 1];
  if (!ov || ov.dataset.listeId !== id) return;

  const l = await db.listes.get(id);
  if (!l) return;

  const ouverte = activiteEstOuverte(l);
  const frais = await listeFraisAll(id);
  const inscrits = await membresDeListe(id);
  const inscritsParId = Object.fromEntries(inscrits.map((m) => [m.id, m]));
  const q = listeDetailQuery.trim().toLowerCase();

  const infosParMembre = {};
  await Promise.all(
    inscrits.map(async (m) => {
      infosParMembre[m.id] = await infosParticipantActivite(id, m.id);
    }),
  );

  // Statistiques financières
  const statsBox = ov.querySelector("#ld_stats");
  if (statsBox) {
    const valeurs = Object.values(infosParMembre);
    const payes = valeurs.filter((i) => i.statut === "paye").length;
    const partiels = valeurs.filter((i) => i.statut === "partiel").length;
    const totalAttendu = valeurs.reduce((a, i) => a + i.attendu, 0);
    const totalRecu = valeurs.reduce((a, i) => a + i.paye, 0);
    const reste = Math.max(0, totalAttendu - totalRecu);
    const pct = totalAttendu > 0 ? Math.min(100, Math.round((totalRecu / totalAttendu) * 100)) : 0;

    statsBox.innerHTML = `
      <div class="activite-stats-grid">
        <div class="activite-stat"><div class="lbl">Total inscrits</div><div class="val">${inscrits.length}</div></div>
        ${frais.length ? `
          <div class="activite-stat"><div class="lbl">Payes</div><div class="val">${payes}</div></div>
          <div class="activite-stat"><div class="lbl">Partiels</div><div class="val">${partiels}</div></div>
          <div class="activite-stat"><div class="lbl">Total recu</div><div class="val">${fmt(totalRecu)}</div></div>` : ""}
      </div>
      ${
        frais.length && totalAttendu > 0
          ? `<div style="margin:10px 0 4px;">
              <div class="progress-bar" style="margin-bottom:6px;"><div class="progress-bar-fill ${pct >= 100 ? "success" : ""}" style="width:${pct}%;"></div></div>
              <div class="detail-row" style="border:none;padding:0;font-size:var(--text-caption);">
                <span class="k">${pct}% collecte</span>
                <span class="v" style="color:${reste > 0 ? "var(--warning)" : "var(--success)"};">${reste > 0 ? `Reste ${fmt(reste)}` : "Complet"}</span>
              </div>
            </div>`
          : ""
      }`;
  }

  // Liste des frais
  const fraisBox = ov.querySelector("#ld_frais");
  if (fraisBox) {
    fraisBox.innerHTML = frais.map((f) => `
      <div class="frais-chip" data-frais-id="${f.id}">
        <span class="name">${esc(f.libelle)}</span>
        <span class="amount">${fmt(f.montant)}</span>
        <div class="frais-chip-actions">
          <button class="link" data-edit-frais="${f.id}">Modifier</button>
          <button class="link link-danger" data-del-frais="${f.id}">Supprimer</button>
        </div>
      </div>`).join("");

    fraisBox.querySelectorAll("[data-edit-frais]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openFraisForm(id, frais.find((f) => f.id === /** @type {HTMLElement} */ (btn).dataset.editFrais)),
      ),
    );

    fraisBox.querySelectorAll("[data-del-frais]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await supprimerFraisListe(/** @type {HTMLElement} */ (btn).dataset.delFrais);
        toast("Frais supprime");
        renderListeDetailSheet(id);
      }),
    );
  }

  // Dons recus pour cette activite
  const donsBox = ov.querySelector("#ld_dons");
  if (donsBox) {
    await renderDonsActivite(id, donsBox);
  }

  // Tableau des participants
  const tousMembres = await listMembres();
  const filtres = tousMembres.filter((m) => fullName(m).toLowerCase().includes(q));
  filtres.sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "Actif" ? -1 : 1;
    return fullName(a).localeCompare(fullName(b));
  });

  const membersBox = ov.querySelector("#ld_members");
  membersBox.innerHTML = filtres.length
    ? filtres.map((m) => {
        const estInscrit = !!inscritsParId[m.id];
        const inscription = inscritsParId[m.id];
        const info = estInscrit ? infosParMembre[m.id] : null;
        const fraisChoisis = new Set((inscription && inscription.frais_choisis) || []);
        const peutCocher = ouverte || estInscrit;

        return `
          <div class="participant-form-row" data-membre="${m.id}">
            <label class="participe-check">
              <input type="checkbox" data-participe="${m.id}" ${estInscrit ? "checked" : ""} ${peutCocher ? "" : "disabled"}>
              <span class="name">${esc(fullName(m))}</span>
              ${m.statut === "Inactif" ? `<span class="tag-inactif">Inactif</span>` : ""}
            </label>
            ${frais.length ? `<div class="frais-inline-row">${frais.map((f) => `
              <label class="frais-inline">
                <input type="checkbox" data-frais="${m.id}|${f.id}" ${fraisChoisis.has(f.id) ? "checked" : ""} ${peutCocher ? "" : "disabled"}>
                ${esc(f.libelle)} <span class="amount">(${fmt(f.montant)})</span>
              </label>`).join("")}</div>` : ""}
            ${estInscrit && frais.length ? `
              <div class="small-note">Paye : <b>${fmt(info.paye)}</b> &middot; Reste : <b>${fmt(info.reste)}</b></div>
              <div class="participant-actions">
                <button class="btn-chip" data-payer="${m.id}">Enregistrer un paiement</button>
                ${info.historique.length ? `<button class="btn-chip" data-historique="${m.id}">Historique (${info.historique.length})</button>` : ""}
              </div>` : ""}
          </div>`;
      }).join("")
    : emptyHTML("Aucun membre ne correspond a cette recherche.");

  membersBox.querySelectorAll("[data-participe]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const mid = /** @type {HTMLInputElement} */ (cb).dataset.participe;
      if (/** @type {HTMLInputElement} */ (cb).checked) await ajouterMembreListe(id, mid);
      else await retirerMembreListe(id, mid);
      refreshListeDetailBody(id);
      renderListesList();
    }),
  );

  membersBox.querySelectorAll("[data-frais]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const [mid, fid] = /** @type {HTMLInputElement} */ (cb).dataset.frais.split("|");
      if (!inscritsParId[mid]) await ajouterMembreListe(id, mid);
      const inscription = inscritsParId[mid];
      const actuels = new Set((inscription && inscription.frais_choisis) || []);
      if (/** @type {HTMLInputElement} */ (cb).checked) actuels.add(fid);
      else actuels.delete(fid);
      await definirFraisChoisisMembre(id, mid, [...actuels]);
      refreshListeDetailBody(id);
    }),
  );

  membersBox.querySelectorAll("[data-payer]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openAjouterPaiementActivite(id, inscritsParId[/** @type {HTMLElement} */ (btn).dataset.payer]),
    ),
  );

  membersBox.querySelectorAll("[data-historique]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openHistoriquePaiementsActivite(id, inscritsParId[/** @type {HTMLElement} */ (btn).dataset.historique]),
    ),
  );
}

// ============================================================================
// FRAIS D'ACTIVITÉS
// ============================================================================

/**
 * Formulaire d'ajout ou de modification d'un poste de frais.
 * @param {string} idListe
 * @param {any} [fraisExistant]
 */
function openFraisForm(idListe, fraisExistant) {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${fraisExistant ? "Modifier le frais" : "Ajouter un frais"}</h3>
    <div class="field"><label for="fr_libelle">Libelle</label><input id="fr_libelle" type="text" placeholder="Ex. Participation, Transport, Repas..." value="${fraisExistant ? esc(fraisExistant.libelle) : ""}"></div>
    <div class="field"><label for="fr_montant">Montant (FCFA)</label><input id="fr_montant" type="number" min="0" value="${fraisExistant ? fraisExistant.montant : ""}"></div>
    ${fraisExistant ? `<div class="small-note">Changer le montant n'efface pas les paiements recus : seul le montant attendu futur change.</div>` : ""}
    <button class="btn btn-primary" id="fr_save" style="margin-top:12px;">Enregistrer</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#fr_save").addEventListener("click", async () => {
    const libelleInput = /** @type {HTMLInputElement} */ (ov.querySelector("#fr_libelle"));
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#fr_montant"));
    const libelle = libelleInput ? libelleInput.value : "";
    const montant = montantInput ? montantInput.value : "";

    try {
      if (fraisExistant) {
        await modifierFraisListe(fraisExistant.id, { libelle: libelle.trim(), montant });
      } else {
        await ajouterFraisListe(idListe, { libelle, montant });
      }
    } catch (err) {
      toast(err.message, "error");
      return;
    }

    closeSheet();
    toast(fraisExistant ? "Frais modifie" : "Frais ajoute");
    renderListeDetailSheet(idListe);
  });
}

// ============================================================================
// PAIEMENTS D'ACTIVITÉS
// ============================================================================

/**
 * Enregistre un nouveau versement pour un participant à une activité.
 *
 * @param {string} idListe
 * @param {any} membre
 */
async function openAjouterPaiementActivite(idListe, membre) {
  if (!membre) return;
  const info = await infosParticipantActivite(idListe, membre.id);

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Enregistrer un paiement</h3>
    <div class="small-note" style="margin-bottom:10px;">${esc(fullName(membre))} &middot; Reste a payer : <b>${fmt(info.reste)}</b></div>
    <div class="field"><label for="pa_montant">Montant verse (FCFA)</label><input id="pa_montant" type="number" min="1" value="${info.reste > 0 ? info.reste : ""}" placeholder="FCFA"></div>
    <div class="field"><label for="pa_com">Commentaire (facultatif)</label><input id="pa_com" type="text" placeholder="Ex. Paye par virement, especes..."></div>
    <button class="btn btn-primary" id="pa_save" style="margin-top:12px;">Valider le paiement</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#pa_save").addEventListener("click", async () => {
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#pa_montant"));
    const comInput = /** @type {HTMLInputElement} */ (ov.querySelector("#pa_com"));
    const montant = Number(montantInput ? montantInput.value : 0);

    if (!montant || montant <= 0) {
      toast("Indique un montant superieur a zero", "error");
      return;
    }

    try {
      await ajouterPaiementListeMembre(idListe, membre.id, {
        montant,
        commentaire: comInput ? comInput.value.trim() : "",
      });
      closeSheet();
      toast("Paiement enregistre");
      refreshListeDetailBody(idListe);
      renderListesList();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

/**
 * Affiche l'historique complet des versements d'un participant sur une activité.
 *
 * @param {string} idListe
 * @param {any} membre
 */
async function openHistoriquePaiementsActivite(idListe, membre) {
  if (!membre) return;
  const paiements = await historiquePaiementsListe(idListe, membre.id);

  const rows = paiements.map((p) => `
    <div class="paiement-histo-item">
      <div>
        <div style="font-weight:600;">${fmtDate(p.date)}${p.heure ? ` &middot; ${p.heure}` : ""}</div>
        ${p.commentaire ? `<div class="meta">${esc(p.commentaire)}</div>` : ""}
      </div>
      <div class="montant">+ ${fmt(p.montant)}</div>
    </div>`).join("") || emptyHTML("Aucun versement enregistre.");

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Historique des paiements</h3>
    <div class="small-note" style="margin-bottom:12px;">${esc(fullName(membre))}</div>
    <div style="margin-bottom:14px;">${rows}</div>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Génère le sélecteur <select> des membres actifs pour attribuer un responsable.
 * @param {string|null} selectedId
 * @returns {Promise<string>}
 */
async function optionsMembresActifs(selectedId) {
  const membresActifs = (await db.membres.where("statut").equals("Actif").toArray()).sort((a, b) =>
    fullName(a).localeCompare(fullName(b)),
  );

  return (
    `<option value="">Aucun</option>` +
    membresActifs.map((m) =>
      `<option value="${m.id}"${selectedId === m.id ? " selected" : ""}>${esc(fullName(m))}</option>`,
    ).join("")
  );
}
