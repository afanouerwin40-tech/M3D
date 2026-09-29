/**
 * @file rapports.js - Les cinq rapports PDF personnalisables.
 *
 * Ce que contient ce fichier : les cinq fonctions qui produisent le contenu
 * d'un document imprime, plus un utilitaire d'en-tete (pdfIdentite). Une
 * fonction = un rapport, et un rapport = ce que le papier doit contenir.
 *
 * Ce que cela permet : chaque rapport se concentre sur SES questions
 * metier. Il collecte ses donnees dans IndexedDB, appelle pdfTableau(),
 * pdfResume(), pdfLigneTotal() et pdfListe() pour la mise en forme, puis
 * delegue l'assemblage et l'impression au socle. Aucune de ces fonctions
 * ne reconstruit de feuille de style ni de formatteur monetaire : si vous
 * voulez changer la police du papier, on ne touche que socle.js.
 *
 * Avec quoi il communique :
 *   - socle.js : pdfOuvrirEtImprimer(), point de sortie de tous les
 *     rapports ;
 *   - composants.js : pdfTableau(), pdfResume(), pdfLigneTotal(),
 *     pdfListe() ;
 *   - js/db.js : les fonctions de lecture, toutes en lecture seule. Aucun
 *     rapport n'ecrit dans la base — un export ne doit jamais modifier les
 *     donnees qu'il exporte.
 *   - js/utils.js : esc(), fmt(), fmtDate(), fullName().
 *
 * Vocabulary, defini ici et utilise dans tout le fichier :
 *   - `async` / `await` : une fonction `async` peut se mettre en pause. Sur
 *     `await`, JavaScript rend la main au navigateur et reprend la fonction
 *     plus tard, quand le resultat est pret. Sans `await`, cinq requetes
 *     s'enchaineraient en se bloquant les unes les autres et l'interface
 *     gelerait.
 *   - `Promise.all([...])` : lance plusieurs Promesses en parallele et
 *     renvoie un tableau de resultats, dans l'ordre du tableau d'entree.
 *     On ne paie donc qu'un seul delai au lieu de la somme des delais.
 *   - `.filter(f)` : nouveau tableau ne gardant que les elements pour
 *     lesquels `f` renvoie vrai.
 *   - `.reduce((acc, x) => ..., 0)` : parcourt le tableau et cumule une
 *     valeur. `acc` est l'accumulateur, `x` l'element courant, `0` la
 *     valeur de depart. C'est la maniere standard de sommer.
 *   - `Object.fromEntries(...)` : transforme un tableau de couples
 *     [[cle, valeur], ...] en objet, pour pouvoir chercher par identifiant
 *     en temps constant au lieu de parcourir le tableau a chaque fois.
 *
 * Chaque fonction lit l'organisation et la session depuis les parametres :
 * les documents ne sont donc plus figes sur « Jeunesse M3D ».
 */

/**
 * Identite affichee en tete de tous les rapports.
 *
 * Le nom de l'organisation est configurable (Systeme > Parametres) ; la
 * session provient de la session pastorale active.
 *
 * On passe par getOrCreateSessionActive() plutot que par une lecture directe
 * du parametre « session_active » : apres un import de sauvegarde, ce
 * parametre peut pointer vers une session disparue, et un simple getParam
 * renverrait alors un en-tete sans session alors que l'application, elle,
 * affiche bien « Session 2026 ». getOrCreateSessionActive() retombe sur une
 * session reelle si celle du parametre a disparu.
 *
 * @returns {Promise<{organisation: string, session: string|null}>} Un objet
 *   avec le nom de l'organisation (jamais vide : « Jeunesse M3D » par
 *   defaut) et le nom de la session, ou `null` si aucune session n'existe.
 *   Effets de bord : aucun, lecture seule.
 */
async function pdfIdentite() {
  const [organisation, sessionId] = await Promise.all([
    getParam("organisation_nom", "Jeunesse M3D"),
    getOrCreateSessionActive(),
  ]);
  const s = sessionId ? await db.sessions.get(sessionId) : null;
  return {
    organisation: organisation || "Jeunesse M3D",
    session: s && s.nom ? s.nom : null,
  };
}

