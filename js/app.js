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

/** @type {number|null} Minuteur anti-rebond pour la recherche globale */
let globalSearchTimer = null;

/** @type {boolean} Drapeau empêchant la duplication d'écouteurs globaux */
let globalSearchListenerWired = false;

/** @type {number|null} Minuteur anti-rebond pour le redimensionnement d'écran */
let resizeTimer = null;

// Mémoire cache locale pour le redimensionnement instantané des graphiques
let lastJoursStats = [];
let lastMembres = [];
let lastDepensesCat = {};

// Filtres et tri des membres
let memberQuery = "";
let memberSort = "alpha";
let memberFilterFonction = "";
let memberFilterMois = "";
let memberFilterStatut = "";

// Filtres et sélection des dimanches
let dimancheQuery = "";
let dimancheShowArchives = false;

// Filtres et pagination des activités (listes)
let listesQuery = "";
let listesShowArchivees = false;
let listeDetailQuery = "";

// Filtres des prêts entre membres
let pretsShowRembourses = false;

// Navigation du calendrier
let calendrierVue = "mois";
let calendrierDateRef = todayISO();
let calendrierJourSelectionne = todayISO();

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
    pretsEnAttente,
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
        ? `<div class="card" id="backupWarnBox" style="margin-bottom:16px;background:var(--bg-warning);border-color:transparent;cursor:pointer;">
            <div class="detail-row" style="border:none;padding:0;">
              <span class="k" style="color:var(--warning);font-weight:600;">${
                derniereSauvegarde
                  ? `Derniere sauvegarde il y a ${joursDepuisSauvegarde} jours`
                  : "Aucune sauvegarde n'a jamais ete faite"
              }</span>
            </div>
            <div class="small-note" style="margin-top:4px;">Toutes les donnees ne vivent que sur cet appareil. Touche ici pour exporter une sauvegarde JSON.</div>
          </div>`
        : ""
    }
    ${
      membres.length === 0
        ? `<div class="card" style="margin-bottom:18px;border-left:4px solid var(--accent);background:var(--surface);">
            <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:var(--text);">Bienvenue sur M3D Gestion</div>
            <div class="small-note" style="margin-bottom:12px;color:var(--text-2);">Votre application est actuellement vierge. Vous pouvez injecter un jeu de donnees de test en 1 clic pour explorer toutes les fonctionnalites (membres, cotisations, caisse, activites), puis les effacer quand vous aurez termine.</div>
            <button class="btn btn-primary" id="accueilLoadDemoBtn" style="padding:10px 16px;font-size:14px;width:auto;">Charger les donnees de test</button>
          </div>`
        : ""
    }
    <div class="kpi-grid">
      <div class="kpi k-navy"><div class="lbl">Membres</div><div class="val">${membres.length}</div></div>
      <div class="kpi k-blue"><div class="lbl">Cotisants</div><div class="val">${participantsCount}</div></div>
      <div class="kpi k-purple"><div class="lbl">Dimanches</div><div class="val">${joursStats.length}</div></div>
      <div class="kpi k-teal"><div class="lbl">Solde</div><div class="val" style="font-size:14.5px;">${fmt(solde)}</div></div>
      <div class="kpi k-green"><div class="lbl">Recettes mois</div><div class="val" style="font-size:14.5px;">${fmt(fluxMois.recettesMois)}</div></div>
      <div class="kpi k-red"><div class="lbl">Depenses mois</div><div class="val" style="font-size:14.5px;">${fmt(fluxMois.depensesMois)}</div></div>
      <div class="kpi k-red"><div class="lbl">Dettes</div><div class="val" style="font-size:14.5px;">${fmt(dettesTotal)}</div></div>
      <div class="kpi k-purple clickable" id="kpiListes"><div class="lbl">Listes</div><div class="val">${listes.length}</div></div>
      <div class="kpi k-red clickable" id="kpiIrreguliers"><div class="lbl">Irreguliers</div><div class="val">${irreguliersIds.length}</div></div>
      <div class="kpi k-amber clickable" id="kpiPrets"><div class="lbl">Prets attente</div><div class="val">${pretsEnAttente.length}</div></div>
      <div class="kpi k-navy clickable" id="kpiRelancer"><div class="lbl">A relancer</div><div class="val">${aRelancer.length}</div></div>
    </div>

    <div class="section-title"><h2>Prochaines activites</h2></div>
    <div class="card list-card" id="prochainesActsBox" style="margin-bottom:22px;"></div>

    <div class="section-title"><h2>Anniversaires de ${MOIS_NOMS[mois - 1]}</h2></div>
    <div class="card list-card" id="moisBox" style="margin-bottom:8px;"></div>
    <div class="small-note" style="margin-bottom:22px;"></div>

    <div class="section-title" style="margin-top:8px;"><h2>Prochains anniversaires</h2></div>
    <div class="card list-card" id="prochainsBox" style="margin-bottom:22px;"></div>

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

    <div class="section-title"><h2>Recapitulatif des dernieres collectes</h2></div>
    <div id="dash-weeks"></div>
  `;

  // Branchement des clics sur les KPI interactifs
  document.getElementById("kpiListes").addEventListener("click", () => renderListes());
  const backupWarnBox = document.getElementById("backupWarnBox");
  if (backupWarnBox) backupWarnBox.addEventListener("click", () => openSysteme());

  document.getElementById("kpiIrreguliers").addEventListener("click", () => {
    openARelancerSheet(aRelancer.filter((x) => x.irregulier));
  });
  document.getElementById("kpiPrets").addEventListener("click", () => renderPretsMembres());
  document.getElementById("kpiRelancer").addEventListener("click", () => openARelancerSheet(aRelancer));

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
        <span class="liste-icon" style="background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone)}</span>
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
  attachWeekCardHandlers();

  const loadDemoBtn = document.getElementById("accueilLoadDemoBtn");
  if (loadDemoBtn) {
    loadDemoBtn.addEventListener("click", async () => {
      await genererDonneesDemo();
      toast("Donnees de test chargees avec succes !");
      await synchroniserSessionTopBar();
      showTab("accueil");
    });
  }

  // Dessin des graphiques Canvas
  lastJoursStats = joursStats;
  lastMembres = membres;
  lastDepensesCat = depensesCat;
  drawCaisseChart(joursStats);
  drawMonthBarChart(membres);
  drawDonutChart(joursStats[0]);
  drawDepensesCategorieChart(depensesCat);
}

// ============================================================================
// RECHERCHE GLOBALE MULTI-CRITÈRES (Membres, Listes, Dimanches)
// ============================================================================

/**
 * Configure la saisie dans le champ de recherche globale avec anti-rebond (debounce).
 * La fermeture au clic externe est attachée une seule fois sur le document (évite les fuites mémoire).
 */
function wireGlobalSearch() {
  const input = document.getElementById("globalSearch");
  const box = document.getElementById("globalSearchResults");
  if (!input || !box) return;

  input.addEventListener("input", () => {
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(() => runGlobalSearch(input.value, box), 120);
  });

  if (!globalSearchListenerWired) {
    globalSearchListenerWired = true;
    document.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (!target.closest(".search-wrap")) {
        const results = document.getElementById("globalSearchResults");
        if (results) {
          results.innerHTML = "";
          results.classList.remove("show");
        }
      }
    });
  }
}

/**
 * Exécute la recherche multi-entités et insère les résultats dans la liste déroulante.
 *
 * @param {string} qRaw - Requête brute saisie par l'utilisateur.
 * @param {HTMLElement} box - Conteneur des résultats.
 */
async function runGlobalSearch(qRaw, box) {
  const q = qRaw.trim().toLowerCase();
  if (!q) {
    box.innerHTML = "";
    box.classList.remove("show");
    return;
  }

  const [membres, listes, joursStats] = await Promise.all([
    listMembres(),
    listesAll(),
    joursAvecStats(),
  ]);

  const matchMembres = membres.filter((m) =>
    fullName(m).toLowerCase().includes(q) ||
    (m.telephone || "").includes(q) ||
    (m.fonction || "").toLowerCase().includes(q) ||
    (m.jour_anniversaire && `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`.includes(q)) ||
    (m.mois_anniversaire && MOIS_NOMS[m.mois_anniversaire - 1].toLowerCase().includes(q)),
  ).slice(0, 5);

  const matchListes = listes.filter((l) => l.nom.toLowerCase().includes(q)).slice(0, 5);
  const matchCotis = joursStats.filter((j) =>
    j.beneficiaires.join(" ").toLowerCase().includes(q) ||
    fmtDate(j.dimanche.date).includes(q),
  ).slice(0, 5);

  if (!matchMembres.length && !matchListes.length && !matchCotis.length) {
    box.innerHTML = `<div class="global-search-empty">Aucun resultat pour "${esc(qRaw)}"</div>`;
    box.classList.add("show");
    return;
  }

  const section = (title, items) => (items.length ? `<div class="gsr-title">${title}</div>${items}` : "");

  box.innerHTML =
    section("Membres", matchMembres.map((m) =>
      `<div class="gsr-item" data-go="membre" data-id="${m.id}"><span class="avatar" style="width:28px;height:28px;font-size:11px;">${initials(m)}</span>${esc(fullName(m))}</div>`,
    ).join("")) +
    section("Listes", matchListes.map((l) =>
      `<div class="gsr-item" data-go="liste" data-id="${l.id}"><span class="liste-icon" style="width:28px;height:28px;background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone, 14)}</span>${esc(l.nom)}</div>`,
    ).join("")) +
    section("Cotisations", matchCotis.map((j) =>
      `<div class="gsr-item" data-go="dimanche" data-id="${j.dimanche.id}">${fmtDate(j.dimanche.date)} — ${esc(j.beneficiaires.join(", ")) || "Collecte"}</div>`,
    ).join(""));

  box.classList.add("show");

  box.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => {
      box.innerHTML = "";
      box.classList.remove("show");
      const go = /** @type {HTMLElement} */ (el).dataset.go;
      const id = /** @type {HTMLElement} */ (el).dataset.id;
      if (go === "membre") {
        showTab("membres").then(() => openMemberDetail(id));
      } else if (go === "liste") {
        renderListes().then(() => openListeDetail(id));
      } else if (go === "dimanche") {
        showTab("dimanche").then(() => openWeekDetail(id));
      }
    }),
  );
}

