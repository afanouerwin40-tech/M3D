/**
 * @file dons.js - Module Dons : enregistrement et suivi des dons.
 * @description Gère les dons reçus par l'association, rattachés ou non à une
 * activité. Un don est toujours rattaché à un membre (donateur) ; l'activité
 * est facultative, ce qui permet de saisir un don général hors opération.
 *
 * L'écran existe à deux endroits :
 *  - dans le détail d'une activité (section "Dons" de la fiche), filtré ;
 *  - en écran global "Tous les dons", avec recherche, filtres et tri.
 *
 * La saisie et la modification passent toujours par une modale dédiée
 * (`openDonForm`) : la fiche d'activité ne fait qu'y renvoyer.
 *
 * Communication :
 * - Entrées : la table `dons` (schéma v9) via `donsList` / `creerDon` /
 *   `modifierDon` / `supprimerDon`, et les activités via `listesAll`.
 * - Sorties : du HTML injecté dans la zone `#app` ou dans la fiche d'activité,
 *   et le rapport PDF via `rapportDonsPDF` (qui reprend les filtres affichés).
 *
 * Choix de conception :
 * - Filtrage et tri vivent dans des variables de module (`donsQuery`,
 *   `donsFiltreActivite`...) plutôt que dans le DOM : `donsFiltrer` reste ainsi
 *   testable sans navigateur.
 * - Le filtrage est refait en JavaScript, pas en SQL : le volume de dons d'une
 *   association tient largement en mémoire, et l'export PDF doit reproduire
 *   exactement ce que l'écran affiche — une seule source de vérité.
 * - Aucune quantité de don n'est stockée agrégée : tout est recalculé depuis
 *   l'historique (règle d'event sourcing appliquée à tout le projet).
 */

// ---------------------------------------------------------------------------
// État de navigation et de filtrage de l'écran global
// ---------------------------------------------------------------------------

/** @type {string} Recherche textuelle (donateur ou commentaire). */
let donsQuery = "";
/** @type {string|null} Activité retenue, ou "" pour les dons généraux, null = aucune. */
let donsFiltreActivite = null;
/** @type {string} Borne basse de la période, au format ISO ("" = pas de borne). */
let donsDu = "";
/** @type {string} Borne haute de la période, au format ISO ("" = pas de borne). */
let donsAu = "";
/** @type {"date"|"montant"} Tri appliqué. */
let donsTri = "date";
/** @type {boolean} Ordre décroissant. */
let donsTriDesc = true;

// ============================================================================
// SÉLECTION ET FILTRAGE
// ============================================================================

/**
 * Applique recherche, filtres de période et tri sur une liste de dons.
 * Isolé pour être testable sans DOM.
 *
 * @param {Array<object>} lignes - Résultat de `donsList`.
 * @returns {Array<object>} Lignes filtrées puis triées.
 * @sideEffect Aucun : fonction pure, elle ne touche ni au DOM ni à la base.
 * @why Le filtre d'activité accepte trois états, d'où le test à deux branches :
 * `null` = pas de filtre, `""` = dons généraux uniquement, sinon un id précis.
 * La comparaison des dates se fait par comparaison de chaînes ISO, ce qui est
 * équivalent à un tri chronologique et évite toute conversion en Date.
 */