// ---------------------------------------------------------------------------
// 1. FICHE MEMBRE
// ---------------------------------------------------------------------------

/**
 * FICHE MEMBRE — fiche financiere et organisationnelle complete.
 *
 * Tables lues, via rapportIndividuelMembre() (js/db.js) :
 *   - membres (la fiche : nom, prenom, fonction) ;
 *   - paiements, joints a dimanches (l'historique de collecte semaine par
 *     semaine) ;
 *   - remboursements + paiements (les dettes) ;
 *   - prets_membres (les emprunts, dans les deux sens).
 *
 * Sections du document, dans cet ordre :
 *   1. Resume financier : cinq chiffres cles. On commence par la synthese
 *      parce que c'est ce que le lecteur cherche en premier, et qu'il peut
 *      descendre ensuite dans le detail s'il le souhaite.
 *   2. Collecte, detail : une ligne par dimanche. L'ordre est inverse
 *      (`.slice().reverse()`) : les semaines les plus recentes d'abord, la
 *      plus recente etant en haut du tableau. On copie d'abord avec
 *      `.slice()` parce que `.reverse()` modifie le tableau d'origine — et
 *      `r.historique` appartient a la couche donnees, qu'on ne doit pas
 *      modifier depuis un rapport.
 *   3. Dette envers le groupe : ce que le membre doit a l'association.
 *   4. Prets a rembourser (il doit) et prets a recevoir (on lui doit).
 *      Les deux sont separes, et non fusionnes en un solde, parce que
 *      « il doit 5 000 F a Marie » et « on lui doit 5 000 F a Jean » ne
 *      s'annulent pas automatiquement : le tresorerieier doit savoir qui
 *      relancer et qui settler.
 *
 * Pourquoi cette repartition : le document repond aux quatre questions
 * concretees que l'on pose sur un membre — « a-t-il paye regulierement ? »,
 * « doit-il de l'argent ? », « doit-il a quelqu'un ? », « lui doit-on ? ».
 * Aucun calcul n'est fait ici : tout vient de rapportIndividuelMembre(),
 * qui recalcule depuis l'historique (principe event sourcing). Le rapport
 * ne fait que mettre en forme.
 *
 * Effets de bord : ouvre une fenetre d'impression (via le socle). Aucune
 * ecriture en base. Si le membre n'existe pas, la couche donnees renvoie
 * un objet vide et le rapport imprime des tableaux vides explicitement
 * plutot que d'echouer.
 *
 * @param {string} idMembre - Identifiant du membre (champ `id` de la table
 *   membres, de la forme « M-00042 »).
 * @returns {Promise<void>}
 */
