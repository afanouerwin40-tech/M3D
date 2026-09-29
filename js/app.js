/**
 * @file app.js - Contrôleur principal et routeur de l'application M3D Gestion.
 * @description Coordonne les différentes vues (Accueil, Membres, Dimanches,
 * Dettes, Caisse, Activités, Calendrier), les graphiques Canvas 2D interactifs,
 * les fenêtres de saisie et la génération des exports PDF imprimables.
 */

// ============================================================================
// ÉLÉMENTS DOM CENTRAUX & ÉTAT LOCAL
// ============================================================================

/** @type {HTMLElement} Conteneur principal de l'application */
const app = document.getElementById("app-content");

// Filtres et tri des membres
let memberQuery = "";
let memberSort = "alpha";
let memberFilterFonction = "";
let memberFilterMois = "";
let memberFilterStatut = "";

// Filtres et sélection des dimanches
let dimancheQuery = "";
let dimancheShowArchives = false;

// ============================================================================
// GESTION DU TITRE DE SESSION DANS LA TOPBAR
// ============================================================================

/**
 * Met à jour dynamiquement l'indicateur de session active dans l'en-tête supérieur.
 *
 * @param {string} [nomSession] - Libellé de la session (ex: "Session 2026-2027").
 */
async function synchroniserSessionTopBar(nomSession) {
  const chip = document.querySelector(".session-chip");
  if (!chip) return;

  if (nomSession) {
    chip.textContent = nomSession.startsWith("Session") ? nomSession : `Session ${nomSession}`;
    return;
  }

  const sId = await getOrCreateSessionActive();
  const sessionObj = await db.sessions.get(sId);
  if (sessionObj && sessionObj.nom) {
    chip.textContent = sessionObj.nom.startsWith("Session") ? sessionObj.nom : `Session ${sessionObj.nom}`;
  }
}

// ============================================================================
// ROUTEUR D'ONGLETS & NAVIGATION PRINCIPALE
// ============================================================================

/**
 * Affiche l'onglet sélectionné et orchestre le rendu de son contrôleur de vue.
 *
 * @param {string} tab - Identifiant de l'onglet ("accueil", "membres", "dimanche", "finance", "activites").
 * @returns {Promise<void>}
 */
async function showTab(tab) {
  setCurrentTab(tab);

  // Mise à jour de l'état actif sur les boutons de navigation
  document.querySelectorAll(".tab").forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle("active", isActive);
    b.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  // Indicateur visuel temporaire pendant le chargement des données
  app.innerHTML = `<div class="skeleton-block" aria-hidden="true"></div><div class="skeleton-block" aria-hidden="true"></div>`;
  window.scrollTo(0, 0);

  try {
    if (tab === "accueil") await renderAccueil();
    else if (tab === "membres") await renderMembres();
    else if (tab === "dimanche") await renderDimanche();
    else if (tab === "finance") await renderFinance();
    else if (tab === "activites") await renderActivites();
  } catch (err) {
    console.error("Erreur lors du rendu de l'onglet :", err);
    app.innerHTML = `<div class="empty">Une erreur est survenue lors du chargement de cet écran.<br><span class="small-note">${esc(err.message)}</span></div>`;
  }
}

// ============================================================================
// ACCUEIL — TABLEAU DE BORD, KPI & GRAPHIQUES
// ============================================================================

/**
 * Rendu complet du tableau de bord d'accueil.
 * Exécute les requêtes de données en parallèle via Promise.all pour des performances optimales.
 */