function donsFiltrer(lignes) {
  const q = donsQuery.trim().toLowerCase();

  // `filter()` renvoie un nouveau tableau des seuls éléments pour lesquels la
  // fonction de test est vraie. Enchaîner plusieurs `return false` revient à
  // dire « cette ligne ne correspond pas », sans structure if imbriquée.
  let out = lignes.filter((d) => {
    if (donsFiltreActivite !== null && (d.id_activite || "") !== donsFiltreActivite)
      return false;
    // `|| ""` évite qu'une date absente soit comparée à `undefined` : les bornes
    // ne s'appliquent que si l'utilisateur en a saisi une.
    if (donsDu && (d.date || "") < donsDu) return false;
    if (donsAu && (d.date || "") > donsAu) return false;
    // Recherche vide : tout passe, inutile de comparer aux trois champs.
    // `includes()` est une recherche de sous-chaîne, sensible à la casse d'où
    // le `toLowerCase()` appliqué à la fois à la requête et au champ testé.
    if (!q) return true;
    return (
      (d.donateur || "").toLowerCase().includes(q) ||
      (d.commentaire || "").toLowerCase().includes(q) ||
      (d.activite || "").toLowerCase().includes(q)
    );
  });

  // Un seul comparateur sert les deux tris : `sens` vaut -1 pour l'ordre
  // décroissant et +1 pour l'ordre croissant. On multiplie le résultat par ce
  // signe plutôt que d'écrire deux comparateurs. La comparaison de date est
  // lexicographique sur le format ISO (AAAA-MM-JJ), ce qui équivaut au tri
  // chronologique sans conversion en objet Date.
  const sens = donsTriDesc ? -1 : 1;
  out.sort((a, b) => {
    if (donsTri === "montant") return ((a.montant || 0) - (b.montant || 0)) * sens;
    return ((a.date || "") < (b.date || "") ? -1 : 1) * sens;
  });
  return out;
}

/**
 * Remplit une balise `<select>` avec la liste des activités.
 *
 * @param {HTMLSelectElement} sel - Élément à remplir.
 * @param {string} valeur - Valeur actuellement sélectionnée.
 * @param {string} [labelTous] - Libellé de l'option « pas de filtre ».
 * @returns {Promise<void>}
 * @sideEffect Oui : remplace le `innerHTML` du sélecteur.
 * @why Le libellé de l'option « toutes » est paramétré car l'écran global dit
 * « Toutes les activités » et le formulaire de saisie dit « Aucune » : deux
 * usages différents pour la même liste, un seul appel de fonction.
 */
async function donsRemplirSelectActivites(sel, valeur, labelTous = "Toutes les activites") {
  const listes = await listesAll({});
  sel.innerHTML =
    `<option value=""${valeur === "" ? " selected" : ""}>${esc(labelTous)}</option>` +
    listes
      .map(
        (l) =>
          `<option value="${l.id}"${valeur === l.id ? " selected" : ""}>${esc(l.nom)}</option>`,
      )
      .join("");
}

/**
 * Construit le titre du rapport PDF pour refleter le filtre actif.
 *
 * Le titre apparait en en-tete du document : sans lui, « Rapport des dons »
 * ne dit pas si l'on imprime toutes les recettes ou celles d'une seule
 * activité — ambiguïté qui se paie cher en assemblée.
 *
 * @param {string|null} idActivite - Filtre actif, "" = dons généraux, null = tous.
 * @returns {Promise<string>} Le titre à inscrire en tête du document.
 * @sideEffect Aucun sur les données : lit une activité pour connaître son nom.
 * @why Le repli sur « Rapport des dons » plutôt qu'une erreur : une activité
 * supprimée entre l'affichage et l'impression ne doit pas faire échouer l'export.
 */
async function buildDonsExportTitle(idActivite) {
  if (idActivite === null || idActivite === undefined) return "Rapport des dons";
  if (idActivite === "") return "Rapport des dons généraux";
  const l = await db.listes.get(idActivite);
  return l ? `Rapport des dons — ${l.nom}` : "Rapport des dons";
}

// ============================================================================
// RENDU : LIGNE DE DON
// ============================================================================

/**
 * Construit le HTML d'une ligne de don.
 *
 * @param {object} d - Ligne issue de `donsList`.
 * @param {boolean} [actions] - Affiche les boutons modifier/supprimer.
 * @returns {string} Le HTML d'une ligne.
 * @sideEffect Aucun : ne fait que produire une chaîne HTML.
 * @why L'identifiant est recopié en attribut `data-don` et `data-don-edit` /
 * `data-don-del` : la délégation d'événements s'appuie sur ces attributs plutôt
 * que sur des gestionnaires posés à la construction, ce qui évite d'avoir à
 * rebrancher la liste à chaque re-rendu.
 */
