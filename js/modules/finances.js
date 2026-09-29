/**
 * @file finances.js - Module Finance : Caisse, Dettes et Prêts entre membres.
 * @description Gère l'affichage et les interactions de l'onglet Finance.
 *
 * ---------------------------------------------------------------------------
 * RÔLE DE CE FICHIER
 * ---------------------------------------------------------------------------
 * Trois domaines financiers tiennent dans le même onglet :
 *
 *   - la CAISSE : l'argent réellement encaissé et dépensé, avec son solde ;
 *   - les DETTES : les cotisations dues par des membres et non versées
 *     (les « impayés ») ;
 *   - les PRÊTS : l'argent qu'un membre absent a fait avancer par un autre,
 *     à rembourser entre eux, hors caisse de l'association.
 *
 * ---------------------------------------------------------------------------
 * COMMUNICATION AVEC db.js
 * ---------------------------------------------------------------------------
 * Règle d'architecture : ce module ne lit ni n'écrit JAMAIS directement dans
 * IndexedDB, il appelle les fonctions métier de `db.js` :
 *
 *   caisseDetail()          → totaux consolidés de la caisse
 *   depensesParCategorie()  → dépenses ventilées par catégorie
 *   dettesList()            → dettes calculées, avec statut et remboursement
 *   totalDettesImpayees()   → somme des seules dettes encore impayées
 *   ajusterCaisse(montant)  → écrit l'écart de caisse
 *   pretsMembres(opts)      → liste des prêts entre membres
 *   marquerPretRembourse()  → bascule l'état d'un prêt
 *   log(entite, action, r)  → journalise l'opération
 *
 * Exception assumée : les petits ajouts directs (`db.caisse_mouvements.add`,
 * `db.paiements.get`, `db.membres.toArray`) restent ici quand ils sont
 * ponctuels et sans calcul métier. Toute agrégation, elle, est confiée à db.js.
 *
 * ---------------------------------------------------------------------------
 * L'AFFICHAGE DES MONTANTS : `fmt()`
 * ---------------------------------------------------------------------------
 * Tous les montants passent par `fmt(n)` (utils.js), qui transforme un nombre
 * en texte lisible : 12000 devient "12 000 F". Deux raisons à cette centralisation :
 *   - un seul endroit à modifier si la devise change ;
 *   - et surtout, `fmt()` est une fonction PURE (mêmes entrées, même sortie,
 *     aucun effet de bord) : elle ne touche pas la base, ce qui permet de
 *     l'utiliser dans un gabarit HTML sans risque.
 *
 * Elle n'est PAS utilisée pour les calculs : on additionne des nombres bruts et
 * on ne formate qu'au dernier moment, à l'affichage.
 */

// État de navigation de l'onglet Finance : "caisse" | "dettes" | "prets".
// Conservée en variable globale (hors fonction) pour survivre au re-rendu :
// c'est la seule donnée qui doit persister d'un changement de vue à l'autre.
let financeVue = "caisse";

// État filtre des prêts : false = ne montrer que les prêts en attente (défaut),
// true = montrer les prêts remboursés.
let pretsShowRembourses = false;

// ============================================================================
// FINANCE — HUB CAISSE, DETTES & PRÊTS
// ============================================================================

/**
 * Onglet Finance : regroupe Caisse, Dettes et Prêts entre membres dans un
 * seul écran, avec une navigation Segmented (Phase C) entre les trois —
 * plus besoin d'ouvrir un écran séparé ni de revenir en arrière pour
 * passer de l'un à l'autre.
 *
 * ROUTAGE INTERNE DES SOUS-ONGLETS
 * ---------------------------------
 * La fonction ne rend qu'un « hub » : le bandeau d'onglets et un conteneur
 * vide (`#financeBody`). Le contenu, lui, est produit par l'une des trois
 * sous-fonctions selon la variable d'état `financeVue`. Le `if / else if / else`
 * final est donc un simple routeur : une seule ligne décide de ce qui s'affiche.
 *
 * Changer d'onglet se fait en réaffectant `financeVue` puis en appelant
 * `renderFinance()` à nouveau. On REGÉNÈRE tout le hub plutôt que de
 * simplement masquer deux blocs : l'état visuel est ainsi toujours cohérent
 * (classe `active` du bon bouton, compteurs à jour), et le code reste simple —
 * le prix est un recalcul de deux indicateurs à chaque bascule.
 *
 * Les deux compteurs (dettes, prêts) sont chargés AVANT le rendu HTML pour
 * pouvoir les incruster dans les étiquettes des boutons.
 *
 * @returns {Promise<void>} La fonction est asynchrone : elle attend les
 *   indicateurs avant d'écrire quoi que ce soit.
 */