// ============================================================================
// GRAPHIQUES CANVAS 2D (Sans dépendance externe)
// ============================================================================

/**
 * Redessine les graphiques de l'accueil en conservant les données mémoïsées.
 */
function redrawAccueilCharts() {
  if (getCurrentTab() !== "accueil") return;
  if (!document.getElementById("chartCaisse")) return;
  drawCaisseChart(lastJoursStats);
  drawMonthBarChart(lastMembres);
  drawDonutChart(lastJoursStats[0]);
  drawDepensesCategorieChart(lastDepensesCat);
}

/**
 * Gestionnaire d'ajustement réactif lors de rotations d'écran ou redimensionnements.
 */
function onViewportChange() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redrawAccueilCharts, 150);
}

window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
}

/**
 * Trace le graphique d'évolution linéaire de la caisse.
 * @param {any[]} joursStats
 */
function drawCaisseChart(joursStats) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartCaisse"));
  if (!canvas) return;

  const ordered = [...joursStats].reverse();
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  if (ordered.length < 2) {
    emptyCanvasMsg(ctx, W, H, "Collectes insuffisantes");
    return;
  }

  let cumul = 0;
  const values = ordered.map((j) => (cumul += j.solde));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padX = 50;
  const padY = 40;

  const pts = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * (W - 2 * padX),
    y: H - padY - ((v - min) / (max - min || 1)) * (H - 2 * padY),
  }));

  ctx.clearRect(0, 0, W, H);

  // Ligne de solde nul si présent dans la plage
  if (min < 0 && max > 0) {
    const y0 = H - padY - ((-min) / (max - min)) * (H - 2 * padY);
    ctx.strokeStyle = cssVar("--border") || "#E5E7EB";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, y0);
    ctx.lineTo(W - padX, y0);
    ctx.stroke();
  }

  // Remplissage dégradé sous la courbe
  const grad = ctx.createLinearGradient(0, padY, 0, H - padY);
  grad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
  grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H - padY);
  ctx.lineTo(pts[0].x, H - padY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Trait de la courbe
  ctx.strokeStyle = cssVar("--accent") || "#6366F1";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Points de repère
  ctx.fillStyle = cssVar("--accent") || "#6366F1";
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Trace le graphique à barres des anniversaires par mois.
 * @param {any[]} membres
 */
function drawMonthBarChart(membres) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartMois"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  const counts = Array(12).fill(0);
  membres.forEach((m) => {
    if (m.mois_anniversaire && m.mois_anniversaire >= 1 && m.mois_anniversaire <= 12) {
      counts[m.mois_anniversaire - 1]++;
    }
  });

  const max = Math.max(1, ...counts);
  const curMonth = new Date().getMonth();
  const padX = 30;
  const padY = 50;
  const barW = (W - 2 * padX) / 12;

  ctx.clearRect(0, 0, W, H);

  counts.forEach((c, i) => {
    const h = (c / max) * (H - 2 * padY);
    const x = padX + i * barW + barW * 0.15;
    const y = H - padY - h;
    const w = barW * 0.7;

    ctx.fillStyle = i === curMonth ? (cssVar("--accent") || "#6366F1") : (cssVar("--surface-2") || "#E2E8F0");
    roundRectTop(ctx, x, y, w, h, 6);

    ctx.fillStyle = cssVar("--text-3") || "#64748B";
    ctx.font = "20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(MOIS_NOMS[i].slice(0, 3), x + w / 2, H - padY + 26);

    if (c > 0) {
      ctx.fillStyle = cssVar("--text") || "#0F172A";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.fillText(String(c), x + w / 2, y - 8);
    }
  });
}

/**
 * Trace le graphique en anneau de participation de la dernière collecte.
 * @param {any} jourDernier
 */
