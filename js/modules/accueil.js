/**
 * @file accueil.js — Module Accueil : logique du tableau de bord « Aujourd'hui ».
 *
 * Ce que contient ce fichier
 * --------------------------
 * Trois fonctions, et rien d'autre : une qui DÉCIDE quelles alertes afficher,
 * une qui produit le HTML correspondant, une qui branche les clics. Le HTML
 * complet de l'onglet Accueil n'est PAS ici : c'est app.js qui construit la
 * page et appelle ces fonctions au bon moment.
 *
 * Ce que cela permet à l'utilisateur
 * -----------------------------------
 * L'onglet Accueil est la page d'entrée de l'application. Sa pièce maîtresse
 * est la carte « Aujourd'hui » : elle ne liste que des actions à mener
 * (relancer des membres, suivre des prêts en attente). Quand tout va bien,
 * elle affiche « Rien ne demande votre attention » — un message rassurant,
 * là où une liste vide laisserait l'utilisateur deviner s'il a un bug.
 *
 * Avec quoi ce module communique
 * ------------------------------
 * EN ENTRÉE (données déjà en mémoire, AUCUNE requête base de données) :
 *   - app.js / db.js fournissent les tableaux de membres, les listes des
 *     membres irréguliers, la liste « à relancer » et les prêts en attente.
 *     Ces listes sont calculées en amont (dans app.js et modules/finances.js),
 *     pas ici.
 *   - openARelancerSheet() et openPretsEnAttenteSheet() : les deux « gestes »
 *     métier, définis dans modules/systeme.js.
 *   - fullName(), initials(), fmt(), fmtDate(), emptyHTML() : utilitaires
 *     globaux de js/utils.js, injectés en paramètres.
 * EN SORTIE :
 *   - window.accueilModule : un objet regroupant les trois fonctions, utilisé
 *     par app.js. Aucun accès direct au DOM en dehors de l'écoute du clic.
 *
 * D'où viennent les données affichées
 * -----------------------------------
 * Les trois listes que ce module met en forme sont produites ailleurs, et
 * jamais en base directement :
 *   - membresIrreguliers() et membresARelancer() vivent dans js/db.js. La
 *     première renvoie les identifiants des membres ayant manqué au moins deux
 *     cotisations d'affilée (les deux dernières lignes de leur historique
 *     portent a_paye === false). La seconde renvoie des fiches d'action, plus
 *     riches : montant de la dette, numéro de téléphone, et deux drapeaux
 *     distincts, hasDebt et isIrregulier, qu'un même membre peut porter
 *     ensemble. Elle accepte en paramètre la liste d'irréguliers déjà calculée,
 *     pour éviter de refaire le même travail deux fois quand l'appelant vient
 *     de l'obtenir.
 *   - pretsMembres({ nonRembourseSeulement: true }) renvoie les prêts entre
 *     membres dont le remboursement n'a pas encore été enregistré.
 * L'appelant, c'est-à-dire renderAccueil() dans app.js, charge tout cela en
 * parallèle puis injecte les tableaux ici.
 *
 * Choix de conception
 * -------------------
 * Injection de dépendances : au lieu d'appeler directement `openARelancerSheet`,
 * la fonction la reçoit en paramètre. Elle pourrait donc être testée sans DOM
 * ni application, en passant des fonctions factices. C'est ce qui permet aux
 * tests automatisés du projet (dossier tools/) de s'exécuter hors navigateur.
 */