function donLigneHTML(d, actions = true) {
  return `
    <div class="row" data-don="${d.id}">
      <div class="avatar" style="background:var(--accent-light);color:var(--accent);">${esc((d.donateur || "?").charAt(0).toUpperCase())}</div>
      <div class="info">
        <div class="name">${esc(d.donateur)}${d.activite ? ` <span class="badge">${esc(d.activite)}</span>` : ` <span class="badge badge-no">Don general</span>`}</div>
        <div class="meta">${fmtDate(d.date)}${d.commentaire ? ` &middot; ${esc(d.commentaire)}` : ""}</div>
      </div>
      <span class="badge" style="background:var(--accent-light);color:var(--accent);">${fmt(d.montant)}</span>
      ${actions ? `<div class="chip-actions"><button class="icon-btn" data-don-edit="${d.id}" aria-label="Modifier ce don">&#9998;</button><button class="icon-btn" data-don-del="${d.id}" aria-label="Supprimer ce don">&#128465;</button></div>` : ""}
    </div>`;
}

/**
 * Branche les boutons d'une liste de lignes de dons.
 *
 * @param {ParentNode} racine - Conteneur des lignes.
 * @param {Function} apres - Callback rejoué après modification/suppression.
 * @returns {void}
 * @sideEffect Oui : attache des écouteurs aux boutons du conteneur.
 * @why `querySelectorAll` renvoie un NodeList, qui possède bien `forEach`
 * dans les navigateurs supportés ; l'ajout de `onclick` inline est évité
 * précisément parce qu'il mélange données et comportement dans le HTML.
 */
function donLignesBrancher(racine, apres) {
  racine
    .querySelectorAll("[data-don-edit]")
    .forEach((b) =>
      b.addEventListener("click", () => openDonForm(null, /** @type {string} */ (b.dataset.donEdit), apres)),
    );
  racine
    .querySelectorAll("[data-don-del]")
    .forEach((b) =>
      b.addEventListener("click", () => supprimerDonDepuisUI(/** @type {string} */ (b.dataset.donDel), apres)),
    );
}

/**
 * Supprime un don après confirmation explicite.
 *
 * @param {string} id - Identifiant du don.
 * @param {Function} apres - Callback de rafraîchissement.
 * @returns {Promise<void>}
 * @sideEffect Oui : supprime la donnée en base et affiche un toast.
 * @why `confirmWithPassword` et non une confirmation simple : supprimer un don
 * retire une recette de l'historique comptable, action qui doit être faite
 * sciemment. `if (!ok) return` abandonne sans rien écrire.
 */
async function supprimerDonDepuisUI(id, apres) {
  const ok = await confirmWithPassword(
    "Supprimer definitivement ce don ? Cette action est irreversible.",
  );
  if (!ok) return;
  await supprimerDon(id);
  toast("Don supprime");
  if (apres) await apres();
}

// ============================================================================
// FORMULAIRE DE SAISIE / MODIFICATION
// ============================================================================

/**
 * Ouvre la modale de saisie d'un don.
 *
 * @param {string|null} [idActivite] - Activité pré-sélectionnée.
 * @param {string|null} [idDon] - Don à modifier, ou null pour une création.
 * @param {Function} [apres] - Callback de rafraîchissement.
 * @returns {Promise<void>}
 * @sideEffect Oui : ouvre une modale, écrit en base à la validation.
 * @why Une seule fonction sert la création et la modification : le formulaire
 * est identique, seule la présence de `existant` change le titre, les valeurs
 * pré-remplies et l'appel créé/modifié à la fin. Dupliquer les deux formulaires
 * ferait diverger les règles de validation.
 */
async function openDonForm(idActivite, idDon, apres) {
  const existant = idDon ? await db.dons.get(idDon) : null;
  // `actifsSeulement: false` : un don peut venir d'un membre devenu inactif.
  // L'exclure de la liste empêcherait de corriger ou voir un don existant.
  const membres = await listMembres({ actifsSeulement: false });
  const listes = await listesAll({});

  const membreOptions = membres
    .map(
      (m) =>
        `<option value="${m.id}"${existant && existant.id_membre === m.id ? " selected" : ""}>${esc(fullName(m))}</option>`,
    )
    .join("");

  // Note : seule l'activité d'un don déjà enregistré est pré-sélectionnée.
  // Pour une création, c'est « Aucune » qui est proposé, même si l'appelant a
  // fourni `idActivite` : le champ reste à confirmer explicitement par
  // l'utilisateur plutôt que pré-rempli à l'aveugle.
  const activiteOptions = [
    `<option value=""${!existant || !existant.id_activite ? " selected" : ""}>Aucune (don general)</option>`,
    ...listes.map(
      (l) =>
        `<option value="${l.id}"${existant && existant.id_activite === l.id ? " selected" : ""}>${esc(l.nom)}</option>`,
    ),
  ].join("");

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>${existant ? "Modifier le don" : "Enregistrer un don"}</h3>
    <div class="field">
      <label for="dn_montant">Montant (FCFA)</label>
      <input id="dn_montant" type="number" min="1" step="1" value="${existant ? existant.montant : ""}">
    </div>
    <div class="field">
      <label for="dn_membre">Donateur</label>
      <select id="dn_membre">${membreOptions}</select>
    </div>
    <div class="field">
      <label for="dn_activite">Activite (facultatif)</label>
      <select id="dn_activite">${activiteOptions}</select>
    </div>
    <div class="field">
      <label for="dn_date">Date du don</label>
      <input id="dn_date" type="date" value="${existant ? existant.date : todayISO()}">
    </div>
    <div class="field">
      <label for="dn_commentaire">Note (facultatif)</label>
      <input id="dn_commentaire" type="text" placeholder="Ex. Participation, don famille..." value="${existant ? esc(existant.commentaire || "") : ""}">
    </div>
    ${!existant ? `<div class="small-note">Un don est toujours rattache a un membre. L'activite reste facultative : laissez-la vide pour un don general.</div>` : ""}
    <button class="btn btn-primary" id="dn_save" style="margin-top:12px;">Enregistrer</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#dn_save").addEventListener("click", async () => {
    const montant = /** @type {HTMLInputElement} */ (ov.querySelector("#dn_montant")).value;
    const id_membre = /** @type {HTMLSelectElement} */ (ov.querySelector("#dn_membre")).value;
    const id_activite = /** @type {HTMLSelectElement} */ (ov.querySelector("#dn_activite")).value;
    const date = /** @type {HTMLInputElement} */ (ov.querySelector("#dn_date")).value;
    const commentaire = /** @type {HTMLInputElement} */ (ov.querySelector("#dn_commentaire")).value;

    const m = Math.round(Number(montant));
    // `Number.isFinite()` exclut `NaN`, `Infinity` et `-Infinity` : toutes
    // ces valeurs sont le résultat d'une saisie corrompue ou d'une division
    // par zéro, et ne doivent jamais être enregistrées comme montant de don.
    if (!Number.isFinite(m) || m <= 0) {
      toast("Le montant doit etre un nombre superieur a zero.", "error");
      return;
    }
    if (!id_membre) {
      toast("Le donateur est obligatoire.", "error");
      return;
    }
    if (!date) {
      toast("La date du don est obligatoire.", "error");
      return;
    }

    // `try/catch` : toute écriture en base peut échouer (quota disque plein,
    // transaction interrompue). L'erreur est transformée en message lisible
    // et la modale reste ouverte, ce qui permet de corriger et réessayer
    // sans ressaisir le formulaire.
    try {
      if (existant) {
        await modifierDon(existant.id, { montant: m, id_membre, id_activite, date, commentaire });
      } else {
        await creerDon({ montant: m, id_membre, id_activite, date, commentaire });
      }
    } catch (err) {
      toast(err.message, "error");
      return;
    }

    closeSheet();
    toast(existant ? "Don modifie" : "Don enregistre");
    if (apres) await apres();
  });
}

