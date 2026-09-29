/**
 * @file exports.js - Points d'entree des exports et documents imprimables.
 * @description Ce fichier ne contient plus de mise en forme. Il conserve les
 * sept entrees historiques (appelees depuis les boutons de l'interface, donc
 * renommees = regression) et les delegue soit au socle PDF, soit a l'un des
 * cinq rapports de js/services/pdf/rapports.js.
 *
 * Ce qui change par rapport a la version precedente :
 * - les rapports passent par pdfOuvrirEtImprimer(), donc le <title> est
 *   echappe (il ne l'etait pas : un nom contenant "</title><script>"
 *   s'executait dans la fenetre d'impression) ;
 * - la palette indigo #6366F1 disparait au profit du terracotta de
 *   l'application ;
 * - chaque document porte un en-tete, un pied de page et une numerotation ;
 * - le nom de l'organisation est parametrable (Syteme > Parametres) au lieu
 *   d'etre ecrit en dur dans chaque corps de document.
 */

// ============================================================================
// FENETRE D'IMPRESSION
// ============================================================================

/**
 * Ouvre une fenetre dediee de facon synchrone, pour rester avant tout
 * bloqueur de popup : c'est l'appel direct depuis le clic utilisateur qui
 * fait la difference entre une fenetre et un blocage.
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

// ============================================================================
// LISTE DES MEMBRES
// ============================================================================

/**
 * Exporte la liste complete des membres.
 */
async function exportMembresPDF() {
  const identite = await pdfIdentite();
  const membres = await listMembres();

  const lignes = membres.map(
    (m) => `<tr>
      <td>${esc(m.nom || "")}</td>
      <td>${esc(m.prenom || "")}</td>
      <td>${esc(m.telephone || "—")}</td>
      <td>${esc(m.fonction || "Membre")}</td>
      <td>${
        m.jour_anniversaire
          ? `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`
          : "—"
      }</td>
      <td>${m.date_adhesion ? esc(fmtDate(m.date_adhesion)) : "—"}</td>
      <td>${esc(m.statut || "")}</td>
    </tr>`,
  );

  const corps = `
    <h1>Liste des membres</h1>
    <div class="meta">Genere le ${esc(fmtDate(todayISO()))} &middot; ${membres.length} membre(s)</div>
    ${pdfTableau(
      ["Nom", "Prenom", "Telephone", "Fonction", "Anniversaire", "Date d'ajout", "Statut"],
      lignes,
      { messageVide: "Aucun membre enregistre" },
    )}
  `;

  pdfOuvrirEtImprimer(identite.organisation, "Liste des membres", corps, identite.session);
}

// ============================================================================
// EXPORTS DELEGUES AUX RAPPORTS PDF
// ============================================================================
// Ces quatre entrees conservent leur nom d'origine (appelees par les boutons
// de l'interface) et deleguent au rapport specialise correspondant.

/** Fiche individuelle d'un membre. @param {string} idMembre */
async function exportMembreIndividuelPDF(idMembre) {
  await rapportMembrePDF(idMembre);
}

/** Feuille de collecte d'un dimanche. @param {string} idDimanche */
async function exportCotisationPDF(idDimanche) {
  await rapportCotisationPDF(idDimanche);
}

/** Fiche de participation d'une activite. @param {string} id */
async function exportListePDF(id) {
  await rapportActivitePDF(id);
}

/** Rapport financier et associatif complet. */
async function exportRapportPDF() {
  await rapportFinancierPDF();
}

// ============================================================================
// ASSISTANT DE REGROUPEMENT
// ============================================================================

/**
 * Regroupe des lignes par membre et produit une section HTML par membre,
 * avec un sous-total par section.
 *
 * Ce helper reste ici parce qu'il est utilise par les deux exports qui n'ont
 * pas de rapport dedie (dettes, prets) : regrouper par membre avec un
 * sous-total par personne est une presentation propre a ces deux ecrans, pas
 * une propriete generale des rapports.
 *
 * @param {object[]} items
 * @param {string} cleGroupe - Champ de regroupement.
 * @param {Function} nomEtSousTitre - (liste) => {nom, sousTitre}
 * @param {Function} montant - (item) => number
 * @param {Function} ligneDetail - (item) => HTML de cellules
 * @param {string[]} entetes - Libelles de colonnes.
 * @param {number[]} [numEnDroite] - Colonnes alignees a droite.
 * @returns {{groupes: object[], html: string}}
 */