async function renderFinance() {
  const dettesTotal = await totalDettesImpayees();
  const pretsEnAttente = (await pretsMembres({ nonRembourseSeulement: true })).length;

  app.innerHTML = `
    <div class="section-title" style="margin-top:0;"><h2>Finance</h2></div>
    <div class="segmented" style="margin-bottom:16px;">
      <button class="btn-chip ${financeVue === "caisse" ? "active" : ""}" id="financeSegCaisse">Caisse</button>
      <button class="btn-chip ${financeVue === "dettes" ? "active" : ""}" id="financeSegDettes">Dettes${dettesTotal > 0 ? ` (${fmt(dettesTotal)})` : ""}</button>
      <button class="btn-chip ${financeVue === "prets" ? "active" : ""}" id="financeSegPrets">Prets${pretsEnAttente > 0 ? ` (${pretsEnAttente})` : ""}</button>
    </div>
    <div id="financeBody"></div>
  `;

  // Les trois gestionnaires sont identiques : ils ne font que fixer `financeVue`
  // et relancer le rendu. Ce sont des « callbacks » (fonctions de rappel) :
  // `addEventListener` les stocke et les exécutera au clic.
  document.getElementById("financeSegCaisse").addEventListener("click", () => { financeVue = "caisse"; renderFinance(); });
  document.getElementById("financeSegDettes").addEventListener("click", () => { financeVue = "dettes"; renderFinance(); });
  document.getElementById("financeSegPrets").addEventListener("click", () => { financeVue = "prets"; renderFinance(); });

  // Routage : on délgue le contenu à la sous-vue correspondante. Le `else`
  // final sert de valeur par défaut (caisse).
  const body = document.getElementById("financeBody");
  if (financeVue === "dettes") await renderDettes(body);
  else if (financeVue === "prets") await renderPretsMembres(body);
  else await renderCaisse(body);
}

// ============================================================================
// CAISSE
// ============================================================================

/**
 * Sous-vue Caisse, intégrée au hub Finance (voir renderFinance) : solde,
 * mouvements, dépenses par catégorie, dettes non incluses, ajout/
 * ajustement manuels.
 *
 * Le solde n'est jamais stocké : `caisseDetail()` le RECALCULE à chaque appel
 * en additionnant les entrées et en soustrayant les sorties (voir
 * db.js). C'est le principe d'« event sourcing » appliqué aux finances : la
 * table `caisse_mouvements` ne contient que des faits datés, et l'affichage
 * est une vue de ces faits. Corriger une écriture fausse se fait en ajoutant
 * un mouvement correctif, jamais en éditant un total.
 *
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
 * @returns {Promise<void>}
 */