// ============================================================================
// SECTION DONS — DANS LE DÉTAIL D'UNE ACTIVITÉ
// ============================================================================

/**
 * Rend la section « Dons » d'une fiche d'activité.
 *
 * @param {string} idActivite - Identifiant de l'activité.
 * @param {HTMLElement} cible - Conteneur dans la fiche (id `ld_dons`).
 * @returns {Promise<void>}
 * @sideEffect Oui : remplace le contenu de `cible`.
 * @why Le total affiché vient de `syntheseDons` et non d'un cumul stocké :
 * il se recalcule à chaque ouverture, donc jamais désynchronisé d'un don ajouté
 * ou supprimé ailleurs dans l'application.
 */
async function renderDonsActivite(idActivite, cible) {
  if (!cible) return;
  const lignes = await donsList({ idActivite });
  const s = syntheseDons(lignes);

  cible.innerHTML = `
    <div class="card" style="padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div class="small-note">Total des dons de cette activite</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent);">${fmt(s.total)}</div>
      </div>
      <div class="small-note" style="text-align:right;">
        ${s.nbDons} don${s.nbDons > 1 ? "s" : ""}<br>${s.nbDonateurs} donateur${s.nbDonateurs > 1 ? "s" : ""}
      </div>
    </div>
    <div class="card list-card">${lignes.map((d) => donLigneHTML(d)).join("") || emptyHTML("Aucun don enregistre pour cette activite.")}</div>
  `;

  donLignesBrancher(cible, () => renderDonsActivite(idActivite, cible));
}