function drawDonutChart(jourDernier) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDonut"));
  const legend = document.getElementById("donutLegend");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  if (!jourDernier || !jourDernier.nbTotal) {
    emptyCanvasMsg(ctx, W, H, "Aucune donnee recente");
    if (legend) legend.innerHTML = "";
    return;
  }

  const payes = jourDernier.nbPayants;
  const nonPayes = jourDernier.nbTotal - payes;
  const total = jourDernier.nbTotal;
  const cx = W / 2;
  const cy = H / 2;
  const rOut = Math.min(cx, cy) - 20;
  const rIn = rOut * 0.65;

  ctx.clearRect(0, 0, W, H);

  let start = -Math.PI / 2;
  const slices = [
    { count: payes, color: cssVar("--success") || "#16A34A" },
    { count: nonPayes, color: cssVar("--danger") || "#DC2626" },
  ];

  slices.forEach((s) => {
    const angle = (s.count / total) * Math.PI * 2;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(cx, cy, rOut, start, start + angle);
    ctx.arc(cx, cy, rIn, start + angle, start, true);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  const pct = Math.round((payes / total) * 100);
  ctx.fillStyle = cssVar("--text") || "#0F172A";
  ctx.font = "bold 44px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${pct}%`, cx, cy);

  if (legend) {
    legend.innerHTML = `
      <span><i style="background:${cssVar("--success") || "#16A34A"}"></i>Paye (${payes})</span>
      <span><i style="background:${cssVar("--danger") || "#DC2626"}"></i>Non paye (${nonPayes})</span>
    `;
  }
}

/**
 * Trace la répartition des dépenses par catégorie sous forme de barres horizontales.
 * @param {Record<string, number>} depensesCat
 */
function drawDepensesCategorieChart(depensesCat) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDepenses"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  const categories = CATEGORIES_DEPENSE.filter((c) => (depensesCat[c] || 0) > 0);
  const total = Object.values(depensesCat).reduce((a, v) => a + v, 0);

  if (!categories.length || total === 0) {
    emptyCanvasMsg(ctx, W, H, "Aucune depense enregistree");
    return;
  }

  const max = Math.max(...categories.map((c) => depensesCat[c]));
  const padX = 140;
  const padY = 30;
  const barH = (H - 2 * padY) / categories.length;

  ctx.clearRect(0, 0, W, H);

  categories.forEach((cat, i) => {
    const val = depensesCat[cat];
    const w = ((val / (max || 1)) * (W - padX - 100));
    const y = padY + i * barH + barH * 0.15;
    const h = barH * 0.7;

    ctx.fillStyle = cssVar("--text-2") || "#334155";
    ctx.font = "bold 20px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(cat, padX - 16, y + h / 2 + 7);

    ctx.fillStyle = cssVar("--accent") || "#6366F1";
    roundRectTop(ctx, padX, y, w, h, 6);

    ctx.fillStyle = cssVar("--text-3") || "#64748B";
    ctx.font = "18px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmt(val), padX + w + 12, y + h / 2 + 6);
  });
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

/**
 * Attache les écouteurs de clic sur toutes les cartes de dimanches affichées.
 */
function attachWeekCardHandlers() {
  document.querySelectorAll("[data-dimanche]").forEach((el) => {
    el.addEventListener("click", () => {
      openWeekDetail(/** @type {HTMLElement} */ (el).dataset.dimanche);
    });
  });
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
    <div class="card list-card" id="memberList"></div>
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
 */
async function renderMemberList() {
  const q = memberQuery.trim().toLowerCase();
  const all = await listMembres();

  let list = all.filter((m) =>
    fullName(m).toLowerCase().includes(q) || (m.telephone || "").includes(q),
  );

  if (memberFilterFonction) {
    list = list.filter((m) => (m.fonction || "Membre") === memberFilterFonction);
  }
  if (memberFilterMois) {
    list = list.filter((m) => String(m.mois_anniversaire || "") === memberFilterMois);
  }
  if (memberFilterStatut) {
    list = list.filter((m) => m.statut === memberFilterStatut);
  }

  if (memberSort === "date") {
    list.sort((a, b) => (b.date_adhesion || "").localeCompare(a.date_adhesion || ""));
  } else if (memberSort === "fonction") {
    list.sort((a, b) =>
      (a.fonction || "Membre").localeCompare(b.fonction || "Membre") ||
      fullName(a).localeCompare(fullName(b)),
    );
  }

  const irreguliers = new Set(await membresIrreguliers());
  const box = document.getElementById("memberList");
  if (!box) return;

  box.innerHTML = list.map((m) => {
    const isIrr = irreguliers.has(m.id);
    const annivStr = m.jour_anniversaire
      ? `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`
      : "Non renseigne";

    return `
      <div class="row" data-id="${m.id}">
        <div class="avatar">${initials(m)}</div>
        <div class="info">
          <div class="name">${esc(fullName(m))}${isIrr ? ` <span class="badge" style="background:var(--bg-danger);color:var(--danger);margin-left:4px;">Irregulier</span>` : ""}</div>
          <div class="meta">${esc(m.fonction || "Membre")} &middot; ${annivStr}</div>
        </div>
        <span class="badge ${m.statut === "Actif" ? "badge-yes" : "badge-no"}">${m.statut}</span>
      </div>`;
  }).join("") || emptyHTML("Aucun membre correspondant.");

  box.querySelectorAll(".row").forEach((el) =>
    el.addEventListener("click", () => openMemberDetail(/** @type {HTMLElement} */ (el).dataset.id)),
  );
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
    <div class="detail-row"><span class="k">Telephone</span><span class="v">${esc(m.telephone || "Non renseigne")}</span></div>
    <div class="detail-row"><span class="k">Anniversaire</span><span class="v">${annivStr}</span></div>
    <div class="detail-row"><span class="k">Cotisation personnalisee</span><span class="v">${m.cotisation_personnalisee ? fmt(m.cotisation_personnalisee) + " / sem." : "Montant par defaut"}</span></div>
    <div class="detail-row"><span class="k">Date d'adhesion</span><span class="v">${m.date_adhesion ? fmtDate(m.date_adhesion) : "Inconnue"}</span></div>
    <div class="detail-row"><span class="k">Dettes en cours</span><span class="v" style="color:${totalDette ? "var(--danger)" : "var(--success)"};">${fmt(totalDette)}</span></div>
    ${m.observations ? `<div class="detail-row"><span class="k">Observations</span><span class="v">${esc(m.observations)}</span></div>` : ""}

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
  const q = dimancheQuery.trim().toLowerCase();
  const jours = await joursAvecStats();

  let list = jours.filter((j) => (dimancheShowArchives ? j.dimanche.archivee : !j.dimanche.archivee));
  if (q) {
    list = list.filter((j) =>
      fmtDate(j.dimanche.date).includes(q) ||
      j.beneficiaires.join(" ").toLowerCase().includes(q),
    );
  }

  const box = document.getElementById("dimanchesList");
  if (!box) return;

  box.innerHTML = list.map((j) => weekCardHTML(j)).join("") ||
    emptyHTML(dimancheShowArchives ? "Aucun dimanche archive." : "Aucune collecte enregistree. Cree le premier dimanche.");

  attachWeekCardHandlers();
}

/**
 * Gabarit simplifié d'une carte de dimanche.
 * @param {any} j
 * @returns {string}
 */
function weekCardHTML(j) {
  const tagClass = j.solde > 0 ? "tag-surplus" : j.solde < 0 ? "tag-manque" : "tag-exact";
  const tagText = j.solde > 0 ? `+ ${fmt(j.solde)} pour la caisse` : j.solde < 0 ? `Manque ${fmt(Math.abs(j.solde))}` : "Montant exact";
  const who = j.beneficiaires.length ? esc(j.beneficiaires.join(", ")) : "Collecte normale";

  return `<div class="week-card" data-dimanche="${j.dimanche.id}">
    <div class="top"><span class="date">${fmtDate(j.dimanche.date)}</span><span class="amount">${fmt(j.totalCollecte)}</span></div>
    <div class="desc">${who} &middot; ${j.nbPayants}/${j.nbTotal} ont cotise</div>
    <div class="tag-row"><span class="tag ${tagClass}">${tagText}</span></div>
  </div>`;
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
        ? `Detecte automatiquement : ${suggested.map(fullName).join(", ")}. Modifie la selection si besoin.`
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
 * Génère la ligne HTML représentant un participant et son statut de cotisation.
 *
 * @param {any} p - Enregistrement paiement.
 * @param {Record<string, any>} memById - Dictionnaire des membres.
 * @param {Record<string, string>} preteurParPaiement - Dictionnaire des prêts par paiement.
 * @returns {string}
 */
function paiementRowHTML(p, memById, preteurParPaiement) {
  const m = memById[p.id_membre] || { nom: "?", prenom: "" };
  const idPreteur = preteurParPaiement[p.id];
  const preteur = idPreteur ? memById[idPreteur] : null;

  let etatClasse = "off";
  let label = "Non paye";

  if (p.a_paye && preteur) {
    etatClasse = "loan";
    label = `Pret (${esc(fullName(preteur))})`;
  } else if (p.a_paye) {
    etatClasse = "on";
    label = "Paye";
  }

  return `<div class="chip-row" data-paiement="${p.id}">
    <span class="name">${esc(fullName(m))}</span>
    <div class="chip-actions">
      ${!p.a_paye ? `<button class="toggle toggle-ghost" data-pret="${p.id}" title="Un autre membre a avance l'argent">Pret</button>` : ""}
      <button class="toggle ${etatClasse}" data-toggle-paiement="${p.id}">${label}</button>
    </div>
  </div>`;
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
  const totalId = "wd_total_" + dimId;

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${benefNames}</h3>
    <div class="field" style="margin-top:10px;">
      <label for="wd_date">Date du dimanche</label>
      <input type="date" id="wd_date" value="${dim.date}">
    </div>
    <div class="small-note" style="margin-bottom:8px;" id="${totalId}">Total cotise : <b>${fmt(total)}</b> (${fmt(montantAttendu)}/membre)</div>
    <div id="wd_rows">${paiements.slice().sort(triParNom).map((p) => paiementRowHTML(p, memById, preteurParPaiement)).join("")}</div>
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
    rowsBox.innerHTML = freshPaiements.slice().sort(triParNom).map((p) => paiementRowHTML(p, memById, preteurParPaiement)).join("");

    const newTotal = freshPaiements.reduce((a, p) => a + p.montant_paye, 0);
    const totalEl = ov.querySelector("#" + totalId + " b");
    if (totalEl) totalEl.textContent = fmt(newTotal);
  }

  function notifyAutresEcrans() {
    const current = getCurrentTab();
    if (current === "accueil") renderAccueil();
    else if (current === "dimanche") renderDimanche();
    else if (current === "dettes") renderDettes();
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
// GESTION DES DETTES & REMBOURSEMENTS
// ============================================================================

/**
 * Rendu principal de l'onglet Dettes.
 */
async function renderDettes() {
  const dettes = await dettesList();
  const impayees = dettes.filter((d) => d.statut === "Impayee");
  const remboursees = dettes.filter((d) => d.statut === "Remboursee");
  const total = impayees.reduce((a, d) => a + d.montant, 0);

  app.innerHTML = `
    <button class="btn-chip" id="dettesBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="card" style="text-align:center;padding:20px;margin-bottom:18px;">
      <div class="small-note">Total impaye</div>
      <div style="font-family:var(--font-sans);font-size:28px;font-weight:700;color:var(--danger);margin-top:2px;">${fmt(total)}</div>
    </div>
    <div class="section-title" style="margin-top:0;"><h2>Impayees (${impayees.length})</h2></div>
    <div class="card list-card" id="dettesImpayees"></div>
    ${remboursees.length ? `<div class="section-title"><h2>Remboursees (${remboursees.length})</h2></div><div class="card list-card" id="dettesRemb"></div>` : ""}
  `;

  document.getElementById("dettesBackBtn").addEventListener("click", () => showTab("finance"));

  const rowHTML = (d, actionable) => `
    <div class="row" ${actionable ? `data-paiement="${d.id_paiement}"` : ""}>
      <div class="avatar" style="background:var(--bg-danger);color:var(--danger);">${(d.membre[0] || "?").toUpperCase()}</div>
      <div class="info"><div class="name">${esc(d.membre)}</div><div class="meta">${fmtDate(d.date)}</div></div>
      <span class="badge" style="background:var(--bg-danger);color:var(--danger);">${fmt(d.montant)}</span>
    </div>`;

  document.getElementById("dettesImpayees").innerHTML =
    impayees.map((d) => rowHTML(d, true)).join("") || emptyHTML("Aucune dette en cours.");

  document.querySelectorAll("#dettesImpayees .row").forEach((el) =>
    el.addEventListener("click", () => openRembourser(/** @type {HTMLElement} */ (el).dataset.paiement)),
  );

  if (remboursees.length) {
    document.getElementById("dettesRemb").innerHTML = remboursees.map((d) => rowHTML(d, false)).join("");
  }
}

/**
 * Modale d'enregistrement du remboursement d'une dette.
 *
 * @param {string} idPaiement - Identifiant du paiement concerné.
 */
function openRembourser(idPaiement) {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Marquer comme remboursee</h3>
    <div class="field"><label for="rb_montant">Montant</label><input id="rb_montant" type="number"></div>
    <div class="field"><label for="rb_note">Note (facultatif)</label><input id="rb_note" type="text"></div>
    <button class="btn btn-primary" id="rb_save">Confirmer le remboursement</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#rb_save").addEventListener("click", async () => {
    const p = await db.paiements.get(idPaiement);
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_montant"));
    const montant = Number(montantInput ? montantInput.value : 0) || p.montant_attendu;
    const noteInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_note"));

    await db.remboursements.add({
      id: uid(),
      id_membre: p.id_membre,
      id_paiement_concerne: idPaiement,
      date_remboursement: todayISO(),
      montant,
      note: noteInput ? noteInput.value.trim() : "",
    });

    await db.caisse_mouvements.add({
      id: uid(),
      date: todayISO(),
      type: "Entree",
      montant,
      libelle: `Remboursement de dette (${p.id_membre})`,
      categorie: null,
      justificatif: null,
      id_auteur: null,
      id_activite: null,
    });

    await log("remboursement", "cree", idPaiement);
    closeSheet();
    toast("Remboursement enregistre");
    renderDettes();
  });
}

// ============================================================================
// PRÊTS PERSONNELS ENTRE MEMBRES
// ============================================================================

/**
 * Rendu de la vue de gestion des prêts entre membres.
 */
async function renderPretsMembres() {
  app.innerHTML = `
    <button class="btn-chip" id="pretsBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Prets entre membres</h2></div>
    <div class="small-note" style="margin-bottom:12px;">Quand un membre absent se fait avancer sa cotisation par un autre, le groupe est deja regle. C'est ici que s'organisent les remboursements entre membres.</div>
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!pretsShowRembourses ? "active" : ""}" id="prets_filtre_attente">En attente</button>
      <button class="btn-chip ${pretsShowRembourses ? "active" : ""}" id="prets_filtre_rembourses">Rembourses</button>
    </div>
    <button class="btn btn-ghost" id="pretsExportBtn" style="margin-bottom:16px;">Exporter en PDF</button>
    <div id="pretsBox"></div>
  `;

  document.getElementById("pretsBackBtn").addEventListener("click", () => showTab("finance"));
  document.getElementById("prets_filtre_attente").addEventListener("click", () => {
    pretsShowRembourses = false;
    renderPretsMembres();
  });
  document.getElementById("prets_filtre_rembourses").addEventListener("click", () => {
    pretsShowRembourses = true;
    renderPretsMembres();
  });
  document.getElementById("pretsExportBtn").addEventListener("click", exportPretsMembresPDF);

  const prets = await pretsMembres({ nonRembourseSeulement: !pretsShowRembourses });
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const box = document.getElementById("pretsBox");

  box.innerHTML = prets.length
    ? prets.map((p) => {
        const debiteur = memById[p.id_debiteur];
        const preteur = memById[p.id_preteur];
        return `<div class="card" style="margin-bottom:10px;">
          <div class="detail-row" style="border:none;padding:0 0 4px;">
            <span class="k" style="font-weight:600;color:var(--text);">${debiteur ? esc(fullName(debiteur)) : "?"} doit a ${preteur ? esc(fullName(preteur)) : "?"}</span>
            <span class="v">${fmt(p.montant)}</span>
          </div>
          <div class="small-note" style="margin-bottom:10px;">${fmtDate(p.date)}${p.rembourse ? " &middot; Rembourse" : ""}</div>
          <button class="btn-chip ${p.rembourse ? "" : "active"}" data-toggle-pret="${p.id}">${p.rembourse ? "Marquer non rembourse" : "Marquer rembourse"}</button>
        </div>`;
      }).join("")
    : emptyHTML(pretsShowRembourses ? "Aucun pret rembourse pour l'instant." : "Aucun pret en attente. Tout le monde est a jour !");

  box.querySelectorAll("[data-toggle-pret]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.togglePret;
      const pret = prets.find((p) => p.id === id);
      await marquerPretRembourse(id, !pret.rembourse);
      toast(pret.rembourse ? "Marque non rembourse" : "Marque rembourse");
      renderPretsMembres();
    }),
  );
}