/**
 * Construit la liste des éléments du tableau de bord « Aujourd'hui ».
 *
 * Principe : on empile (« push ») un objet par alerte détectée. Chaque objet
 * décrit ce qu'il faut afficher (libellé, méta, couleurs) et ce qu'il faut
 * faire au clic (onClick). Le rendu et le branchement des événements sont
 * ainsi découplés : ajouter une nouvelle alerte consiste à écrire un bloc
 * `if` ici, sans toucher au HTML.
 *
 * Les trois sources d'alerte, dans l'ordre où elles apparaissent à l'écran :
 *   1. les membres irréguliers : au moins deux cotisations manquées ;
 *   2. les membres à relancer : absents ou en simple retard ;
 *   3. les prêts entre membres qui n'ont pas encore été remboursés.
 * Les deux premières peuvent coexister (un irrégulier est aussi « à
 * relancer ») : c'est volontaire, ce sont deux kadres de lecture différents
 * pour le trésorier — l'un historique, l'autre de la semaine en cours.
 *
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
 * @param {Object} memById - Dictionnaire des membres par ID
 * @returns {Array} Tableau d'objets représentant les éléments du tableau de bord.
 *   Retourner un tableau vide est un résultat normal : c'est le cas « tout
 *   est à jour », que `rendreAuJourdhuiBox` traduit par un message rassurant.
 * @sideEffect Aucun. La fonction ne touche ni au DOM ni à la base : elle se
 *   contente de décrire ce qui doit être affiché et fixé.
 */
function construireAuJourdhuiItems(irreguliersIds, aRelancer, pretsEnAttenteArray,
                                  openARelancerSheet, openPretsEnAttenteSheet,
                                  fullName, initials, fmt, fmtDate, emptyHTML, memById) {
  const aujourdhuiItems = [];

  // --- Alerte 1 : les membres irréguliers -----------------------------------
  // `push` empile un objet dans le tableau. Chaque objet est une carte
  // d'alerte : un identifiant (`id`, qui servira de clef dans le HTML),
  // une icône SVG, deux couleurs prises dans les variables CSS du thème
  // (var(--danger) et consorts, définies dans variables.css), un libellé
  // calculé, une précision, et le comportement à déclencher au clic.
  if (irreguliersIds.length > 0) {
    aujourdhuiItems.push({
      id: "auj-irreguliers",
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4M12 16h.01"/></svg>`,
      bg: "var(--bg-danger)",
      color: "var(--danger)",
      label: `${irreguliersIds.length} membre${irreguliersIds.length > 1 ? "s" : ""} irregulier${irreguliersIds.length > 1 ? "s" : ""}`,
      meta: "Cotisation manquee au moins 2 fois",
      // Au clic, on ne montre que les irréguliers. `filter` parcourt le
      // tableau et en garde un nouveau composé des seuls éléments vrais.
      // Un membre à la fois endetté ET irrégulier apparaît donc dans les deux
      // lignes : ce n'est pas un doublon, ce sont deux raisons de le relancer.
      onClick: () => openARelancerSheet(aRelancer.filter((x) => x.irregulier)),
    });
  }

  // --- Alerte 2 : tous les membres à relancer ------------------------------
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

  // --- Alerte 3 : les prêts entre membres non remboursés --------------------
  // Le test est doubles : `pretsEnAttenteArray &&` protège contre un tableau
  // absent ou null (la fonction ne doit pas planter si l'appelant n'a rien
  // calculé), `length > 0` évite d'afficher une alerte vide.
  if (pretsEnAttenteArray && pretsEnAttenteArray.length > 0) {
    aujourdhuiItems.push({
      id: "auj-prets",
      icon: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h8"/></svg>`,
      bg: "var(--bg-warning)",
      color: "var(--warning)",
      label: `${pretsEnAttenteArray.length} pret${pretsEnAttenteArray.length > 1 ? "s" : ""} en attente`,
      meta: "Remboursement entre membres a suivre",
      onClick: () => openPretsEnAttenteSheet(pretsEnAttenteArray, memById),
    });
  }

  return aujourdhuiItems;
}