async function renderAccueil() {
  const [
    membres,
    joursStats,
    dettesTotal,
    solde,
    prochains,
    listes,
    irreguliersIds,
    pretsEnAttenteArray,
    derniereSauvegarde,
    sessionId,
    membresMois,
    fluxMois,
    prochainesActs,
    depensesCat,
  ] = await Promise.all([
    listMembres(),
    joursAvecStats(),
    totalDettesImpayees(),
    caisseSolde(),
    prochainAnniversaire(),
    listesAll({ archiveesSeulement: false }),
    membresIrreguliers(),
    pretsMembres({ nonRembourseSeulement: true }),
    getParam("derniere_sauvegarde", null),
    getOrCreateSessionActive(),
    membresAnniversaireCeMoisRestants(new Date().getMonth() + 1),
    fluxCaisseMoisCourant(),
    prochainesActivites(5),
    depensesParCategorie(),
  ]);

  const participantsCount = await compterCotisants(sessionId);
  const now = new Date();
  const mois = now.getMonth() + 1;
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const aRelancer = await membresARelancer(irreguliersIds);

  // Alerte si la dernière sauvegarde dépasse 14 jours (ou si aucune n'a été effectuée)
  const joursDepuisSauvegarde = derniereSauvegarde
    ? Math.floor((now - new Date(derniereSauvegarde)) / 86400000)
    : null;
  const sauvegardeAlerte = joursDepuisSauvegarde === null || joursDepuisSauvegarde > 14;

  app.innerHTML = `
    <div class="search-wrap" style="position:relative;">
      <input class="search" id="globalSearch" placeholder="Rechercher un membre, une liste, une cotisation..." autocomplete="off">
      <div id="globalSearchResults" class="global-search-results"></div>
    </div>
    ${
      sauvegardeAlerte
        ? `<div class="alert alert--warning alert--clickable" id="backupWarnBox">
            <svg class="alert-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4M12 17h.01"/><path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
            <div class="alert-body">
              <div class="alert-title">${
                derniereSauvegarde
                  ? `Derniere sauvegarde il y a ${joursDepuisSauvegarde} jours`
                  : "Aucune sauvegarde n'a jamais ete faite"
              }</div>
              <div class="small-note" style="margin-top:2px;">Toutes les donnees ne vivent que sur cet appareil. Touche ici pour exporter une sauvegarde JSON.</div>
            </div>
          </div>`
        : ""
    }
    <div class="section-title" style="margin-top:0;"><h2>Aujourd'hui</h2></div>
    <div class="card list-card" id="aujourdhuiBox" style="margin-bottom:22px;"></div>

    <div class="section-title"><h2>Situation financiere</h2></div>
    <div class="financial-summary financial-summary--clickable" id="financeSummaryBox">
      <div class="financial-summary-total">
        <div class="label">Solde de la caisse</div>
        <div class="value ${solde >= 0 ? "positive" : "negative"}">${fmt(solde)}</div>
      </div>
      <div class="financial-summary-rows">
        <div class="detail-row"><span class="k">Recettes du mois</span><span class="v" style="color:var(--success);">+ ${fmt(fluxMois.recettesMois)}</span></div>
        <div class="detail-row"><span class="k">Depenses du mois</span><span class="v" style="color:var(--danger);">− ${fmt(fluxMois.depensesMois)}</span></div>
        <div class="detail-row"><span class="k" style="color:var(--warning);">Dettes impayees</span><span class="v" style="color:var(--warning);">${fmt(dettesTotal)}</span></div>
      </div>
    </div>

    <div class="section-title"><h2>Activite</h2><button class="link" id="kpiListes">${listes.length} liste${listes.length > 1 ? "s" : ""}</button></div>
    <div class="card list-card" id="prochainesActsBox" style="margin-bottom:22px;"></div>

    <div class="section-title"><h2>Membres</h2></div>
    <div class="stat-card-grid" style="margin-bottom:18px;">
      <div class="stat-card"><div class="stat-card-body"><div class="stat-card-label">Membres</div><div class="stat-card-value">${membres.length}</div></div></div>
      <div class="stat-card"><div class="stat-card-body"><div class="stat-card-label">Cotisants</div><div class="stat-card-value">${participantsCount}</div></div></div>
    </div>

    <div class="section-title" style="margin-top:0;"><h2>Anniversaires de ${MOIS_NOMS[mois - 1]}</h2></div>
    <div class="card list-card" id="moisBox" style="margin-bottom:22px;"></div>

    <div class="section-title"><h2>Prochains anniversaires</h2></div>
    <div class="card list-card" id="prochainsBox" style="margin-bottom:22px;"></div>

    <div class="section-title"><h2>Statistiques</h2></div>
    <div class="charts-grid">
      <div class="card chart-card">
        <div class="chart-title">Evolution de la caisse</div>
        <canvas id="chartCaisse" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="chart-title">Anniversaires par mois</div>
        <canvas id="chartMois" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="chart-title">Dernier dimanche</div>
        <canvas id="chartDonut" height="160"></canvas>
        <div id="donutLegend" class="donut-legend"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-title">Depenses par categorie</div>
        <canvas id="chartDepenses" height="160"></canvas>
      </div>
    </div>

    <div class="section-title"><h2>Recapitulatif des dernieres collectes</h2><span class="page-subtitle">${joursStats.length} dimanche${joursStats.length > 1 ? "s" : ""}</span></div>
    <div id="dash-weeks"></div>
  `;

  // Utilisation du module accueil pour le tableau de bord "Aujourd'hui"
  const aujourdhuiItems = accueilModule.construireAuJourdhuiItems(
    irreguliersIds,
    aRelancer,
    pretsEnAttenteArray,
    openARelancerSheet,
    openPretsEnAttenteSheet,
    fullName,
    initials,
    fmt,
    fmtDate,
    emptyHTML,
    memById
  );

  document.getElementById("aujourdhuiBox").innerHTML = accueilModule.rendreAuJourdhuiBox(
  aujourdhuiItems,
  esc
);

accueilModule.attacherEvenementsAuJourdhui(aujourdhuiItems);

  document.getElementById("financeSummaryBox").addEventListener("click", () => showTab("finance"));

  // Branchement des clics sur les éléments interactifs restants
  document.getElementById("kpiListes").addEventListener("click", () => renderListes());
  const backupWarnBox = document.getElementById("backupWarnBox");
  if (backupWarnBox) backupWarnBox.addEventListener("click", () => openSysteme());

  // Initialisation sécurisée de la barre de recherche globale
  wireGlobalSearch();

  // Affichage des prochaines activités
  document.getElementById("prochainesActsBox").innerHTML =
    prochainesActs.map((l) => {
      const statutEvt = getStatutActivite(l);
      const lieuHeure = [l.heure ? esc(l.heure) : "", l.lieu ? esc(l.lieu) : ""]
        .filter(Boolean)
        .join(" &middot; ");
      return `<div class="row" data-id="${l.id}">
        <div class="info"><div class="name">${esc(l.nom)}</div><div class="meta">${fmtDate(l.date)}${lieuHeure ? " &middot; " + lieuHeure : ""}</div></div>
        <span class="badge ${STATUT_ACTIVITE_BADGE[statutEvt]}">${STATUT_ACTIVITE_LABEL[statutEvt]}</span>
      </div>`;
    }).join("") || emptyHTML("Aucune activite a venir.");

  document.querySelectorAll("#prochainesActsBox .row").forEach((el) =>
    el.addEventListener("click", () =>
      renderListes().then(() => openListeDetail(el.dataset.id)),
    ),
  );

  // Affichage des prochains anniversaires
  document.getElementById("prochainsBox").innerHTML =
    prochains.slice(0, 5).map((x) => {
      const bdayIso = dateToIso(x.bday);
      const dimIso = dateToIso(x.dimanche);
      const diff = bdayIso !== dimIso;
      return `<div class="row" data-id="${x.membre.id}">
        <div class="avatar">${initials(x.membre)}</div>
        <div class="info">
          <div class="name">${esc(fullName(x.membre))}</div>
          <div class="meta">Anniversaire le ${fmtDate(bdayIso)}${diff ? ` &middot; cotisation le dimanche ${fmtDate(dimIso)}` : " &middot; tombe un dimanche"}</div>
        </div>
        <span class="badge badge-yes">12 000 F</span>
      </div>`;
    }).join("") || emptyHTML("Aucune date d'anniversaire connue.");

  document.querySelectorAll("#prochainsBox .row").forEach((el) =>
    el.addEventListener("click", () => openMemberDetail(el.dataset.id)),
  );

  // Affichage des anniversaires du mois courant restant
  document.getElementById("moisBox").innerHTML =
    membresMois.map((m) => `
      <div class="row" data-id="${m.id}">
        <div class="avatar" style="background:var(--bg-warning);color:var(--warning);">${initials(m)}</div>
        <div class="info"><div class="name">${esc(fullName(m))}</div><div class="meta">${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}</div></div>
      </div>`).join("") || emptyHTML("Aucun anniversaire restant ce mois-ci.");

  document.querySelectorAll("#moisBox .row").forEach((el) =>
    el.addEventListener("click", () => openMemberDetail(el.dataset.id)),
  );

  // Dernières semaines de collectes
  const last = joursStats.slice(0, 3);
  document.getElementById("dash-weeks").innerHTML =
    last.map((j) => weekCardDetailedHTML(j, memById)).join("") ||
    emptyHTML("Aucune collecte enregistree.");
  cotisationsModule.attachWeekCardHandlers(openWeekDetail);

  // Dessin des graphiques Canvas
  lastJoursStats = joursStats;
  lastMembres = membres;
  lastDepensesCat = depensesCat;
  drawCaisseChart(joursStats);
  drawMonthBarChart(membres);
  drawDonutChart(joursStats[0]);
  drawDepensesCategorieChart(depensesCat);
}