// ============================================================================
// MODULE ACTIVITÉS (Ex-Listes personnalisées)
// ============================================================================

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

      return `<div class="card liste-card" data-id="${l.id}" style="border-left:4px solid ${safeColor(l.couleur)};">
        <div class="liste-card-top">
          <span class="liste-icon" style="background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone)}</span>
          <div class="info">
            <div class="name">${esc(l.nom)} <span class="badge ${STATUT_ACTIVITE_BADGE[statutEvt]}" style="margin-left:4px;">${STATUT_ACTIVITE_LABEL[statutEvt]}</span>${fermee ? ` <span class="badge badge-no">Cloturee</span>` : ""}</div>
            <div class="meta">${fmtDate(l.date)} &middot; ${membres.length} participant${membres.length > 1 ? "s" : ""}${stats ? ` &middot; ${stats.payes} paye${stats.payes > 1 ? "s" : ""}/${membres.length}` : ""}</div>
            ${lieuHeure ? `<div class="meta">${lieuHeure}</div>` : ""}
          </div>
        </div>
        ${l.description ? `<div class="small-note" style="margin-top:6px;">${esc(l.description)}</div>` : ""}
      </div>`;
    }),
  );

  box.innerHTML = cardsHtml.join("");
  box.querySelectorAll(".liste-card").forEach((el) =>
    el.addEventListener("click", () => openListeDetail(/** @type {HTMLElement} */ (el).dataset.id)),
  );
}

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

  const couleurDepart = isEdit ? safeColor(liste.couleur) : LISTE_COULEURS[0];
  const iconeDepart = isEdit && LISTE_ICONES[liste.icone] ? liste.icone : LISTE_ICONE_KEYS[0];

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
    <div class="field"><label>Couleur</label><div class="swatch-row" id="l_couleur_row">${LISTE_COULEURS.map((c) => `<button type="button" class="swatch ${c === couleurDepart ? "active" : ""}" data-c="${c}" style="background:${c};" aria-label="Couleur ${c}"></button>`).join("")}</div></div>
    <div class="field"><label>Icone</label><div class="swatch-row" id="l_icone_row">${LISTE_ICONE_KEYS.map((k) => `<button type="button" class="swatch-icon ${k === iconeDepart ? "active" : ""}" data-i="${k}" aria-label="Icone ${k}">${listeIconSVG(k, 18)}</button>`).join("")}</div></div>
    <div class="field"><label for="l_notes">Notes</label><input id="l_notes" type="text" placeholder="Facultatif" value="${isEdit ? esc(liste.notes || "") : ""}"></div>
    ${!isEdit ? `<div class="small-note">Les frais (participation, transport...) se configurent depuis la fiche de l'activite. Une activite sans frais sert a suivre des participants.</div>` : ""}
    <button class="btn btn-primary" id="l_save" style="margin-top:12px;">${isEdit ? "Enregistrer" : "Creer l'activite"}</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  let couleur = couleurDepart;
  let icone = iconeDepart;

  ov.querySelectorAll("#l_couleur_row .swatch").forEach((b) =>
    b.addEventListener("click", () => {
      ov.querySelectorAll("#l_couleur_row .swatch").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      couleur = /** @type {HTMLElement} */ (b).dataset.c;
    }),
  );

  ov.querySelectorAll("#l_icone_row .swatch-icon").forEach((b) =>
    b.addEventListener("click", () => {
      ov.querySelectorAll("#l_icone_row .swatch-icon").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      icone = /** @type {HTMLElement} */ (b).dataset.i;
    }),
  );

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
      couleur,
      icone,
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
    <div class="liste-detail-head" style="border-left:4px solid ${safeColor(l.couleur)};padding-left:12px;">
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
    const totalRecu = valeurs.reduce((a, i) => a + i.paye, 0);

    statsBox.innerHTML = `
      <div class="activite-stats-grid">
        <div class="activite-stat"><div class="lbl">Total inscrits</div><div class="val">${inscrits.length}</div></div>
        ${frais.length ? `
          <div class="activite-stat"><div class="lbl">Payes</div><div class="val">${payes}</div></div>
          <div class="activite-stat"><div class="lbl">Partiels</div><div class="val">${partiels}</div></div>
          <div class="activite-stat"><div class="lbl">Total recu</div><div class="val">${fmt(totalRecu)}</div></div>` : ""}
      </div>`;
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
// MODULE CALENDRIER (Vues Mois, Semaine, Jour)
// ============================================================================

/**
 * Calcule le libellé de la période temporelle affichée dans le calendrier.
 * @returns {string}
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
 * @param {number} direction - (-1 ou +1)
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
      const color = e.type === "activite" ? safeColor(e.liste.couleur) : "var(--warning)";
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
          <span class="liste-icon" style="background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone)}</span>
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
// FINANCE — HUB CAISSE, DETTES & PRÊTS
// ============================================================================

/**
 * Onglet Finance : regroupe Caisse, Dettes et Prêts entre membres, qui
 * vivaient auparavant dispersés dans l'onglet "Plus" (Caisse, Prêts) et
 * dans un onglet à part (Dettes). Phase B : uniquement la navigation change
 * ici — le contenu de chaque destination reste celui d'avant la refonte ;
 * leur présentation commune sera revue en Phase G.
 */
async function renderFinance() {
  const cd = await caisseDetail();
  const dettesTotal = await totalDettesImpayees();
  const pretsEnAttente = (await pretsMembres({ nonRembourseSeulement: true })).length;

  app.innerHTML = `
    <div class="section-title" style="margin-top:0;"><h2>Finance</h2></div>
    <div class="card list-card" id="financeCaisseBox" style="margin-bottom:12px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path stroke-linecap="round" d="M6 12h.01M18 12h.01"/></svg></span>
        <div class="info"><div class="name">Caisse</div><div class="meta">Solde actuel : ${fmt(cd.solde)}</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    <div class="card list-card" id="financeDettesBox" style="margin-bottom:12px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--bg-danger);color:var(--danger);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4M12 16h.01"/></svg></span>
        <div class="info"><div class="name">Dettes</div><div class="meta">${dettesTotal > 0 ? `${fmt(dettesTotal)} impayes` : "Aucune dette en cours"}</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    <div class="card list-card" id="financePretsBox" style="margin-bottom:24px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--bg-warning);color:var(--warning);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2M9 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H11a2 2 0 0 0-2 2v9Z"/></svg></span>
        <div class="info"><div class="name">Prets entre membres</div><div class="meta">${pretsEnAttente > 0 ? `${pretsEnAttente} en attente de remboursement` : "Aucun pret en attente"}</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
  `;

  document.getElementById("financeCaisseBox").addEventListener("click", renderCaisse);
  document.getElementById("financeDettesBox").addEventListener("click", renderDettes);
  document.getElementById("financePretsBox").addEventListener("click", renderPretsMembres);
}

/**
 * Détail de la Caisse : solde, mouvements, dépenses par catégorie, dettes
 * impayées non incluses, ajout/ajustement manuels. Extrait tel quel de
 * l'ancien onglet "Plus" (Phase B : déplacement de navigation uniquement,
 * aucun changement de contenu ni de logique).
 */