/**
 * Rend la boîte du tableau de bord « Aujourd'hui ».
 *
 * Transforme la liste d'alertes en une chaîne HTML prête à injecter. Deux
 * sorties possibles : les lignes d'alerte, ou — si la liste est vide — le
 * bandeau vert « Rien ne demande votre attention ».
 *
 * `map` transforme chaque objet en fragment de HTML ; `join("")` recolle les
 * fragments. C'est le duo classique pour construire du HTML : il évite la
 * concaténation manuelle dans une boucle, qui devient vite illisible.
 *
 * L'attribut `data-auj-id` n'est pas décoratif : c'est lui que
 * `attacherEvenementsAuJourdhui` recherche pour rattacher chaque clic au bon
 * comportement. Le HTML et le comportement restent ainsi reliés par un identifiant
 * plutôt que par l'ordre des éléments.
 *
 * @param {Array} aujourdhuiItems - Tableau des éléments à afficher
 * @param {Function} esc - Fonction d'échappement HTML
 * @returns {string} HTML à injecter dans la boîte d'accueil
 */
function rendreAuJourdhuiBox(aujourdhuiItems, esc) {
  // L'opérateur ternaire `? :` choisit entre deux chaînes selon une condition.
  // Ici : s'il y a au moins une alerte, on renvoie les lignes d'alerte ;
  // sinon, on renvoie le bandeau rassurant. C'est un choix d'ergonomie :
  // un tableau vide laisserait croire à un bug, un message affirmatif non.
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
 * Attache les gestionnaires d'événements aux éléments du tableau de bord.
 *
 * Un « event listener » est la fonction que l'on confie au navigateur : il
 * l'appellera à chaque fois que l'utilisateur clique sur l'élément. On parcourt
 * les alertes, on retrouve la ligne correspondante dans le document par son
 * `data-auj-id`, puis on branche le `onClick` calculé plus tôt.
 *
 * Pourquoi cette étape est séparée du rendu : `rendreAuJourdhuiBox` ne
 * produit qu'une chaîne de caractères, et une chaîne n'a pas de
 * comportement. En contrepartie, `construireAuJourdhuiItems` ne touche pas au
 * document et reste testable seule. Le trio build / render / attach laisse
 * ainsi chaque fonction faire une seule chose.
 *
 * `document.querySelector` avec un sélecteur d'attributé cherche le PREMIER
 * élément du document dont l'attribut vaut exactement la valeur donnée. La
 * clef `data-auj-id` est ce qui relie le comportement à sa ligne : réordonner
 * les alertes, ou en insérer une nouvelle, ne casse aucun branchement. C'est
 * plus robuste qu'une indexation `[0]`, `[1]`, qui se décalerait à chaque
 * ajout.
 *
 * Le test `if (row)` évite une exception : le HTML a pu être remplacé entre la
 * construction et cet appel (changement d'onglet, par exemple), auquel cas
 * l'élément n'existe plus.
 *
 * @param {Array} aujourdhuiItems - Tableau des éléments avec leurs gestionnaires onClick
 * @sideEffect OUI : modifie le DOM en ajoutant des écouteurs. Comme le HTML
 *   est reconstruit à chaque affichage de l'accueil, les anciens écouteurs
 *   disparaissent avec lui — pas de fuite à gérer ici.
 */
function attacherEvenementsAuJourdhui(aujourdhuiItems) {
  aujourdhuiItems.forEach((it) => {
    // La ligne peut ne pas exister si le HTML affiché n'est pas celui qu'on
    // vient de construire : on ne branche alors rien, sans planter.
    const row = document.querySelector(`[data-auj-id="${it.id}"]`);
    if (row) row.addEventListener("click", it.onClick);
  });
}

// Export des fonctions pour utilisation dans app.js.
// Un objet regroupant les trois étapes, published sur `window` : c'est ce que
// le navigateur expose globalement à toutes les autres scripts de la page.
// L'intérêt est double : le nom de la globale est unique (donc pas de
// collision avec un autre module), et le préfixe `accueilModule` rend
// explicite l'origine de la méthode à la lecture d'un appel dans app.js.
window.accueilModule = {
  construireAuJourdhuiItems,
  rendreAuJourdhuiBox,
  attacherEvenementsAuJourdhui
};