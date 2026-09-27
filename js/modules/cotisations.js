/**
 * Module Cotisations - Logique liée au rendu des dimanches de collecte et des paiements
 * Contient les fonctions de rendu pur pour l'onglet Cotisations
 */

/**
 * Génère la carte HTML représentant un dimanche de collecte (liste des dimanches).
 * @param {Object} j - Objet dimanche enrichi (solde, beneficiaires, totalCollecte, nbPayants, nbTotal, dimanche)
 * @param {Function} fmt - Fonction de formatage monétaire
 * @param {Function} fmtDate - Fonction de formatage de date
 * @param {Function} esc - Fonction d'échappement HTML
 * @returns {string} HTML de la carte du dimanche
 */
function weekCardHTML(j, fmt, fmtDate, esc) {
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
 * Génère la ligne HTML représentant un participant et son statut de cotisation.
 * @param {any} p - Enregistrement paiement.
 * @param {Record<string, any>} memById - Dictionnaire des membres.
 * @param {Record<string, string>} preteurParPaiement - Dictionnaire des prêts par paiement.
 * @param {Function} esc - Fonction d'échappement HTML
 * @param {Function} fullName - Fonction pour obtenir le nom complet
 * @returns {string} HTML de la ligne de paiement
 */
function paiementRowHTML(p, memById, preteurParPaiement, esc, fullName) {
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
 * Filtre et rend la liste des cartes de dimanches selon la recherche et le mode archives.
 * @param {Array<Object>} jours - Liste des dimanches enrichis (sortie de joursAvecStats()).
 * @param {string} dimancheQuery - Terme de recherche courant.
 * @param {boolean} dimancheShowArchives - true pour afficher les archives, false pour les actifs.
 * @param {Function} fmt - Fonction de formatage monétaire.
 * @param {Function} fmtDate - Fonction de formatage de date.
 * @param {Function} esc - Fonction d'échappement HTML.
 * @returns {string} HTML de la liste (ou message vide si aucun résultat).
 */
function renderDimancheListHTML(jours, dimancheQuery, dimancheShowArchives, fmt, fmtDate, esc) {
  const q = dimancheQuery.trim().toLowerCase();

  let list = jours.filter((j) => (dimancheShowArchives ? j.dimanche.archivee : !j.dimanche.archivee));
  if (q) {
    list = list.filter((j) =>
      fmtDate(j.dimanche.date).includes(q) ||
      j.beneficiaires.join(" ").toLowerCase().includes(q),
    );
  }

  return list.map((j) => weekCardHTML(j, fmt, fmtDate, esc)).join("") ||
    emptyHTML(dimancheShowArchives ? "Aucun dimanche archive." : "Aucune collecte enregistree. Cree le premier dimanche.");
}

/**
 * Attache les écouteurs de clic sur toutes les cartes de dimanches actuellement affichées dans le DOM.
 * @param {Function} onOpenWeekDetail - Callback appelé avec l'id du dimanche au clic.
 */
function attachWeekCardHandlers(onOpenWeekDetail) {
  document.querySelectorAll("[data-dimanche]").forEach((el) => {
    el.addEventListener("click", () => {
      onOpenWeekDetail(/** @type {HTMLElement} */ (el).dataset.dimanche);
    });
  });
}

// Export des fonctions pour utilisation dans app.js
window.cotisationsModule = {
  weekCardHTML,
  paiementRowHTML,
  renderDimancheListHTML,
  attachWeekCardHandlers
};