// ============================================================================
// ÉCRAN GLOBAL « TOUS LES DONS »
// ============================================================================

/**
 * Rend l'écran global de consultation de tous les dons.
 * Accessible depuis le hub Activités, à côté de Listes et Calendrier.
 * @returns {Promise<void>}
 * @sideEffect Oui : injecte le HTML dans la zone `#app` et attache les
 * gestionnaires de tous les contrôles de l'écran.
 * @why Un seul `innerHTML` pour l'écran entier : les compteurs sont initialisés
 * à "--" puis remplis par `renderDonsListe`, ce qui évite deux écritures DOM
 * successives au chargement. Les valeurs de filtre viennent des variables de
 * module, donc revenir sur cet onglet restitue la dernière recherche.
 */
async function renderDons() {
  app.innerHTML = `
    <button class="btn-chip" id="donsBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Tous les dons</h2></div>
    <div class="card" style="padding:16px;margin-bottom:12px;display:flex;justify-content:space-around;text-align:center;">
      <div><div class="small-note">Total</div><div style="font-size:20px;font-weight:700;color:var(--accent);" id="dons_total">--</div></div>
      <div><div class="small-note">Dons</div><div style="font-size:20px;font-weight:700;" id="dons_nb">--</div></div>
      <div><div class="small-note">Donateurs</div><div style="font-size:20px;font-weight:700;" id="dons_nb_donateurs">--</div></div>
    </div>
    <input class="search" id="donsSearch" placeholder="Rechercher un donateur, une activite, une note..." value="${esc(donsQuery)}" autocomplete="off">
    <div class="row" style="border:none;padding:6px 4px 10px;justify-content:flex-start;gap:8px;flex-wrap:wrap;">
      <select id="donsFiltreActivite" class="search" style="max-width:200px;"></select>
      <input id="donsDu" type="date" class="search" style="max-width:150px;" value="${esc(donsDu)}" aria-label="Dons a partir du">
      <input id="donsAu" type="date" class="search" style="max-width:150px;" value="${esc(donsAu)}" aria-label="Dons jusqu'au">
      <button class="btn-chip" id="donsTriChip">Trier : ${donsTri === "montant" ? "montant" : "date"}</button>
      <button class="btn-chip" id="donsExportBtn">Exporter en PDF</button>
      <button class="btn-chip" id="donsReset">Reinitialiser</button>
    </div>
    <div class="fab-zone"><button class="fab" id="addDonBtn" aria-label="Enregistrer un don"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
    <div id="donsBox"></div>
  `;

  document.getElementById("donsBackBtn").addEventListener("click", () => showTab("activites"));
  document.getElementById("addDonBtn").addEventListener("click", () =>
    openDonForm(donsFiltreActivite === null || donsFiltreActivite === "" ? null : donsFiltreActivite, null, renderDons),
  );

  document.getElementById("donsSearch").addEventListener("input", (e) => {
    donsQuery = /** @type {HTMLInputElement} */ (e.target).value;
    renderDonsListe();
  });
  document.getElementById("donsDu").addEventListener("change", (e) => {
    donsDu = /** @type {HTMLInputElement} */ (e.target).value;
    renderDonsListe();
  });
  document.getElementById("donsAu").addEventListener("change", (e) => {
    donsAu = /** @type {HTMLInputElement} */ (e.target).value;
    renderDonsListe();
  });
  document.getElementById("donsTriChip").addEventListener("click", () => {
    // Bascule date <-> montant, en conservant le sens pour la nouvelle clé.
    // Le sens est forcé à décroissant : après un changement de critère, un
    // ordre croissant « par surprise » (trié par date croissante alors qu'on
    // était au montant décroissant) ferait perdre le repère visuel.
    donsTri = donsTri === "date" ? "montant" : "date";
    donsTriDesc = true;
    renderDons();
  });
  // Réinitialisation : toutes les variables de filtre reviennent à leur valeur
  // initiale en un seul endroit, sinon il faudrait les remettre à zéro une à une
  // à chaque évolution de l'écran.
  document.getElementById("donsReset").addEventListener("click", () => {
    donsQuery = "";
    donsFiltreActivite = null;
    donsDu = "";
    donsAu = "";
    donsTri = "date";
    donsTriDesc = true;
    renderDons();
  });

  // L'export reprend exactement les filtres affiches a l'ecran : on ne
  // demande pas au tresorier de recomposer a la main la meme selection.
  document.getElementById("donsExportBtn").addEventListener("click", () => {
    rapportDonsPDF({
      idActivite: donsFiltreActivite === null ? undefined : donsFiltreActivite,
      du: donsDu,
      au: donsAu,
      titre: buildDonsExportTitle(donsFiltreActivite),
    }).catch((err) => {
      // `rapportDonsPDF` est asynchrone : sans `catch`, une erreur de
      // génération produirait un rejet de promesse non traité, invisible
      // pour l'utilisateur (rien ne se passe à l'écran).
      console.error("[M3D] Export des dons impossible.", err);
      toast("Export impossible", "error");
    });
  });

  const selActivite = /** @type {HTMLSelectElement} */ (document.getElementById("donsFiltreActivite"));
  // Le remplissage attend la base : `await` suspend ici le temps que la liste
  // des activités arrive, l'utilisateur ne peut pas encore filtrer de toute façon.
  await donsRemplirSelectActivites(selActivite, donsFiltreActivite === null ? "" : donsFiltreActivite);
  selActivite.addEventListener("change", (e) => {
    const v = /** @type {HTMLSelectElement} */ (e.target).value;
    // "" = don général ; toute autre valeur = une activité précise.
    donsFiltreActivite = v;
    renderDonsListe();
  });

  await renderDonsListe();
}

