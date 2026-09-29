/**
 * Module Cotisations - Logique liée au rendu des dimanches de collecte et des paiements
 * Contient les fonctions de rendu pur pour l'onglet Cotisations
 *
 * ---------------------------------------------------------------------------
 * RÔLE DE CE FICHIER
 * ---------------------------------------------------------------------------
 * Ce module produit le HTML de la « feuille de collecte » hebdomadaire :
 * la liste des dimanches d'un côté (vues d'ensemble), la fiche d'un dimanche
 * de l'autre (liste des membres et état de leur cotisation).
 *
 * ---------------------------------------------------------------------------
 * LE PRINCIPE DE LA COTISATION
 * ---------------------------------------------------------------------------
 * Chaque membre actif doit verser une contribution hebdomadaire, le dimanche,
 * lors de la collecte. Le montant DEFAUT est de 500 FCFA par semaine ; il est
 * modifiable, et un membre peut avoir sa valeur PERSONNALISÉE (par exemple
 * 1000 F), via le champ `cotisation_personnalisee` de sa fiche. Ce montant
 * est figé au moment de la création du dimanche dans le champ
 * `montant_attendu` de la ligne de paiement : le modifier plus tard ne
 * réécrit PAS l'historique, ce qui est volontaire.
 *
 * 500 FCFA x 4 dimanches = 2000 F par mois et par membre, hors cotisations
 * spéciales servant à financer un cadeau d'anniversaire.
 *
 * ---------------------------------------------------------------------------
 * `a_paye` (booléen) vs `montant_paye` (nombre) — la distinction est centrale
 * ---------------------------------------------------------------------------
 * Ces deux champs ne disent pas la même chose, et l'application s'appuie
 * dessus :
 *
 *   `a_paye`        vrai / faux — « cette ligne est-elle réglée ? »
 *                   Sert à TOUT ce qui est binaire : l'icône du bouton dans
 *                   la feuille de collecte, le calcul de la régularité d'un
 *                   membre (deux dimanches non payés = irrégulier), la
 *                   présence d'une dette. C'est un INTERRUPTEUR.
 *
 *   `montant_paye`  nombre — « combien a été versé ? »
 *                   Sert aux calculs d'argent : total encaissé, solde de la
 *                   caisse, montant restant. C'est une MESURE.
 *
 * Pourquoi les deux ? Parce qu'un prêt entre membres vaut 0 F pour la caisse
 * tout en réglant la cotisation : `a_paye` passe à `true` alors que
 * `montant_paye` reste à 0. Un simple booléen serait alors faux, et un
 * simple montant perdrait l'information « réglé par un tiers ». Cette
 * distinction est ce qui permet à l'accueil d'afficher « membre à jour »
 * tout en montrant que la caisse n'a rien encaissé.
 *
 * La cohérence est rétablie par construction : `a_paye === true` implique
 * `montant_paye > 0` SAUF dans le cas d'un prêt, où cette exception est
 * justement ce que la feuille de collecte doit signaler.
 *
 * ---------------------------------------------------------------------------
 * FONCTIONS PURES DE GABARIT
 * ---------------------------------------------------------------------------
 * Toutes les fonctions de ce fichier ne font QUE retourner une chaîne HTML,
 * sans jamais toucher au DOM. Elles peuvent donc être appelées autant de fois
 * que nécessaire, testées sans navigateur, et composées entre elles
 * (`renderDimancheListHTML` appelle `weekCardHTML` pour chaque carte).
 * Brancher les événements, en revanche, ne peut se faire qu'après l'injection
 * du HTML : c'est le rôle d'`attachWeekCardHandlers`.
 */

