/**
 * @file exports.js - Moteur d'exports PDF et documents imprimables.
 * @description Ouverture d'une fenêtre d'impression, injection du document HTML
 * formaté et génération des exports Membres, Fiche individuelle, Dettes,
 * Prêts entre membres, Cotisation, Activité et Rapport général.
 */

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