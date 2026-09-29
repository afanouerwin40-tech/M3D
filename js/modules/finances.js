/**
 * @file finances.js - Module Finance : Caisse, Dettes et Prêts entre membres.
 * @description Gère l'affichage et les interactions de l'onglet Finance.
 */

// État de navigation de l'onglet Finance
let financeVue = "caisse";

// État filtre des prêts
let pretsShowRembourses = false;

// ============================================================================
// FINANCE — HUB CAISSE, DETTES & PRÊTS
// ============================================================================

/**
 * Onglet Finance : regroupe Caisse, Dettes et Prêts entre membres dans un
 * seul écran, avec une navigation Segmented (Phase C) entre les trois —
 * plus besoin d'ouvrir un écran séparé ni de revenir en arrière pour
 * passer de l'un à l'autre.
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

  document.getElementById("financeSegCaisse").addEventListener("click", () => { financeVue = "caisse"; renderFinance(); });
  document.getElementById("financeSegDettes").addEventListener("click", () => { financeVue = "dettes"; renderFinance(); });
  document.getElementById("financeSegPrets").addEventListener("click", () => { financeVue = "prets"; renderFinance(); });

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
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
 */
async function renderCaisse(container) {
  const el = container || document.getElementById("financeBody");
  if (!el) return;

  const cd = await caisseDetail();
  const manuels = (await db.caisse_mouvements.toArray()).sort((a, b) => b.date.localeCompare(a.date));
  const depensesCat = await depensesParCategorie();
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
// DETTES & REMBOURSEMENTS
// ============================================================================

/**
 * Rendu de la sous-vue Dettes, intégrée au hub Finance (voir renderFinance).
 *
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
 */
async function renderDettes(container) {
  const el = container || document.getElementById("financeBody");
  if (!el) return;

  const dettes = await dettesList();
  const impayees = dettes.filter((d) => d.statut === "Impayee");
  const remboursees = dettes.filter((d) => d.statut === "Remboursee");
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
  const rowHTML = (d, actionable) => {
    const meta = actionable
      ? fmtDate(d.date)
      : `${fmtDate(d.date)} &middot; rembourse par ${esc(d.remb_par || "?")}`
        + `${d.remb_date ? " le " + fmtDate(d.remb_date) : ""}`;
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
 * @param {string} idPaiement - Identifiant du paiement concerné.
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
      return;
    }
    const rembourseur = membres.find((m) => m.id === idRembourseur);
    const montantInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_montant"));
    const montant = Number(montantInput ? montantInput.value : 0) || p.montant_attendu;
    const noteInput = /** @type {HTMLInputElement} */ (ov.querySelector("#rb_note"));
    const nomRem = rembourseur ? fullName(rembourseur) : "";

    // Les deux écritures vont dans la meme transaction : sans cela, une
    // coupure entre elles laisserait un encaissement en caisse sans dette
    // solderee, et l'anomalie ne serait visible nulle part.
    try {
      await db.transaction("rw", db.remboursements, db.caisse_mouvements, async () => {
        await db.remboursements.add({
          id: uid(),
          id_membre: p.id_membre,
          id_paiement_concerne: idPaiement,
          id_membre_rembourseur: idRembourseur,
          nom_rembourseur: nomRem,
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
 * @param {HTMLElement} [container] - Élément cible ; par défaut #financeBody.
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

  document.getElementById("prets_filtre_attente").addEventListener("click", () => {
    pretsShowRembourses = false;
    renderPretsMembres(el);
  });
  document.getElementById("prets_filtre_rembourses").addEventListener("click", () => {
    pretsShowRembourses = true;
    renderPretsMembres(el);
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
      renderPretsMembres(el);
    }),
  );
}