/**
 * Génère la carte HTML représentant un dimanche de collecte (liste des dimanches).
 *
 * UNE CARTE = UN DIMANCHE, EN UN COUP D'ŒIL
 * -----------------------------------------
 * Chaque carte condense en trois informations ce qui caractérise un dimanche :
 *
 *   1. LA DATE et le TOTAL ENCAISSÉ (`totalCollecte`) — combien d'argent est
 *      réellement entré dans la caisse ce jour-là ;
 *   2. LE CONTEXTE (`beneficiaires`) — les membres dont c'est l'anniversaire
 *      ce dimanche-là, car ils recoivent un cadeau financé par la collecte
 *      commune. Si la liste est vide, on affiche « Collecte normale » ;
 *   3. LA SITUATION GLOBALE (`solde`) — la comparaison entre le montant
 *     collecté et le montant redistribué en cadeaux.
 *
 * Le calcul de `solde` décide de l'étiquette ET de sa classe CSS : positif
 * = « tag-surplus » (vert, de l'argent reste en caisse), négatif = « tag-manque »
 * (rouge, il manque de l'argent), nul = « tag-exact ». La classe et le texte
 * sont donc toujours cohérents, puisqu'ils sortent de la même comparaison.
 *
 * `Math.abs()` sert à afficher « Manque 500 F » plutôt que « Manque −500 F » :
 * le signe est déjà porté par le mot « Manque ».
 *
 * @param {Object} j - Objet dimanche enrichi (solde, beneficiaires, totalCollecte, nbPayants, nbTotal, dimanche)
 * @param {Function} fmt - Fonction de formatage monétaire
 * @param {Function} fmtDate - Fonction de formatage de date
 * @param {Function} esc - Fonction d'échappement HTML
 * @returns {string} HTML de la carte du dimanche
 */
function weekCardHTML(j, fmt, fmtDate, esc) {
  // Une seule comparaison ternaire enchaîne : elle détermine la classe, une autre le
  // libellé : impossible d'avoir une classe et un texte qui se contredisent.
  const tagClass = j.solde > 0 ? "tag-surplus" : j.solde < 0 ? "tag-manque" : "tag-exact";
  const tagText = j.solde > 0 ? `+ ${fmt(j.solde)} pour la caisse` : j.solde < 0 ? `Manque ${fmt(Math.abs(j.solde))}` : "Montant exact";
  // `join(", ")` transforme le tableau de prénoms en texte lisible. L'échappement
  // est indispensable : ces noms viennent des fiches membres, donc de saisies
  // utilisateur, et aboutissent dans du `innerHTML`.
  const who = j.beneficiaires.length ? esc(j.beneficiaires.join(", ")) : "Collecte normale";

  // L'attribut `data-dimanche` transporte l'identifiant du dimanche jusqu'au
  // gestionnaire de clic, sans avoir à reconstruire la liste des dimanches à
  // chaque carte.
  return `<div class="week-card" data-dimanche="${j.dimanche.id}">
    <div class="top"><span class="date">${fmtDate(j.dimanche.date)}</span><span class="amount">${fmt(j.totalCollecte)}</span></div>
    <div class="desc">${who} &middot; ${j.nbPayants}/${j.nbTotal} ont cotise</div>
    <div class="tag-row"><span class="tag ${tagClass}">${tagText}</span></div>
  </div>`;
}

/**
 * Génère la ligne HTML représentant un participant et son statut de cotisation.
 *
 * C'est la ligne centrale de la feuille de collecte d'un dimanche : un membre,
 * et l'état de sa cotisation. Elle peut contenir jusqu'à DEUX boutons :
 *
 *   - « Prêt » : affiché UNIQUEMENT si la cotisation n'est pas payée. Il sert
 *     à enregistrer qu'un autre membre a avancé l'argent, donc à ce que
 *     `a_paye` passe à `true` sans que la caisse reçoive rien. Cliquer dessus
 *     demande ensuite QUI a prêté (géré par app.js).
 *   - le bouton d'état, qui bascule la cotisation entre payée et non payée.
 *
 * LE PRÊT EST UNE TROISIÈME SITUATION
 * Si `a_paye` est vrai MAIS qu'un prêteur est associé à cette ligne, l'argent
 * n'est pas arrivé dans la caisse : la classe « loan » et le libellé
 * « Prêt (Nom) » le signalent, là où un paiement direct afficherait « Payé ».
 * C'est exactement la distinction `a_paye` / `montant_paye` décrite en tête de
 * fichier, appliquée à l'affichage.
 *
 * @param {any} p - Enregistrement paiement.
 * @param {Record<string, any>} memById - Dictionnaire des membres indexé par id.
 * @param {Record<string, string>} preteurParPaiement - Dictionnaire des prêts,
 *   indexé par `id_paiement` : chaque valeur est l'id du membre prêteur.
 * @param {Function} esc - Fonction d'échappement HTML
 * @param {Function} fullName - Fonction pour obtenir le nom complet
 * @returns {string} HTML de la ligne de paiement
 */