async function renderCaisse() {
  const cd = await caisseDetail();
  const manuels = (await db.caisse_mouvements.toArray()).sort((a, b) => b.date.localeCompare(a.date));
  const depensesCat = await depensesParCategorie();
  const totalDepensesCategorisees = Object.values(depensesCat).reduce((a, v) => a + v, 0);

  app.innerHTML = `
    <button class="btn-chip" id="caisseBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Caisse</h2></div>
    <div class="card" style="text-align:center;padding:20px;margin-bottom:14px;">
      <div class="small-note">Solde actuel</div>
      <div class="num" style="font-family:var(--font-sans);font-size:28px;font-weight:700;color:var(--success);margin-top:2px;">${fmt(cd.solde)}</div>
    </div>
    <div class="card list-card" style="margin-bottom:14px;">
      <div class="detail-row"><span class="k">Cotisations encaissees</span><span class="v" style="color:var(--success);">+ ${fmt(cd.totalCollecte)}</span></div>
      <div class="detail-row"><span class="k">Cadeaux d'anniversaire verses</span><span class="v" style="color:var(--danger);">− ${fmt(cd.totalCadeauxVerses)}</span></div>
      <div class="detail-row"><span class="k">Entrees manuelles</span><span class="v" style="color:var(--success);">+ ${fmt(cd.entreesManuelles)}</span></div>
      <div class="detail-row"><span class="k">Sorties manuelles</span><span class="v" style="color:var(--danger);">− ${fmt(cd.sortiesManuelles)}</span></div>
      <div class="detail-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px;"><span class="k" style="font-weight:700;color:var(--text);">= Solde de la caisse</span><span class="v" style="font-size:16px;">${fmt(cd.solde)}</span></div>
    </div>
    ${
      totalDepensesCategorisees > 0
        ? `<div class="section-title" style="margin-top:0;"><h2>Depenses par categorie</h2></div>
           <div class="card list-card" style="margin-bottom:14px;">
             ${CATEGORIES_DEPENSE.filter((c) => depensesCat[c] > 0)
               .map((c) => `<div class="detail-row"><span class="k">${c}</span><span class="v">${fmt(depensesCat[c])}</span></div>`)
               .join("")}
           </div>`
        : ""
    }
    <div class="card" style="margin-bottom:18px;background:var(--bg-warning);border-color:transparent;">
      <div class="detail-row" style="border:none;padding:0;"><span class="k" style="color:var(--warning);">Dettes impayees (non incluses ci-dessus)</span><span class="v" style="color:var(--warning);">${fmt(cd.dettesImpayees)}</span></div>
      <div class="small-note" style="margin-top:6px;">Cet argent n'est pas en caisse : il correspond aux cotisations dues par des membres.</div>
    </div>
    <button class="btn btn-ghost" id="addMouvBtn" style="margin-bottom:10px;">+ Mouvement manuel (achat, depense...)</button>
    <button class="btn btn-ghost" id="ajusterCaisseBtn" style="margin-bottom:18px;">Ajuster la caisse (montant reel en main)</button>
    <div class="card list-card" id="mouvList" style="margin-bottom:24px;"></div>
  `;

  document.getElementById("caisseBackBtn").addEventListener("click", () => showTab("finance"));

  document.getElementById("mouvList").innerHTML =
    manuels.map((m) => `
      <div class="row" data-mv-id="${m.id}" style="cursor:pointer;">
        <div class="avatar" style="background:${m.type === "Entree" ? "var(--bg-success)" : "var(--bg-danger)"};color:${m.type === "Entree" ? "var(--success)" : "var(--danger)"};">${m.type === "Entree" ? "+" : "-"}</div>
        <div class="info">
          <div class="name">${esc(m.libelle)}${m.justificatif ? ` <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--text-3)" stroke-width="2" style="vertical-align:-2px;" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/></svg>` : ""}</div>
          <div class="meta">${fmtDate(m.date)}${m.categorie ? " &middot; " + esc(m.categorie) : ""}</div>
        </div>
        <span class="badge" style="background:${m.type === "Entree" ? "var(--bg-success)" : "var(--bg-danger)"};color:${m.type === "Entree" ? "var(--success)" : "var(--danger)"};">${m.type === "Entree" ? "+" : "-"}${fmt(m.montant)}</span>
      </div>`).join("") || emptyHTML("Aucun mouvement manuel.");

  document.querySelectorAll("#mouvList [data-mv-id]").forEach((row) =>
    row.addEventListener("click", () => openMouvementDetail(/** @type {HTMLElement} */ (row).dataset.mvId)),
  );

  document.getElementById("addMouvBtn").addEventListener("click", openAddMouvement);
  document.getElementById("ajusterCaisseBtn").addEventListener("click", openAjusterCaisse);
}

// ============================================================================
// ACTIVITÉS — HUB LISTES/ACTIVITÉS & CALENDRIER
// ============================================================================

/**
 * Onglet Activités : regroupe les Listes/Activités et le Calendrier, qui
 * vivaient tous deux comme simples liens dans l'ancien onglet "Plus".
 * Phase B : uniquement la navigation change ici.
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
    <div class="card list-card" id="activitesCalendrierBox" style="margin-bottom:24px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 2v3M16 2v3M3 9h18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg></span>
        <div class="info"><div class="name">Calendrier</div><div class="meta">Vue mois, semaine et jour des activites et anniversaires</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
  `;

  document.getElementById("activitesListesBox").addEventListener("click", renderListes);
  document.getElementById("activitesCalendrierBox").addEventListener("click", renderCalendrier);
}

// ============================================================================
// SYSTÈME — PARAMÈTRES, SAUVEGARDE, DÉMONSTRATION, EXPORT & ZONE DANGEREUSE
// ============================================================================

/** Onglet actif à restaurer quand on quitte l'écran Système. */
let systemeReturnTab = "accueil";

/**
 * Point d'entrée du Système : mémorise l'onglet courant pour pouvoir y
 * revenir, puis affiche l'écran Système. Appelé depuis l'icône dédiée de
 * la topbar (visible sur tous les écrans), et non depuis la barre
 * d'onglets — le Système est volontairement un espace séparé des 5
 * domaines métier (Accueil, Membres, Cotisations, Finance, Activités).
 */
function openSysteme() {
  systemeReturnTab = getCurrentTab();
  renderSysteme();
}

/**
 * Rendu de l'écran Système : reprend tel quel le contenu de l'ancien
 * onglet "Plus" une fois Caisse/Dettes/Prêts/Listes/Calendrier sortis
 * vers Finance et Activités. Phase B : uniquement la navigation change
 * ici ; la présentation de ces sections sera revue en Phase I.
 */
async function renderSysteme() {
  const montantCotis = await getParam("montant_cotisation_defaut", 500);
  const montantCadeau = await getParam("montant_cadeau_defaut", 12000);

  app.innerHTML = `
    <button class="btn-chip" id="systemeBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Systeme</h2></div>

    <div class="section-title" style="margin-top:0;"><h2>Parametres</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <div class="field"><label for="p_cotis">Cotisation par defaut (FCFA)</label><input id="p_cotis" type="number" value="${montantCotis}"></div>
      <div class="field"><label for="p_cadeau">Cadeau par defaut (FCFA)</label><input id="p_cadeau" type="number" value="${montantCadeau}"></div>
      <button class="btn btn-primary" id="saveParamsBtn">Enregistrer</button>
    </div>

    <div class="section-title"><h2>Sauvegarde</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <button class="btn btn-ghost" id="exportJsonBtn">Exporter une sauvegarde (JSON)</button>
      <label class="btn btn-ghost" style="display:block;text-align:center;margin-top:10px;cursor:pointer;">
        Importer une sauvegarde
        <input type="file" id="importJsonInput" accept="application/json" style="display:none;">
      </label>
      <div class="small-note">Utilise ceci pour changer d'appareil. L'import remplace toutes les donnees et exige le mot de passe administrateur.</div>
    </div>

    <div class="section-title"><h2>Donnees de test &amp; Demonstration</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <button class="btn btn-primary" id="btnLoadDemoData" style="margin-bottom:10px;">Charger les donnees de test</button>
      <button class="btn btn-ghost" id="btnResetAllData" style="color:var(--danger);border-color:rgba(185, 28, 28, 0.3);">Effacer toutes les donnees (remise a zero)</button>
      <div class="small-note" style="margin-top:10px;">Injecte un jeu complet de donnees (membres, cotisations, dettes, caisse, activites) pour essayer toutes les fonctionnalites, puis permet d'effacer les donnees de test en un clic.</div>
    </div>

    <div class="section-title"><h2>Export &amp; impression</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <button class="btn btn-ghost" id="exportMembresPdfBtn" style="margin-bottom:10px;">Membres — PDF</button>
      <button class="btn btn-ghost" id="exportDettesPdfBtn" style="margin-bottom:10px;">Dettes du groupe — PDF</button>
      <button class="btn btn-ghost" id="exportPretsPdfBtn" style="margin-bottom:10px;">Prets entre membres — PDF</button>
      <button class="btn btn-ghost" id="exportRapportPdfBtn" style="margin-bottom:10px;">Rapport complet — PDF</button>
      <div class="small-note">Documents prets a etre imprimes ou partages (PDF). Les prets personnels sont exportes separement des dettes du groupe.</div>
    </div>

    <div class="section-title"><h2>Apparence</h2></div>
    <div class="card" style="margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;">
      <span class="small-note" style="margin:0;">Theme sombre / clair</span>
      <button class="theme-switch" id="themeToggleBtn" aria-label="Changer de theme">
        <svg class="icon-sun" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
      </button>
    </div>

    <div class="section-title"><h2>A propos</h2></div>
    <div class="card small-note" style="margin-bottom:24px;">
      Application Progressive Web App 100% hors-ligne. Toutes les donnees sont stockees localement dans le navigateur (IndexedDB).
    </div>

    <div class="section-title"><h2>Zone dangereuse</h2></div>
    <div class="card" style="margin-bottom:24px;border-color:var(--danger);">
      <button class="btn btn-ghost" id="resetAnnivBtn" style="margin-bottom:10px;color:var(--danger);">Supprimer tous les anniversaires</button>
      <div class="small-note" style="margin-bottom:16px;">Efface la date d'anniversaire de tous les membres. Les membres eux-memes sont conserves.</div>
      <button class="btn btn-ghost" id="resetCotisBtn" style="color:var(--danger);">Reinitialiser cotisations, dettes et caisse</button>
      <div class="small-note">Remet a zero les paiements, dettes et mouvements de caisse. Les dimanches et membres restent intacts.</div>
    </div>
  `;

  document.getElementById("systemeBackBtn").addEventListener("click", () => showTab(systemeReturnTab));

  document.getElementById("saveParamsBtn").addEventListener("click", async () => {
    const cotis = Number(/** @type {HTMLInputElement} */ (document.getElementById("p_cotis")).value) || 500;
    const cadeau = Number(/** @type {HTMLInputElement} */ (document.getElementById("p_cadeau")).value) || 12000;
    await setParam("montant_cotisation_defaut", cotis);
    await setParam("montant_cadeau_defaut", cadeau);
    toast("Parametres enregistres");
  });

  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    toggleTheme();
    redrawAccueilCharts();
  });

  document.getElementById("exportJsonBtn").addEventListener("click", exportBackup);
  document.getElementById("importJsonInput").addEventListener("change", importBackup);
  document.getElementById("exportMembresPdfBtn").addEventListener("click", exportMembresPDF);
  document.getElementById("exportDettesPdfBtn").addEventListener("click", exportDettesPDF);
  document.getElementById("exportPretsPdfBtn").addEventListener("click", exportPretsMembresPDF);
  document.getElementById("exportRapportPdfBtn").addEventListener("click", exportRapportPDF);

  document.getElementById("btnLoadDemoData").addEventListener("click", async () => {
    const totalMembres = await db.membres.count();
    if (totalMembres > 0) {
      const ok = confirm("Attention : le chargement des donnees de test va remplacer les donnees actuelles. Voulez-vous continuer ?");
      if (!ok) return;
    }
    await genererDonneesDemo();
    toast("Donnees de test chargees avec succes !");
    await synchroniserSessionTopBar();
    showTab("accueil");
  });

  document.getElementById("btnResetAllData").addEventListener("click", async () => {
    const configured = await isAdminConfigured();
    let ok = false;
    if (configured) {
      ok = await confirmWithPassword(
        "Cette action va supprimer TOUTES les donnees (membres, cotisations, caisse, activites) pour retrouver une application vierge. Confirme avec le mot de passe administrateur."
      );
    } else {
      ok = confirm("Attention : cette action va supprimer toutes les donnees pour retrouver une base totalement vierge. Continuer ?");
    }
    if (!ok) return;
    await reinitialiserToutesDonnees();
    toast("Toutes les donnees ont ete effacees");
    await synchroniserSessionTopBar();
    showTab("accueil");
  });

  document.getElementById("resetAnnivBtn").addEventListener("click", async () => {
    const ok = await confirmWithPassword(
      "Ceci va effacer la date d'anniversaire de TOUS les membres. Cette action est definitive. Confirme avec le mot de passe administrateur.",
    );
    if (!ok) return;
    await supprimerTousLesAnniversairesMembres();
    toast("Tous les anniversaires ont ete supprimes");
    renderSysteme();
  });

  document.getElementById("resetCotisBtn").addEventListener("click", async () => {
    const ok = await confirmWithPassword(
      "Ceci va remettre a zero les paiements, les dettes et les mouvements de caisse. Les dimanches et les membres ne sont jamais touches. Confirme avec le mot de passe administrateur.",
    );
    if (!ok) return;
    const avant = await db.membres.count();
    await reinitialiserCotisations();
    const apres = await db.membres.count();
    toast(`Cotisations reinitialisees — ${apres} membres conserves (${avant} avant)`);
    renderSysteme();
  });
}