/**
 * Gabarit HTML détaillé d'une carte de collecte hebdomadaire.
 *
 * @param {any} j - Statistiques du dimanche.
 * @param {Record<string, any>} memById - Dictionnaire des membres.
 * @returns {string}
 */
function weekCardDetailedHTML(j, memById) {
  const tagClass = j.solde > 0 ? "tag-surplus" : j.solde < 0 ? "tag-manque" : "tag-exact";
  const tagText =
    j.solde > 0
      ? `+ ${fmt(j.solde)} pour la caisse`
      : j.solde < 0
        ? `Manque ${fmt(Math.abs(j.solde))}`
        : "Montant exact";

  const who = j.beneficiaires.length
    ? esc(j.beneficiaires.join(", "))
    : "Aucun anniversaire cette semaine";

  const nonPayeurs = j.paiements
    .filter((p) => !p.a_paye)
    .map((p) => (memById[p.id_membre] ? esc(fullName(memById[p.id_membre])) : "?"));

  return `<div class="week-card" data-dimanche="${j.dimanche.id}">
    <div class="top"><span class="date">${fmtDate(j.dimanche.date)}</span><span class="amount">${fmt(j.totalCollecte)}</span></div>
    <div class="desc">${who}</div>
    <div class="detail-row" style="border:none;padding:6px 0 2px;"><span class="k">Ont cotise</span><span class="v" style="color:var(--success);">${j.nbPayants} / ${j.nbTotal}</span></div>
    ${nonPayeurs.length ? `<div class="detail-row" style="border:none;padding:0 0 6px;"><span class="k">N'ont pas cotise</span><span class="v" style="color:var(--danger);text-align:right;">${nonPayeurs.join(", ")}</span></div>` : ""}
    <div class="detail-row" style="border:none;padding:0 0 6px;"><span class="k">Montant par membre</span><span class="v">${fmt(j.montantAttendu)}</span></div>
    <div class="tag-row"><span class="tag ${tagClass}">${tagText}</span></div>
  </div>`;
}

// ============================================================================
// GESTION DES MEMBRES
// ============================================================================

/**
 * Vérifie si des filtres personnalisés sur les membres sont actuellement actifs.
 * @returns {boolean}
 */
function memberFiltersActive() {
  return !!(memberFilterFonction || memberFilterMois || memberFilterStatut) || memberSort !== "alpha";
}

/**
 * Rendu principal de l'onglet Membres.
 */
async function renderMembres() {
  app.innerHTML = `
    <input class="search" id="memberSearch" placeholder="Rechercher un membre..." value="${esc(memberQuery)}" autocomplete="off">
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${memberFiltersActive() ? "active" : ""}" id="memberFiltersBtn">Filtrer &amp; trier${memberFiltersActive() ? " ●" : ""}</button>
    </div>
    <div class="card list-card mobile-only" id="memberList"></div>
    <div class="data-table-wrap data-table--clickable desktop-only" id="memberTableWrap">
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Fonction</th><th>Anniversaire</th><th>Statut</th></tr></thead>
        <tbody id="memberTable"></tbody>
      </table>
    </div>
    <div class="fab-zone"><button class="fab" id="addMemberBtn" aria-label="Ajouter un membre"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
  `;

  document.getElementById("memberSearch").addEventListener("input", (e) => {
    memberQuery = /** @type {HTMLInputElement} */ (e.target).value;
    renderMemberList();
  });
  document.getElementById("addMemberBtn").addEventListener("click", openAddMember);
  document.getElementById("memberFiltersBtn").addEventListener("click", openMemberFiltersSheet);

  await renderMemberList();
}

/**
 * Rendu de la liste filtrée et triée des membres.
 * Utilise le module membres pour le rendu et l'attache des événements.
 */
async function renderMemberList() {
  const membres = await listMembres();

  // Rendu de la liste mobile
  const memberListBox = document.getElementById("memberList");
  if (memberListBox) {
    memberListBox.innerHTML = await membresModule.renderMemberListMobile(
      membres,
      memberQuery,
      memberSort,
      memberFilterFonction,
      memberFilterMois,
      memberFilterStatut,
      membresIrreguliers,
      membresARelancer,
      emptyHTML,
      esc,
      fullName,
      initials,
      fmt,
      fmtDate,
      MOIS_NOMS,
      STATUT_ACTIVITE_BADGE,
      STATUT_ACTIVITE_LABEL,
      FONCTIONS,
      getStatutActivite
    );
  }

  // Rendu du tableau desktop
  const memberTableBody = document.getElementById("memberTable");
  if (memberTableBody) {
    memberTableBody.innerHTML = await membresModule.renderMemberListDesktop(
      membres,
      memberQuery,
      memberSort,
      memberFilterFonction,
      memberFilterMois,
      memberFilterStatut,
      membresIrreguliers,
      membresARelancer,
      emptyHTML,
      esc,
      fullName,
      initials,
      fmt,
      fmtDate,
      MOIS_NOMS,
      STATUT_ACTIVITE_BADGE,
      STATUT_ACTIVITE_LABEL,
      FONCTIONS,
      getStatutActivite
    );
  }

  // Attache des événements
  membresModule.attachMemberListEvents(openMemberDetail);
}

/**
 * Modale de configuration des filtres de la liste des membres.
 */
function openMemberFiltersSheet() {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Filtrer &amp; trier</h3>
    <div class="field"><label for="mf_sort">Trier par</label>
      <select id="mf_sort">
        <option value="alpha"${memberSort === "alpha" ? " selected" : ""}>Ordre alphabetique (nom)</option>
        <option value="date"${memberSort === "date" ? " selected" : ""}>Date d'ajout (plus recent)</option>
        <option value="fonction"${memberSort === "fonction" ? " selected" : ""}>Fonction</option>
      </select>
    </div>
    <div class="field"><label for="mf_fonction">Fonction</label>
      <select id="mf_fonction"><option value="">Toutes</option>${FONCTIONS.map((f) => `<option value="${f}"${memberFilterFonction === f ? " selected" : ""}>${f}</option>`).join("")}</select>
    </div>
    <div class="field"><label for="mf_mois">Mois d'anniversaire</label>
      <select id="mf_mois"><option value="">Tous</option>${MOIS_NOMS.map((nom, i) => `<option value="${i + 1}"${memberFilterMois === String(i + 1) ? " selected" : ""}>${nom}</option>`).join("")}</select>
    </div>
    <div class="field"><label for="mf_statut">Statut</label>
      <select id="mf_statut"><option value="">Tous</option><option value="Actif"${memberFilterStatut === "Actif" ? " selected" : ""}>Actif</option><option value="Inactif"${memberFilterStatut === "Inactif" ? " selected" : ""}>Inactif</option></select>
    </div>
    <button class="btn btn-primary" id="mf_apply" style="margin-bottom:8px;">Appliquer</button>
    <button class="btn btn-ghost" id="mf_reset">Reinitialiser les filtres</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#mf_apply").addEventListener("click", () => {
    memberSort = /** @type {HTMLSelectElement} */ (ov.querySelector("#mf_sort")).value;
    memberFilterFonction = /** @type {HTMLSelectElement} */ (ov.querySelector("#mf_fonction")).value;
    memberFilterMois = /** @type {HTMLSelectElement} */ (ov.querySelector("#mf_mois")).value;
    memberFilterStatut = /** @type {HTMLSelectElement} */ (ov.querySelector("#mf_statut")).value;
    closeSheet();
    renderMembres();
  });

  ov.querySelector("#mf_reset").addEventListener("click", () => {
    memberSort = "alpha";
    memberFilterFonction = "";
    memberFilterMois = "";
    memberFilterStatut = "";
    closeSheet();
    renderMembres();
  });
}

/**
 * Fiche détaillée d'un membre avec historique individuel, édition et export PDF.
 *
 * @param {string} id - Identifiant du membre.
 */
async function openMemberDetail(id) {
  const m = await db.membres.get(id);
  if (!m) return;

  const annivStr = m.jour_anniversaire
    ? `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`
    : "Non renseigne";

  const dettes = (await dettesList()).filter((d) => d.id_membre === id && d.statut === "Impayee");
  const totalDette = dettes.reduce((a, d) => a + d.montant, 0);

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;">
      <div class="avatar" style="width:48px;height:48px;font-size:16px;">${initials(m)}</div>
      <div>
        <h3 style="margin:0;">${esc(fullName(m))}</h3>
        <div class="meta">${esc(m.fonction || "Membre")} &middot; <span class="badge ${m.statut === "Actif" ? "badge-yes" : "badge-no"}">${m.statut}</span></div>
      </div>
    </div>
    <div class="text-caption" style="color:var(--text-muted);margin:14px 0 4px;">Informations</div>
    <div class="detail-row"><span class="k">Telephone</span><span class="v">${esc(m.telephone || "Non renseigne")}</span></div>
    <div class="detail-row"><span class="k">Anniversaire</span><span class="v">${annivStr}</span></div>
    <div class="detail-row"><span class="k">Date d'adhesion</span><span class="v">${m.date_adhesion ? fmtDate(m.date_adhesion) : "Inconnue"}</span></div>
    ${m.observations ? `<div class="detail-row"><span class="k">Observations</span><span class="v">${esc(m.observations)}</span></div>` : ""}

    <div class="text-caption" style="color:var(--text-muted);margin:14px 0 4px;">Finances</div>
    <div class="detail-row"><span class="k">Cotisation personnalisee</span><span class="v">${m.cotisation_personnalisee ? fmt(m.cotisation_personnalisee) + " / sem." : "500 FCFA / sem."}</span></div>
    <div class="detail-row"><span class="k">Dettes en cours</span><span class="v" style="color:${totalDette ? "var(--danger)" : "var(--success)"};">${fmt(totalDette)}</span></div>

    <div class="sheet-actions">
      <button class="btn btn-primary" id="editMemberBtn" style="margin-bottom:8px;">Modifier</button>
      <button class="btn btn-ghost" id="exportFicheBtn" style="margin-bottom:8px;">Envoyer sa fiche complete (PDF)</button>
      <button class="btn btn-ghost" id="historyMemberBtn" style="margin-bottom:8px;">Historique des cotisations</button>
      <button class="btn btn-ghost" id="toggleStatutBtn" style="color:var(--danger);">${m.statut === "Actif" ? "Passer Inactif" : "Reactiver ce membre"}</button>
    </div>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#exportFicheBtn").addEventListener("click", () => exportMembreIndividuelPDF(id));

  ov.querySelector("#toggleStatutBtn").addEventListener("click", async () => {
    if (m.statut === "Actif") {
      const ok = await confirmWithPassword(
        `Passer ${fullName(m)} en Inactif ? Ses cotisations impayees actuelles seront effacees et il ne sera plus propose pour les prochaines semaines.`,
      );
      if (!ok) return;
      const nbEffacees = await passerMembreInactif(id);
      closeSheet();
      toast(nbEffacees > 0 ? `Membre inactif — ${nbEffacees} dette(s) effacee(s)` : "Membre passe Inactif");
    } else {
      await db.membres.update(id, { statut: "Actif" });
      await log("membre", "reactive", id);
      closeSheet();
      toast("Membre reactive");
    }
    renderMemberList();
  });

  ov.querySelector("#editMemberBtn").addEventListener("click", () => {
    closeSheet();
    openEditMember(m);
  });

  ov.querySelector("#historyMemberBtn").addEventListener("click", () => {
    openHistoriqueMembre(m);
  });
}

/**
 * Affiche l'historique complet des cotisations et participations d'un membre.
 *
 * @param {any} m - Fiche du membre.
 */
async function openHistoriqueMembre(m) {
  const histo = await historiquePaiementsMembre(m.id);
  const rows = histo.map((h) => `
    <div class="detail-row">
      <div>
        <div style="font-weight:600;">${fmtDate(h.date)}</div>
        <div class="small-note" style="margin:2px 0 0;">${h.beneficiaires.length ? esc(h.beneficiaires.join(", ")) : "Collecte normale"}</div>
      </div>
      <div style="text-align:right;">
        <span class="badge ${h.a_paye ? "badge-yes" : "badge-no"}">${h.a_paye ? "Paye" : "Non paye"}</span>
        <div style="font-size:13px;color:var(--text-3);margin-top:2px;">${fmt(h.montant_attendu)}</div>
      </div>
    </div>`).join("") || emptyHTML("Aucun historique pour ce membre.");

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Historique — ${esc(fullName(m))}</h3>
    <div style="margin-top:12px;">${rows}</div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
}

/**
 * Formulaire de modification d'un membre.
 *
 * @param {any} m - Membre à modifier.
 */
function openEditMember(m) {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Modifier le membre</h3>
    <div class="field-row">
      <div class="field"><label for="em_nom">Nom</label><input id="em_nom" type="text" value="${esc(m.nom || "")}"></div>
      <div class="field"><label for="em_prenom">Prenom</label><input id="em_prenom" type="text" value="${esc(m.prenom || "")}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="em_jj">Jour anniv.</label><select id="em_jj">${dayOptionsHTML(m.jour_anniversaire)}</select></div>
      <div class="field"><label for="em_mm">Mois anniv.</label><select id="em_mm">${monthOptionsHTML(m.mois_anniversaire)}</select></div>
    </div>
    <div class="field"><label for="em_fonction_select">Fonction</label><select id="em_fonction_select">${fonctionOptionsHTML(m.fonction || "Membre")}</select></div>
    <div class="field" id="em_fonction_autre_wrap" style="display:none;"><label for="em_fonction_autre">Preciser la fonction</label><input id="em_fonction_autre" type="text" placeholder="Ex: Responsable des enfants"></div>
    <div class="field"><label for="em_tel">Telephone</label><input id="em_tel" type="tel" value="${esc(m.telephone || "")}"></div>
    <div class="field"><label for="em_cotis">Cotisation hebdomadaire personnalisee (FCFA)</label><input id="em_cotis" type="number" placeholder="Laisser vide = montant par defaut" value="${m.cotisation_personnalisee || ""}"></div>
    <div class="small-note" style="margin-bottom:12px;">Ex. le President cotise 1000 F au lieu des 500 F habituels : indique 1000 ici pour lui.</div>
    <div class="field"><label for="em_statut">Statut</label>
      <select id="em_statut">
        <option value="Actif"${m.statut === "Actif" ? " selected" : ""}>Actif (cotise, apparait dans les prochains dimanches)</option>
        <option value="Inactif"${m.statut === "Inactif" ? " selected" : ""}>Inactif (ne cotise plus, n'apparait plus)</option>
      </select>
    </div>
    <div class="field"><label for="em_obs">Observations</label><input id="em_obs" type="text" value="${esc(m.observations || "")}" placeholder="Facultatif"></div>
    <button class="btn btn-primary" id="em_save" style="margin-top:14px;">Enregistrer</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  wireFonctionAutre("em_fonction_select", "em_fonction_autre_wrap", "em_fonction_autre", m.fonction || "Membre");

  ov.querySelector("#em_save").addEventListener("click", async () => {
    const prenom = /** @type {HTMLInputElement} */ (ov.querySelector("#em_prenom")).value.trim();
    if (!prenom) {
      toast("Le prenom est obligatoire", "error");
      return;
    }
    const cotisVal = /** @type {HTMLInputElement} */ (ov.querySelector("#em_cotis")).value;
    const nouveauStatut = /** @type {HTMLSelectElement} */ (ov.querySelector("#em_statut")).value;
    const passageEnInactif = m.statut === "Actif" && nouveauStatut === "Inactif";

    await db.membres.update(m.id, {
      nom: /** @type {HTMLInputElement} */ (ov.querySelector("#em_nom")).value.trim(),
      prenom,
      jour_anniversaire: Number(/** @type {HTMLSelectElement} */ (ov.querySelector("#em_jj")).value) || null,
      mois_anniversaire: Number(/** @type {HTMLSelectElement} */ (ov.querySelector("#em_mm")).value) || null,
      fonction: fonctionValueFrom("em_fonction_select", "em_fonction_autre"),
      telephone: /** @type {HTMLInputElement} */ (ov.querySelector("#em_tel")).value.trim(),
      cotisation_personnalisee: cotisVal ? Number(cotisVal) : null,
      statut: nouveauStatut,
      observations: /** @type {HTMLInputElement} */ (ov.querySelector("#em_obs")).value.trim(),
    });

    await log("membre", "modifie", m.id);

    if (passageEnInactif) {
      const nbEffacees = await passerMembreInactif(m.id);
      closeSheet();
      toast(nbEffacees > 0 ? `Membre inactif — ${nbEffacees} dette(s) effacee(s)` : "Membre passe Inactif");
    } else {
      closeSheet();
      toast("Membre mis a jour");
    }
    renderMemberList();
  });
}

/**
 * Formulaire de création d'un nouveau membre.
 * Utilise genererIdMembre() pour garantir l'unicité de la clé primaire.
 */
function openAddMember() {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Nouveau membre</h3>
    <div class="field"><label for="f_nom">Nom</label><input id="f_nom" type="text"></div>
    <div class="field"><label for="f_prenom">Prenom</label><input id="f_prenom" type="text" required></div>
    <div class="field-row">
      <div class="field"><label for="f_jj">Jour anniv.</label><select id="f_jj">${dayOptionsHTML(null)}</select></div>
      <div class="field"><label for="f_mm">Mois anniv.</label><select id="f_mm">${monthOptionsHTML(null)}</select></div>
    </div>
    <div class="field"><label for="f_tel">Telephone</label><input id="f_tel" type="tel"></div>
    <div class="field"><label for="f_fonction_select">Fonction</label><select id="f_fonction_select">${fonctionOptionsHTML("Membre")}</select></div>
    <div class="field" id="f_fonction_autre_wrap" style="display:none;"><label for="f_fonction_autre">Preciser la fonction</label><input id="f_fonction_autre" type="text" placeholder="Ex: Responsable des enfants"></div>
    <div class="field"><label for="f_cotis">Cotisation hebdomadaire (FCFA)</label><input id="f_cotis" type="number" placeholder="Laisser vide = montant par defaut"></div>
    <button class="btn btn-primary" id="saveMemberBtn">Ajouter</button>
    <div class="small-note">Le nouveau membre rejoint le registre general. Il participera aux collectes a partir de la prochaine session, sauf si tu l'ajoutes manuellement a un dimanche.</div>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  wireFonctionAutre("f_fonction_select", "f_fonction_autre_wrap", "f_fonction_autre", "Membre");

  ov.querySelector("#saveMemberBtn").addEventListener("click", async () => {
    const prenom = /** @type {HTMLInputElement} */ (ov.querySelector("#f_prenom")).value.trim();
    if (!prenom) {
      toast("Le prenom est obligatoire", "error");
      return;
    }
    const id = genererIdMembre();
    await db.membres.add({
      id,
      nom: /** @type {HTMLInputElement} */ (ov.querySelector("#f_nom")).value.trim(),
      prenom,
      jour_anniversaire: Number(/** @type {HTMLSelectElement} */ (ov.querySelector("#f_jj")).value) || null,
      mois_anniversaire: Number(/** @type {HTMLSelectElement} */ (ov.querySelector("#f_mm")).value) || null,
      telephone: /** @type {HTMLInputElement} */ (ov.querySelector("#f_tel")).value.trim(),
      fonction: fonctionValueFrom("f_fonction_select", "f_fonction_autre"),
      cotisation_personnalisee: Number(/** @type {HTMLInputElement} */ (ov.querySelector("#f_cotis")).value) || null,
      statut: "Actif",
      date_adhesion: todayISO(),
      observations: "",
    });

    await log("membre", "cree", id);
    closeSheet();
    toast("Membre ajoute");
    renderMemberList();
  });
}

// ============================================================================
// DIMANCHES DE COLLECTE & PAIEMENTS
// ============================================================================

/**
 * Rendu principal de l'onglet Dimanches.
 */
async function renderDimanche() {
  app.innerHTML = `
    <input class="search" id="dimancheSearch" placeholder="Rechercher un dimanche..." value="${esc(dimancheQuery)}" autocomplete="off">
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!dimancheShowArchives ? "active" : ""}" id="dim_filtre_actifs">Actifs</button>
      <button class="btn-chip ${dimancheShowArchives ? "active" : ""}" id="dim_filtre_archives">Archives</button>
    </div>
    <div id="dimanchesList"></div>
    <div class="fab-zone"><button class="fab" id="addSundayBtn" aria-label="Nouveau dimanche"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
  `;

  document.getElementById("dimancheSearch").addEventListener("input", (e) => {
    dimancheQuery = /** @type {HTMLInputElement} */ (e.target).value;
    renderDimancheList();
  });

  document.getElementById("addSundayBtn").addEventListener("click", openNewSunday);
  document.getElementById("dim_filtre_actifs").addEventListener("click", () => {
    dimancheShowArchives = false;
    renderDimanche();
  });
  document.getElementById("dim_filtre_archives").addEventListener("click", () => {
    dimancheShowArchives = true;
    renderDimanche();
  });

  await renderDimancheList();
}

/**
 * Rendu de la liste des dimanches filtrés.
 */
async function renderDimancheList() {
  const jours = await joursAvecStats();

  const box = document.getElementById("dimanchesList");
  if (!box) return;

  box.innerHTML = cotisationsModule.renderDimancheListHTML(jours, dimancheQuery, dimancheShowArchives, fmt, fmtDate, esc);
  cotisationsModule.attachWeekCardHandlers(openWeekDetail);
}

/**
 * Modale de création d'un nouveau dimanche de collecte.
 */
async function openNewSunday() {
  const membres = await listMembres({ actifsSeulement: true });
  const initialDate = todayISO();
  const suggested = await membresAnniversaireCeDimanche(initialDate);
  const suggestedIds = new Set(suggested.map((m) => m.id));

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Nouveau dimanche</h3>
    <div class="field"><label for="nd_date">Date</label><input id="nd_date" type="date" value="${initialDate}"></div>
    <div class="field"><label for="nd_benef">Anniversaire(s) ce dimanche</label>
      <select id="nd_benef" multiple size="5">
        ${membres.map((m) => `<option value="${m.id}" ${suggestedIds.has(m.id) ? "selected" : ""}>${esc(fullName(m))}</option>`).join("")}
      </select>
    </div>
    <div class="small-note" id="nd_hint">${
      suggested.length
        ? `Detecte automatiquement : ${esc(suggested.map(fullName).join(", "))}. Modifie la selection si besoin.`
        : "Aucun anniversaire detecte automatiquement pour cette date."
    }</div>
    <div class="small-note">Tous les membres partiront de "Non paye" — tu coches au fur et a mesure que chacun cotise.</div>
    <button class="btn btn-primary" id="createSundayBtn" style="margin-top:14px;">Creer le dimanche</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#nd_date").addEventListener("change", async (e) => {
    const sug = await membresAnniversaireCeDimanche(/** @type {HTMLInputElement} */ (e.target).value);
    const sugIds = new Set(sug.map((m) => m.id));
    ov.querySelectorAll("#nd_benef option").forEach((o) => {
      const opt = /** @type {HTMLOptionElement} */ (o);
      opt.selected = sugIds.has(opt.value);
    });
    ov.querySelector("#nd_hint").textContent = sug.length
      ? `Detecte automatiquement : ${sug.map(fullName).join(", ")}. Modifie la selection si besoin.`
      : "Aucun anniversaire detecte automatiquement pour cette date.";
    // Note : textContent (pas innerHTML) ici, donc pas de risque d'injection — aucun esc() necessaire.
  });

  ov.querySelector("#createSundayBtn").addEventListener("click", async () => {
    const dateInput = /** @type {HTMLInputElement} */ (ov.querySelector("#nd_date"));
    const date = dateInput ? dateInput.value : "";
    if (!date) {
      toast("Choisis une date", "error");
      return;
    }

    const existant = await dimancheExisteADate(date);
    if (existant) {
      const continuer = confirm(
        `Un dimanche existe deja a cette date (${fmtDate(date)}). Creer quand meme un 2e dimanche a la meme date ?`,
      );
      if (!continuer) return;
    }

    const selectBenef = /** @type {HTMLSelectElement} */ (ov.querySelector("#nd_benef"));
    const benef = Array.from(selectBenef.selectedOptions).map((o) => o.value);

    const id = await nouveauDimanche({ date, beneficiaireIds: benef });
    closeSheet();
    toast("Dimanche cree");
    showTab("dimanche");
    setTimeout(() => openWeekDetail(id), 150);
  });
}

/**
 * Fiche détaillée d'un dimanche : cochage des paiements, enregistrement des prêts, export PDF.
 * Utilise la délégation d'événements pour une performance optimale.
 *
 * @param {string} dimId - Identifiant du dimanche.
 */
async function openWeekDetail(dimId) {
  const dim = await db.dimanches.get(dimId);
  if (!dim) return;

  const [paiements, anniv, membres, pretsDuJour] = await Promise.all([
    db.paiements.where("id_dimanche").equals(dimId).toArray(),
    db.anniversaires_du_jour.where("id_dimanche").equals(dimId).toArray(),
    db.membres.toArray(),
    db.prets_membres.where("id_dimanche").equals(dimId).toArray(),
  ]);

  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  let preteurParPaiement = Object.fromEntries(pretsDuJour.map((pr) => [pr.id_paiement, pr.id_preteur]));

  const benefNames = anniv.map((a) => (memById[a.id_membre_fete] ? esc(fullName(memById[a.id_membre_fete])) : "?")).join(", ") || "Collecte normale";
  const total = paiements.reduce((a, p) => a + p.montant_paye, 0);
  const montantAttendu = paiements[0] ? paiements[0].montant_attendu : 0;

  const triParNom = (a, b) => fullName(memById[a.id_membre] || {}).localeCompare(fullName(memById[b.id_membre] || {}));

  const nbPayes = paiements.filter((p) => p.a_paye).length;
  const totalAttendu = montantAttendu * paiements.length;
  const reste = Math.max(0, totalAttendu - total);
  const pct = totalAttendu > 0 ? Math.min(100, Math.round((total / totalAttendu) * 100)) : 0;

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${benefNames}</h3>
    <div class="field" style="margin-top:10px;">
      <label for="wd_date">Date du dimanche</label>
      <input type="date" id="wd_date" value="${dim.date}">
    </div>
    <div class="financial-summary" style="margin-bottom:14px;">
      <div class="financial-summary-total">
        <div class="label">Collecte du jour (${fmt(montantAttendu)}/membre)</div>
        <div class="value positive" id="wd_total_value">${fmt(total)}</div>
      </div>
      <div style="padding:0 16px 14px;">
        <div class="progress-bar" style="margin-bottom:8px;"><div class="progress-bar-fill" id="wd_progress_fill" style="width:${pct}%;"></div></div>
        <div class="detail-row" style="border:none;padding:0;">
          <span class="k" id="wd_payes_count">${nbPayes}/${paiements.length} membres ont paye</span>
          <span class="v" style="color:var(--warning);" id="wd_reste_value">${reste > 0 ? `Reste ${fmt(reste)}` : "Complet"}</span>
        </div>
      </div>
    </div>
    <div id="wd_rows">${paiements.slice().sort(triParNom).map((p) => cotisationsModule.paiementRowHTML(p, memById, preteurParPaiement, esc, fullName)).join("")}</div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="wd_export" style="margin-bottom:8px;">Exporter cette cotisation (PDF)</button>
      <button class="btn btn-ghost" id="wd_archive" style="margin-bottom:8px;">${dim.archivee ? "Desarchiver" : "Archiver"} ce dimanche</button>
      <button class="btn btn-ghost" id="wd_delete" style="color:var(--danger);">Supprimer ce dimanche</button>
    </div>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#wd_export").addEventListener("click", () => exportCotisationPDF(dimId));

  ov.querySelector("#wd_archive").addEventListener("click", async () => {
    await db.dimanches.update(dimId, { archivee: !dim.archivee });
    await log("dimanche", dim.archivee ? "desarchive" : "archive", dimId);
    closeSheet();
    toast(dim.archivee ? "Dimanche desarchive" : "Dimanche archive");
    renderDimanche();
  });

  ov.querySelector("#wd_date").addEventListener("change", async (e) => {
    await db.dimanches.update(dimId, { date: /** @type {HTMLInputElement} */ (e.target).value });
    await log("dimanche", "date_modifiee", dimId);
    toast("Date mise a jour");
  });

  // Délégation d'événements sur la liste des paiements
  const rowsBox = ov.querySelector("#wd_rows");
  rowsBox.addEventListener("click", async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const toggleBtn = target.closest("[data-toggle-paiement]");
    const pretBtn = target.closest("[data-pret]");

    if (toggleBtn) {
      const pid = toggleBtn.dataset.togglePaiement;
      const nextPaye = !toggleBtn.classList.contains("on") && !toggleBtn.classList.contains("loan");

      await marquerPaiement(pid, nextPaye);

      if (!nextPaye) {
        const prets = await db.prets_membres.where("id_paiement").equals(pid).toArray();
        for (const pr of prets) await db.prets_membres.delete(pr.id);
      }

      await refreshWeekRows();
      notifyAutresEcrans();
    } else if (pretBtn) {
      openPretPicker(pretBtn.dataset.pret);
    }
  });

  async function refreshWeekRows() {
    const [freshPaiements, freshPrets] = await Promise.all([
      db.paiements.where("id_dimanche").equals(dimId).toArray(),
      db.prets_membres.where("id_dimanche").equals(dimId).toArray(),
    ]);

    preteurParPaiement = Object.fromEntries(freshPrets.map((pr) => [pr.id_paiement, pr.id_preteur]));
    rowsBox.innerHTML = freshPaiements.slice().sort(triParNom).map((p) => cotisationsModule.paiementRowHTML(p, memById, preteurParPaiement, esc, fullName)).join("");

    const newTotal = freshPaiements.reduce((a, p) => a + p.montant_paye, 0);
    const newNbPayes = freshPaiements.filter((p) => p.a_paye).length;
    const newTotalAttendu = montantAttendu * freshPaiements.length;
    const newReste = Math.max(0, newTotalAttendu - newTotal);
    const newPct = newTotalAttendu > 0 ? Math.min(100, Math.round((newTotal / newTotalAttendu) * 100)) : 0;

    const totalEl = ov.querySelector("#wd_total_value");
    if (totalEl) totalEl.textContent = fmt(newTotal);
    const fillEl = ov.querySelector("#wd_progress_fill");
    if (fillEl) /** @type {HTMLElement} */ (fillEl).style.width = newPct + "%";
    const countEl = ov.querySelector("#wd_payes_count");
    if (countEl) countEl.textContent = `${newNbPayes}/${freshPaiements.length} membres ont paye`;
    const resteEl = ov.querySelector("#wd_reste_value");
    if (resteEl) resteEl.textContent = newReste > 0 ? `Reste ${fmt(newReste)}` : "Complet";
  }

  function notifyAutresEcrans() {
    const current = getCurrentTab();
    if (current === "accueil") renderAccueil();
    else if (current === "dimanche") renderDimanche();
    else if (current === "finance") renderFinance();
  }

  function openPretPicker(idPaiement) {
    const autresParticipants = paiements
      .filter((p) => p.id !== idPaiement)
      .map((p) => memById[p.id_membre])
      .filter(Boolean);

    const pretOv = openSheet(`
      <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
      <h3>Qui a avance l'argent ?</h3>
      <div class="small-note" style="margin-bottom:10px;">La cotisation sera marquee payee pour le groupe. Le pret sera suivi dans Finance &rarr; Prets entre membres.</div>
      <div id="pret_list"></div>
    `);

    const box = pretOv.querySelector("#pret_list");
    box.innerHTML = autresParticipants.length
      ? autresParticipants.map((m) => `
          <div class="row" data-preteur="${m.id}" style="cursor:pointer;">
            <div class="avatar">${initials(m)}</div>
            <div class="info"><div class="name">${esc(fullName(m))}</div></div>
          </div>`).join("")
      : emptyHTML("Aucun autre participant sur ce dimanche.");

    pretOv.querySelector("[data-close]").addEventListener("click", closeSheet);

    box.querySelectorAll("[data-preteur]").forEach((el) =>
      el.addEventListener("click", async () => {
        try {
          await enregistrerPretMembre(idPaiement, /** @type {HTMLElement} */ (el).dataset.preteur);
          closeSheet();
          toast("Pret enregistre — cotisation payee");
          await refreshWeekRows();
          notifyAutresEcrans();
        } catch (err) {
          toast(err.message || "Erreur", "error");
        }
      }),
    );
  }

  ov.querySelector("#wd_delete").addEventListener("click", async () => {
    const ok = await confirmWithPassword(
      "Cette suppression est definitive et efface tous les paiements de ce dimanche. Confirme avec le mot de passe administrateur.",
    );
    if (!ok) return;
    await supprimerDimanche(dimId);
    closeSheet();
    toast("Dimanche supprime");
    showTab("dimanche");
  });
}

// ============================================================================
// CYCLE DE VIE & DÉMARRAGE DE L'APPLICATION
// ============================================================================

// Écouteurs de navigation sur la tabbar principale
document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => showTab(/** @type {HTMLElement} */ (b).dataset.tab));
});

// Système : espace séparé des 5 onglets métier, accessible depuis la topbar
document.getElementById("systemeBtn").addEventListener("click", () => openSysteme());

// Initialisation du thème avant tout rendu
initTheme();

// Surveillance d'inactivité et reverrouillage automatique
initVisibilityWatcher(() => {
  closeAllSheets();
  showLoginScreen();
});

// Bootstrap asynchrone
(async function start() {
  // La base doit etre ouverte ET a jour de schema avant la moindre lecture.
  // Sans cette attente explicite, Dexie ouvre en arriere-plan a la premiere
  // requete et une migration bloquee echoue plus tard, sans indication de
  // source. Voir ouvrirBase() dans db.js.
  try {
    await ouvrirBase();
  } catch (err) {
    document.getElementById("app-content").innerHTML =
      '<div class="empty"><h2>Base de donnees indisponible</h2>' +
      "<p>Impossible d'ouvrir la base locale. Fermez les autres onglets de " +
      "l'application puis rechargez la page.</p>" +
      "<p class=\"muted\">Detail : " + esc(err && err.message ? err.message : String(err)) + "</p></div>";
    return;
  }

  await seedIfEmpty();

  // Enregistrement du Service Worker PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("ServiceWorker registration skipped:", err);
    });
  }

  const configured = await isAdminConfigured();
  if (!configured) {
    showSetupScreen();
    return;
  }

  if (!isSessionAuthed()) {
    showLoginScreen();
    return;
  }

  if (verrouillerSiExpire(() => showLoginScreen())) {
    return;
  }

  await synchroniserSessionTopBar();
  showTab("accueil");
})();