async function rapportMembrePDF(idMembre) {
  const [identite, r] = await Promise.all([pdfIdentite(), rapportIndividuelMembre(idMembre)]);
  const nom = fullName(r.membre);

  // `.slice()` copie le tableau avant `.reverse()`, qui modifie l'original.
  // Sans la copie, l'historique de la couche donnees serait ordonne a
  // l'envers pour tous les appelants suivants.
  const collecte = r.historique
    .slice()
    .reverse()
    .map((h) => `<tr>
      <td>${esc(fmtDate(h.date))}</td>
      <td>${h.a_paye ? "Paye" : "Non paye"}</td>
      <td class="num">${esc(fmt(h.montant_attendu))}</td>
      <td>${esc(h.beneficiaires.length ? h.beneficiaires.join(", ") : "—")}</td>
    </tr>`);

  const dettes = r.detteGroupeDetail.map(
    (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
  );

  const pretsADevoir = r.pretsADevoirEnAttente.map(
    (p) => `<tr><td>${esc(p.autreMembre)}</td><td class="num">${esc(fmt(p.montant))}</td><td>${esc(fmtDate(p.date))}</td></tr>`,
  );

  const pretsARecevoir = r.pretsARecevoirEnAttente.map(
    (p) => `<tr><td>${esc(p.autreMembre)}</td><td class="num">${esc(fmt(p.montant))}</td><td>${esc(fmtDate(p.date))}</td></tr>`,
  );

  const corps = `
    <h1>Fiche individuelle</h1>
    <div class="meta">${esc(nom)} &middot; ${esc(r.membre.fonction || "Membre")} &middot; Genere le ${esc(fmtDate(r.genereLe))}</div>

    <h2>Resume financier</h2>
    ${pdfResume([
      ["Total collecte attendu (toutes semaines)", esc(fmt(r.totalCollecteAttendu))],
      ["Total effectivement paye", esc(fmt(r.totalCollectePaye))],
      ["Dette envers le groupe", esc(fmt(r.detteGroupeTotal))],
      ["Prets a rembourser a d'autres membres", esc(fmt(r.pretsADevoirTotal))],
      ["Prets a recevoir d'autres membres", esc(fmt(r.pretsARecevoirTotal))],
    ])}

    <h2>Collecte — detail (${r.historique.length} dimanches)</h2>
    ${pdfTableau(["Date", "Statut", "Montant", "Beneficiaire(s)"], collecte, {
      numEnDroite: [2],
      messageVide: "Aucune collecte enregistree pour ce membre",
    })}

    <h2>Dette envers le groupe</h2>
    ${pdfTableau(["Date", "Montant"], dettes, { numEnDroite: [1], messageVide: "Aucune dette" })}
    ${pdfLigneTotal("Total dette", esc(fmt(r.detteGroupeTotal)))}

    <h2>Prets a rembourser (${r.pretsADevoirEnAttente.length})</h2>
    ${pdfTableau(["Preteur", "Montant", "Date"], pretsADevoir, {
      numEnDroite: [1],
      messageVide: "Aucun pret en attente",
    })}
    ${pdfLigneTotal("Total a rembourser", esc(fmt(r.pretsADevoirTotal)))}

    <h2>Prets a recevoir (${r.pretsARecevoirEnAttente.length})</h2>
    ${pdfTableau(["Debiteur", "Montant", "Date"], pretsARecevoir, {
      numEnDroite: [1],
      messageVide: "Aucun pret a recevoir",
    })}
    ${pdfLigneTotal("Total a recevoir", esc(fmt(r.pretsARecevoirTotal)))}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Fiche — ${nom}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 2. RAPPORT ACTIVITE
// ---------------------------------------------------------------------------

/**
 * RAPPORT ACTIVITE — fiche de financement et de participation.
 *
 * Tables lues :
 *   - listes (la fiche : nom, description, date, heure, lieu, responsable) ;
 *   - liste_membres (la liste des participants) via membresDeListe() ;
 *   - liste_frais (les frais demandes) via listeFraisAll() ;
 *   - liste_paiements (ce que chacun a reellement verse), agrege par
 *     infosParticipantActivite() ;
 *   - dons, filtres sur cette activite, via donsList({idActivite}).
 *
 * Sections du document :
 *   1. Identite de l'activite (date, heure, lieu, responsable) et nombre de
 *      participants, rassembles dans une seule ligne de metadonnees.
 *   2. Frais : la liste des frais demandes, tries par le champ `ordre`
 *      (`.sort()`) — c'est un entier choisi par l'utilisateur dans l'ecran
 *      de configuration, pas l'ordre alphabetique ni l'ordre d'insertion.
 *   3. Participation : une ligne par membre, avec attendu / paye / reste.
 *      On affiche `reste` en plus de `paye` parce que c'est la seule
 *      colonne qui declenche une action : c'est elle qu'on relance.
 *   4. Dons recus, associes a l'activite.
 *
 * Calculs : `reduce` est utilise deux fois pour les participants
 * (`totalAttendu`, `totalPaye`) et une fois pour les frais. On additionne
 * les montants attendus, et non un prix unique, parce qu'une activite peut
 * avoir plusieurs frais et donc un montant different par personne.
 *
 * Pourquoi les infos de chaque participant sont chargees en un seul
 * `Promise.all` : elles sont necessaires toutes, donc les demander en
 * parallele divise le temps d'attente par le nombre de participants au
 * lieu de les additionner. `membres.map(...)` produit un tableau de
 * Promesses ; `Promise.all` les resout toutes et renvoie les resultats
 * dans le MEME ordre, ce qui permet de retrouver `infos[i]` par simple
 * correspondance d'index avec `membres[i]`.
 *
 * Effets de bord : si l'activite n'existe pas, appelle `toast()` pour
 * signaler l'erreur a l'utilisateur et s'arrete sans ouvrir de fenetre.
 * Sinon, ouvre une fenetre d'impression. Aucune ecriture en base.
 *
 * @param {string} idListe - Identifiant de l'activite (champ `id` de la
 *   table listes).
 * @returns {Promise<void>}
 */
async function rapportActivitePDF(idListe) {
  const l = await db.listes.get(idListe);
  if (!l) {
    toast("Activite introuvable", "error");
    return;
  }
  const [identite, membres, frais, dons] = await Promise.all([
    pdfIdentite(),
    membresDeListe(idListe),
    listeFraisAll(idListe),
    donsList({ idActivite: idListe }),
  ]);
  const infos = await Promise.all(membres.map((m) => infosParticipantActivite(idListe, m.id)));

  const identiteHTML = [];
  if (l.date) identiteHTML.push("Date : " + fmtDate(l.date));
  if (l.heure) identiteHTML.push("Heure : " + l.heure);
  if (l.lieu) identiteHTML.push("Lieu : " + l.lieu);
  if (l.id_responsable) {
    const resp = await db.membres.get(l.id_responsable);
    if (resp) identiteHTML.push("Responsable : " + fullName(resp));
  }

  const participants = membres.map((m, i) => {
    const inf = infos[i];
    return `<tr>
      <td>${esc(m.nom || "")}</td><td>${esc(m.prenom || "")}</td>
      <td>${esc(m.telephone || "—")}</td>
      <td class="num">${esc(fmt(inf.attendu))}</td>
      <td class="num">${esc(fmt(inf.paye))}</td>
      <td class="num">${esc(fmt(inf.reste))}</td>
      <td>${esc(STATUT_PAIEMENT_LABEL[inf.statut] || inf.statut)}</td>
    </tr>`;
  });

  const fraisLignes = frais
    .slice()
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
    .map(
      (f) => `<tr><td>${esc(f.libelle)}</td><td class="num">${esc(fmt(f.montant))}</td></tr>`,
    );
  const totalFrais = frais.reduce((a, f) => a + (f.montant || 0), 0);

  const synth = syntheseDons(dons);
  const donsLignes = dons
    .map(
      (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.donateur || "?")}</td>
        <td>${esc(d.commentaire || "—")}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
    );

  const totalAttendu = infos.reduce((a, i) => a + (i.attendu || 0), 0);
  const totalPaye = infos.reduce((a, i) => a + (i.paye || 0), 0);

  const corps = `
    <h1>Activite — ${esc(l.nom)}</h1>
    <div class="meta">${esc(identiteHTML.join(" · "))} &middot; ${membres.length} participant(s)</div>
    ${l.description ? `<p>${esc(l.description)}</p>` : ""}

    <h2>Frais (${frais.length})</h2>
    ${pdfTableau(["Libelle", "Montant"], fraisLignes, {
      numEnDroite: [1],
      messageVide: "Aucun frais defini",
    })}
    ${pdfLigneTotal("Total des frais", esc(fmt(totalFrais)))}

    <h2>Participation (${membres.length})</h2>
    ${pdfTableau(["Nom", "Prenom", "Telephone", "Attendu", "Paye", "Reste", "Statut"], participants, {
      numEnDroite: [3, 4, 5],
      messageVide: "Aucun participant inscrit",
    })}
    ${pdfLigneTotal("Total encaisse / attendu", esc(fmt(totalPaye)) + " / " + esc(fmt(totalAttendu)))}

    <h2>Dons recus (${dons.length})</h2>
    ${pdfTableau(["Date", "Donateur", "Commentaire", "Montant"], donsLignes, {
      numEnDroite: [3],
      messageVide: "Aucun don enregistre pour cette activite",
    })}
    ${pdfLigneTotal("Total des dons", esc(fmt(synth.total)))}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Activite — ${l.nom}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 3. RAPPORT COTISATION
// ---------------------------------------------------------------------------

/**
 * RAPPORT COTISATION — feuille de collecte d'un dimanche precis.
 *
 * Tables lues :
 *   - joursAvecStats() agrege l'ensemble des dimanches, leurs paiements et
 *     leurs beneficiaires. On passe par cette vue plutot que par une
 *     lecture directe des tables, parce qu'elle applique les memes regles de
 *     calcul que l'ecran : le papier et l'application ne peuvent pas
 *     afficher deux chiffres differents pour le meme dimanche ;
 *   - membres, pour retrouver nom, prenom et telephone de chaque payeur.
 *
 * Sections du document :
 *   1. La feuille de collecte elle-meme : une ligne par membre present,
 *      avec le montant verse, la date, et le statut. C'est l'ordre de
 *      grandeur d'une feuille de presence : on y coche qui a donne.
 *   2. Le recapitulatif chiffre (participants, cotisants, montant
 *      attendu, total encaisse).
 *   3. La liste des membres n'ayant pas paye, produite par une chaine de
 *      `.filter()` puis `.map()`. Elle est volontairement en fin de
 *      document, et separee du tableau principal : c'est une liste de
 *      relances, faite pour etre lue d'un trait pendant la seance, alors
 *      que le tableau est fait pour etre consulte. Si tout etait dans un
 *      seul bloc, ces deux usages se melangeraient.
 *
 * Pourquoi utiliser `jours.find(...)` plutot que `db.dimanches.get(...)` :
 * on cherche ici le dimanche DANS l'ensemble des statistiques. Une simple
 * comparaison d'identifiant, et surtout on reutilise les statistiques deja
 * calculees plutot que de les recalculer.
 *
 * Effets de bord : si le dimanche n'existe pas, appelle `toast()` et
 * s'arrete. Sinon, ouvre une fenetre d'impression.
 *
 * @param {string} idDimanche - Identifiant du dimanche (champ `id` de la
 *   table dimanches).
 * @returns {Promise<void>}
 */
async function rapportCotisationPDF(idDimanche) {
  const jours = await joursAvecStats();
  const j = jours.find((x) => x.dimanche.id === idDimanche);
  if (!j) {
    toast("Dimanche introuvable", "error");
    return;
  }
  const [identite, membres] = await Promise.all([pdfIdentite(), db.membres.toArray()]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));

  const lignes = j.paiements.map((p) => {
    const m = memById[p.id_membre];
    return `<tr>
      <td>${esc(m ? m.nom : "?")}</td><td>${esc(m ? m.prenom : "?")}</td>
      <td>${esc(m ? m.telephone || "—" : "—")}</td>
      <td class="num">${esc(fmt(p.montant_paye))}</td>
      <td>${p.a_paye ? esc(fmtDate(j.dimanche.date)) : "—"}</td>
      <td>${p.a_paye ? "Paye" : "Non paye"}</td>
    </tr>`;
  });

  const nonPayants = j.paiements
    .filter((p) => !p.a_paye)
    .map((p) => memById[p.id_membre])
    .filter(Boolean)
    .map((m) => fullName(m));

  const corps = `
    <h1>Feuille de collecte</h1>
    <div class="meta">Dimanche du ${esc(fmtDate(j.dimanche.date))} &middot; ${
      esc(j.beneficiaires.join(", ") || "Collecte normale")
    }</div>
    ${pdfTableau(["Nom", "Prenom", "Telephone", "Montant paye", "Date", "Statut"], lignes, {
      numEnDroite: [3],
      messageVide: "Aucun participant pour ce dimanche",
    })}

    <h2>Recapitulatif</h2>
    ${pdfResume([
      ["Participants total", esc(j.nbTotal)],
      ["Ont cotise", esc(j.nbPayants)],
      ["N'ont pas cotise", esc(j.nbTotal - j.nbPayants)],
      ["Montant attendu / personne", esc(fmt(j.montantAttendu))],
      ["Total encaisse", esc(fmt(j.totalCollecte))],
    ])}

    <h2>Membres n'ayant pas paye (${nonPayants.length})</h2>
    ${pdfListe(nonPayants, "Tous les membres ont cotise")}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Cotisation du ${fmtDate(j.dimanche.date)}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 4. RAPPORT DONS
// ---------------------------------------------------------------------------

/**
 * RAPPORT DONS — synthese, ventilation et detail des dons.
 *
 * Tables lues : `dons` uniquement, via donsList() et syntheseDons() (toutes
 * deux dans js/db.js, en lecture seule). Le rapport applique ensuite ses
 * propres filtres en memoire, par-dessus ceux de donsList().
 *
 * Les trois filtres, et pourquoi ils s'appliquent dans cet ordre :
 *   - `idActivite` : restreint a une activite. La valeur `""` a un sens
 *     precis — elle ne selectionne PAS « aucune activite » mais les dons
 *     generaux (ceux sans activite rattachee). D'ou le test
 *     `!== undefined` plutot qu'un simple test de verite : `""` est falsy
 *     en JavaScript, un test `if (o.idActivite)` l'aurait ignore, et le
 *     filtre n'aurait jamais ete applique. C'est le piege classique de la
 *     valeur-vide-significative.
 *   - `du` et `au` : bornes de periode, comparees comme des chaines. C'est
 *     possible parce que les dates sont stockees au format ISO
 *     « AAAA-MM-JJ », dont l'ordre alphabétique coincide avec l'ordre
 *     chronologique. Aucune conversion en objet Date n'est necessaire, et
 *     le tri reste correct meme si deux dates sont au meme jour.
 *
 * Sections du document :
 *   1. Synthese : total, nombre de dons, donateurs distincts, don moyen.
 *      Le total est obtenu par syntheseDons() et non additionne ici, pour
 *      qu'il reste recalcule depuis l'historique.
 *   2. Ventilation par activite : le montant total par activite, trie du
 *      plus gros au plus petit. Elle est construite avec une boucle `for`
 *      qui empile les montants dans un objet ; `.reduce()` ferait le meme
 *      travail, mais ici l'objet doit servir ensuite a lister les cles.
 *   3. Detail : une ligne par don.
 *
 * Pourquoi la ventilation est presentee avant le detail : c'est la question
 * posee le plus souvent sur l'ecran « Dons » (« d'ou vient l'argent ? »),
 * alors que le detail sert surtout a verifier. Le document se lit donc du
 * general au particulier.
 *
 * @param {object} [o] - Filtres, tous optionnels.
 * @param {string} [o.idActivite] - Restreint a une activite ; `""` = dons
 *   generaux. Absent = tous les dons.
 * @param {string} [o.du] - Borne basse de periode, au format ISO AAAA-MM-JJ.
 * @param {string} [o.au] - Borne haute de periode, au format ISO AAAA-MM-JJ.
 * @param {string} [o.titre] - Titre force. Sinon, deduit du contexte
 *   (« Rapport des dons », ou « Rapport des dons generals » pour `""`).
 * @returns {Promise<void>}
 */
async function rapportDonsPDF(o = {}) {
  const [identite, tous] = await Promise.all([pdfIdentite(), donsList()]);

  let lignes = tous;
  if (o.idActivite !== undefined) {
    lignes = lignes.filter((d) => (d.id_activite || "") === o.idActivite);
  }
  if (o.du) lignes = lignes.filter((d) => (d.date || "") >= o.du);
  if (o.au) lignes = lignes.filter((d) => (d.date || "") <= o.au);

  const synth = syntheseDons(lignes);

  const detail = lignes
    .map(
      (d) => `<tr>
        <td>${esc(fmtDate(d.date))}</td>
        <td>${esc(d.donateur || "?")}</td>
        <td>${esc(d.activite || "Don general")}</td>
        <td>${esc(d.commentaire || "—")}</td>
        <td class="num">${esc(fmt(d.montant))}</td>
      </tr>`,
    );

  // Ventilation par activite : c'est la question qu'on pose le plus
  // souvent sur un écran « Dons ». On empile les montants dans un objet
  // dont les cles sont les noms d'activite ; `Object.entries` en extrait
  // ensuite les couples [nom, total] pour le tri et l'affichage.
  const parActivite = {};
  for (const d of lignes) {
    const cle = d.activite || "Don general";
    parActivite[cle] = (parActivite[cle] || 0) + (d.montant || 0);
  }
  const ventilation = Object.entries(parActivite)
    .sort((a, b) => b[1] - a[1])
    .map(([nom, total]) => `<tr><td>${esc(nom)}</td><td class="num">${esc(fmt(total))}</td></tr>`);

  let titre = o.titre || "Rapport des dons";
  if (o.idActivite === "" && !o.titre) titre = "Rapport des dons generals";

  const corps = `
    <h1>${esc(titre)}</h1>
    <div class="meta">Genere le ${esc(fmtDate(todayISO()))} &middot; ${
      lignes.length
    } don(s) &middot; ${synth.nbDonateurs} donateur(s)</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Montant total recu", esc(fmt(synth.total))],
      ["Nombre de dons", esc(synth.nbDons)],
      ["Donateurs distincts", esc(synth.nbDonateurs)],
      ["Don moyen par donateur", esc(fmt(synth.moyenne))],
    ])}
    ${pdfLigneTotal("Total recu", esc(fmt(synth.total)))}

    <h2>Ventilation par activite</h2>
    ${pdfTableau(["Activite", "Montant"], ventilation, {
      numEnDroite: [1],
      messageVide: "Aucun don a ventiler",
    })}

    <h2>Detail des dons</h2>
    ${pdfTableau(["Date", "Donateur", "Activite", "Commentaire", "Montant"], detail, {
      numEnDroite: [4],
      messageVide: "Aucun don enregistre sur cette periode",
    })}
  `;

  pdfOuvrirEtImprimer(identite.organisation, titre, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 5. RAPPORT FINANCIER
// ---------------------------------------------------------------------------

/**
 * RAPPORT FINANCIER — consolidation destinee a l'assemblee.
 *
 * C'est le seul rapport sans parametre : il porte sur l'ensemble de la
 * session, et son destinataire est le groupe reuni, pas une personne.
 *
 * Tables lues : `membres`, `paiements`/`dimanches` (via rapportStats()),
 * `caisse_mouvements`, `remboursements`/`paiements` (via dettesList()),
 * `prets_membres` (via pretsMembres()) et `dons`. Les six lectures sont
 * lancees ensemble dans un `Promise.all` : elles sont independantes, donc
 * le rapport attend le plus lent et non la somme.
 *
 * Sections du document, dans cet ordre :
 *   1. Synthese : collecte, dons, solde en caisse, dettes, prets, taux de
 *      participation. Les chiffres cles d'abord.
 *   2. Dettes impayees, avec le telephone : c'est le document que le
 *      tresorerieier emporte pour relancer, donc le contact y figure.
 *   3. Dettes soldees. Elles sont listees separement, et non masquees
 *      derriere un total « 0 impayee » : montrer que les dettes se soldent
 *      est une information en soi. La colonne « Rembourse par » indique QUI
 *      a solde, afin que le papier reste aussi informatif que l'ecran.
 *   4. Prets entre membres en attente, avec debiteur et preteur.
 *   5. Mouvements de caisse, tries du plus recent au plus ancien.
 *
 * Calculs : les totaux de dettes et de prets sont obtenus par `reduce`
 * sur les seules lignes concernees (dettes impayees, prets en attente), et
 * jamais sur la liste complete : additionner toutes les dettes inclut les
 * montants deja rembourses et surestimait la dette reelle.
 *
 * Deux outils utiles dans ce rapport : `Object.fromEntries(...)` construit
 * un index identifiant -> membre, pour que `nomOf(id)` soit une lecture
 * directe au lieu d'un parcours de tableau a chaque ligne. Et
 * `.sort((a, b) => String(...).localeCompare(...))` sur les dates, traitees
 * comme des chaines : meme justification que dans rapportDonsPDF, l'ordre
 * lexicographique du format ISO est l'ordre chronologique.
 *
 * Effets de bord : ouvre une fenetre d'impression. Aucune ecriture en base.
 *
 * @returns {Promise<void>}
 */
async function rapportFinancierPDF() {
  const [identite, r, dettes, prets, dons, membres] = await Promise.all([
    pdfIdentite(),
    rapportStats(),
    dettesList(),
    pretsMembres({ nonRembourseSeulement: true }),
    donsList(),
    db.membres.toArray(),
  ]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) => (memById[id] ? fullName(memById[id]) : "?");

  const dettesImpayees = dettes.filter((d) => d.statut === "Impayee");
  const pretsEnAttente = prets;
  const synthDons = syntheseDons(dons);

  const totalDettes = dettesImpayees.reduce((a, d) => a + d.montant, 0);
  const totalPrets = pretsEnAttente.reduce((a, p) => a + (p.montant || 0), 0);

  const pretsLignes = pretsEnAttente.map(
    (p) => `<tr>
      <td>${esc(nomOf(p.id_debiteur))}</td>
      <td>${esc(nomOf(p.id_preteur))}</td>
      <td class="num">${esc(fmt(p.montant))}</td>
      <td>${esc(fmtDate(p.date))}</td>
    </tr>`,
  );

  // Mouvements de caisse : le detail le plus long, il merite sa propre page.
  const mouvements = (await db.caisse_mouvements.toArray())
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(
      (m) => `<tr>
        <td>${esc(fmtDate(m.date))}</td>
        <td>${m.type === "Entree" ? "Entree" : "Sortie"}</td>
        <td>${esc(m.libelle || "—")}</td>
        <td>${esc(m.categorie || "—")}</td>
        <td class="num">${esc(fmt(m.montant))}</td>
      </tr>`,
    );

  // Dettes : on affiche aussi qui a rembourse, pour que le document imprime
  // reste aussi informatif que l'ecran.
  const dettesLignes = dettes
    .filter((d) => d.statut === "Remboursee")
    .map(
      (d) => `<tr>
        <td>${esc(fmtDate(d.date))}</td>
        <td>${esc(d.membre)}</td>
        <td>${d.remb_date ? esc(fmtDate(d.remb_date)) : "—"}</td>
        <td>${esc(d.remb_par || "—")}</td>
        <td class="num">${esc(fmt(d.remb_montant != null ? d.remb_montant : d.montant))}</td>
      </tr>`,
    );

  const corps = `
    <h1>Rapport financier</h1>
    <div class="meta">Genere le ${esc(fmtDate(r.genereLe))}</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Total collecte", esc(fmt(r.totalCollecte))],
      ["Total des dons recus", esc(fmt(synthDons.total))],
      ["Solde en caisse", esc(fmt(r.solde))],
      ["Dettes impayees", esc(fmt(totalDettes))],
      ["Prets entre membres en attente", esc(fmt(totalPrets))],
      ["Taux de participation moyen", esc(Math.round(r.tauxParticipationGlobal * 100) + "%")],
    ])}

    <h2>Dettes impayees (${dettesImpayees.length})</h2>
    ${pdfTableau(
      ["Date", "Membre", "Telephone", "Montant"],
      dettesImpayees.map(
        (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.membre)}</td>
          <td>${esc(d.telephone || "—")}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
      ),
      { numEnDroite: [3], messageVide: "Aucune dette en cours" },
    )}
    ${pdfLigneTotal("Total des dettes", esc(fmt(totalDettes)))}

    <h2>Dettes soldees (${dettes.length - dettesImpayees.length})</h2>
    ${pdfTableau(["Date", "Membre", "Rembourse le", "Rembourse par", "Montant"], dettesLignes, {
      numEnDroite: [4],
      messageVide: "Aucun remboursement enregistre",
    })}

    <h2>Prets entre membres en attente (${pretsEnAttente.length})</h2>
    ${pdfTableau(["Debiteur", "Preteur", "Montant", "Date"], pretsLignes, {
      numEnDroite: [2],
      messageVide: "Aucun pret en attente",
    })}
    ${pdfLigneTotal("Total des prets", esc(fmt(totalPrets)))}

    <h2>Mouvements de caisse (${mouvements.length})</h2>
    ${pdfTableau(["Date", "Type", "Libelle", "Categorie", "Montant"], mouvements, {
      numEnDroite: [4],
      messageVide: "Aucun mouvement de caisse",
    })}
  `;

  pdfOuvrirEtImprimer(identite.organisation, "Rapport financier", corps, identite.session);
}
