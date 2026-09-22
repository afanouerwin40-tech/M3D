/**
 * Module Accueil - Logique du tableau de bord "Aujourd'hui"
 * Contient les fonctions pour construire et afficher les éléments du tableau de bord
 */

/**
 * Construit la liste des éléments du tableau de bord "Aujourd'hui"
 * @param {Array} irreguliersIds - IDs des membres irréguliers
 * @param {Array} aRelancer - Membres à relancer
 * @param {Array} pretsEnAttenteArray - Prêts en attente
 * @param {Function} openARelancerSheet - Fonction d'ouverture de la feuille
 * @param {Function} openPretsEnAttenteSheet - Fonction d'ouverture de la feuille de prêts
 * @param {Function} fullName - Fonction pour obtenir le nom complet
 * @param {Function} initials - Fonction pour obtenir les initiales
 * @param {Function} fmt - Fonction de formatage monétaire
 * @param {Function} fmtDate - Fonction de formatage de date
 * @param {Function} emptyHTML - Fonction pour générer le HTML vide
 * @returns {Array} Tableau d'objets représentant les éléments du tableau de bord
 */
function construireAuJourdhuiItems(irreguliersIds, aRelancer, pretsEnAttenteArray,
                                  openARelancerSheet, openPretsEnAttenteSheet,
                                  fullName, initials, fmt, fmtDate, emptyHTML) {
  const aujourdhuiItems = [];

  if (irreguliersIds.length > 0) {
    aujourdhuiItems.push({
      id: "auj-irreguliers",
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4M12 16h.01"/></svg>`,
      bg: "var(--bg-danger)",
      color: "var(--danger)",
      label: `${irreguliersIds.length} membre${irreguliersIds.length > 1 ? "s" : ""} irregulier${irreguliersIds.length > 1 ? "s" : ""}`,
      meta: "Cotisation manquee au moins 2 fois",
      onClick: () => openARelancerSheet(aRelancer.filter((x) => x.irregulier)),
    });
  }

  if (aRelancer.length > 0) {
    aujourdhuiItems.push({
      id: "auj-relancer",
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-cap="round" stroke-linejoin="round" d="M12 6v6l4 2"/></svg>`,
      bg: "var(--bg-warning)",
      color: "var(--warning)",
      label: `${aRelancer.length} membre${aRelancer.length > 1 ? "s" : ""} a relancer`,
      meta: "Absents ou en retard de cotisation",
      onClick: () => openARelancerSheet(aRelancer),
    });
  }

  if (pretsEnAttenteArray && pretsEnAttenteArray.length > 0) {
    aujourdhuiItems.push({
      id: "auj-prets",
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8"/></svg>`,
      bg: "var(--bg-warning)",
      color: "var(--warning)",
      label: `${pretsEnAttenteArray.length} pret${pretsEnAttenteArray.length > 1 ? "s" : ""} en attente`,
      meta: "Remboursement entre membres a suivre",
      onClick: () => openPretsEnAttenteSheet(pretsEnAttenteArray),
    });
  }

  return aujourdhuiItems;
}

/**
 * Rend la boîte du tableau de bord "Aujourd'hui"
 * @param {Array} aujourdhuiItems - Tableau des éléments à afficher
 * @param {Function} esc - Fonction d'échappement HTML
 * @returns {string} HTML à injecter dans la boîte d'accueil
 */
function rendreAuJourdhuiBox(aujourdhuiItems, esc) {
  return aujourdhuiItems.length
    ? aujourdhuiItems.map((it) => `
        <div class="row" data-auj-id="${it.id}">
          <div class="avatar" style="background:${it.bg};color:${it.color};">${it.icon}</div>
          <div class="info"><div class="name">${it.label}</div><div class="meta">${it.meta}</div></div>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-3)" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
        </div>`).join("")
    : `<div class="row"><div class="avatar" style="background:var(--bg-success);color:var(--success);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="m9 12 2 2 4-4"/></svg></div><div class="info"><div class="name">Rien ne demande votre attention</div><div class="meta">Tout est a jour</div></div></div>`;
}

/**
 * Attache les gestionnaires d'événements aux éléments du tableau de bord
 * @param {Array} aujourdhuiItems - Tableau des éléments avec leurs gestionnaires onClick
 */
function attacherEvenementsAuJourdhui(aujourdhuiItems) {
  aujourdhuiItems.forEach((it) => {
    const row = document.querySelector(`[data-auj-id="${it.id}"]`);
    if (row) row.addEventListener("click", it.onClick);
  });
}

// Export des fonctions pour utilisation dans app.js
window.accueilModule = {
  construireAuJourdhuiItems,
  rendreAuJourdhuiBox,
  attacherEvenementsAuJourdhui
};