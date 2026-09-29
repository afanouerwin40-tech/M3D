/**
 * Module Membres - Logique liée à l'affichage et à la gestion des listes de membres
 * Contient les fonctions pour rendre les listes de membres et gérer l'interface
 *
 * ---------------------------------------------------------------------------
 * RÔLE DE CE FICHIER
 * ---------------------------------------------------------------------------
 * Ce module ne fait QUE de l'affichage : il produit du HTML, il ne touche ni
 * à IndexedDB, ni aux styles, ni à l'état global. Concrètement il répond à
 * trois questions :
 *   1. quelles lignes afficher (recherche + filtres) ?
 *   2. dans quel ordre (tri) ?
 *   3. à quoi ressemble chaque ligne (HTML) et que se passe-t-il au clic ?
 *
 * ---------------------------------------------------------------------------
 * DEUX RENDUS, UNE SEULE LOGIQUE
 * ---------------------------------------------------------------------------
 * L'application affiche la liste des membres de deux façons selon la largeur
 * de l'écran :
 *   - MOBILE  : des « rows » empilées, une par membre ;
 *   - DESKTOP  : un vrai tableau `<table>` avec colonnes.
 *
 * Les deux rendus partagent donc exactement la même chaîne de traitement
 * (recherche → filtres → tri) et le même contenu, seuls les balises diffèrent.
 * D'où les deux fonctions jumelles `renderMemberListMobile` et
 * `renderMemberListDesktop`, qui acceptent volontairement la MÊME liste de
 * paramètres : le tri, les filtres et l'accès aux données sont ainsi garantis
 * identiques entre mobile et desktop.
 *
 * ---------------------------------------------------------------------------
 * INJECTION DE DÉPENDANCES (pourquoi autant de paramètres ?)
 * ---------------------------------------------------------------------------
 * Les fonctions utilitaires (`esc`, `fullName`, `fmt`, `emptyHTML`…) sont
 * GLOBALES : définies dans utils.js, accessibles partout. Plutôt que de les
 * appeler directement, ce module les reçoit en paramètre et les utilise par
 * leur nom local. C'est de l'« injection de dépendances » : chaque fonction
 * déclare ce dont elle a besoin, et l'appelant (app.js) décide quoi fournir.
 *
 * L'intérêt n'est pas ici d'autoriser plusieurs implémentations, mais de
 * rendre la dépendance VISIBLE et de permettre le test : on pourrait appeler
 * ces fonctions dans un environnement de test en passant de fausses fonctions.
 *
 * Conséquence pratique : la liste de paramètres est longue et doit rester
 * IDENTIQUE dans les deux fonctions ET dans l'appel d'app.js. Toute
 * modification de signature doit être répercutée aux deux endroits.
 *
 * Note : `membresARelancer` fait partie de cette signature commune mais n'est
 * pas utilisé par le rendu actuel — il est conservé pour que les deux
 * fonctions restent interchangeables et que la signature ne diverge pas.
 */

/**
 * Rendu de la liste filtrée et triée des membres pour l'affichage mobile.
 *
 * CONSTRUCTION DU HTML DYNAMIQUE — le schéma en trois temps
 * --------------------------------------------------------
 * Une « template string » (chaîne délimitée par des accents graves `` ` ``)
 * permet d'intercaler du JavaScript dans du HTML avec `${...}`. Le schéma
 * utilisé partout dans ce projet est :
 *
 *   source.map(...).join("")  || .emptyHTML("message")
 *
 *   .map()   transforme chaque membre en une chaîne HTML (une ligne) ;
 *   .join()  colle ces chaînes bout à bout (sans séparateur) en un seul texte ;
 *   ||       si le résultat est vide (falsy), on affiche un message d'état
 *            vide fourni par `emptyHTML()`.
 *
 * L'injection se fait par `innerHTML` : c'est précisément pourquoi CHAQUE
 * donnée venant d'un membre passe par `esc()`. Sans cela, un membre nommé
 * `<img onerror=...>` exécuterait du code. `esc()` transforme les caractères
 * HTML en entités et rend le texte inerte.
 *
 * FILTRES ET TRI
 * --------------
 * Les filtres s'enchaînent volontairement : on commence par la recherche
 * textuelle (la plus large), puis on restreint successivement avec les
 * filtres sélectionnés, puis on trie. Chaque étape produit un nouveau tableau
 * (`.filter()` ne modifie pas l'original) : la variable `list` est réassignée à
 * chaque fois, ce qui garde l'enchaînement lisible.
 *
 * Un filtre vide (« Tous ») est simplement faux : le `if` correspondant est
 * sauté, aucun filtre n'est appliqué. Un `filter` en cascade coûte peu et
 * évite d'écrire huit combinaisons de conditions.
 *
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
 * @returns {Promise<string>} HTML à injecter dans la liste des membres mobile
 */
