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
 * @returns {Window|null} La fenetre ouverte, ou `null` si le navigateur l'a bloquee.
 * @sideEffect Oui : ouvre un onglet et affiche un toast d'erreur en cas de blocage.
 * @why Les navigateurs n'autorisent `window.open()` que dans le geste utilisateur
 * qui declenche l'action. Cette fonction doit donc rester synchrone et etre
 * appelee au plus proche du clic : si elle etait `async` ou differee, le
 * navigateur la considersrait comme non sollicitee par l'utilisateur.
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
 * Exporte la liste complete des membres sous forme de tableau PDF.
 * @returns {Promise<void>} Resolue une fois la fenetre d'impression ouverte.
 * @sideEffect Oui : lit la base, ouvre la fenetre d'impression.
 * @why Seul export de la liste des membres : il n'a pas de rapport dedie car il
 * ne comporte ni calcul ni tri par personne, juste un tableau de reference.
 * `async`/`await` : `await` suspend la fonction jusqu'a la resolution de la
 * promesse, sans bloquer le reste de la page (le navigateur continue de peindre
 * et de repondre aux clics pendant la lecture IndexedDB).
 */
async function exportMembresPDF() {
  const identite = await pdfIdentite();
  const membres = await listMembres();

  // `map()` transforme chaque membre en une ligne HTML. Toute valeur saisie par
  // l'utilisateur passe par `esc()` : ce HTML sera injecte tel quel dans la
  // fenetre d'impression, qui execute le JavaScript.
  const lignes = membres.map(
    (m) => `<tr>
      <td>${esc(m.nom || "")}</td>
      <td>${esc(m.prenom || "")}</td>
      <td>${esc(m.telephone || "—")}</td>
      <td>${esc(m.fonction || "Membre")}</td>
      <td>${
        // `padStart(2, "0")` complete a gauche avec un zero : le 5/3 devient 05/03.
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

/**
 * Fiche individuelle d'un membre.
 * @param {string} idMembre — identifiant du membre (clé primaire, format "M-XXXXX").
 * @returns {Promise<void>}
 * @sideEffect Oui : ouvre la fenetre d'impression via le rapport appele.
 * @why Delegue a `rapportMembrePDF` plutot que d'implementer le document ici.
 * On garde ce nom pour ne pas casser les boutons existants (voir §14 de CLAUDE.md :
 * les exports restent un point d'entree, la mise en forme vit dans services/pdf/).
 */
async function exportMembreIndividuelPDF(idMembre) {
  await rapportMembrePDF(idMembre);
}

/**
 * Feuille de collecte d'un dimanche.
 * @param {string} idDimanche — identifiant du dimanche (clé primaire de la table `dimanches`).
 * @returns {Promise<void>}
 * @sideEffect Oui : ouvre la fenetre d'impression.
 * @why Idem : la feuille de collecte et la liste des non-payants sont produites
 * par le rapport specialise, qui gere le format A4 et la pagination.
 */
async function exportCotisationPDF(idDimanche) {
  await rapportCotisationPDF(idDimanche);
}

/**
 * Fiche de participation d'une activite.
 * @param {string} id — identifiant de l'activite (clé primaire de la table `listes`).
 * @returns {Promise<void>}
 * @sideEffect Oui : ouvre la fenetre d'impression.
 * @why Le nom historique `exportListePDF` est conserve alors que la table
 * `listes` s'appelle aujourd'hui activites (v1.8.0) : le renommer casserait
 * les appels dans l'interface sans gain de clarte pour l'utilisateur final.
 */
async function exportListePDF(id) {
  await rapportActivitePDF(id);
}

/**
 * Rapport financier et associatif complet.
 * @returns {Promise<void>}
 * @sideEffect Oui : ouvre la fenetre d'impression.
 * @why Point d'entree unique du bouton "Rapport financier" : synthese caisse,
 * dettes, prets et mouvements de caisse tiennent sur un meme document.
 */
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
 * @param {object[]} items — lignes a regrouper (dettes ou prets).
 * @param {string} cleGroupe - Champ de regroupement (ex: "id_membre", "id_debiteur").
 * @param {Function} nomEtSousTitre - (liste) => {nom, sousTitre}
 * @param {Function} montant - (item) => number
 * @param {Function} ligneDetail - (item) => HTML de cellules
 * @param {string[]} entetes - Libelles de colonnes.
 * @param {number[]} [numEnDroite] - Colonnes alignees a droite.
 * @returns {{groupes: object[], html: string}} Les groupes (pour le resume) et le HTML.
 * @sideEffect Aucun : fonction pure, elle ne fait que transformer des donnees en HTML.
 * @why Le tri final se fait sur le sous-total decroissant : le tresorier veut
 * d'abord voir qui doit le plus. Chaque groupe est trie par date croissante,
 * parce qu'une dette qui vieillit est plus urgente qu'une dette de la semaine.
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
  // `groupBy` renvoie une Map ; `Array.from(...values())` la convertit en
  // tableau pour pouvoir utiliser `map` et `sort` dessus. Le `||` du vide
  // affiche un message au lieu d'un document sans titre, sinon l'impression
  // sort une page blanche sans explication.
  const groupes = Array.from(groupBy(items, cleGroupe).values())
    .map((liste) => {
      const { nom, sousTitre } = nomEtSousTitre(liste);
      return {
        nom,
        sousTitre,
        // `reduce()` additionne les montants du groupe : c'est la somme des
        // dettes ou des prets d'une meme personne.
        sousTotal: liste.reduce((a, it) => a + montant(it), 0),
        // `slice()` copie le tableau avant le tri : `sort()` modifie en place
        // et reordonner ici reordonnerait aussi le tableau d'origine.
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
 * @returns {Promise<void>}
 * @sideEffect Oui : lit la base, ouvre la fenetre d'impression.
 * @why Le nom de celui qui a rembourse (`remb_par`) est affiche et non calcule
 * ici : il vient de `dettesList()`, qui applique la regle de nom fige documentee
 * dans CLAUDE.md §8 — le nom historique survit a une suppression ou un renommage.
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

  // Tri decroissant sur la date de remboursement : l'historique se lit du plus
  // recent au plus ancien. `localeCompare` compare des chaines en respectant
  // l'ordre alphabétique local ; sur des dates ISO (AAAA-MM-JJ) l'ordre obtenu
  // est l'ordre chronologique, ce qui evite de parser chaque valeur.
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
 * @returns {Promise<void>}
 * @sideEffect Oui : lit la base, ouvre la fenetre d'impression.
 * @why Un pret est toujours un debiteur et un preteur : on regroupe par
 * `id_debiteur` (ce qui doit etre rendu) en indiquant le preteur en colonne
 * detaillee (a qui rendre). L'inverse — regrouper par preteur — describes les
 * sommes qu'il faut recouvrer, pas les dettes en cours.
 */
async function exportPretsMembresPDF() {
  const identite = await pdfIdentite();
  const prets = await pretsMembres();
  const membres = await db.membres.toArray();
  // Index id → membre construit une seule fois : sans lui, chaque pret
  // declencherait une recherche dans tout le tableau des membres.
  // `Object.fromEntries` transforme la liste de paires en objet (equivalent d'un
  // dictionnaire), avec repli sur "?" si l'identifiant est introuvable.
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
