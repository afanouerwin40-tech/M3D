/**
 * Module Membres - Logique liée à l'affichage et à la gestion des listes de membres
 * Contient les fonctions pour rendre les listes de membres et gérer l'interface
 */

/**
 * Rendu de la liste filtrée et triée des membres pour l'affichage mobile.
 * @param {Array} membres - Liste des membres à afficher
 * @param {string} memberQuery - Requête de recherche
 * @param {string} memberSort - Critère de tri
 * @param {string} memberFilterFonction - Filtre par fonction
 * @param {string} memberFilterMois - Filtre par mois d'anniversaire
 * @param {string} memberFilterStatut - Filtre par statut
 * @param {Function} membresIrreguliers - Fonction pour obtenir les IDs des membres irréguliers
 * @param {Function} membresARelancer - Fonction pour obtenir les membres à relancer
 * @param {Function} emptyHTML - Fonction pour générer le HTML vide
 * @param {Function} esc - Fonction d'échappement HTML
 * @param {Function} fullName - Fonction pour obtenir le nom complet
 * @param {Function} initials - Fonction pour obtenir les initiales
 * @param {Function} fmt - Fonction de formatage monétaire
 * @param {Function} fmtDate - Fonction de formatage de date
 * @param {Array} MOIS_NOMS - Tableau des noms des mois
 * @param {Object} STATUT_ACTIVITE_BADGE - Mapping des badges de statut
 * @param {Object} STATUT_ACTIVITE_LABEL - Mapping des étiquettes de statut
 * @param {Array} FONCTIONS - Liste des fonctions disponibles
 * @param {Function} getStatutActivite - Fonction pour obtenir le statut d'activité
 * @returns {string} HTML à injecter dans la liste des membres mobile
 */
function renderMemberListMobile(membres, memberQuery, memberSort, memberFilterFonction, memberFilterMois, memberFilterStatut,
                               membresIrreguliers, membresARelancer, emptyHTML, esc, fullName, initials, fmt, fmtDate,
                               MOIS_NOMS, STATUT_ACTIVITE_BADGE, STATUT_ACTIVITE_LABEL, FONCTIONS, getStatutActivite) {
  const q = memberQuery.trim().toLowerCase();
  const all = membres; // Déjà filtré par actifsSeulement ou autre si nécessaire

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
  } else {
    // Tri par défaut alphabétique
    list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }

  const irreguliers = new Set(membresIrreguliers());
  const boxContent = list.map((m) => {
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

  return boxContent;
}

/**
 * Rendu des lignes du tableau des membres pour l'affichage desktop.
 * @param {Array} membres - Liste des membres à afficher
 * @param {string} memberQuery - Requête de recherche
 * @param {string} memberSort - Critère de tri
 * @param {string} memberFilterFonction - Filtre par fonction
 * @param {string} memberFilterMois - Filtre par mois d'anniversaire
 * @param {string} memberFilterStatut - Filtre par statut
 * @param {Function} membresIrreguliers - Fonction pour obtenir les IDs des membres irréguliers
 * @param {Function} membresARelancer - Fonction pour obtenir les membres à relancer
 * @param {Function} emptyHTML - Fonction pour générer le HTML vide
 * @param {Function} esc - Fonction d'échappement HTML
 * @param {Function} fullName - Fonction pour obtenir le nom complet
 * @param {Function} initials - Fonction pour obtenir les initiales
 * @param {Function} fmt - Fonction de formatage monétaire
 * @param {Function} fmtDate - Fonction de formatage de date
 * @param {Array} MOIS_NOMS - Tableau des noms des mois
 * @param {Object} STATUT_ACTIVITE_BADGE - Mapping des badges de statut
 * @param {Object} STATUT_ACTIVITE_LABEL - Mapping des étiquettes de statut
 * @param {Array} FONCTIONS - Liste des fonctions disponibles
 * @param {Function} getStatutActivite - Fonction pour obtenir le statut d'activité
 * @returns {string} HTML à injecter dans le tbody du tableau des membres desktop
 */
function renderMemberListDesktop(membres, memberQuery, memberSort, memberFilterFonction, memberFilterMois, memberFilterStatut,
                                membresIrreguliers, membresARelancer, emptyHTML, esc, fullName, initials, fmt, fmtDate,
                                MOIS_NOMS, STATUT_ACTIVITE_BADGE, STATUT_ACTIVITE_LABEL, FONCTIONS, getStatutActivite) {
  const q = memberQuery.trim().toLowerCase();
  const all = membres; // Déjà filtré par actifsSeulement ou autre si nécessaire

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
  } else {
    // Tri par défaut alphabétique
    list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }

  const irreguliers = new Set(membresIrreguliers());
  const boxContent = list.map((m) => {
    const isIrr = irreguliers.has(m.id);
    const annivStr = m.jour_anniversaire
      ? `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`
      : "Non renseigne";

    return `
      <tr data-id="${m.id}">
        <td><div class="info" style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="width:30px;height:30px;font-size:12px;">${initials(m)}</div><span>${esc(fullName(m))}</span>${isIrr ? ` <span class="badge" style="background:var(--bg-danger);color:var(--danger);">Irregulier</span>` : ""}</div></td>
        <td>${esc(m.fonction || "Membre")}</td>
        <td>${annivStr}</td>
        <td><span class="badge ${m.statut === "Actif" ? "badge-yes" : "badge-no"}">${m.statut}</span></td>
      </tr>`;
  }).join("") || `<tr><td colspan="4">${emptyHTML("Aucun membre correspondant.")}</td></tr>`;

  return boxContent;
}

/**
 * Attache les gestionnaires d'événements aux éléments de la liste des membres.
 * @param {Function} openMemberDetail - Fonction pour ouvrir le détail d'un membre
 */
function attachMemberListEvents(openMemberDetail) {
  document.querySelectorAll("#memberList .row").forEach((el) => {
    el.addEventListener("click", () => openMemberDetail(el.dataset.id));
  });

  document.querySelectorAll("#memberTable tr[data-id]").forEach((el) => {
    el.addEventListener("click", () => openMemberDetail(el.dataset.id));
  });
}

// Export des fonctions pour utilisation dans app.js
window.membresModule = {
  renderMemberListMobile,
  renderMemberListDesktop,
  attachMemberListEvents
};