async function renderMemberListMobile(membres, memberQuery, memberSort, memberFilterFonction, memberFilterMois, memberFilterStatut,
                               membresIrreguliers, membresARelancer, emptyHTML, esc, fullName, initials, fmt, fmtDate,
                               MOIS_NOMS, STATUT_ACTIVITE_BADGE, STATUT_ACTIVITE_LABEL, FONCTIONS, getStatutActivite) {
  // `trim()` retire les espaces parasites, `toLowerCase()` rend la recherche
  // insensible à la casse. La comparaison se fait sur le nom mis en minuscules
  // des deux côtés.
  const q = memberQuery.trim().toLowerCase();
  const all = membres; // Déjà filtré par actifsSeulement ou autre si nécessaire

  // `includes` teste une sous-chaîne : c'est une recherche « contient ».
  // Le téléphone est orthogonal au nom, d'où le `||`.
  let list = all.filter((m) =>
    fullName(m).toLowerCase().includes(q) || (m.telephone || "").includes(q),
  );

  // Filtre par fonction : `(m.fonction || "Membre")` donne une valeur de
  // repli, pour les fiches créées avant l'existence des fonctions.
  if (memberFilterFonction) {
    list = list.filter((m) => (m.fonction || "Membre") === memberFilterFonction);
  }
  // `String(...)` uniformise le type : la valeur du `<select>` est une chaîne,
  // la donnée en base un nombre. Comparer directement échouerait.
  if (memberFilterMois) {
    list = list.filter((m) => String(m.mois_anniversaire || "") === memberFilterMois);
  }
  if (memberFilterStatut) {
    list = list.filter((m) => m.statut === memberFilterStatut);
  }

  // TRI — `sort` modifie le tableau SUR PLACE et renvoie ce même tableau.
  // Le comparateur est une fonction (a, b) qui renvoie un nombre : négatif si
  // `a` avant `b`, positif si après, 0 si équivalent. Attention, on ne compare
  // JAMAIS deux nombres avec `<` : il faut soustraire, sinon le tri est faux.
  // Pour des textes, `localeCompare` tient compte de l'accentuation et des
  // règles de la langue — bien plus robuste que `<` ou `>`.
  if (memberSort === "date") {
    // Décroissant (le plus récent d'abord) : on inverse l'ordre des arguments
    // par rapport au tri croissant.
    list.sort((a, b) => (b.date_adhesion || "").localeCompare(a.date_adhesion || ""));
  } else if (memberSort === "fonction") {
    // Tri à deux niveaux : d'abord la fonction, puis le nom en cas d'égalité.
    // C'est le rôle du `||` : s'il renvoie 0 (égalité), le second critère
    // départage.
    list.sort((a, b) =>
      (a.fonction || "Membre").localeCompare(b.fonction || "Membre") ||
      fullName(a).localeCompare(fullName(b)),
    );
  } else {
    // Tri par défaut alphabétique
    list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }

  // `new Set(...)` : ensemble de valeurs uniques, avec une recherche en temps
  // constant. `irreguliers.has(m.id)` est donc bien plus rapide qu'un
  // `indexOf` sur un tableau, et le code dit exactement l'intention.
  const irreguliers = new Set(await membresIrreguliers());
  const boxContent = list.map((m) => {
    const isIrr = irreguliers.has(m.id);
    // `padStart(2, "0")` complète à gauche avec des zéros pour obtenir deux
    // chiffres : 5 devient "05". Sans cela, la date s'afficherait "5/3".
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

  // La fonction renvoie une CHAÎNE, elle n'écrit pas dans la page : l'appelant
  // décide où l'injecter (`innerHTML = ...`). Ce contrat « pur » permet de
  // tester la fonction sans navigateur.
  return boxContent;
}

/**
 * Rendu des lignes du tableau des membres pour l'affichage desktop.
 *
 * Même chaîne de traitement que la version mobile — recherche, filtres, tri,
 * irrégularités — seules les balises changent : `<tr>`/`<td>` au lieu de
 * `<div class="row">`. Conséquence : toute correction de règle de filtrage ou
 * de tri doit être appliquée aux DEUX fonctions, sans quoi les deux vues
 * divergeraient. C'est le prix de la duplication assumée ici (le factoring
 * créerait plus de complexité que ce qu'elle évite).
 *
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
 * @returns {Promise<string>} HTML à injecter dans le tbody du tableau des membres desktop
 */
async function renderMemberListDesktop(membres, memberQuery, memberSort, memberFilterFonction, memberFilterMois, memberFilterStatut,
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

  const irreguliers = new Set(await membresIrreguliers());
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
  // Le HTML produit est une suite de lignes `<tr>` destinée à un `<tbody>`.
  // Le cas vide doit donc être UNE LIGNE occupant toutes les colonnes : d'où
  // le `colspan="4"`. Sans lui, un tableau sans lignes casserait la mise en page.
  }).join("") || `<tr><td colspan="4">${emptyHTML("Aucun membre correspondant.")}</td></tr>`;

  return boxContent;
}

