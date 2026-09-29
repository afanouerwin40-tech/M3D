/**
 * @file systeme.js - Écran Système, sauvegarde JSON, modales de relance et écrans d'authentification.
 * @description Regroupe les paramètres, la sauvegarde/restauration complète,
 * la zone dangereuse, l'export de données, les feuilles de relance et de prêts
 * en attente, ainsi que les écrans de création et de saisie du mot de passe.
 */

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
  const organisation = await getParam("organisation_nom", "Jeunesse M3D");

  app.innerHTML = `
    <button class="btn-chip" id="systemeBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Systeme</h2></div>

    <div class="section-title" style="margin-top:0;"><h2>Parametres</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <div class="field"><label for="p_organisation">Nom de l'organisation</label><input id="p_organisation" type="text" value="${esc(organisation)}" maxlength="80" placeholder="Jeunesse M3D"><div class="small-note">Imprime en en-tete de tous les exports PDF.</div></div>
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

    <div class="section-title" style="color:var(--danger);"><h2>Zone dangereuse</h2></div>
    <div class="alert alert--danger" style="margin-bottom:14px;">
      <svg class="alert-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4M12 17h.01"/><path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
      <div class="alert-body">
        <div class="alert-title">Actions irreversibles</div>
        <div class="small-note" style="margin-top:2px;">Chacune des actions ci-dessous demande le mot de passe administrateur et ne peut pas etre annulee. Exporte une sauvegarde avant de continuer si tu n'es pas certain.</div>
      </div>
    </div>
    <div class="card" style="margin-bottom:12px;border-color:var(--danger);background:var(--bg-danger);">
      <button class="btn btn-ghost" id="btnResetAllData" style="color:var(--danger);border-color:var(--danger);">Effacer toutes les donnees (remise a zero)</button>
      <div class="small-note" style="margin-top:10px;">Supprime definitivement membres, cotisations, dettes, caisse et activites pour retrouver une application vierge.</div>
    </div>
    <div class="card" style="margin-bottom:12px;border-color:var(--danger);background:var(--bg-danger);">
      <button class="btn btn-ghost" id="resetAnnivBtn" style="color:var(--danger);border-color:var(--danger);">Supprimer tous les anniversaires</button>
      <div class="small-note" style="margin-top:10px;">Efface la date d'anniversaire de tous les membres. Les membres eux-memes sont conserves.</div>
    </div>
    <div class="card" style="margin-bottom:24px;border-color:var(--danger);background:var(--bg-danger);">
      <button class="btn btn-ghost" id="resetCotisBtn" style="color:var(--danger);border-color:var(--danger);">Reinitialiser cotisations, dettes et caisse</button>
      <div class="small-note" style="margin-top:10px;">Remet a zero les paiements, dettes et mouvements de caisse. Les dimanches et membres restent intacts.</div>
    </div>
  `;

  document.getElementById("systemeBackBtn").addEventListener("click", () => showTab(systemeReturnTab));

  document.getElementById("saveParamsBtn").addEventListener("click", async () => {
    const cotis = Number(/** @type {HTMLInputElement} */ (document.getElementById("p_cotis")).value) || 500;
    const cadeau = Number(/** @type {HTMLInputElement} */ (document.getElementById("p_cadeau")).value) || 12000;
    const nomOrg = String(/** @type {HTMLInputElement} */ (document.getElementById("p_organisation")).value).trim();
    await setParam("montant_cotisation_defaut", cotis);
    await setParam("montant_cadeau_defaut", cadeau);
    // Un nom vide ferait disparaitre l'identite de tous les exports : on
    // refuse d'ecrire une valeur vide plutot que de la corriger apres coup.
    if (nomOrg) await setParam("organisation_nom", nomOrg);
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
  "dons",
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
// MODALE DES MEMBRES À RELANCER

// ============================================================================

/**
 * Affiche la feuille des membres en retard de cotisation avec lien WhatsApp direct.
 *
 * @param {any[]} liste
 */
function openARelancerSheet(liste) {
  const rows = liste.map((x) => {
    // Extract first name from full name (format: "NOM Prenom")
    const fullNameStr = x.nom || "";
    const nameParts = fullNameStr.trim().split(/\s+/);
    const nom = nameParts[0] || "";
    const prenom = nameParts.length > 1 ? nameParts.slice(1).join(' ') : "";

    const tel = (x.telephone || "").replace(/\s+/g, "");
    const waLink = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(`Bonjour ${prenom}, petit rappel amical pour la cotisation de la Jeunesse M3D.`)}` : null;

    return `
      <div class="row" style="cursor:default;">
        <div class="avatar" style="background:var(--bg-danger);color:var(--danger);">${initials({ nom, prenom })}</div>
        <div class="info">
          <div class="name">${esc(x.nom)}</div>
          <div class="meta">
            ${x.irregulier ? '<span style="color:var(--danger);">Irregulier</span>' : ''}
            ${x.montantDette > 0 ? ` <span style="color:var(--warning);">(+${fmt(x.montantDette)})</span>` : ''}
          </div>
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

/**
 * Affiche la feuille des prêts en attente de remboursement avec détails.
 *
 * @param {any[]} liste
 * @param {Object} memById - Dictionnaire des membres par ID
 */
function openPretsEnAttenteSheet(liste, memById) {
  console.log("openPretsEnAttenteSheet called with:", liste);

  // Handle null or undefined list
  if (!liste || !Array.isArray(liste)) {
    console.error("openPretsEnAttenteSheet: liste is not a valid array", liste);
    return;
  }

  try {
    // Use the provided memById
    const localMemById = memById || {};

    console.log("Processing loans list, memById available:", !!localMemById && Object.keys(localMemById).length > 0);
    const rows = liste.map((pret, index) => {
      // Handle null or undefined pret
      if (!pret || typeof pret !== 'object') {
        console.error("Invalid pret at index", index, pret);
        return `<div class="row"><div class="info">Donnée de prêt invalide</div></div>`;
      }

      console.log("Processing pret:", pret);

      // Assuming pret object has: id_preteur, id_debiteur, montant, date, etc.
      // We need to get member names from memById which is now passed as parameter
      const preteur = localMemById[pret.id_preteur] || { nom: "Inconnu", prenom: "" };
      const beneficiaire = localMemById[pret.id_debiteur] || { nom: "Inconnu", prenom: "" };

      console.log("Preteur:", preteur, "Beneficiaire:", beneficiaire);

      const preteurName = fullName(preteur);
      const beneficiaireName = fullName(beneficiaire);
      const montantFmt = fmt(pret.montant || 0);
      const dateFmt = fmtDate(pret.date || "");

      console.log("PreteurName:", preteurName, "BeneficiaireName:", beneficiaireName, "MontantFmt:", montantFmt, "DateFmt:", dateFmt);

      return `
        <div class="row" style="cursor:default;">
          <div class="avatar" style="background:var(--bg-warning);color:var(--warning);">${initials(preteur)}</div>
          <div class="info">
            <div class="name">${esc(preteurName)} → ${esc(beneficiaireName)}</div>
            <div class="meta">${montantFmt} • ${dateFmt}</div>
          </div>
        </div>`;
    }).join("") || emptyHTML("Aucun pret en attente de remboursement.");

    console.log("Rows generated:", rows.length);

    const ov = openSheet(`
      <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
      <h3>Prets en attente (${liste.length})</h3>
      <div style="margin-top:12px;">${rows}</div>
    `);

    ov.querySelector("[data-close]").addEventListener("click", closeSheet);
    console.log("Sheet opened successfully");
  } catch (error) {
    console.error("Error in openPretsEnAttenteSheet:", error);
    console.error("Error stack:", error.stack);
    // Show error in sheet format
    const ov = openSheet(`
      <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
      <h3>Erreur lors du chargement des prêts</h3>
      <div style="margin-top:12px; color:var(--danger);">
        Une erreur est survenue lors du chargement de la liste des prêts en attente.
        Veuillez consulter la console pour plus de détails.
      </div>
    `);
    ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  }
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