/**
 * Formulaire de saisie d'un mouvement manuel de caisse (Entrée ou Sortie/Dépense).
 */
function openAddMouvement() {
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Nouveau mouvement de caisse</h3>
    <div class="field"><label for="mv_type">Type</label>
      <select id="mv_type"><option value="Sortie">Sortie (depense)</option><option value="Entree">Entree</option></select>
    </div>
    <div class="field"><label for="mv_montant">Montant</label><input id="mv_montant" type="number"></div>
    <div class="field"><label for="mv_libelle">Libelle</label><input id="mv_libelle" type="text" placeholder="Ex. Achat cadeau"></div>
    <div id="mv_depense_fields">
      <div class="field"><label for="mv_categorie">Categorie</label>
        <select id="mv_categorie">${CATEGORIES_DEPENSE.map((c) => `<option value="${c}">${c}</option>`).join("")}</select>
      </div>
      <div class="field"><label for="mv_auteur">Depense par (facultatif)</label><select id="mv_auteur"><option value="">Chargement...</option></select></div>
      <div class="field"><label for="mv_activite">Activite liee (facultatif)</label><select id="mv_activite"><option value="">Aucune</option></select></div>
      <div class="field">
        <label for="mv_photo">Justificatif photo (facultatif)</label>
        <input id="mv_photo" type="file" accept="image/*" capture="environment">
        <div id="mv_photo_preview" style="margin-top:8px;"></div>
      </div>
    </div>
    <button class="btn btn-primary" id="mv_save">Enregistrer</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  optionsMembresActifs(null).then((html) => {
    ov.querySelector("#mv_auteur").innerHTML = html;
  });

  db.listes.toArray().then((listes) => {
    const options = listes
      .filter((l) => !l.archivee)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((l) => `<option value="${l.id}">${esc(l.nom)}</option>`)
      .join("");
    ov.querySelector("#mv_activite").insertAdjacentHTML("beforeend", options);
  });

  let photoBase64 = null;
  ov.querySelector("#mv_photo").addEventListener("change", async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files[0];
    if (!file) return;
    const preview = ov.querySelector("#mv_photo_preview");
    preview.textContent = "Compression de la photo...";
    try {
      photoBase64 = await compresserPhoto(file);
      preview.innerHTML = `<img src="${photoBase64}" alt="Justificatif" style="max-width:100%;max-height:180px;border-radius:8px;display:block;">`;
    } catch {
      photoBase64 = null;
      preview.textContent = "";
      toast("Photo illisible, reessaie avec une autre image", "error");
    }
  });

  const toggleDepenseFields = () => {
    ov.querySelector("#mv_depense_fields").style.display =
      /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_type")).value === "Sortie" ? "" : "none";
  };
  ov.querySelector("#mv_type").addEventListener("change", toggleDepenseFields);
  toggleDepenseFields();

  ov.querySelector("#mv_save").addEventListener("click", async () => {
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#mv_montant"));
    const montant = Number(montantInput ? montantInput.value : 0);
    if (!montant || montant <= 0) {
      toast("Montant invalide", "error");
      return;
    }

    const type = /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_type")).value;
    const estDepense = type === "Sortie";

    await db.caisse_mouvements.add({
      id: uid(),
      date: todayISO(),
      type,
      montant,
      libelle: /** @type {HTMLInputElement} */ (ov.querySelector("#mv_libelle")).value.trim() || "Mouvement manuel",
      categorie: estDepense ? /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_categorie")).value : null,
      justificatif: estDepense ? photoBase64 : null,
      id_auteur: estDepense ? /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_auteur")).value || null : null,
      id_activite: estDepense ? /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_activite")).value || null : null,
    });

    await log("caisse", "mouvement_manuel", montant);
    closeSheet();
    toast(estDepense ? "Depense enregistree" : "Mouvement enregistre");
    renderCaisse();
  });
}

/**
 * Fiche détaillée en lecture seule d'un mouvement de caisse avec justificatif.
 * @param {string} id
 */