/**
 * Recharge la liste filtrée et les compteurs de l'écran global des dons.
 * N'ébranle pas les contrôles : seul le corps de liste est remplacé, ce qui
 * évite de perdre le focus de saisie pendant la frappe.
 * @returns {Promise<void>}
 * @sideEffect Oui : met à jour les trois compteurs et la liste.
 * @why Les trois compteurs sont mis à jour sur `textContent` et non dans le
 * `innerHTML` de l'écran : seule la liste est reconstruite, la saisie en cours
 * n'est pas interrompue à chaque frappe dans la recherche.
 */
async function renderDonsListe() {
  const toutes = await donsList();
  const filtrees = donsFiltrer(toutes);
  const s = syntheseDons(filtrees);

  const total = document.getElementById("dons_total");
  if (total) total.textContent = fmt(s.total);
  const nb = document.getElementById("dons_nb");
  if (nb) nb.textContent = String(s.nbDons);
  const nbD = document.getElementById("dons_nb_donateurs");
  if (nbD) nbD.textContent = String(s.nbDonateurs);

  const box = document.getElementById("donsBox");
  if (!box) return;
  // Le message « aucun don ne correspond » est distinct du cas « aucun don
  // enregistré » : dans le premier, l'utilisateur doit comprendre que c'est
  // sa recherche qui filtre tout, pas que les données manquent.
  box.innerHTML = filtrees.length
    ? filtrees.map((d) => donLigneHTML(d)).join("")
    : emptyHTML("Aucun don ne correspond a ces criteres.");

  donLignesBrancher(box, renderDonsListe);
}