function grouperParMembreHTML(
  items,
  cleGroupe,
  nomEtSousTitre,
  montant,
  ligneDetail,
  entetes,
  numEnDroite = [],
) {
  const groupes = Array.from(groupBy(items, cleGroupe).values())
    .map((liste) => {
      const { nom, sousTitre } = nomEtSousTitre(liste);
      return {
        nom,
        sousTitre,
        sousTotal: liste.reduce((a, it) => a + montant(it), 0),
        detail: liste.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")),
      };
    })
    .sort((a, b) => b.sousTotal - a.sousTotal);

  const html =
    groupes
      .map(
        (g) => `
    <h2>${esc(g.nom)}${g.sousTitre ? ` &middot; ${esc(g.sousTitre)}` : ""}</h2>
    ${pdfTableau(entetes, g.detail.map(ligneDetail), { numEnDroite })}
    ${pdfLigneTotal("Sous-total", esc(fmt(g.sousTotal)))}`,
      )
      .join("") || `<p class="vide">Aucune donnee.</p>`;

  return { groupes, html };
}

// ============================================================================
// DETTES
// ============================================================================

/**
 * Exporte l'etat des dettes du groupe. Les dettes remboursees sont listees
 * separees des impayees, avec le nom de celui qui a rembourse : c'est
 * l'information qu'un tresorier cherche en premier.
 */
async function exportDettesPDF() {
  const identite = await pdfIdentite();
  const toutes = await dettesList();

  const impayees = toutes.filter((d) => d.statut === "Impayee");
  const soldees = toutes.filter((d) => d.statut === "Remboursee");
  const totalImpayees = impayees.reduce((a, d) => a + d.montant, 0);

  const { groupes, html: sections } = grouperParMembreHTML(
    impayees,
    "id_membre",
    (liste) => ({ nom: liste[0].membre, sousTitre: liste[0].telephone }),
    (d) => d.montant,
    (d) => `<td>${esc(fmtDate(d.date))}</td><td class="num">${esc(fmt(d.montant))}</td>`,
    ["Date", "Montant"],
    [1],
  );

  const soldeesLignes = soldees
    .sort((a, b) => (b.remb_date || "").localeCompare(a.remb_date || ""))
    .map(
      (d) => `<tr>
        <td>${esc(fmtDate(d.remb_date))}</td>
        <td>${esc(d.membre)}</td>
        <td>${esc(d.remb_par || "—")}</td>
        <td class="num">${esc(fmt(d.remb_montant != null ? d.remb_montant : d.montant))}</td>
      </tr>`,
    );

  const corps = `
    <h1>Dettes du groupe</h1>
    <div class="meta">Genere le ${esc(fmtDate(todayISO()))} &middot; ${
      impayees.length
    } dette(s) impayee(s) sur ${groupes.length} membre(s)</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Membres concernes", esc(groupes.length)],
      ["Dettes impayees", esc(impayees.length)],
      ["Total des dettes impayees", esc(fmt(totalImpayees))],
      ["Dettes soldees", esc(soldees.length)],
    ])}
    ${pdfLigneTotal("Total des dettes impayees", esc(fmt(totalImpayees)))}

    <h2>Detail par membre</h2>
    ${sections}

    <h2>Dettes soldee (${soldees.length})</h2>
    ${pdfTableau(["Rembourse le", "Dette de", "Rembourse par", "Montant"], soldeesLignes, {
      numEnDroite: [3],
      messageVide: "Aucun remboursement enregistre",
    })}
  `;

  pdfOuvrirEtImprimer(identite.organisation, "Dettes du groupe", corps, identite.session);
}

// ============================================================================
// PRETS ENTRE MEMBRES
// ============================================================================

/**
 * Exporte le suivi des prets personnels entre membres.
 */
async function exportPretsMembresPDF() {
  const identite = await pdfIdentite();
  const prets = await pretsMembres();
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) => (memById[id] ? fullName(memById[id]) : "?");

  const enAttente = prets.filter((p) => !p.rembourse);
  const rembourses = prets.filter((p) => p.rembourse);
  const totalEnAttente = enAttente.reduce((a, p) => a + p.montant, 0);

  const { groupes, html: sections } = grouperParMembreHTML(
    enAttente,
    "id_debiteur",
    (liste) => ({ nom: nomOf(liste[0].id_debiteur), sousTitre: "" }),
    (p) => p.montant,
    (p) =>
      `<td>${esc(nomOf(p.id_preteur))}</td><td class="num">${esc(
        fmt(p.montant),
      )}</td><td>${esc(fmtDate(p.date))}</td>`,
    ["A avance", "Montant", "Date"],
    [1],
  );

  const corps = `
    <h1>Prets entre membres</h1>
    <div class="meta">Genere le ${esc(fmtDate(todayISO()))} &middot; ${
      enAttente.length
    } pret(s) en cours &middot; ${rembourses.length} rembourse(s)</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Debiteurs concernes", esc(groupes.length)],
      ["Prets en cours", esc(enAttente.length)],
      ["Total des prets non rembourses", esc(fmt(totalEnAttente))],
      ["Prets deja rembourses", esc(rembourses.length)],
    ])}
    ${pdfLigneTotal("Total des prets non rembourses", esc(fmt(totalEnAttente)))}

    <h2>Detail par debiteur</h2>
    ${sections}
  `;

  pdfOuvrirEtImprimer(identite.organisation, "Prets entre membres", corps, identite.session);
}