async function renderCaisse(container) {
  // `container || valeur_par_défaut` : la fonction fonctionne aussi bien
  // appelée depuis le hub (avec #financeBody) qu'en re-rendrement autonome
  // (les gestionnaires de modale appellent `renderCaisse()` sans argument).
  const el = container || document.getElementById("financeBody");
  if (!el) return;

  const cd = await caisseDetail();
  // Les mouvements sont rechargés et re-triés du plus récent au plus ancien
  // pour la liste ; `sort` modifie le tableau sur place, d'où la copie.
  const manuels = (await db.caisse_mouvements.toArray()).sort((a, b) => b.date.localeCompare(a.date));
  const depensesCat = await depensesParCategorie();
  // `Object.values` + `reduce` : somme de toutes les valeurs de l'objet
  // returned par depensesParCategorie(). Le total sert à décider si le bloc
  // « dépenses par catégorie » a des chances d'être non vide.
  const totalDepensesCategorisees = Object.values(depensesCat).reduce((a, v) => a + v, 0);

  el.innerHTML = `
    <div class="financial-summary" style="margin-bottom:14px;">
      <div class="financial-summary-total">
        <div class="label">Solde de la caisse</div>
        <div class="value ${cd.solde >= 0 ? "positive" : "negative"}">${fmt(cd.solde)}</div>
      </div>
      <div class="financial-summary-rows">
        <div class="detail-row"><span class="k">Cotisations encaissees</span><span class="v" style="color:var(--success);">+ ${fmt(cd.totalCollecte)}</span></div>
        <div class="detail-row"><span class="k">Cadeaux d'anniversaire verses</span><span class="v" style="color:var(--danger);">− ${fmt(cd.totalCadeauxVerses)}</span></div>
        <div class="detail-row"><span class="k">Entrees manuelles</span><span class="v" style="color:var(--success);">+ ${fmt(cd.entreesManuelles)}</span></div>
        <div class="detail-row"><span class="k">Sorties manuelles</span><span class="v" style="color:var(--danger);">− ${fmt(cd.sortiesManuelles)}</span></div>
      </div>
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
    <div class="alert alert--warning" style="margin-bottom:18px;">
      <div class="alert-body">
        <div class="alert-title">Dettes impayees (non incluses ci-dessus)</div>
        <div class="small-note" style="margin-top:2px;">${fmt(cd.dettesImpayees)} — cet argent n'est pas en caisse, il correspond aux cotisations dues par des membres.</div>
      </div>
    </div>
    <button class="btn btn-ghost" id="addMouvBtn" style="margin-bottom:10px;">+ Mouvement manuel (achat, depense...)</button>
    <button class="btn btn-ghost" id="ajusterCaisseBtn" style="margin-bottom:18px;">Ajuster la caisse (montant reel en main)</button>
    <div class="card list-card" id="mouvList" style="margin-bottom:24px;"></div>
  `;

  // `|| emptyHTML(...)` : si le tableau est vide, `map().join()` renvoie une
  // chaîne vide (fausse), donc le message de liste vide prend le relais.
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

  // Délégation d'événements : un gestionnaire par ligne, branché après
  // l'injection du HTML (les éléments doivent exister). L'id du mouvement est
  // transporté par l'attribut `data-mv-id`, relu au clic via `dataset`.
  document.querySelectorAll("#mouvList [data-mv-id]").forEach((row) =>
    row.addEventListener("click", () => openMouvementDetail(/** @type {HTMLElement} */ (row).dataset.mvId)),
  );

  // `addEventListener` attend un nom d'événement et une fonction : on peut
  // aussi passer directement un nom de fonction déjà écrite (`openAddMouvement`),
  // elle sera alors appelée avec l'événement en argument sans que cela gêne.
  document.getElementById("addMouvBtn").addEventListener("click", openAddMouvement);
  document.getElementById("ajusterCaisseBtn").addEventListener("click", openAjusterCaisse);
}