async function openMouvementDetail(id) {
  const m = await db.caisse_mouvements.get(id);
  if (!m) return;

  const auteur = m.id_auteur ? await db.membres.get(m.id_auteur) : null;
  const activite = m.id_activite ? await db.listes.get(m.id_activite) : null;

  openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${esc(m.libelle)}</h3>
    <div class="detail-row"><span class="k">Type</span><span class="v">${m.type === "Entree" ? "Entree" : "Sortie (depense)"}</span></div>
    <div class="detail-row"><span class="k">Montant</span><span class="v">${fmt(m.montant)}</span></div>
    <div class="detail-row"><span class="k">Date</span><span class="v">${fmtDate(m.date)}</span></div>
    ${m.categorie ? `<div class="detail-row"><span class="k">Categorie</span><span class="v">${esc(m.categorie)}</span></div>` : ""}
    ${auteur ? `<div class="detail-row"><span class="k">Depense par</span><span class="v">${esc(fullName(auteur))}</span></div>` : ""}
    ${activite ? `<div class="detail-row"><span class="k">Activite liee</span><span class="v">${esc(activite.nom)}</span></div>` : ""}
    ${m.justificatif ? `<div class="field"><label>Justificatif</label><img src="${m.justificatif}" alt="Justificatif" style="max-width:100%;border-radius:8px;display:block;"></div>` : ""}
  `).querySelector("[data-close]").addEventListener("click", closeSheet);
}

/**
 * Modale d'ajustement comptable de la caisse (réconciliation du montant réel en main).
 */
async function openAjusterCaisse() {
  const cd = await caisseDetail();
  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Ajuster la caisse</h3>
    <div class="small-note" style="margin-bottom:12px;">Solde calcule : <b>${fmt(cd.solde)}</b>. Indique le montant reel en main : l'app comblera automatiquement l'ecart sans effacer l'historique.</div>
    <div class="field"><label for="aj_montant">Montant reel en main (FCFA)</label><input id="aj_montant" type="number" value="${cd.solde}"></div>
    <button class="btn btn-primary" id="aj_save">Ajuster</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#aj_save").addEventListener("click", async () => {
    const input = /** @type {HTMLInputElement} */ (ov.querySelector("#aj_montant"));
    const montant = Number(input ? input.value : NaN);

    if (isNaN(montant)) {
      toast("Montant invalide", "error");
      return;
    }

    const { ecart } = await ajusterCaisse(montant);
    closeSheet();
    toast(ecart === 0 ? "Deja a jour" : `Caisse ajustee (${ecart > 0 ? "+" : ""}${fmt(ecart)})`);
    renderCaisse();
  });
}

// ============================================================================
// SAUVEGARDE & RESTAURATION COMPLÈTE JSON (Fix critique perte de données)
// ============================================================================

/**
 * Liste blanche exhaustive des tables de la base de données IndexedDB.
 * DOIT être mise à jour à chaque évolution de schéma.
 * @type {readonly string[]}
 */
const TABLES_APPLICATION = Object.freeze([
  "membres",
  "sessions",
  "dimanches",
  "anniversaires_du_jour",
  "paiements",
  "remboursements",
  "caisse_mouvements",
  "parametres",
  "activity_log",
  "listes",
  "liste_membres",
  "prets_membres",
  "liste_frais",
  "liste_paiements",
]);

/**
 * Exporte l'intégralité de la base de données dans un fichier JSON structuré.
 * Garantit l'inclusion des tables d'activités (liste_frais, liste_paiements).
 */
async function exportBackup() {
  const data = {};
  for (const t of TABLES_APPLICATION) {
    data[t] = await db[t].toArray();
  }

  const blob = new Blob(
    [JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data }, null, 2)],
    { type: "application/json" },
  );

  const resultat = await partagerOuTelechargerFichier(
    blob,
    `m3d-sauvegarde-${todayISO()}.json`,
    "application/json",
  );

  if (resultat === "annule") return;

  await setParam("derniere_sauvegarde", new Date().toISOString());
  toast(
    resultat === "partage"
      ? "Sauvegarde prete — choisis ou l'enregistrer (Fichiers, Drive, etc.)."
      : "Sauvegarde telechargee avec succes.",
  );
}

/**
 * Restaure une sauvegarde JSON en écrasant les données existantes de manière transactionnelle.
 * Exige la confirmation par mot de passe administrateur.
 *
 * @param {Event} e - Événement de sélection de fichier.
 */
async function importBackup(e) {
  const file = /** @type {HTMLInputElement} */ (e.target).files[0];
  if (!file) return;

  const ok = await confirmWithPassword(
    "Importer va REMPLACER l'ensemble des donnees par le contenu de ce fichier de sauvegarde. Confirme avec le mot de passe administrateur.",
  );

  if (!ok) {
    /** @type {HTMLInputElement} */ (e.target).value = "";
    return;
  }

  try {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

    const parsed = JSON.parse(/** @type {string} */ (text));
    if (!parsed || typeof parsed !== "object" || typeof parsed.data !== "object" || parsed.data === null) {
      throw new Error("Structure du fichier de sauvegarde invalide.");
    }

    const tablesAImporter = Object.keys(parsed.data).filter(
      (t) => TABLES_APPLICATION.indexOf(t) !== -1 && Array.isArray(parsed.data[t]),
    );

    if (tablesAImporter.length === 0) {
      throw new Error("Aucune table reconnue dans ce fichier.");
    }

    await db.transaction("rw", tablesAImporter.map((t) => db[t]), async () => {
      for (const t of tablesAImporter) {
        await db[t].clear();
        await db[t].bulkAdd(parsed.data[t]);
      }
    });

    toast("Sauvegarde restauree avec succes");
    synchroniserSessionTopBar();
    showTab("accueil");
  } catch (err) {
    toast(`Fichier invalide : ${err.message || "erreur inconnue"}`, "error");
  }

  /** @type {HTMLInputElement} */ (e.target).value = "";
}

// ============================================================================
// MOTEUR D'EXPORTS PDF & DOCUMENTS IMPRIMABLES
// ============================================================================

/**
 * Ouvre une fenêtre dédiée synchrone pour contourner les bloqueurs de popup.
 * @returns {Window|null}
 */
function openPrintableWindow() {
  const win = window.open("", "_blank");
  if (!win) {
    toast("Autorise les fenetres popup pour imprimer / exporter en PDF", "error");
    return null;
  }
  return win;
}

/**
 * Injecte le document HTML formaté dans la fenêtre popup et lance l'impression système.
 *
 * @param {Window} win
 * @param {string} title
 * @param {string} bodyHtml
 */
function writePrintableDocument(win, title, bodyHtml) {
  const style = `
    body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111827;margin:24px;}
    h1{color:#6366F1;font-size:21px;margin-bottom:2px;}
    h2{font-size:15px;margin-top:24px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;}
    table{border-collapse:collapse;width:100%;margin-top:8px;}
    td,th{border:1px solid #D1D5DB;padding:6px 8px;font-size:12.5px;text-align:left;}
    th{background:#F3F4F6;}
    .meta{color:#6B7280;font-size:12.5px;margin-bottom:14px;}
    .print-bar{margin-bottom:18px;}
    .print-bar button{font:inherit;padding:9px 16px;border-radius:8px;border:none;background:#6366F1;color:#fff;cursor:pointer;}
    @media print { .print-bar{display:none;} }
  `;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head><body>
    <div class="print-bar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
    ${bodyHtml}
  </body></html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  win.location.href = url;

  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch (e) {}
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

/**
 * Exporte la liste complète des membres au format PDF.
 */
async function exportMembresPDF() {
  const win = openPrintableWindow();
  const membres = await listMembres();

  const rows = membres.map((m) => `<tr>
    <td>${esc(m.nom || "")}</td><td>${esc(m.prenom || "")}</td><td>${esc(m.telephone || "—")}</td>
    <td>${esc(m.fonction || "Membre")}</td>
    <td>${m.jour_anniversaire ? `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}` : "—"}</td>
    <td>${m.date_adhesion ? fmtDate(m.date_adhesion) : "—"}</td>
    <td>${m.statut}</td>
  </tr>`).join("");

  const body = `
    <h1>Jeunesse M3D — Liste des membres</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${membres.length} membres</div>
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th><th>Fonction</th><th>Anniversaire</th><th>Date d'ajout</th><th>Statut</th></tr>${rows}</table>
  `;

  if (win) writePrintableDocument(win, "Membres — M3D", body);
}

/**
 * Exporte la fiche financière et organisationnelle individuelle d'un membre.
 * @param {string} idMembre
 */
async function exportMembreIndividuelPDF(idMembre) {
  const win = openPrintableWindow();
  const r = await rapportIndividuelMembre(idMembre);
  const nom = fullName(r.membre);

  const collecteRows = r.historique.slice().reverse().map((h) => `<tr>
    <td>${fmtDate(h.date)}</td>
    <td>${h.a_paye ? "Paye" : "Non paye"}</td>
    <td>${fmt(h.montant_attendu)}</td>
    <td>${h.beneficiaires.length ? esc(h.beneficiaires.join(", ")) : "—"}</td>
  </tr>`).join("") || `<tr><td colspan="4">Aucune collecte enregistree</td></tr>`;

  const detteRows = r.detteGroupeDetail.map((d) =>
    `<tr><td>${fmtDate(d.date)}</td><td>${fmt(d.montant)}</td></tr>`,
  ).join("") || `<tr><td colspan="2">Aucune dette envers le groupe</td></tr>`;

  const pretsADevoirRows = r.pretsADevoirEnAttente.map((p) =>
    `<tr><td>${esc(p.autreMembre)}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
  ).join("") || `<tr><td colspan="3">Aucun pret en attente</td></tr>`;

  const pretsARecevoirRows = r.pretsARecevoirEnAttente.map((p) =>
    `<tr><td>${esc(p.autreMembre)}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
  ).join("") || `<tr><td colspan="3">Personne ne doit rembourser ce membre</td></tr>`;

  const body = `
    <h1>Jeunesse M3D — Fiche individuelle</h1>
    <div class="meta">${esc(nom)} &middot; ${esc(r.membre.fonction || "Membre")} &middot; Genere le ${fmtDate(r.genereLe)}</div>

    <h2>Resume financier</h2>
    <table>
      <tr><th>Total collecte attendu (toutes semaines)</th><td>${fmt(r.totalCollecteAttendu)}</td></tr>
      <tr><th>Total effectivement paye</th><td>${fmt(r.totalCollectePaye)}</td></tr>
      <tr><th>Dette envers le groupe</th><td>${fmt(r.detteGroupeTotal)}</td></tr>
      <tr><th>Prets a rembourser a d'autres membres</th><td>${fmt(r.pretsADevoirTotal)}</td></tr>
      <tr><th>Prets a recevoir d'autres membres</th><td>${fmt(r.pretsARecevoirTotal)}</td></tr>
    </table>

    <h2>Collecte — detail (${r.historique.length} dimanches)</h2>
    <table><tr><th>Date</th><th>Statut</th><th>Montant</th><th>Beneficiaire(s)</th></tr>${collecteRows}</table>

    <h2>Dette envers le groupe (Total : ${fmt(r.detteGroupeTotal)})</h2>
    <table><tr><th>Date</th><th>Montant</th></tr>${detteRows}</table>

    <h2>Prets que ${esc(r.membre.prenom)} doit rembourser (Total : ${fmt(r.pretsADevoirTotal)})</h2>
    <table><tr><th>Preteur</th><th>Montant</th><th>Date</th></tr>${pretsADevoirRows}</table>

    <h2>Prets dus a ${esc(r.membre.prenom)} (Total : ${fmt(r.pretsARecevoirTotal)})</h2>
    <table><tr><th>Debiteur</th><th>Montant</th><th>Date</th></tr>${pretsARecevoirRows}</table>
  `;

  if (win) writePrintableDocument(win, `Fiche — ${nom} — M3D`, body);
}

/**
 * Assistant de regroupement par membre pour les exports imprimables.
 */
function grouperParMembreHTML(items, cleGroupe, nomEtSousTitre, montant, ligneDetail, enteteDetail) {
  const groupes = Array.from(groupBy(items, cleGroupe).values()).map((liste) => {
    const { nom, sousTitre } = nomEtSousTitre(liste);
    return {
      nom,
      sousTitre,
      sousTotal: liste.reduce((a, it) => a + montant(it), 0),
      detail: liste.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")),
    };
  }).sort((a, b) => b.sousTotal - a.sousTotal);

  const html = groupes.map((g) => `
    <h2>${esc(g.nom)}${g.sousTitre ? ` &middot; ${esc(g.sousTitre)}` : ""} — Total : ${fmt(g.sousTotal)}</h2>
    <table><tr>${enteteDetail}</tr>${g.detail.map(ligneDetail).join("")}</table>`,
  ).join("") || `<p>Aucune donnee.</p>`;

  return { groupes, html };
}

/**
 * Exporte l'état des dettes du groupe au format PDF.
 */
async function exportDettesPDF() {
  const win = openPrintableWindow();
  const dettes = (await dettesList()).filter((d) => d.statut === "Impayee");
  const total = dettes.reduce((a, d) => a + d.montant, 0);

  const { groupes, html: sections } = grouperParMembreHTML(
    dettes,
    "id_membre",
    (liste) => ({ nom: liste[0].membre, sousTitre: liste[0].telephone }),
    (d) => d.montant,
    (d) => `<tr><td>${fmtDate(d.date)}</td><td>${fmt(d.montant)}</td></tr>`,
    `<th>Date</th><th>Montant</th>`,
  );

  const body = `
    <h1>Jeunesse M3D — Dettes du groupe</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${groupes.length} membres &middot; ${dettes.length} dettes</div>
    ${sections}
    <h2>Total general</h2>
    <table><tr><th>Total des dettes impayees</th><td>${fmt(total)}</td></tr></table>
  `;

  if (win) writePrintableDocument(win, "Dettes du groupe — M3D", body);
}

/**
 * Exporte le suivi des prêts personnels entre membres au format PDF.
 */
async function exportPretsMembresPDF() {
  const win = openPrintableWindow();
  const prets = await pretsMembres();
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) => (memById[id] ? fullName(memById[id]) : "?");

  const enAttente = prets.filter((p) => !p.rembourse);
  const totalEnAttente = enAttente.reduce((a, p) => a + p.montant, 0);

  const { groupes, html: sections } = grouperParMembreHTML(
    enAttente,
    "id_debiteur",
    (liste) => ({ nom: nomOf(liste[0].id_debiteur), sousTitre: "" }),
    (p) => p.montant,
    (p) => `<tr><td>${esc(nomOf(p.id_preteur))}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
    `<th>A avance</th><th>Montant</th><th>Date</th>`,
  );

  const body = `
    <h1>Jeunesse M3D — Prets entre membres</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${groupes.length} membres &middot; ${enAttente.length} prets en cours</div>
    ${sections}
    <h2>Total en attente</h2>
    <table><tr><th>Total des prets non rembourses</th><td>${fmt(totalEnAttente)}</td></tr></table>
  `;

  if (win) writePrintableDocument(win, "Prets entre membres — M3D", body);
}

/**
 * Exporte la feuille de collecte d'un dimanche au format PDF.
 * @param {string} idDimanche
 */
async function exportCotisationPDF(idDimanche) {
  const win = openPrintableWindow();
  const jours = await joursAvecStats();
  const j = jours.find((x) => x.dimanche.id === idDimanche);

  if (!j) {
    if (win) win.close();
    toast("Dimanche introuvable", "error");
    return;
  }

  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));

  const rows = j.paiements.map((p) => {
    const m = memById[p.id_membre];
    return `<tr>
      <td>${m ? esc(m.nom) : "?"}</td><td>${m ? esc(m.prenom) : "?"}</td><td>${m ? esc(m.telephone || "—") : "—"}</td>
      <td>${fmt(p.montant_paye)}</td><td>${p.a_paye ? fmtDate(j.dimanche.date) : "—"}</td>
      <td>${p.a_paye ? "Paye" : "Non paye"}</td>
    </tr>`;
  }).join("");

  const nonPayants = j.paiements.filter((p) => !p.a_paye).map((p) => memById[p.id_membre]).filter(Boolean);

  const body = `
    <h1>Cotisation anniversaire — ${esc(j.beneficiaires.join(", ")) || "Collecte normale"}</h1>
    <div class="meta">Dimanche du ${fmtDate(j.dimanche.date)}</div>
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th><th>Montant paye</th><th>Date</th><th>Statut</th></tr>${rows}</table>
    <h2>Recapitulatif</h2>
    <table>
      <tr><th>Participants total</th><td>${j.nbTotal}</td></tr>
      <tr><th>Ont cotise</th><td>${j.nbPayants}</td></tr>
      <tr><th>N'ont pas cotise</th><td>${j.nbTotal - j.nbPayants}</td></tr>
      <tr><th>Montant attendu / pers.</th><td>${fmt(j.montantAttendu)}</td></tr>
      <tr><th>Total encaisse</th><td>${fmt(j.totalCollecte)}</td></tr>
    </table>
    <h2>Membres n'ayant pas paye (${nonPayants.length})</h2>
    ${nonPayants.length ? `<ul>${nonPayants.map((m) => `<li>${esc(fullName(m))}</li>`).join("")}</ul>` : `<p>Tous les membres ont cotise.</p>`}
  `;

  if (win) writePrintableDocument(win, "Cotisation — M3D", body);
}

/**
 * Exporte la feuille d'une activité personnalisée au format PDF.
 * @param {string} id
 */
async function exportListePDF(id) {
  const win = openPrintableWindow();
  const l = await db.listes.get(id);
  if (!l) {
    if (win) win.close();
    toast("Activite introuvable", "error");
    return;
  }

  const membres = await membresDeListe(id);
  const frais = await listeFraisAll(id);
  const infos = await Promise.all(membres.map((m) => infosParticipantActivite(id, m.id)));

  const rows = membres.map((m, i) => {
    const inf = infos[i];
    return `<tr>
      <td>${esc(m.nom || "")}</td><td>${esc(m.prenom || "")}</td><td>${esc(m.telephone || "—")}</td>
      <td>${fmt(inf.attendu)}</td><td>${fmt(inf.paye)}</td><td>${fmt(inf.reste)}</td>
      <td>${STATUT_PAIEMENT_LABEL[inf.statut]}</td>
    </tr>`;
  }).join("");

  const body = `
    <h1>Activite — ${esc(l.nom)}</h1>
    <div class="meta">Date : ${fmtDate(l.date)}${l.lieu ? " &middot; Lieu : " + esc(l.lieu) : ""} &middot; ${membres.length} participant(s)</div>
    ${l.description ? `<p>${esc(l.description)}</p>` : ""}
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th><th>Attendu</th><th>Paye</th><th>Reste</th><th>Statut</th></tr>${rows}</table>
  `;

  if (win) writePrintableDocument(win, `Activite — ${l.nom} — M3D`, body);
}

/**
 * Exporte le rapport financier et associatif complet au format PDF.
 */
async function exportRapportPDF() {
  const win = openPrintableWindow();
  const r = await rapportStats();

  const fonctionsRows = Object.entries(r.parFonction).map(([f, n]) => `<tr><td>${f}</td><td>${n}</td></tr>`).join("");
  const moisRows = r.parMois.map((x) => `<tr><td>${x.mois}</td><td>${x.nb}</td></tr>`).join("");
  const histRows = r.joursStats.map((j) =>
    `<tr><td>${fmtDate(j.dimanche.date)}</td><td>${esc(j.beneficiaires.join(", ")) || "—"}</td><td>${fmt(j.totalCollecte)}</td><td>${j.nbPayants}/${j.nbTotal}</td></tr>`,
  ).join("");

  const body = `
    <h1>Jeunesse M3D — Rapport general</h1>
    <div class="meta">Genere le ${fmtDate(r.genereLe)}</div>
    <h2>Resume general</h2>
    <table>
      <tr><th>Membres</th><td>${r.totalMembres}</td></tr>
      <tr><th>Dimanches de collecte</th><td>${r.nbDimanches}</td></tr>
      <tr><th>Total collecte</th><td>${fmt(r.totalCollecte)}</td></tr>
      <tr><th>Total cadeaux distribues</th><td>${fmt(r.totalDistribue)}</td></tr>
      <tr><th>Solde en caisse</th><td>${fmt(r.solde)}</td></tr>
      <tr><th>Dettes impayees</th><td>${fmt(r.dettesTotal)}</td></tr>
      <tr><th>Taux de participation moyen</th><td>${Math.round(r.tauxParticipationGlobal * 100)}%</td></tr>
      <tr><th>Activites actives</th><td>${r.nbListes}</td></tr>
    </table>
    <h2>Repartition par fonction</h2>
    <table><tr><th>Fonction</th><th>Membres</th></tr>${fonctionsRows}</table>
    <h2>Anniversaires par mois</h2>
    <table><tr><th>Mois</th><th>Membres</th></tr>${moisRows}</table>
    <h2>Historique des cotisations (${r.joursStats.length})</h2>
    <table><tr><th>Date</th><th>Anniversaire(s)</th><th>Total</th><th>Cotisants</th></tr>${histRows}</table>
  `;

  if (win) writePrintableDocument(win, "Rapport general — M3D", body);
}

// ============================================================================
// MODALE DES MEMBRES À RELANCER
// ============================================================================

/**
 * Affiche la feuille des membres en retard de cotisation avec lien WhatsApp direct.
 *
 * @param {any[]} liste
 */
function openARelancerSheet(liste) {
  const rows = liste.map((x) => {
    const tel = (x.membre.telephone || "").replace(/\s+/g, "");
    const waLink = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(`Bonjour ${x.membre.prenom}, petit rappel amical pour la cotisation de la Jeunesse M3D.`)}` : null;

    return `
      <div class="row" style="cursor:default;">
        <div class="avatar" style="background:var(--bg-danger);color:var(--danger);">${initials(x.membre)}</div>
        <div class="info">
          <div class="name">${esc(fullName(x.membre))}</div>
          <div class="meta">${x.nbImpayes} dimanche(s) impaye(s) &middot; ${fmt(x.totalDu)}</div>
        </div>
        ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn-chip" style="text-decoration:none;">Relancer</a>` : `<span class="small-note">Sans numero</span>`}
      </div>`;
  }).join("") || emptyHTML("Personne a relancer, tout le monde est a jour !");

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Membres a relancer (${liste.length})</h3>
    <div style="margin-top:12px;">${rows}</div>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
}

// ============================================================================
// ÉCRANS D'INITIALISATION DU MOT DE PASSE & CONNEXION ADMIN
// ============================================================================

/**
 * Écran d'accueil au tout premier lancement demandant la création du mot de passe.
 */
function showSetupScreen() {
  const el = authOverlay(`
    <div class="auth-logo" style="color:var(--accent);">${LOGO_SVG}</div>
    <h2>Bienvenue sur M3D Gestion</h2>
    <p class="small-note">Cree un mot de passe administrateur. Il sera demande a l'ouverture et pour toute operation sensible.</p>
    ${pwField("su_pw", "Mot de passe", "new-password")}
    ${pwField("su_pw2", "Confirme le mot de passe", "new-password")}
    <div class="auth-error" id="su_err"></div>
    <button class="btn btn-primary" id="su_go">Creer et continuer</button>
  `);

  const doSetup = async () => {
    const pw = /** @type {HTMLInputElement} */ (el.querySelector("#su_pw")).value;
    const pw2 = /** @type {HTMLInputElement} */ (el.querySelector("#su_pw2")).value;
    const errEl = el.querySelector("#su_err");

    if (pw.length < 4) {
      errEl.textContent = "4 caracteres minimum.";
      return;
    }
    if (pw !== pw2) {
      errEl.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }

    await setAdminPassword(pw);
    setSessionAuthed(true);
    el.remove();
    synchroniserSessionTopBar();
    showTab("accueil");
  };

  el.querySelector("#su_go").addEventListener("click", doSetup);
  el.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSetup();
    });
  });
}

/**
 * Écran de connexion demandant le mot de passe administrateur.
 */
function showLoginScreen() {
  const el = authOverlay(`
    <div class="auth-logo" style="color:var(--accent);">${LOGO_SVG}</div>
    <h2>Jeunesse M3D</h2>
    <p class="small-note">Entre le mot de passe administrateur pour acceder a l'application.</p>
    ${pwField("li_pw", "Mot de passe")}
    <div class="auth-error" id="li_err"></div>
    <button class="btn btn-primary" id="li_go">Se connecter</button>
  `);

  const doLogin = async () => {
    const pwInput = /** @type {HTMLInputElement} */ (el.querySelector("#li_pw"));
    const pw = pwInput ? pwInput.value : "";
    const ok = await verifyAdminPassword(pw);

    if (!ok) {
      el.querySelector("#li_err").textContent = "Mot de passe incorrect.";
      return;
    }

    setSessionAuthed(true);
    el.remove();
    synchroniserSessionTopBar();
    showTab("accueil");
  };

  el.querySelector("#li_go").addEventListener("click", doLogin);
  el.querySelector("#li_pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
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