function paiementRowHTML(p, memById, preteurParPaiement, esc, fullName) {
  // Repli sur un objet « fantôme » quand le membre est introuvable : la ligne
  // s'affiche quand même, avec « ? » au lieu de planter sur `undefined.nom`.
  const m = memById[p.id_membre] || { nom: "?", prenom: "" };
  // Les deux accès sont indexés : un prêt absent donne `undefined`, et le
  // test qui suit se contente de vérifier la véritéiness.
  const idPreteur = preteurParPaiement[p.id];
  const preteur = idPreteur ? memById[idPreteur] : null;

  // Valeurs par défaut = cotisation non réglée. Les deux `if` ensuite ne font
  // que surcharger ces valeurs, du cas le plus « payé » au cas intermédiaire.
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
 *
 * Deux filtres se cumulent, et sont conceptuellement différents :
 *   - le mode ARCHIVES n'est pas un filtre de recherche mais un changement de
 *     périmètre : on regarde soit les dimanches actifs, soit ceux archivés ;
 *     les dimanches archivés ne sont jamais modifiables, c'est le rôle de
 *     l'archivage ;
 *   - la RECHERCHE est un filtre texte, appliqué ensuite, qui porte à la fois
 *     sur la date affichée et sur les noms des bénéficiaires.
 *
 * La recherche porte sur `fmtDate(...)` (la date telle qu'affichée, donc au
 * format local) et non sur la donnée brute : ce que l'utilisateur lit est ce
 * qu'il peut chercher. C'est un choix d'interface, assumé : chercher « 29/09 »
 * fonctionne, chercher « 2026-09-29 » non.
 *
 * Le rendu est délégué à `weekCardHTML` : cette fonction ne fait que
 * sélectionner, jamais construire.
 *
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

  // `filter` renvoie un NOUVEAU tableau : `jours` n'est pas modifié, ce qui
  // permet à l'appelant de changer de filtre plus tard sans effet de bord.
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
 *
 * UNE ÉTAPE OBLIGATOIRE APRÈS TOUT RENDU
 * --------------------------------------
 * On ne peut pas brancher un écouteur sur un élément qui n'existe pas encore.
 * Comme les fonctions de rendu de ce fichier ne font que produire une chaîne,
 * l'appelant procède en deux temps :
 *
 *   box.innerHTML = renderDimancheListHTML(...);   // 1. le HTML apparaît
 *   attachWeekCardHandlers(openWeekDetail);        // 2. on branche les clics
 *
 * `attachWeekCardHandlers` est donc appelé à chaque re-rendu de la liste, et
 * aussi sur l'écran d'accueil (qui affiche les dernières cartes de semaine).
 * Chaque appel repart d'une page neuve : les cartes précédentes ayant été
 * remplacées, leurs écouteurs disparaissent avec elles — aucun risque
 * d'accumulation ni de double déclenchement.
 *
 * L'identifiant du dimanche est relu au clic dans `dataset.dimanche` (l'attribut
 * `data-dimanche` posé par `weekCardHTML`). Le sélecteur `[data-dimanche]`
 * cible TOUT élément portant cet attribut, pas seulement les `.week-card` :
 * c'est volontairement générique, pour que le même câblage serve à l'accueil
 * comme à l'onglet Cotisations.
 *
 * @param {Function} onOpenWeekDetail - Callback appelé avec l'id du dimanche au clic.
 * @returns {void}
 */
function attachWeekCardHandlers(onOpenWeekDetail) {
  document.querySelectorAll("[data-dimanche]").forEach((el) => {
    el.addEventListener("click", () => {
      onOpenWeekDetail(/** @type {HTMLElement} */ (el).dataset.dimanche);
    });
  });
}

// Export des fonctions pour utilisation dans app.js
// Les fichiers sont chargés par <script> dans un ordre défini par index.html,
// sans bundler : exposer les fonctions via `window` est le moyen de les
// partager. Toute fonction ajoutée ici doit l'être aussi dans ce objet,
// sinon app.js ne pourra pas l'appeler.
window.cotisationsModule = {
  weekCardHTML,
  paiementRowHTML,
  renderDimancheListHTML,
  attachWeekCardHandlers
};