/**
 * Formulaire de saisie d'un mouvement manuel de caisse (Entrée ou Sortie/Dépense).
 *
 * Le formulaire suit toujours la même séquence :
 *   1. `openSheet()` construit la modale et retourne l'élément overlay ;
 *   2. les listes déroulantes sont remplies APRÈS l'affichage, de façon
 *      asynchrone (`.then`), car elles demandent une lecture en base ;
 *   3. chaque contrôle récupère son élément par `ov.querySelector(...)` et
 *      s'écoute ;
 *   4. le clic sur « Enregistrer » valide, écrit, journalise, ferme et
 *      rafraîchit l'affichage.
 *
 * @returns {void}
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

  // `optionsMembresActifs` (modules/activites.js) renvoie directement le HTML
  // des <option>. On attend la lecture asynchrone avant de l'injecter : le
  // « Chargement... » visible au départ n'est qu'un remplissage provisoire.
  optionsMembresActifs(null).then((html) => {
    ov.querySelector("#mv_auteur").innerHTML = html;
  });

  db.listes.toArray().then((listes) => {
    const options = listes
      .filter((l) => !l.archivee)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((l) => `<option value="${l.id}">${esc(l.nom)}</option>`)
      .join("");
    // `insertAdjacentHTML("beforeend", ...)` ajoute le HTML à la FIN de
    // l'élément, sans toucher à l'<option> « Aucune » déjà présente.
    ov.querySelector("#mv_activite").insertAdjacentHTML("beforeend", options);
  });

  // La photo compressée est conservée dans cette variable locale : le
  // <input type="file"> ne peut pas être relu après coup, il faut donc garder
  // le résultat du traitement pour l'associer à l'enregistrement.
  let photoBase64 = null;
  ov.querySelector("#mv_photo").addEventListener("change", async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files[0];
    if (!file) return;
    const preview = ov.querySelector("#mv_photo_preview");
    preview.textContent = "Compression de la photo...";
    try {
      // `compresserPhoto` (utils.js) redimensionne via un <canvas> et renvoie
      // une « data URL » (une image encodée en texte, stockable en base).
      photoBase64 = await compresserPhoto(file);
      preview.innerHTML = `<img src="${photoBase64}" alt="Justificatif" style="max-width:100%;max-height:180px;border-radius:8px;display:block;">`;
    } catch {
      // Le bloc `catch` sans paramètre ignore l'erreur : ici, seule la
      // conséquence pour l'utilisateur compte (pas d'enregistrement de photo).
      photoBase64 = null;
      preview.textContent = "";
      toast("Photo illisible, reessaie avec une autre image", "error");
    }
  });

  // Masque les champs propres aux dépenses quand le type est « Entrée » :
  // une entrée n'a ni catégorie, ni auteur, ni justificatif.
  const toggleDepenseFields = () => {
    ov.querySelector("#mv_depense_fields").style.display =
      /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_type")).value === "Sortie" ? "" : "none";
  };
  ov.querySelector("#mv_type").addEventListener("change", toggleDepenseFields);
  // Appel immédiat : applique l'état initial sans attendre un changement.
  toggleDepenseFields();

  ov.querySelector("#mv_save").addEventListener("click", async () => {
    // `Number()` convertit la chaîne du champ en nombre. Les conversions
    // explicites (`/** @type {...} */`) documentent le type réel attendu et
    // évitent les surprises de l'éditeur : elles ne changent rien à l'exécution.
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#mv_montant"));
    const montant = Number(montantInput ? montantInput.value : 0);
    if (!montant || montant <= 0) {
      toast("Montant invalide", "error");
      return; // arrêt immédiat : rien n'est écrit
    }

    const type = /** @type {HTMLSelectElement} */ (ov.querySelector("#mv_type")).value;
    const estDepense = type === "Sortie";

    // `|| null` transforme une chaîne vide (aucun choix) en vraie absence de
    // valeur : c'est ce que la base attend pour un champ facultatif.
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
 *
 * Les liaisons `id_auteur` / `id_activite` sont des clés étrangères (foreign
 * keys) : elles ne stockent qu'un identifiant, pas le nom. Il faut donc relire
 * la table concernée pour afficher « qui » et « quelle activité ».
 *
 * @param {string} id - Identifiant du mouvement de caisse.
 * @returns {Promise<void>}
 */
async function openMouvementDetail(id) {
  const m = await db.caisse_mouvements.get(id);
  if (!m) return; // mouvement supprimé entre-temps : on n'affiche rien

  const auteur = m.id_auteur ? await db.membres.get(m.id_auteur) : null;
  const activite = m.id_activite ? await db.listes.get(m.id_activite) : null;

  // Les lignes facultatives sont construites par des expressions ternaires
  // (`cond ? ... : ""`) directement dans le gabarit : si le champ est vide,
  // rien ne s'affiche et on ne garde pas de ligne vide.
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
 *
 * L'ajustement ne modifie aucun historique : `ajusterCaisse()` calcule l'écart
 * entre le montant annoncé et le solde calculé, puis INSÈRE un mouvement
 * correctif du signe de cet écart. La piste d'audit reste donc complète — on
 * voit qu'un ajustement a eu lieu, et pourquoi.
 *
 * @returns {Promise<void>}
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
    // `Number(NaN)` : le cas "champ vide ou non numérique" donne NaN, que
    // `isNaN` détecte. Préférer `NaN` en valeur de repli évite qu'une saisie
    // vide soit interprétée comme un zéro valide.
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
// DETTES & REMBOURSEMENTS
// ============================================================================

/**
 * Rendu de la sous-vue Dettes, intégrée au hub Finance (voir renderFinance).
 *
 * CALCUL DES DETTES — « EVENT SOURCING », RIEN DE STOCKÉ
 * ------------------------------------------------------
 * Il n'existe aucune table « dettes » et aucun champ « montant_du ». Une dette
 * est une DÉDUCTION faite à l'affichage, à partir des tables brutes :
 *
 *   dette  ⇔  une ligne de `paiements` avec `a_paye === false`
 *   statut ⇔  existe-t-il une ligne dans `remboursements` pour ce paiement ?
 *              oui → "Remboursee" ; non → "Impayee"
 *   montant⇔  `paiement.montant_attendu` (et non le montant réellement versé)
 *
 * Conséquences pratiques :
 *   - impossible d'avoir un total de dettes « faux » : il est recalculé à
 *     chaque appel de `dettesList()` ;
 *   - solder une dette, c'est ajouter une ligne de remboursement, pas modifier
 *     un solde : la trace de qui a payé quoi et quand est conservée ;
 *   - le montant d'une dette remboursée est celui ATTENDU. Le montant
 *     EFFECTIVEMENT encaissé peut différer (remboursement partiel, arrondi) :
 *     c'est pourquoi l'affichage sait montrer `remb_montant` à côté de
 *     `montant` lorsqu'ils divergent.
 *
 * Un « montant attendu » est la somme des cotisations dues par ce membre pour
 * ce dimanche : 500 FCFA/semaine par défaut, ou la valeur personnalisée du
 * membre le cas échéant.
 *
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
 * @returns {Promise<void>}
 */
async function renderDettes(container) {
  const el = container || document.getElementById("financeBody");
  if (!el) return;

  const dettes = await dettesList();
  // Deux `filter` successifs découpent la liste unique renvoyée par db.js en
  // deux sous-listes affichables. Aucun tri : db.js renvoie déjà du plus récent
  // au plus ancien.
  const impayees = dettes.filter((d) => d.statut === "Impayee");
  const remboursees = dettes.filter((d) => d.statut === "Remboursee");
  // `reduce` cumule les montants : le total n'est stocké nulle part, il est
  // calculé à chaque rendu.
  const total = impayees.reduce((a, d) => a + d.montant, 0);

  el.innerHTML = `
    <div class="card" style="text-align:center;padding:20px;margin-bottom:18px;">
      <div class="small-note">Total impaye</div>
      <div style="font-family:var(--font-sans);font-size:28px;font-weight:700;color:var(--danger);margin-top:2px;">${fmt(total)}</div>
    </div>
    <div class="section-title" style="margin-top:0;"><h2>Impayees (${impayees.length})</h2></div>
    <div class="card list-card" id="dettesImpayees"></div>
    ${remboursees.length ? `<div class="section-title"><h2>Remboursees (${remboursees.length})</h2></div><div class="card list-card" id="dettesRemb"></div>` : ""}
  `;

  // Une dette encore impayee ne montre que son montant attendu. Une dette
  // remboursee affiche en plus qui a rembourse, quand et pour quel
  // montant reel — le montant encaisse peut differer du montant attendu.
  //
  // `rowHTML` est une fonction de gabarit locale : elle produit une ligne
  // HTML et prend le booléen `actionable` pour savoir si la ligne est cliquable
  // (impayée = action possible) ou purement informative (déjà soldée).
  const rowHTML = (d, actionable) => {
    const meta = actionable
      ? fmtDate(d.date)
      : `${fmtDate(d.date)} &middot; rembourse par ${esc(d.remb_par || "?")}`
        + `${d.remb_date ? " le " + fmtDate(d.remb_date) : ""}`;
    // `!= null` (et non `!x`) teste à la fois `null` ET `undefined` : c'est
    // la manière idiomatique de dire « une valeur a été fournie ».
    const montant = !actionable && d.remb_montant != null && d.remb_montant !== d.montant
      ? `<span class="badge" style="background:var(--bg-danger);color:var(--danger);">${fmt(d.remb_montant)}</span>`
      : `<span class="badge" style="background:var(--bg-danger);color:var(--danger);">${fmt(d.montant)}</span>`;
    return `
    <div class="row" ${actionable ? `data-paiement="${d.id_paiement}"` : ""}>
      <div class="avatar" style="background:var(--bg-danger);color:var(--danger);">${(d.membre[0] || "?").toUpperCase()}</div>
      <div class="info"><div class="name">${esc(d.membre)}</div><div class="meta">${meta}</div></div>
      ${montant}
    </div>`;
  };

  document.getElementById("dettesImpayees").innerHTML =
    impayees.map((d) => rowHTML(d, true)).join("") || emptyHTML("Aucune dette en cours.");

  // Délégation d'événements : chaque ligne impayée est cliquable et transmet
  // l'id du paiement concerné via l'attribut `data-paiement`. Le `.catch()`
  // évite qu'un rejet de promesse (lecture en base impossible) reste muet :
  // l'erreur est journalisée dans la console, l'utilisateur n'est pas bloqué.
  document.querySelectorAll("#dettesImpayees .row").forEach((row) =>
    row.addEventListener("click", () => openRembourser(/** @type {HTMLElement} */ (row).dataset.paiement).catch((err) => {
      console.error("[M3D] Ouverture de la modale de remboursement echouee", err);
    })),
  );

  if (remboursees.length) {
    document.getElementById("dettesRemb").innerHTML = remboursees.map((d) => rowHTML(d, false)).join("");
  }
}

/**
 * Modale d'enregistrement du remboursement d'une dette.
 *
 * La personne ayant remboursé est pré-sélectionnée sur le débiteur, mais
 * reste modifiable : un tiers peut rembourser à la place d'un absent. Son
 * nom est figé dans `nom_rembourseur` au moment de l'enregistrement, pour
 * que l'historique reste lisible même si le membre est ensuite modifié ou
 * supprimé.
 *
 * FLUX COMPLET, ÉTAPE PAR ÉTAPE
 * -----------------------------
 *   1. LECTURE      `db.paiements.get(idPaiement)` récupère la ligne de
 *                   paiement concernée. `montant_attendu` sert de valeur
 *                   initiale du champ montant. Si la ligne n'existe plus
 *                   (suppression entre-temps), on sort avec un toast.
 *   2. LISTE        Les membres sont chargés et triés, puis transformés en
 *                   `<option>`. L'attribut `selected` est posé sur le
 *                   débiteur : `selected` sans valeur est un attribut booléen,
 *                   sa présence suffit.
 *   3. MODALE       `openSheet()` affiche le formulaire ; chaque champ est
 *                   retrouvé par `ov.querySelector(...)` et branché.
 *   4. VALIDATION   Les trois champs sont relus, `trim()` normalise les
 *                   espaces, et `Number(x) || p.montant_attendu` retombe sur
 *                   le montant attendu si le champ est vide ou nul.
 *   5. ÉCRITURE     Les deux enregistrements (voir plus bas) sont encadrés
 *                   par une transaction IndexedDB.
 *   6. SUITES       Journalisation, fermeture de la modale, toast de
 *                   confirmation, re-rendu de la sous-vue.
 *
 * POURQUOI DEUX ÉCRITURES ?
 * Un remboursement a deux effets indépendants :
 *   - il SOLDE une dette → ligne dans `remboursements` ;
 *   - il FAIT ENTRER de l'argent en caisse → ligne "Entree" dans
 *     `caisse_mouvements`.
 * Écrire l'un sans l'autre laisserait un état incohérent (de l'argent encaissé
 * mais une dette toujours affichée comme impayée, ou l'inverse).
 *
 * `id_membre_rembourseur` PEUT ÊTRE UN TIERS
 * ------------------------------------------
 * Ce champ désigne la personne ayant réellement versé les fonds, pas
 * nécessairement le débiteur (`id_membre`). Les deux sont conservés séparément
 * dans l'enregistrement : `id_membre` reste le redevable, `id_membre_rembourseur`
 * le payeur. C'est pourquoi la liste déroulante n'est PAS limitée au débiteur :
 * un proche, un parent ou un autre membre du groupe peut avancer la somme.
 *
 * `nom_rembourseur` EST FIGÉ, ET C'EST VOLONTAIRE
 * ----------------------------------------------
 * Le nom est une COPIE du nom du membre au moment du remboursement, écrite en
 * plus de l'identifiant. Pourquoi cette redondance ?
 *   - l'historique doit rester exact même si le membre est RENOMMÉ plus tard
 *     (« Jean Dupont » qui paie en 2026 ne doit pas ressortir « Jean Koffi »
 *     si la fiche a changé depuis) ;
 *   - il reste lisible même si le membre est SUPPRIMÉ de l'annuaire : sans la
 *     copie, la ligne d'historique afficherait « ? » ;
 *   - il fige le nom porté À L'ÉPOQUE, ce qui est la donnée utile en audit.
 * C'est le même choix que celui de dettesList() (db.js), qui affiche cette
 * copie en priorité et ne retombe sur le membre que pour les enregistrements
 * antérieurs à l'existence de ce champ.
 *
 * @param {string} idPaiement - Identifiant du paiement concerné.
 * @returns {Promise<void>}
 */
async function openRembourser(idPaiement) {
  const p = await db.paiements.get(idPaiement);
  if (!p) {
    toast("Paiement introuvable");
    return;
  }

  // Tous les membres, pas seulement les actifs : un dettes peut être soldée
  // par un membre devenu inactif, et on ne doit pas l'empêcher de l'être.
  const membres = (await db.membres.toArray()).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const optionsHTML =
    membres
      .map(
        (m) =>
          `<option value="${m.id}"${m.id === p.id_membre ? " selected" : ""}>${esc(fullName(m))}</option>`,
      )
      .join("") || '<option value="">Aucun membre disponible</option>';

  const ov = openSheet(`
    <button class="sheet-close" data-close aria-label="Fermer">&times;</button>
    <h3>Marquer comme remboursee</h3>
    <div class="field"><label for="rb_par">A rembourse</label><select id="rb_par">${optionsHTML}</select></div>
    <div class="field"><label for="rb_montant">Montant</label><input id="rb_montant" type="number" value="${p.montant_attendu}"></div>
    <div class="field"><label for="rb_note">Note (facultatif)</label><input id="rb_note" type="text"></div>
    <button class="btn btn-primary" id="rb_save">Confirmer le remboursement</button>
  `);

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);

  ov.querySelector("#rb_save").addEventListener("click", async () => {
    const sel = /** @type {HTMLSelectElement} */ (ov.querySelector("#rb_par"));
    const idRembourseur = sel ? sel.value : "";
    if (!idRembourseur) {
      toast("Choisissez qui a rembourse");
      return; // sans payeur identifié, l'opération n'a pas de sens
    }
    // `find` renvoie l'objet correspondant au critère, ou `undefined`.
    const rembourseur = membres.find((m) => m.id === idRembourseur);
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_montant"));
    // `|| p.montant_attendu` : un champ laissé vide donne 0 (faux) et retombe
    // donc sur le montant attendu, qui reste le cas normal.
    const montant = Number(montantInput ? montantInput.value : 0) || p.montant_attendu;
    const noteInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_note"));
    // Copie figée du nom : calculée ICI, avant l'écriture, à partir de l'état
    // actuel de la fiche membre.
    const nomRem = rembourseur ? fullName(rembourseur) : "";

    // Les deux écritures vont dans la meme transaction : sans cela, une
    // coupure entre elles laisserait un encaissement en caisse sans dette
    // solderee, et l'anomalie ne serait visible nulle part.
    //
    // Une « transaction » IndexedDB est un ensemble d'écritures « tout ou
    // rien » : si la seconde échoue, la première est annulée. Le mode "rw"
    // (read/write) déclare l'intention de lire ET d'écrire — indispensable,
    // IndexedDB refusant d'écrire sur une transaction ouverte en lecture seule.
    try {
      await db.transaction("rw", db.remboursements, db.caisse_mouvements, async () => {
        await db.remboursements.add({
          id: uid(),
          id_membre: p.id_membre,           // le redevable
          id_paiement_concerne: idPaiement,  // la dette soldée
          id_membre_rembourseur: idRembourseur, // le payeur, éventuellement un tiers
          nom_rembourseur: nomRem,           // copie figée du nom
          date_remboursement: todayISO(),
          montant,
          note: noteInput ? noteInput.value.trim() : "",
        });

        await db.caisse_mouvements.add({
          id: uid(),
          date: todayISO(),
          type: "Entree",
          montant,
          libelle: `Remboursement de dette (${nomRem})`,
          categorie: null,
          justificatif: null,
          id_auteur: idRembourseur,
          id_activite: null,
        });
      });
    } catch (err) {
      // Échec de l'une des deux écritures : la transaction a tout annulé,
      // l'état est intact. On remonte l'erreur ET on prévient l'utilisateur,
      // car une remise de dette sans effet doit être signalée.
      console.error("[M3D] Enregistrement du remboursement echoue", err);
      toast("Remboursement non enregistre");
      return;
    }

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
 * Rendu de la sous-vue Prêts entre membres, intégrée au hub Finance.
 *
 * CAS D'USAGE : quand un membre est absent le dimanche, un autre peut régler
 * sa cotisation à sa place. L'association est alors serviced, la dette
 * n'apparaît donc PAS dans l'onglet Dettes : c'est une affaire privée entre
 * les deux membres. La table `prets_membres` trace donc deux parties
 * (`id_debiteur`, `id_preteur`), un montant et une date.
 *
 * CONTRASTE AVEC LES DETTES
 * Un prêt n'est pas un mouvement de caisse : l'argent n'est pas entré dans les
 * comptes de l'association, il a seulement circulé entre deux membres. Seule
 * la FLIP (`rembourse`) est gérée ici, par `marquerPretRembourse()`.
 *
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
 * @returns {Promise<void>}
 */
async function renderPretsMembres(container) {
  const el = container || document.getElementById("financeBody");
  if (!el) return;

  el.innerHTML = `
    <div class="small-note" style="margin-bottom:12px;">Quand un membre absent se fait avancer sa cotisation par un autre, le groupe est deja regle. C'est ici que s'organisent les remboursements entre membres.</div>
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!pretsShowRembourses ? "active" : ""}" id="prets_filtre_attente">En attente</button>
      <button class="btn-chip ${pretsShowRembourses ? "active" : ""}" id="prets_filtre_rembourses">Rembourses</button>
    </div>
    <button class="btn btn-ghost" id="pretsExportBtn" style="margin-bottom:16px;">Exporter en PDF</button>
    <div id="pretsBox"></div>
  `;

  // Les deux filtres ne font que changer l'indicateur global puis redessiner
  // la même sous-vue : à l'intérieur d'un onglet, le motif reste « état global
  // + re-rendu », jamais de navigation vers un autre écran.
  document.getElementById("prets_filtre_attente").addEventListener("click", () => {
    pretsShowRembourses = false;
    renderPretsMembres(el);
  });
  document.getElementById("prets_filtre_rembourses").addEventListener("click", () => {
    pretsShowRembourses = true;
    renderPretsMembres(el);
  });
  document.getElementById("pretsExportBtn").addEventListener("click", exportPretsMembresPDF);

  // `nonRembourseSeulement: !pretsShowRembourses` : le filtre est poussé dans
  // db.js, qui trie par date décroissante au passage.
  const prets = await pretsMembres({ nonRembourseSeulement: !pretsShowRembourses });
  const membres = await db.membres.toArray();
  // Index de recherche : transforme un tableau de membres en objet indexé par
  // id. `memById[unId]` est ainsi en O(1), au lieu d'un `find` linéaire par
  // emprunt. C'est le « pattern » d'indexation utilisé dans tout le projet.
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

  // Délégation d'événements sur les boutons : l'id du prêt voyage dans
  // `data-toggle-pret`, ce qui évite de reconstruire des fermetures.
  box.querySelectorAll("[data-toggle-pret]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = /** @type {HTMLElement} */ (btn).dataset.togglePret;
      // `find` ramène le prêt pour connaître son état actuel : le bouton
      // fait un TOGGLE (`!pret.rembourse`), ce qui permet aussi d'annuler
      // une erreur de saisie sans supprimer la ligne.
      const pret = prets.find((p) => p.id === id);
      await marquerPretRembourse(id, !pret.rembourse);
      toast(pret.rembourse ? "Marque non rembourse" : "Marque rembourse");
      renderPretsMembres(el);
    }),
  );
}