/**
 * Attache les gestionnaires d'événements aux éléments de la liste des membres.
 *
 * LA DÉLÉGATION D'ÉVÉNEMENTS
 * -------------------------
 * Brancher un écouteur sur chaque ligne serait possible… mais voici le
 * problème : à chaque re-rendu de la liste (à chaque frappe dans la recherche),
 * de nouveaux éléments sont créés. Des écouteurs attachés aux anciens
 * éléments ne sont plus reliés à rien, et ceux attachés aux nouveaux doivent
 * être recréés : `querySelectorAll(...).forEach(addEventListener)` marche, mais
 * il faut imperativement le rejouer après CHAQUE rendu, sous peine d'oublier
 * un lot — bug difficile à reproduire, car il ne se voit qu'après un filtrage.
 *
 * Le motif retenu ici est un motif en deux temps, volontairement explicite :
 *
 *   1. le HTML produit par les fonctions de rendu est INJECTÉ (innerHTML) ;
 *   2. cette fonction est appelée juste après, et elle parcourt les éléments
 *      désormais présents pour brancher les écouteurs.
 *
 * `openMemberDetail` est le comportement à déclencher, mais ce module ne
 * connaît pas cette fiche : on lui passe la fonction en paramètre. Chaque
 * ligne transporte son identifiant dans l'attribut `data-id`, relu au clic via
 * `el.dataset.id` — l'attribut HTML fait donc office de « paramètre caché ».
 *
 * Les DEUX sélecteurs sont traités dans la même fonction car les deux rendus
 * coexistent dans la page : selon la largeur, l'un est visible et l'autre
 * masqué par le CSS. Brancher les deux garantit le bon comportement quel que
 * soit le point de départ (redimensionnement, rotation de l'appareil).
 *
 * @param {Function} openMemberDetail - Fonction pour ouvrir le détail d'un membre
 * @returns {void}
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
// `window` est l'objet global du navigateur : y attacher un objet rend ses
// propriétés accessibles depuis n'importe quel autre script, y compris
// ceux chargés séparément via <script>. C'est le mécanisme utilisé ici, car il
// n'y a ni bundler ni modules ES : les fichiers sont chargés par ordre dans
// index.html et se parlent par l'objet global.
window.membresModule = {
  renderMemberListMobile,
  renderMemberListDesktop,
  attachMemberListEvents
};
