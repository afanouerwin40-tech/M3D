/* ==========================================================================
 * db.js — COUCHE DONNEES DE L'APPLICATION
 * ==========================================================================
 *
 * POURQUI CE FICHIER EST SPECIAL
 * ------------------------------
 * db.js est le SEUL fichier du projet autorisé à parler directement à la base
 * de données. Aucun autre fichier n'appelle `db.*` directement : les modules
 * (finances.js, activites.js, dons.js...) appellent les fonctions de db.js,
 * qui leur renvoie des données déjà assemblées. Cette règle de séparation
 * s'appelle le "principe de responsabilité unique" : un fichier, une
 * responsabilité. Si on trifouillait IndexedDB depuis dix fichiers, il
 * faudrait comprendre dix fois comment les données s'articulent, et le
 * coquillage d'un bug deviendrait impossible à trouver.
 *
 *
 * 1) POURQUOI IndexedDB ET PAS localStorage
 * ----------------------------------------
 * On pourrait stocker les données avec `localStorage.setItem("cle", "valeur")`.
 * C'est plus simple. Mais localStorage est inadapté ici :
 *
 *   - Capacité : localStorage est plafonné à environ 5 Mo. Or ce projet
 *     stocke des photos de membres en base64 : quelques centaines de photos
 *     et la limite est atteinte. IndexedDB accepte plusieurs gigaoctets.
 *   - Nature de la donnée : localStorage ne contient que du texte. Stocker
 *     un objet necessitates un aller-retour `JSON.parse(localStorage.getItem())`
 *     a chaque lecture. IndexedDB stocke des objets JavaScript reels, avec
 *     leurs types (nombres, dates, booleens) preserves.
 *   - Requetes : localStorage n'a aucun index. Pour trouver "tous les membres
 *     actifs", il faut TOUT lire puis filtrer en JavaScript. IndexedDB
 *     possede des index : une requete parcourt directement les enregistrements
 *     concernes, sans lire le reste. Sur une base de 500 membres et 4 000
 *     paiements, la difference est de l'ordre de la milliseconde contre
 *     plusieurs dizaines.
 *   - Transactions : IndexedDB garantit qu'un groupe d'ecritures est soit
 *     entierement reussi, soit entierement annule (on parle de propriete
 *     ACID). Si l'application se ferme au milieu d'une operation, la base ne
 *     se retrouve pas dans un etat a moitie ecrit. localStorage n'offre rien
 *     de comparable.
 *
 *
 * 2) POURQUOI Dexie.js
 * --------------------
 * IndexedDB est une API native du navigateur, tres puissante mais tres
 * bavarde : tout se fait par evenements (onSuccess, onerror, onupgradeneeded),
 * chaque objet doit etre transforme manuellement, les transactions s'ecrivent
 * avec des callbacks imbriques. Dexie est une fine surcouche qui rend la meme
 * base accessible comme si on manipulait des tableaux :
 *
 *   - await db.membres.toArray()   -> tous les enregistrements, en une ligne
 *   - await db.membres.get(id)     -> un enregistrement par sa cle
 *   - await db.membres.add(objet)  -> ajout
 *   - await db.membres.update(id, patch) -> modification partielle
 *   - await db.membres.delete(id)  -> suppression
 *
 * Dexie gere aussi la partie la plus piegeuse d'IndexedDB : les migrations
 * (voir la section 3 plus bas). Et elle ajoute des possibilites qu'IndexedDB
 * n'a pas, comme le "where().equals().toArray()".
 *
 * CHOIX DE LIBRAIRIE : Dexie pese environ 20 Ko minifies, tient en UNE
 * dependance CDN, sans build ni npm. Le projet est"No-Build, Zero Backend" :
 * on ne peut pas se permettre d'imposer un `npm install` a l'utilisateur.
 *
 *
 * 3) EVENT SOURCING — LE PRINCIPE FONDATEUR DE CE FICHIER
 * -------------------------------------------------------
 * "Event sourcing" signifie, litteralement, "les evenements sont la source".
 * Concretement, dans cette application :
 *
 *   - on ne stocke JAMAIS un total, ni un solde, ni un compteur ;
 *   - on ne stocke que les FAITS ("ce membre a paye 500 F tel jour") ;
 *   - tous les chiffres affiches a l'ecran sont RECALCULES a partir de ces
 *     faits, a chaque affichage.
 *
 * Concretement, dans la table `paiements` on lit `montant_attendu` et
 * `montant_paye`, mais on ne trouve nulle part un champ `total_du` ni
 * `nb_cotisants`. Le total est obtenu par une simple addition :
 * `paiements.reduce((a, p) => a + p.montant_paye, 0)`.
 *
 * Pourquoi ce choix, alors qu'un total stocke serait plus rapide ? Parce
 * qu'un total stocke peut desynchronise. Trois scenarios rendent le stockage
 * d'un total dangereux :
 *   a) un bug dans le code qui met a jour le total au meme endroit que
 *      l'ecriture -> les deux divergent silencieusement ;
 *   b) une annee de modification tarifaire (500 F -> 1000 F) : il faut
 *      recalculer retroactivement des centaines de lignes a la main ;
 *   c) une migration de schema qui change la signification d'un champ.
 *
 * Avec l'event sourcing, ces trois cas se reglent seuls : changer la regle de
 * calcul suffit. Le cout ? On relit l'historique a chaque affichage. Sur le
 * volume de ce projet (quelques milliers de lignes), ce cout est invisible ;
 * sur une base de cinquante millions de lignes, il ne le serait pas. Le
 * compromis est donc assume, et il est le bon ici.
 *
 * Corollaire : des qu'une information peut etre DERIVEE, elle ne doit pas
 * etre stockee. C'est la regle suivie par `dettesList()` (les dettes sont
 * recalculees depuis les paiements impayes), par `caisseDetail()` (le solde
 * est recalcule depuis les mouvements et les paiements) et par `syntheseDons()`.
 *
 *
 * 4) OUVERTURE EXPLICITE DE LA BASE
 * ---------------------------------
 * IndexedDB ouvre la base "en tache de fond" : `db.membres.get(...)` marche
 * sans qu'on ait rien demande, et IndexedDB demarre la connexion tout seul.
 * Cette commodite est une faute ici. Avec elle :
 *   - l'application demarre quand meme, et une erreur de schema (version de
 *     base obsolete, table manquante) ne remonte que trois secondes plus tard,
 *     depuis un `await` enfoui dans un module, sans indication de sa source ;
 *   - une base bloquee par un autre onglet laisse `db.open()` en attente
 *     INDEFINIE : ni resolue, ni rejetee. Sans garde-fou, l'utilisateur reste
 *     devant un ecran vide, sans le moindre message.
 *
 * D'ou `ouvrirBase()`, appele en tete de `start()` dans app.js, AVANT
 * `seedIfEmpty()` et avant tout affichage. Elle explicite les deux echecs
 * (blocage et lenteur) et verifie la version du schema. Elle est documentee
 * plus bas, apres les migrations.
 *
 *
 * 5) CE QUE CONTIENT CE FICHIER, DANS L'ORDRE
 * -------------------------------------------
 *   1. en-tete + polyfill de compatibilite Safari ;
 *   2. creation de l'objet Dexie et schema version 1 ;
 *   3. migrations versions 2 a 9 (evolution du schema au fil du temps) ;
 *   4. `ouvrirBase()` — ouverture explicite et controlee ;
 *   5. utilitaires (groupBy, log, parametres) ;
 *   6. amorcage et reinitialisations globales ;
 *   7. requetes derivees : membres, dettes, dons, caisse, calendrier ;
 *   8. anniversaires, dimanches de collecte, prets, regularite ;
 *   9. authentification locale (SHA-256 + sel) ;
 *  10. module Activites : listes, frais, paiements echelonnes ;
 *  11. rapports (general et individuel).
 *
 * Chaque fonction de ce fichier est declaree en `function` (et non
 * `const f = () => {}`) afin d'etre APPELABLE DEPUIS N'IMPORTE QUELLE PORTEE
 * et de figurer dans window. C'est ce qui permet a un autre fichier charge
 * plus tard dans index.html de l'appeler directement par son nom. Le script
 * de controle `tools/verify-globals.js` verifie que ces identifiants sont
 * bien accessibles.
 */

// -----------------------------------------------------------------------------
// PRINCIPE METIER CENTRAL
// -----------------------------------------------------------------------------
// `paiements` est la SEULE source de verite pour l'argent lie aux collectes.
// Les dettes et le volet "collecte" de la caisse ne sont JAMAIS stockes :
// ils sont toujours recalcules a la volee depuis `paiements`. Consequence
// importante : "marquer un paiement paye" ne fait qu'ecrire UNE ligne, et
// toutes les sommes affichees ailleurs se mettent a jour seules.

// Polyfill Object.fromEntries : cette methode n'existe PAS sur Safari 12.0
// (elle n'a ete ajoutee qu'en Safari 12.1). Comme certains vieux iPad
// restent bloques en 12.0/12.1 selon le modele, on la definit nous-memes
// si absente, plutot que de faire confiance a la version exacte du WebKit
// de l'appareil. Utilisee 8 fois dans app.js/db.js -- sans ce polyfill,
// chaque appel plante avec "Object.fromEntries is not a function".
//
// QU'EST-CE QU'UN POLYFILL ? C'est une reimplementation locale d'une
// fonction qui manque au navigateur, qu'on n'installe que si le navigateur ne
// la possede pas deja. Le test `typeof X !== "function"` verifie sa presence :
// sur un navigateur recent, la condition est fausse et le bloc est ignore.
//
// NOTE IMPORTANTE : le polyfill doit etre place AVANT tout usage de la
// fonction, et le nom de la propriete ne doit contenir ni point, ni
// crochets, sinon l'assignement echoue silencieusement.
if (typeof Object.fromEntries !== "function") {
  Object.fromEntries = function (entries) {
    var obj = {};
    var iter = entries;
    // entries peut etre un Map (via .map()) ou un tableau de paires
    if (typeof iter.forEach === "function") {
      iter.forEach(function (pair) {
        obj[pair[0]] = pair[1];
      });
    } else {
      for (var i = 0; i < iter.length; i++) {
        obj[iter[i][0]] = iter[i][1];
      }
    }
    return obj;
  };
}

/**
 * Instance unique de la base, partagee par toute l'application.
 *
 * `new Dexie("m3d_db")` cree l'objet gestionnaire, mais n'OUVRE PAS la base : la
 * connexion est etablie par `ouvrirBase()` (voir plus bas). Le nom "m3d_db"
 * est definitif : le changer ferait perdre les donnees de tous les
 * utilisateurs deja installes.
 *
 * A quoi sert l'objet `db` ? C'est le point d'acces unique aux tables. Chaque
 * table declaree dans le schema devient une propriete de `db` :
 * `db.membres`, `db.paiements`, `db.dons`... Chacune expose les cinq
 * operations de base : `add`, `get`, `put`, `update`, `delete`, `toArray`,
 * `where`, `count`, `clear`.
 */
const db = new Dexie("m3d_db");

/* ==========================================================================
 * SCHEMA DE LA BASE — POURQUOI CE LONG BLOC DE TEXTE
 * ==========================================================================
 *
 * `db.version(1).stores({...})` DECRIT la forme de la base. Chaque ligne est
 * une table, chaque valeur une chaine de caracteres decrivant ses index.
 *
 * ANATOMIE D'UNE LIGNE DE SCHEMA
 *   membres: "id, nom, prenom, statut, mois_anniversaire",
 *            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *            liste de champs, tous indexes, separes par des virgules
 *
 * REGLE ABSOLUE DE DEXIE : le PREMIER champ de la liste est la CLE PRIMAIRE
 * (l'identifiant unique, `"id"` dans cette application). Tous les autres
 * champs sont des INDEX. Un index permet de faire :
 *   db.membres.where("statut").equals("Actif").toArray()
 * ...sans quoi Dexie leve une SchemaError.
 *
 * MAIS ATTENTION : un index a un cout. IndexedDB construit un arbre de
 * tri par index, donc plus on indexe, plus l'ecriture est lente et plus la
 * base occupe de disque. On n'indexe donc QUE les champs reellement
 * interroges par `.where()`. C'est pourquoi certaines tables
 * ci-dessous n'indexent que `id` : leurs autres champs (libelle, montant,
 * commentaire...) sont lus apres coup, en memoire, une fois la table chargee.
 *
 * FORMATAGE : `"id, nom, prenom"` = indexes simples.
 *            `"++seq, date"` = auto-increment ; `++` devant le nom du champ
 *                            indique a IndexedDB de generer lui-meme la
 *                            valeur (1, 2, 3...) et de l'incrementer. Utilise
 *                            pour le journal d'activite, ou l'ordre de
 *                            creation est une information en soi.
 *
 * REGLE DE NOMMAGE DES TABLES : le pluriel systematise, ce qui permet
 * d'ecrire `db.<table>.where(...)` sans se tromper de singulier. Les
 * relations portent le prefixe `id_` : `id_membre` designe le membre
 * concerne, `id_dimanche` le dimanche de collecte, `id_liste` l'activite.
 * Ce prefixe est la seule trace du lien : il n'y a PAS de cle etrangere
 * declaree comme en SQL.
 */

/**
 * VERSION 1 — LE SOCLE COMMUN.
 *
 * Cette version cree les tables qui n'ont pas evolue depuis le tout debut :
 * annuaire des membres, sessions annuelles, dimanches de collecte,
 * anniversaires du jour, paiements, remboursements, mouvements de caisse,
 * parametres et journal d'activite.
 *
 * AUCUNE MIGRATION ICI : `db.version(1)` n'a pas de `.upgrade()`. C'est
 * normal : la base etant vide au premier lancement, il n'y a rien a
 * convertir. Le schema est purement declaratif.
 */
db.version(1).stores({
  // --- L'ANNUAIRE ---------------------------------------------------------
  // Un enregistrement par personne. `id` est de la forme "M-00001"
  // (format court et lisible, choisi a la main : les identifiants
  // incrementaux de Dexie n'auraient pas de sens pour des humains).
  // Champs non indexes mais presents dans l'objet : prenom, telephone,
  // fonction, photo, jour_anniversaire, cotisation_personnalisee.
  //   - photo : une data URL base64 (image compressee en JPEG par
  //     compressImage() dans utils.js). C'est ce qui justifie IndexedDB :
  //     quelques centaines de photos en base64 depassent vite la limite de
  //     localStorage.
  //   - mois_anniversaire / jour_anniversaire : deux entiers separees
  //     plutot qu'une date complete, car un anniversaire se recite chaque
  //     annee (le jour ET le mois suffisent, l'annee n'a pas de sens).
  //   - statut : "Actif" ou "Inactif". Un membre inactif est absent des
  //     prochains dimanches de collecte.
  // Index nom / prenom : recherche et tri alphabétique. Index statut :
  // ecran "Membres actifs". Index mois_anniversaire : calendrier et
  // echeance d'anniversaires.
  membres: "id, nom, prenom, statut, mois_anniversaire",

  // --- LES SESSIONS ANNUELLES ---------------------------------------------
  // Une "session" est une annee associative (2026-2027, 2027-2028...).
  // Les dimanches de collecte y sont rattaches, ce qui permet de consulter
  // une annee passee sans melanger les exercices. La session courante est
  // designee par le parametre "session_active" (voir getParam plus bas).
  sessions: "id, nom",

  // --- LES DIMANCHES DE COLLECTE ------------------------------------------
  // Un enregistrement par dimanche de cotation. C'est l'ENTETE de la
  // feuille de collecte : c'est elle qui dit quels membres etaient
  // attendus, pour quel montant, et a qui le cadeau etait destine.
  //   - id_session : rattache le dimanche a une annee.
  //   - date : format ISO "AAAA-MM-JJ". Le format ISO est choisi
  //     deliberement : il se trie lexicographiquement (les chaines se
  //     comparent dans le meme ordre que les dates reelles), ce qui permet
  //     de trier par `.sort((a,b) => a.date.localeCompare(b.date))` sans
  //     convertir en objet Date.
  //   - statut : "En cours", "Termine"...
  dimanches: "id, id_session, date, statut",

  // --- LES ANNIVERSAIRES DU JOUR ------------------------------------------
  // Table de jonction : pour un dimanche donne, quels membres sont fetes et
  // quel cadeau a ete verse. Sans elle, impossible de savoir a qui un
  // montant de 12 000 F a ete destine. Le champ montant_cadeau est stocke
  // ici parce qu'il est un FAIT (12 000 F ont ete promis CE dimanche-la),
  // pas un total a recalculer.
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",

  // --- LES PAIEMENTS : LE COEUR DU SYSTEME -------------------------------
  // Une ligne par membre et par dimanche. Contient le montant ATTENDU et le
  // montant PAYE. C'est la seule source de verite de l'argent des collectes :
  // la caisse, les dettes, les relances, les statistiques, les rapports PDF
  // en derivent tous.
  //   - montant_attendu : ce que le membre doit (500 F, ou sa cotisation
  //     personnalisee, fois le nombre de beneficiaires du dimanche).
  //   - a_paye : booleen. True = la somme a ete versee.
  //   - montant_paye : 0 ou montant_attendu. On ne suit volontairement pas
  //     les paiements partiels sur les cotisations (contrairement au module
  //     Activites, ou l'historique detaille est enregistre).
  // Index id_membre et id_dimanche : les deux seules questions que l'on pose
  // sans cesse ("qu'a paye ce membre ?", "qui doit ce dimanche ?").
  paiements: "id, id_dimanche, id_membre",

  // --- LES REMBOURSEMENTS -------------------------------------------------
  // Trace qui a floral un membre absent, et pour quel montant. Relie un
  // membre (id_membre_rembourseur) a un paiement concerne
  // (id_paiement_concerne). Ce n'est PAS une dette du groupe : c'est un
  // arrangement personnel entre deux personnes.
  // Le nom du remboursant est une COPIE figee au moment du
  // remboursement : si la personne est ensuite renommee ou supprimee,
  // l'historique affiche ce qu'elle portait a l'epoque plutot que de
  // perdre l'information.
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",

  // --- LES MOUVEMENTS DE CAISSE -------------------------------------------
  // Les entrees et sorties SAISIES A LA MAIN (un don en especie, un achat,
  // un transport...). Les mouvements qui NE sont pas saisis (une cotisation
  // encaissee) ne sont pas ici : ils sont deduits de `paiements`. Deux
  // sources, un seul solde.
  //   - type : "Entree" ou "Sortie".
  //   - categorie : ajoutee en v8 (voir plus bas).
  //   - justificatif : photo du ticket, facultative.
  caisse_mouvements: "id, date, type",

  // --- LES PARAMETRES -----------------------------------------------------
  // Table cle/valeur, ou chaque enregistrement est un reglage de
  // l'application : `cle: "montant_cotisation_defaut"`, `cle: "admin_hash"`,
  // `cle: "session_active"`, `cle: "organisation_nom"`...
  // On ne peut pas mettre des attributs variables sur un objet JavaScript :
  // pour stocker une liste de reglages de nature variable, une table
  // cle/valeur est la structure naturelle.
  parametres: "cle",

  // --- LE JOURNAL D'ACTIVITE ---------------------------------------------
  // Trace horodatee de chaque action : qui (la seule session admin),
  // quand, quoi, sur quelle entite. Sert a la transparence et a la
  // reconstruction apres un incident. `++seq` auto-incremente, ce qui
  // garantit un ordre d'insertion stable meme si deux evenements tombent
  // dans la meme milliseconde.
  activity_log: "++seq, date, entite, action",
});

/* ==========================================================================
 * MIGRATIONS — LE COEUR TECHNIQUE DE CE FICHIER
 * ==========================================================================
 *
 * QU'EST-CE QU'UNE MIGRATION ?
 * Quand le code ajoute une table ou un index, la base deja installee sur les
 * telephones des utilisateurs ne peut pas etre modifiee a distance : elle vit
 * dans leur navigateur. Une migration est le script qui transforme une base
 * ancienne pour qu'elle corresponde au nouveau code. IndexedDB les declenche
 * automatiquement a la premiere ouverture, en passant d'une version a la
 * suivante.
 *
 * POURQUOI ON NE SUPPRIME JAMAIS UNE MIGRATION
 * ---------------------------------------------
 * Parce qu'un utilisateur peut mettre a jour l'application depuis N'IMPORTE
 * QUELLE version. Un telephone bloque en v3 et mis a jour en v9 doit
 * executer, dans l'ordre, les migrations 4, 5, 6, 7, 8 ET 9. Si l'on
 * supprimait la migration 5, ce telephone passerait de v4 a v6 sans elle, et
 * la base resterait dans un etat incoherent. De plus, comme il n'y a pas de
 * serveur, PERSONNE ne peut rejouer une migration effacee par erreur.
 *
 * LES TROIS REGLES DE MIGRATION (CLAUDE.md, section 9)
 * -----------------------------------------------------
 *   1. TOUJOUR ADDITIVES : on ajoute, on ne supprime ni table ni champ.
 *   2. IDEMPOTENTES : la migration verifie avant d'agir qu'elle n'a pas
 *      deja ete executee (une interruption a mi-chemin ne doit pas
 *      corrompre la base au second essai).
 *   3. SANS PERTE DE DONNEES : on convertit, jamais on n'efface.
 *
 * Pour rediger une migration, la formule est toujours la meme :
 *   db.version(N).stores({ ...schema complet... })
 *                    .upgrade(async (tx) => { ... })
 * Deux points techniques souvent oublies :
 *   - `.stores()` doit redeclarer le schema EN ENTIER, pas seulement les
 *     tables nouvelles : IndexedDB remplace la definition, il ne la fusionne
 *     pas. Oublier une table ici revient a la supprimer.
 *   - `tx` est l'objet "transaction". A l'interieur d'un `upgrade()`, on
 *     utilise `tx.table` et non `db.table` : IndexedDB impose de passer par
 *     la transaction courante, sinon celle-ci se ferme prematurely et les
 *     ecritures suivantes echouent.
 */

/**
 * VERSION 2 — COTISATION PERSONNALISEE.
 *
 * Pourquoi elle existe : le President, ATTIDZONOU Eric (M009), cotise
 * 1000 F au lieu des 500 F par defaut. C'est une EXCEPTION, pas une
 * nouvelle regle generale.
 *
 * Pourquoi le schema est reecrit a l'identique : c'est obligatoire (voir la
 * regle sur `.stores()` ci-dessus). Il ne change ici que les DONNEES, pas la
 * structure.
 *
 * La migration est idempotente : si `cotisation_personnalisee` est deja
 * posee, la fonction `return` immediatement. Cela rend un second passage sans
 * risque.
 *
 * Point delicat : la migration corrige aussi les paiements DEJA enregistres
 * de ce membre. On pourrait s'en passer (les nouveaux dimanches
 * calculeraient deja le bon montant), mais sans cela sa feuille de collecte
 * historique afficherait des montants faux, et la somme de son annee
 * serait erronee. Corriger l'historique vaut mieux que de le laisser
 * incoherent : on prefere un calcul un peu plus long a un ecart de chiffres
 * affiche a l'utilisateur.
 */
// Version 2 : correction — ATTIDZONOU Eric (M009, President) cotise 1000 F
// au lieu du montant par defaut de 500 F. On ajoute le champ
// cotisation_personnalisee sur le membre et on met a jour retroactivement
// ses paiements deja enregistres pour refleter le bon montant.
db.version(2)
  .stores({
    membres: "id, nom, prenom, statut, mois_anniversaire",
    sessions: "id, nom",
    dimanches: "id, id_session, date, statut",
    anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
    paiements: "id, id_dimanche, id_membre",
    remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
    caisse_mouvements: "id, date, type",
    parametres: "cle",
    activity_log: "++seq, date, entite, action",
  })
  .upgrade(async (tx) => {
    const eric = await tx.membres.get("M009");
    if (eric && eric.cotisation_personnalisee) return; // deja migre
    if (eric) {
      await tx.membres.update("M009", {
        cotisation_personnalisee: 1000,
        fonction: "President",
      });
      const paiements = await tx.paiements
        .where("id_membre")
        .equals("M009")
        .toArray();
      for (const p of paiements) {
        const nbAnniv = await tx.anniversaires_du_jour
          .where("id_dimanche")
          .equals(p.id_dimanche)
          .count();
        const nb = Math.max(1, nbAnniv);
        const nouveauMontant = 1000 * nb;
        await tx.paiements.update(p.id, {
          montant_attendu: nouveauMontant,
          montant_paye: p.a_paye ? nouveauMontant : 0,
        });
      }
    }
  });

// Version 3 : ajout du module independant "Mes listes" (listes personnalisees
// non liees aux cotisations d'anniversaire : sorties, reunions, camps...).
// Aucune table existante n'est modifiee : upgrade additif, sans risque pour
// les donnees deja presentes.
//
// POURQUOI DEUX TABLES ET NON UNE ? Une table "listes" decrirait les
// activites, une table "liste_membres" les inscriptions. Les mettre dans une
// seule table obligerait a dupliquer le nom, la date et la description de
// l'activite sur chaque ligne d'inscription. La separation evite cette
// duplication et permet de modifier une activite sans toucher a ses
// participants. C'est la forme "un pour plusieurs".
db.version(3).stores({
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
  caisse_mouvements: "id, date, type",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
  listes: "id, nom, date, archivee",
  liste_membres: "id, id_liste, id_membre",
});
// Version 4 : ajout du suivi des "prets entre membres" (quand un membre
// absent se fait avancer sa cotisation par un autre membre present). C'est
// un pret PERSONNEL entre deux personnes, distinct des dettes du groupe :
// cote groupe, la cotisation est consideree payee (a_paye=true) des que le
// pret est enregistre. Aucune table existante n'est modifiee.
db.version(4).stores({
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
  caisse_mouvements: "id, date, type",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
  listes: "id, nom, date, archivee",
  liste_membres: "id, id_liste, id_membre",
  prets_membres: "id, id_dimanche, id_debiteur, id_preteur, rembourse",
});
// Version 5 : correction de bug — le champ "id_paiement" de prets_membres
// etait utilise partout dans le code (db.prets_membres.where("id_paiement")
// ...) mais n'a JAMAIS ete declare comme index dans le schema. Dexie leve
// une SchemaError des qu'on fait .where() sur un champ non indexe : chaque
// fois qu'un membre repassait "Non paye" un paiement couvert par un pret,
// l'app plantait silencieusement et le pret orphelin restait en base.
// Cette version ajoute l'index manquant ; aucune donnee n'est perdue
// (upgrade purement additif au niveau du schema).
db.version(5).stores({
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
  caisse_mouvements: "id, date, type",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
  listes: "id, nom, date, archivee",
  liste_membres: "id, id_liste, id_membre",
  prets_membres:
    "id, id_dimanche, id_debiteur, id_preteur, id_paiement, rembourse",
});

// Version 6 : les listes personnalisees deviennent des "activites" a part
// entiere -- une activite peut desormais avoir PLUSIEURS postes financiers
// (frais), chaque membre peut n'en choisir qu'une partie, et chaque
// paiement recu est trace individuellement (montant, date, commentaire)
// au lieu d'un simple booleen "paye". Meme principe que le module
// cotisations : rien n'est jamais ecrase, le montant paye se recalcule
// toujours a partir de l'historique (liste_paiements est la seule source
// de verite pour l'argent d'une activite, comme paiements l'est pour les
// cotisations).
//
// Schema additif uniquement : aucune table existante n'est supprimee ni
// renommee, donc aucun risque pour les listes deja creees. "listes" et
// "liste_membres" recoivent de nouveaux champs (date_limite, cloturee,
// frais_choisis) qui n'ont pas besoin d'etre declares ici -- Dexie
// n'exige une declaration que pour les champs interroges via .where().
db.version(6)
  .stores({
    membres: "id, nom, prenom, statut, mois_anniversaire",
    sessions: "id, nom",
    dimanches: "id, id_session, date, statut",
    anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
    paiements: "id, id_dimanche, id_membre",
    remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
    caisse_mouvements: "id, date, type",
    parametres: "cle",
    activity_log: "++seq, date, entite, action",
    listes: "id, nom, date, archivee",
    liste_membres: "id, id_liste, id_membre",
    prets_membres:
      "id, id_dimanche, id_debiteur, id_preteur, id_paiement, rembourse",
    liste_frais: "id, id_liste",
    liste_paiements: "id, id_liste, id_membre",
  })
  .upgrade(async (tx) => {
    // migrateListesData() : convertit l'ancien modele (un seul
    // "montant_demande" sur la liste + un booleen "paye" par membre) vers
    // le nouveau (plusieurs frais + historique de paiements), sans rien
    // perdre. Idempotent : si une liste a deja un frais migre, on la
    // saute (permet de relancer l'upgrade sans dupliquer les donnees).
    const listes = await tx.listes.toArray();
    for (const liste of listes) {
      if (!liste.montant_demande) continue; // rien a migrer sur cette liste

      const fraisExistants = await tx.liste_frais
        .where("id_liste")
        .equals(liste.id)
        .count();
      if (fraisExistants > 0) continue; // deja migre

      // L'ancien montant unique devient le premier poste "Participation" --
      // un cas particulier du nouveau systeme a frais multiples. L'ancienne
      // UI continue par ailleurs de lire liste.montant_demande directement,
      // donc rien ne change visuellement tant que l'ecran n'est pas mis a
      // jour (etape suivante).
      const idFrais = uid();
      await tx.liste_frais.add({
        id: idFrais,
        id_liste: liste.id,
        libelle: "Participation",
        montant: liste.montant_demande,
        ordre: 0,
      });

      const membres = await tx.liste_membres
        .where("id_liste")
        .equals(liste.id)
        .toArray();
      for (const lm of membres) {
        await tx.liste_membres.update(lm.id, { frais_choisis: [idFrais] });
        if (lm.paye) {
          // L'ancien systeme ne gardait ni date ni trace du paiement recu.
          // On cree une ligne d'historique retroactive datee de la
          // creation de la liste (meilleure estimation disponible), pour
          // qu'aucun montant deja encaisse ne disparaisse du nouveau calcul.
          await tx.liste_paiements.add({
            id: uid(),
            id_liste: liste.id,
            id_membre: lm.id_membre,
            montant: liste.montant_demande,
            date: liste.date_creation || liste.date || todayISO(),
            heure: null,
            commentaire: "Paiement migre automatiquement (ancien systeme)",
          });
        }
      }
    }
  });

// Version 7 : une activite devient un vrai evenement organisationnel et pas
// seulement une collecte -- ajout de heure, lieu, responsable (membre
// designe), budget previsionnel et type (sortie/reunion/voyage/collecte/
// anniversaire/evenement). Schema additif : "type" est indexe des maintenant
// car le futur module Rapports en aura besoin pour ventiler par categorie ;
// les autres champs n'ont pas besoin d'index (jamais interroges via .where()).
//
// Choix volontaire : PAS de champ "statut" stocke. Comme pour
// activiteEstOuverte() et getStatutPaiementActivite(), le statut d'une
// activite (a_venir / en_cours / terminee / annulee) est calcule a la
// demande depuis sa date -- voir getStatutActivite() plus bas. Seule
// l'annulation (qui ne peut pas se deduire de la date) est stockee, en
// miroir du booleen "cloturee" deja existant. Un statut stocke se
// desynchroniserait de la realite des qu'une date passe sans qu'on rouvre
// l'activite pour le mettre a jour a la main.
db.version(7)
  .stores({
    membres: "id, nom, prenom, statut, mois_anniversaire",
    sessions: "id, nom",
    dimanches: "id, id_session, date, statut",
    anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
    paiements: "id, id_dimanche, id_membre",
    remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
    caisse_mouvements: "id, date, type",
    parametres: "cle",
    activity_log: "++seq, date, entite, action",
    listes: "id, nom, date, archivee, type",
    liste_membres: "id, id_liste, id_membre",
    prets_membres:
      "id, id_dimanche, id_debiteur, id_preteur, id_paiement, rembourse",
    liste_frais: "id, id_liste",
    liste_paiements: "id, id_liste, id_membre",
  })
  .upgrade(async (tx) => {
    const listes = await tx.listes.toArray();
    for (const l of listes) {
      // Idempotent : une activite deja migree (type deja present) est
      // sautee, pour pouvoir rejouer l'upgrade sans ecraser des valeurs
      // deja choisies par l'utilisateur.
      if (l.type) continue;
      await tx.listes.update(l.id, {
        heure: typeof l.heure !== "undefined" ? l.heure : null,
        lieu: typeof l.lieu !== "undefined" ? l.lieu : "",
        id_responsable:
          typeof l.id_responsable !== "undefined" ? l.id_responsable : null,
        budget: typeof l.budget !== "undefined" ? l.budget : null,
        type: "evenement",
        annulee: false,
      });
    }
  });

// getStatutActivite : statut de l'activite EN TANT QU'EVENEMENT (a_venir /
// en_cours / terminee / annulee) -- a ne pas confondre avec
// getStatutPaiementActivite, qui parle de l'argent d'UN participant.
// L'annulation est la seule information qui ne peut pas se deduire de la
// date : elle reste stockee (liste.annulee), le reste est toujours recalcule.
function getStatutActivite(liste) {
  if (liste.annulee) return "annulee";
  const today = todayISO();
  if (liste.date > today) return "a_venir";
  if (liste.date === today) return "en_cours";
  return "terminee";
}

// Version 8 : Module Depenses (cahier des charges). Decision d'architecture
// importante : PAS de table "depenses" separee. Le solde de la caisse
// (caisseDetail) additionne deja les mouvements "Sortie" -- si les depenses
// vivaient dans une table a part, il faudrait les additionner UNE DEUXIEME
// FOIS quelque part, avec le risque que les deux totaux divergent avec le
// temps. On enrichit donc directement les mouvements de type "Sortie" avec
// les champs demandes (categorie, justificatif photo, auteur, activite
// liee) : une depense EST un mouvement de caisse sortant, rien de plus.
// "categorie" est indexee des maintenant pour le futur rapport "Depenses"
// (ventilation par categorie) mentionne au chapitre Rapports.
db.version(8)
  .stores({
    membres: "id, nom, prenom, statut, mois_anniversaire",
    sessions: "id, nom",
    dimanches: "id, id_session, date, statut",
    anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
    paiements: "id, id_dimanche, id_membre",
    remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
    caisse_mouvements: "id, date, type, categorie",
    parametres: "cle",
    activity_log: "++seq, date, entite, action",
    listes: "id, nom, date, archivee, type",
    liste_membres: "id, id_liste, id_membre",
    prets_membres:
      "id, id_dimanche, id_debiteur, id_preteur, id_paiement, rembourse",
    liste_frais: "id, id_liste",
    liste_paiements: "id, id_liste, id_membre",
  })
  .upgrade(async (tx) => {
    const mouvements = await tx.caisse_mouvements.toArray();
    for (const m of mouvements) {
      if ("categorie" in m) continue; // deja migre (upgrade rejouable)
      await tx.caisse_mouvements.update(m.id, {
        // Une sortie deja existante (avant que les categories n'existent)
        // est classee "Divers" par defaut plutot que laissee vide : un
        // rapport "Depenses par categorie" qui ignorerait silencieusement
        // les vieilles depenses fausserait le total. Une entree n'est par
        // definition pas une depense, elle n'a pas besoin de categorie.
        categorie: m.type === "Sortie" ? "Divers" : null,
        justificatif: null,
        id_auteur: null,
        id_activite: null,
      });
    }
  });

// ---------------------------------------------------------------------------
// v9 — DOSSIER DONS
//
// Un don est une RECETTE encaissée, mais d'une nature différente d'une
// cotisation : il n'a pas de montant attendu, il n'est jamais "dû", et son
// montant est libre. C'est pourquoi il ne peut pas vivre dans `paiements`
// (dont le modèle est "montant attendu / montant payé", cf. le commentaire
// de getStatutPaiementActivite) ni dans `liste_paiements`, qui calcule une
// somme attendue. Une table dédiée est donc créée.
//
// `id_activite` est INDEXÉ : les dons se filtrent par activité. Il est
// volontairement vide (et non `""`) quand le don est général, ce que la
// migration ci-dessous garantit pour les enregistrements futurs.
//
// Aucun upgrade() n'est nécessaire : la table est neuve et vide. Les
// données existantes (membres, paiements, caisse...) ne sont pas touchées.
// ---------------------------------------------------------------------------
db.version(9)
  .stores({
    membres: "id, nom, prenom, statut, mois_anniversaire",
    sessions: "id, nom",
    dimanches: "id, id_session, date, statut",
    anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
    paiements: "id, id_dimanche, id_membre",
    remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
    caisse_mouvements: "id, date, type, categorie",
    parametres: "cle",
    activity_log: "++seq, date, entite, action",
    listes: "id, nom, date, archivee, type",
    liste_membres: "id, id_liste, id_membre",
    prets_membres:
      "id, id_dimanche, id_debiteur, id_preteur, id_paiement, rembourse",
    liste_frais: "id, id_liste",
    liste_paiements: "id, id_liste, id_membre",
    dons: "id, id_activite, id_membre, date",
  })
  .upgrade(async () => {
    // Rien a migrer : la table est creee vide. Ce upgrade() existe pour
    // garder la meme forme que les versions precedentes et pour offrir un
    // point d'ancrage explicite si un jour un don existant doit etre
    // rattache a une activite.
  });

// SCHEMA_VERSION doit rester aligne sur le dernier db.version(N) declare
// ci-dessus. Il sert de garde-fou : si un jour une version est ajoutee et
// qu'on oublie d'ouvrir la base explicitement, cette fonction le signale
// au lieu de laisser une transaction echouer plus tard sur un
// "objectStore was not found" qui ne dit rien de sa source.
const SCHEMA_VERSION = 9;

/**
 * Ouvre la base et verifie que le schema sur disque correspond au schema
 * attendu. A appeler AVANT tout usage de db.* : sans cela, Dexie ouvre la
 * base en arriere-plan a la premiere operation, l'application demarre
 * immediatement, et une migration bloquée (onglet ouvert ailleurs, service
 * worker qui sert un vieux db.js) se manifeste beaucoup plus tard par une
 * erreur qui ne mentionne ni le fichier ni la ligne.
 */
async function ouvrirBase() {
  // Une base bloquee (un autre onglet tient une connexion ouverte sur une
  // version anterieure) laisse la promesse ddb.open() en attente indefinie :
  // ni resolvee, ni rejetee. Sans ce delai, l'application resterait figee sur
  // un ecran vide, sans le moindre message.
  let bloque = false;
  const surBloque = () => { bloque = true; };
  db.on("blocked", surBloque);

  const delai = new Promise((_, rejeter) =>
    setTimeout(
      () => rejeter(new Error(bloque
        ? "Mise a jour de la base bloquee : un autre onglet de l'application " +
          "est ouvert. Fermez-le, puis rechargez la page."
        : "Ouverture de la base trop lente (> 10 s).")),
      10000,
    ),
  );

  try {
    await Promise.race([db.open(), delai]);
  } catch (err) {
    console.error(
      "[M3D] Ouverture de la base impossible.\n" +
        "Si le probleme persiste : DevTools > Application > Service Worker > " +
        "« Desinstaller », puis rechargez avec Ctrl+Shift+R (le service " +
        "worker sert un ancien db.js tant que le cache n'est pas invalide).",
      err,
    );
    throw err;
  } finally {
    // Dexie 3.2.4 n'a pas de .off() : on retire via la gestion interne
    // (le listener bloque reste actif mais n'a pas d'effet après ouverture)
  }

  if (db.verno < SCHEMA_VERSION) {
    const err = new Error(
      "Schema de base obsolete : la base est en v" + db.verno +
        " mais le code attend la v" + SCHEMA_VERSION +
        ". Rechargez la page (Ctrl+Shift+R) pour charger le dernier db.js.",
    );
    console.error("[M3D] " + err.message);
    throw err;
  }
  return db;
}

// depensesParCategorie : ventilation des sorties de caisse par categorie,
// utilisee pour le petit recapitulatif dans l'onglet Caisse. Les mouvements
// d'ajustement (voir ajusterCaisse) portent la categorie "Divers" comme
// n'importe quelle autre sortie non detaillee -- ce ne sont pas des
// depenses au sens strict, mais les compter ailleurs creerait un total qui
// ne boucle plus avec le solde affiche.
async function depensesParCategorie() {
  const mouvements = await db.caisse_mouvements
    .where("type")
    .equals("Sortie")
    .toArray();
  const parCategorie = {};
  for (const cat of CATEGORIES_DEPENSE) parCategorie[cat] = 0;
  for (const m of mouvements) {
    const cat = m.categorie || "Divers";
    parCategorie[cat] = (parCategorie[cat] || 0) + m.montant;
  }
  return parCategorie;
}

// uid(), todayISO(), MOIS_NOMS, CATEGORIES_DEPENSE, isoToDate et dateToIso
// sont fournis par config.js et utils.js (chargés avant db.js dans index.html) —
// ne pas les redéclarer ici.

// groupBy : regroupe un tableau par une cle, en un seul passage memoire.
// Utilise partout pour remplacer les boucles `for (...) await db.x.where(...)`
// (un aller-retour IndexedDB par element) par UN SEUL chargement de table
// puis un regroupement en JS pur — c'est la base de l'optimisation de
// performance de tout ce fichier (accueil, dimanches, dettes, caisse...).
function groupBy(arr, key) {
  const m = new Map();
  for (const item of arr) {
    const k = item[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

async function log(entite, action, detail) {
  try {
    await db.activity_log.add({
      date: new Date().toISOString(),
      entite,
      action,
      detail: detail || "",
    });
  } catch (e) {
    /* le log ne doit jamais bloquer une operation */
  }
}

// ---------------------------------------------------------------
// Parametres (valeurs par defaut, modifiables dans le module Parametres)
// ---------------------------------------------------------------
async function getParam(cle, defaut) {
  const row = await db.parametres.get(cle);
  return row ? row.valeur : defaut;
}
async function setParam(cle, valeur) {
  await db.parametres.put({ cle, valeur });
  await log("parametres", "modifie", `${cle} = ${valeur}`);
}

// ---------------------------------------------------------------
// Seed — donnees deja validees (28 membres, session 2026-2027, 4 dimanches)
// Ne s'execute qu'une seule fois (base vide).
// ---------------------------------------------------------------
// seedIfEmpty : n'insere PLUS aucune donnee reelle (noms, cotisations...).
// Le code source publie sur GitHub ne doit jamais contenir d'informations
// sur de vraies personnes. L'app demarre totalement vide ; toutes les
// donnees sont ensuite importees localement via Plus > Sauvegarde > Import
// JSON, ce qui ne touche jamais le depot GitHub.
async function seedIfEmpty() {
  const count = await db.membres.count();
  if (count > 0) return;
  const montantBase = 500,
    cadeau = 12000;
  await setParam("montant_cotisation_defaut", montantBase);
  await setParam("montant_cadeau_defaut", cadeau);
  await log(
    "systeme",
    "premier_lancement",
    "Base de donnees initialisee, vide",
  );
}

/**
 * Calcule les dates ISO des N derniers dimanches précédant la date courante.
 * @param {number} [n=3] - Nombre de dimanches souhaités.
 * @returns {string[]}
 */
function getDerniersDimanchesISO(n = 3) {
  const dates = [];
  const cur = new Date();
  const diff = cur.getDay(); // 0 = dimanche
  const lastSunday = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - diff);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(lastSunday.getFullYear(), lastSunday.getMonth(), lastSunday.getDate() - (i * 7));
    dates.push(dateToIso(d));
  }
  return dates;
}

/**
 * Supprime l'ensemble des données de travail (membres, dimanches, cotisations, caisse, activités)
 * pour retrouver une base de données entièrement vierge, tout en conservant le mot de passe admin.
 */
async function reinitialiserToutesDonnees() {
  await db.transaction(
    "rw",
    [
      db.membres,
      db.sessions,
      db.dimanches,
      db.anniversaires_du_jour,
      db.paiements,
      db.remboursements,
      db.caisse_mouvements,
      db.listes,
      db.liste_frais,
      db.liste_membres,
      db.liste_paiements,
      db.prets_membres,
      db.activity_log,
      db.dons,
    ],
    async () => {
      await Promise.all([
        db.membres.clear(),
        db.sessions.clear(),
        db.dimanches.clear(),
        db.anniversaires_du_jour.clear(),
        db.paiements.clear(),
        db.remboursements.clear(),
        db.caisse_mouvements.clear(),
        db.listes.clear(),
        db.liste_frais.clear(),
        db.liste_membres.clear(),
        db.liste_paiements.clear(),
        db.prets_membres.clear(),
        db.activity_log.clear(),
        db.dons.clear(),
      ]);

      await setParam("montant_cotisation_defaut", 500);
      await setParam("montant_cadeau_defaut", 12000);
      await log("systeme", "remise_a_zero", "Base de données entièrement réinitialisée.");
    },
  );
}

// ---------------------------------------------------------------
// Requetes derivees (jamais stockees)
// ---------------------------------------------------------------
async function listMembres({ actifsSeulement = false } = {}) {
  let all = await db.membres.toArray();
  if (actifsSeulement) all = all.filter((m) => m.statut === "Actif");
  return all.sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom));
}

async function isParticipant(idMembre, idSession) {
  // Un membre est "participant" a une session s'il a au moins un paiement attendu
  // sur un dimanche de cette session (source de verite = Paiements, pas un flag redondant).
  if (!idSession) return false; // aucune session active -> personne n'est encore "participant"
  const dims = await db.dimanches
    .where("id_session")
    .equals(idSession)
    .toArray();
  const dimIds = new Set(dims.map((d) => d.id));
  const p = await db.paiements.where("id_membre").equals(idMembre).first();
  return p ? dimIds.has(p.id_dimanche) : false;
}

// compterParticipants : equivalent de `membres.map(m => isParticipant(m.id,
// idSession))` mais SANS boucle N+1. Avant, isParticipant() rechargeait
// `dimanches.where(id_session)` (le meme resultat a chaque fois !) une
// fois PAR membre. Ici on charge dimanches + paiements une seule fois.
// Retourne le NOMBRE de membres ayant au moins un paiement enregistre
// (paye ou non) sur la session, tous statuts confondus — utilise pour la
// fiche membre ("Participe a la session active : Oui/Non").
async function compterParticipants(idsMembres, idSession) {
  if (!idSession) return 0;
  const [dims, paiements] = await Promise.all([
    db.dimanches.where("id_session").equals(idSession).toArray(),
    db.paiements.toArray(),
  ]);
  const dimIds = new Set(dims.map((d) => d.id));
  const membresParticipants = new Set();
  for (const p of paiements) {
    if (dimIds.has(p.id_dimanche)) membresParticipants.add(p.id_membre);
  }
  let count = 0;
  for (const id of idsMembres) if (membresParticipants.has(id)) count++;
  return count;
}

// compterCotisants : le KPI "Cotisants" de l'accueil. AVANT (bug) :
// compterParticipants() retournait un "score" +1 par participant / -1 par
// non-participant au lieu d'un compte -- ce qui pouvait meme afficher un
// nombre NEGATIF sur l'accueil -- et comptait aussi les membres Inactifs,
// et n'importe quel paiement enregistre (meme "Non paye") comme
// "cotisant". Ici : uniquement les membres ACTIFS ayant REELLEMENT paye
// (a_paye === true) au moins une fois sur la session active.
async function compterCotisants(idSession) {
  if (!idSession) return 0;
  const [dims, paiements, membresActifs] = await Promise.all([
    db.dimanches.where("id_session").equals(idSession).toArray(),
    db.paiements.toArray(),
    db.membres.where("statut").equals("Actif").toArray(),
  ]);
  const dimIds = new Set(dims.map((d) => d.id));
  const idsActifs = new Set(membresActifs.map((m) => m.id));
  const cotisants = new Set();
  for (const p of paiements) {
    if (p.a_paye && dimIds.has(p.id_dimanche) && idsActifs.has(p.id_membre)) {
      cotisants.add(p.id_membre);
    }
  }
  return cotisants.size;
}

// getOrCreateSessionActive : renvoie toujours l'id d'une session VALIDE et
// EXISTANTE. Si le parametre "session_active" est absent (ex. apres import
// d'une sauvegarde qui ne contenait que les membres) ou pointe vers une
// session qui n'existe plus, une nouvelle session est creee automatiquement.
// Ceci evite les plantages Dexie (.equals(undefined)) partout ou une
// session est necessaire. (Regression fixee une fois deja -- si l'accueil
// replante avec une erreur Dexie liee a "id_session", verifier en premier
// que cette fonction est toujours bien appelee au lieu de getParam direct.)
async function getOrCreateSessionActive() {
  const currentId = await getParam("session_active", null);
  if (currentId) {
    const exists = await db.sessions.get(currentId);
    if (exists) return currentId;
  }
  const id = uid();
  const annee = new Date().getFullYear();
  await db.sessions.add({
    id,
    nom: `${annee}-${annee + 1}`,
    date_debut: todayISO(),
    date_fin: null,
  });
  await setParam("session_active", id);
  return id;
}

async function dettesList() {
  const impayes = (await db.paiements.toArray()).filter((p) => !p.a_paye);
  const dims = await db.dimanches.toArray();
  const dimById = Object.fromEntries(dims.map((d) => [d.id, d]));
  const remb = await db.remboursements.toArray();
  // Index par paiement concerne : plusieurs remboursements pour un meme
  // paiement sont impossibles (l'ecran ne propose l'action que sur une dette
  // impayee), le premier suffit donc.
  const rembByPaiement = {};
  for (const r of remb) {
    if (!rembByPaiement[r.id_paiement_concerne]) rembByPaiement[r.id_paiement_concerne] = r;
  }
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));

  const rows = [];
  for (const p of impayes) {
    const r = rembByPaiement[p.id];
    const dim = dimById[p.id_dimanche];
    // Le nom du remboursementeur est une COPIE figee au moment du
    // remboursement (remb.nom_rembourseur). Si le membre a ete depuis
    // renomme ou supprime, l'historique affiche ce qu'il portait a l'epoque
    // plutot que de perdre l'information. Les remboursements enregistres
    // avant l'ajout de ce champ n'ont pas de copie : on retombe alors sur le
    // membre, et a defaut sur le debiteur.
    const rembMember = r && r.id_membre_rembourseur ? memById[r.id_membre_rembourseur] : null;
    const rembPar = r
      ? r.nom_rembourseur || (rembMember ? fullName(rembMember) : (memById[p.id_membre] ? fullName(memById[p.id_membre]) : "?"))
      : null;

    rows.push({
      id_paiement: p.id,
      id_membre: p.id_membre,
      membre: memById[p.id_membre] ? fullName(memById[p.id_membre]) : "?",
      telephone: memById[p.id_membre] ? memById[p.id_membre].telephone : "",
      date: dim ? dim.date : "?",
      montant: p.montant_attendu,
      statut: r ? "Remboursee" : "Impayee",
      // Details du remboursement, absents des dettes encore impayees.
      remb_montant: r && r.montant != null ? r.montant : null,
      remb_date: r ? r.date_remboursement || null : null,
      remb_par: rembPar,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

async function totalDettesImpayees() {
  const rows = await dettesList();
  return rows
    .filter((r) => r.statut === "Impayee")
    .reduce((a, r) => a + r.montant, 0);
}

// ---------------------------------------------------------------------------
// DONS
//
// Un don est une recette libre : aucun montant n'est attendu, donc rien ne
// peut être "impayé". Le total et le nombre de donateurs sont TOUJOURS
// recalcules a partir de la table `dons` -- jamais stockes -- sur le meme
// principe que les dettes (cf. dettesList). Corriger un don, c'est modifier
// sa ligne ; le total suit automatiquement.
// ---------------------------------------------------------------------------

/**
 * Liste les dons, du plus recent au plus ancien, avec le nom du donateur
 * et le nom de l'activite resolus pour l'affichage.
 *
 * @param {object} [options]
 * @param {string} [options.idActivite] - Restreint a une activite. La
 *   chaine vide "" signifie "aucune activite" (dons generaux) : c'est une
 *   valeur de filtre legitime, pas une absence de filtre.
 * @returns {Promise<Array<object>>} Lignes de don enrichies.
 */
async function donsList({ idActivite = null } = {}) {
  const base =
    idActivite === null
      ? await db.dons.toArray()
      : await db.dons.where("id_activite").equals(idActivite).toArray();
  const [membres, listes] = await Promise.all([
    db.membres.toArray(),
    db.listes.toArray(),
  ]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const listeById = Object.fromEntries(listes.map((l) => [l.id, l]));

  return base
    .map((d) => ({
      ...d,
      donateur: memById[d.id_membre]
        ? `${memById[d.id_membre].nom} ${memById[d.id_membre].prenom}`.trim()
        : "Anonyme",
      activite: listeById[d.id_activite] ? listeById[d.id_activite].nom : "",
    }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/**
 * Cree un don. La validation de fond (montant strictement positif, membre
 * obligatoire) est faite par l'appelant pour pouvoir afficher un message
 * precis ; ici on refuse seulement ce qui corromprait la donnee.
 *
 * @param {object} don
 * @param {number} don.montant - Montant du don, en entier positif.
 * @param {string} don.id_membre - Identifiant du donateur (obligatoire).
 * @param {string} [don.id_activite] - Activite liee, ou "" si don general.
 * @param {string} [don.date] - Date du don au format ISO (AAAA-MM-JJ).
 * @param {string} [don.commentaire] - Note libre, facultative.
 * @returns {Promise<string>} Identifiant du don cree.
 */
async function creerDon({ montant, id_membre, id_activite, date, commentaire }) {
  const m = Math.round(Number(montant));
  if (!Number.isFinite(m) || m <= 0)
    throw new Error("Le montant du don doit etre un nombre superieur a zero.");
  if (!id_membre) throw new Error("Le donateur est obligatoire.");

  const id = uid();
  await db.dons.add({
    id,
    id_membre,
    id_activite: id_activite || "",
    montant: m,
    date: date || todayISO(),
    commentaire: (commentaire || "").trim(),
    created_at: new Date().toISOString(),
  });
  await log("don", "cree", `${m} — ${id_activite || "don general"}`);
  return id;
}

/**
 * Modifie un don existant. Meme contrat que creerDon, mais conserve les
 * champs non transmis au lieu de les effacer.
 *
 * @param {string} id - Identifiant du don a modifier.
 * @param {object} patch - Champs a mettre a jour.
 * @returns {Promise<void>}
 */
async function modifierDon(id, patch) {
  if ("montant" in patch) {
    const m = Math.round(Number(patch.montant));
    if (!Number.isFinite(m) || m <= 0)
      throw new Error("Le montant du don doit etre un nombre superieur a zero.");
    patch.montant = m;
  }
  if ("id_activite" in patch) patch.id_activite = patch.id_activite || "";
  if ("date" in patch) patch.date = patch.date || todayISO();
  if ("commentaire" in patch) patch.commentaire = (patch.commentaire || "").trim();

  await db.dons.update(id, patch);
  await log("don", "modifie", id);
}

/**
 * Supprime un don. Le journal d'activite conserve la trace : la suppression
 * reste traçable meme si la ligne, elle, a disparu.
 *
 * @param {string} id - Identifiant du don a supprimer.
 * @returns {Promise<void>}
 */
async function supprimerDon(id) {
  await db.dons.delete(id);
  await log("don", "supprime", id);
}

/**
 * Synthese d'un ensemble de dons : total, nombre de donateurs distincts et
 * moyenne. Utilisee par l'ecran d'activite comme par le rapport PDF.
 *
 * @param {Array<object>} lignes - Resultat de donsList, ou toute liste de
 *   lignes portant au minimum un champ `montant`.
 * @returns {{total: number, nbDons: number, nbDonateurs: number, moyenne: number}}
 */
function syntheseDons(lignes) {
  const total = lignes.reduce((a, d) => a + (Number(d.montant) || 0), 0);
  const donateurs = new Set(lignes.map((d) => d.id_membre).filter(Boolean));
  return {
    total,
    nbDons: lignes.length,
    nbDonateurs: donateurs.size,
    moyenne: donateurs.size ? Math.round(total / donateurs.size) : 0,
  };
}

async function caisseSolde() {
  const d = await caisseDetail();
  return d.solde;
}
// caisseDetail : decompose le solde de la caisse en ses composantes, pour
// que l'utilisateur comprenne d'ou vient le chiffre final. Les impayes ne
// sont PAS inclus dans le solde (ils sont renvoyes separement, a titre
// informatif uniquement).
async function caisseDetail() {
  // Avant : une boucle `for (dimanche of dimanches) { await ...; await ...; }`
  // faisait 2 requetes IndexedDB SEQUENTIELLES par dimanche. Le total
  // collecte/distribue est une simple somme sur TOUTES les lignes, peu
  // importe leur regroupement par dimanche : on charge donc chaque table
  // une seule fois, en parallele, puis on somme en memoire.
  const [manuels, paiements, anniv, dettesImpayees] = await Promise.all([
    db.caisse_mouvements.toArray(),
    db.paiements.toArray(),
    db.anniversaires_du_jour.toArray(),
    totalDettesImpayees(),
  ]);
  const entreesManuelles = manuels
    .filter((m) => m.type === "Entree")
    .reduce((a, m) => a + m.montant, 0);
  const sortiesManuelles = manuels
    .filter((m) => m.type === "Sortie")
    .reduce((a, m) => a + m.montant, 0);
  const totalCollecte = paiements.reduce((a, p) => a + p.montant_paye, 0);
  const totalCadeauxVerses = anniv.reduce((a, x) => a + x.montant_cadeau, 0);

  const solde =
    entreesManuelles - sortiesManuelles + totalCollecte - totalCadeauxVerses;

  return {
    totalCollecte,
    totalCadeauxVerses,
    entreesManuelles,
    sortiesManuelles,
    solde,
    dettesImpayees,
  };
}

// ajusterCaisse : reconciliation. L'utilisateur indique le montant qu'il a
// REELLEMENT en main ; on cree un mouvement d'ajustement (Entree ou Sortie)
// pour combler l'ecart avec le solde calcule, de sorte que le solde
// affiche devienne exactement ce montant. L'historique n'est jamais
// efface : on ajoute une ligne tracee, on ne supprime rien (piste d'audit
// conservee).
async function ajusterCaisse(montantReel) {
  const avant = await caisseDetail();
  const ecart = montantReel - avant.solde;
  if (ecart === 0) return { ecart: 0 };
  await db.caisse_mouvements.add({
    id: uid(),
    date: todayISO(),
    type: ecart > 0 ? "Entree" : "Sortie",
    montant: Math.abs(ecart),
    libelle: `Ajustement caisse (solde reel : ${montantReel} F)`,
    categorie: ecart > 0 ? null : "Divers",
    justificatif: null,
    id_auteur: null,
    id_activite: null,
  });
  await log("caisse", "ajustement", `${avant.solde} F -> ${montantReel} F`);
  return { ecart };
}

// fluxCaisseMoisCourant : depenses et recettes du mois EN COURS, pour le
// Dashboard. Les "recettes" additionnent les cotisations collectees (via
// les dimanches du mois) et les entrees manuelles du mois -- les depenses
// ne sont que les sorties de caisse du mois (voir Module Depenses). Comme
// caisseDetail(), c'est un recalcul a la demande : aucun total mensuel
// n'est stocke nulle part, donc rien ne peut jamais se desynchroniser.
async function fluxCaisseMoisCourant() {
  const prefixMois = todayISO().slice(0, 7); // "YYYY-MM"
  const [mouvements, dimanches, paiements] = await Promise.all([
    db.caisse_mouvements.toArray(),
    db.dimanches.toArray(),
    db.paiements.toArray(),
  ]);
  const depensesMois = mouvements
    .filter((m) => m.type === "Sortie" && m.date.startsWith(prefixMois))
    .reduce((a, m) => a + m.montant, 0);
  const entreesManuellesMois = mouvements
    .filter((m) => m.type === "Entree" && m.date.startsWith(prefixMois))
    .reduce((a, m) => a + m.montant, 0);
  const dimanchesMoisIds = new Set(
    dimanches.filter((d) => d.date.startsWith(prefixMois)).map((d) => d.id),
  );
  const cotisationsMois = paiements
    .filter((p) => dimanchesMoisIds.has(p.id_dimanche))
    .reduce((a, p) => a + p.montant_paye, 0);
  return {
    depensesMois,
    recettesMois: entreesManuellesMois + cotisationsMois,
  };
}

// prochainesActivites : les activites a venir (ou en cours aujourd'hui),
// ni archivees ni annulees, triees par date puis heure -- pour la section
// "Prochaines echeances" du Dashboard (cahier des charges V2).
async function prochainesActivites(limite = 5) {
  const today = todayISO();
  const all = await db.listes.toArray();
  return all
    .filter((l) => !l.archivee && !l.annulee && l.date >= today)
    .sort((a, b) =>
      (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")),
    )
    .slice(0, limite);
}

// evenementsEntreDates : fusionne activites et anniversaires en une liste
// unique d'"evenements de calendrier" pour les vues Mois/Semaine/Jour.
// On renvoie volontairement l'objet "liste" ou "membre" BRUT dans chaque
// evenement plutot que des champs deja mis en forme (nom complet...) :
// ces mises en forme dependent de helpers d'affichage
// (fullName) qui vivent dans app.js, pas ici. db.js ne connait
// que les donnees, jamais leur presentation.
async function evenementsEntreDates(dateDebutISO, dateFinISO) {
  const [listes, membres] = await Promise.all([
    db.listes.toArray(),
    db.membres.toArray(),
  ]);
  const evenements = [];

  for (const l of listes) {
    if (l.archivee || l.annulee) continue;
    if (l.date >= dateDebutISO && l.date <= dateFinISO) {
      evenements.push({ date: l.date, heure: l.heure, type: "activite", liste: l });
    }
  }

  // Un anniversaire n'a pas d'annee propre (jour_anniversaire/mois_anniversaire
  // seulement) : on le projette sur chaque annee couverte par la plage
  // demandee. Une vue Mois/Semaine/Jour ne traverse jamais plus de 2 annees
  // civiles (le cas limite etant une semaine a cheval sur le 31 decembre).
  const anneesAVerifier = new Set([
    isoToDate(dateDebutISO).getFullYear(),
    isoToDate(dateFinISO).getFullYear(),
  ]);
  for (const m of membres) {
    if (!m.jour_anniversaire || !m.mois_anniversaire || m.statut !== "Actif")
      continue;
    for (const annee of anneesAVerifier) {
      // new Date(annee, mois-1, jour) deborde naturellement sur mars pour un
      // 29 fevrier hors annee bissextile -- meme comportement deja accepte
      // ailleurs dans l'app (prochaineOccurrenceAnniversaire).
      const bdayISO = dateToIso(
        new Date(annee, m.mois_anniversaire - 1, m.jour_anniversaire),
      );
      if (bdayISO >= dateDebutISO && bdayISO <= dateFinISO) {
        evenements.push({ date: bdayISO, heure: null, type: "anniversaire", membre: m });
      }
    }
  }

  return evenements.sort((a, b) =>
    (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")),
  );
}

async function joursAvecStats() {
  // Avant : 2 requetes IndexedDB sequentielles PAR dimanche (await dans une
  // boucle for). Avec ne serait-ce que 30-40 dimanches, ca fait 60-80
  // allers-retours l'un apres l'autre. Maintenant : 3 chargements de table
  // en parallele, une seule fois, puis regroupement en memoire (groupBy).
  const [dimanches, membres, paiements, anniv] = await Promise.all([
    db.dimanches.toArray(),
    db.membres.toArray(),
    db.paiements.toArray(),
    db.anniversaires_du_jour.toArray(),
  ]);
  dimanches.sort((a, b) => a.date.localeCompare(b.date));
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const paiementsByDim = groupBy(paiements, "id_dimanche");
  const annivByDim = groupBy(anniv, "id_dimanche");

  const out = dimanches.map((dim) => {
    const paiementsDuJour = paiementsByDim.get(dim.id) || [];
    const annivDuJour = annivByDim.get(dim.id) || [];
    const totalCollecte = paiementsDuJour.reduce(
      (a, p) => a + p.montant_paye,
      0,
    );
    const giftNeeded = annivDuJour.reduce((a, x) => a + x.montant_cadeau, 0);
    return {
      dimanche: dim,
      beneficiaires: annivDuJour.map((a) =>
        memById[a.id_membre_fete]
          ? `${memById[a.id_membre_fete].nom} ${memById[a.id_membre_fete].prenom}`.trim()
          : "?",
      ),
      nbAnniv: Math.max(1, annivDuJour.length),
      montantAttendu: paiementsDuJour[0]
        ? paiementsDuJour[0].montant_attendu
        : 0,
      nbPayants: paiementsDuJour.filter((p) => p.a_paye).length,
      nbTotal: paiementsDuJour.length,
      totalCollecte,
      giftNeeded,
      solde: totalCollecte - giftNeeded,
      paiements: paiementsDuJour,
    };
  });
  return out.reverse();
}

async function prochainAnniversaire() {
  const membres = (await db.membres.toArray()).filter(
    (m) => m.jour_anniversaire && m.mois_anniversaire,
  );
  const today = new Date();
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const withDates = membres.map((m) => {
    const bday = prochaineOccurrenceAnniversaire(
      m.jour_anniversaire,
      m.mois_anniversaire,
      todayMid,
    );
    const dimanche = nextSunday(bday);
    return { membre: m, bday, dimanche };
  });
  withDates.sort((a, b) => a.dimanche - b.dimanche);
  return withDates;
}

// ---------------------------------------------------------------
// Anniversaires <-> dimanche de collecte
// ---------------------------------------------------------------
function nextSunday(d) {
  const day = d.getDay();
  const diff = (7 - day) % 7;
  const res = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return res;
}
function prochaineOccurrenceAnniversaire(jj, mm, fromDate) {
  const y = fromDate.getFullYear();
  let d = new Date(y, mm - 1, jj);
  if (d < fromDate) d = new Date(y + 1, mm - 1, jj);
  return d;
}
function sameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Pour un dimanche donne, quels membres devraient etre fetes ce jour-la
// (leur anniversaire tombe entre le lundi precedent et ce dimanche inclus) ?
async function membresAnniversaireCeDimanche(dimancheISO) {
  const target = isoToDate(dimancheISO);
  const membres = (await db.membres.toArray()).filter(
    (m) => m.jour_anniversaire && m.mois_anniversaire && m.statut === "Actif",
  );
  const out = [];
  for (const m of membres) {
    for (const yearOffset of [0, -1, 1]) {
      const y = target.getFullYear() + yearOffset;
      const bday = new Date(y, m.mois_anniversaire - 1, m.jour_anniversaire);
      if (sameDate(nextSunday(bday), target)) {
        out.push(m);
        break;
      }
    }
  }
  return out;
}

async function membresAnniversaireCeMois(mois) {
  const membres = (await db.membres.toArray()).filter(
    (m) => m.mois_anniversaire === mois,
  );
  return membres.sort((a, b) => a.jour_anniversaire - b.jour_anniversaire);
}

// Anniversaires du mois en cours, en ne gardant que ceux qui n'ont pas
// encore ete fetes : des qu'un dimanche de collecte passe (ou du jour meme)
// a deja verse le cadeau a un membre ce mois-ci, ce membre disparait de la
// liste. Il ne reste donc que ceux qui vont encore feter leur anniversaire.
async function membresAnniversaireCeMoisRestants(mois) {
  const membresMois = await membresAnniversaireCeMois(mois);
  if (membresMois.length === 0) return membresMois;
  const now = new Date();
  const year = now.getFullYear();
  const todayIso = todayISO();
  const dimanches = await db.dimanches.toArray();
  const dimIdsDuMoisPasses = new Set(
    dimanches
      .filter((d) => {
        const dt = isoToDate(d.date);
        return (
          dt.getFullYear() === year &&
          dt.getMonth() + 1 === mois &&
          d.date <= todayIso
        );
      })
      .map((d) => d.id),
  );
  if (dimIdsDuMoisPasses.size === 0) return membresMois;
  const anniv = await db.anniversaires_du_jour.toArray();
  const dejaFetesIds = new Set(
    anniv
      .filter((a) => dimIdsDuMoisPasses.has(a.id_dimanche))
      .map((a) => a.id_membre_fete),
  );
  return membresMois.filter((m) => !dejaFetesIds.has(m.id));
}

// ---------------------------------------------------------------
// Reinitialisations ("Zone dangereuse" du module Plus)
// ---------------------------------------------------------------

// Efface la date d'anniversaire (jour + mois) de TOUS les membres, sans
// supprimer aucun membre : la fiche (nom, telephone, fonction, statut...)
// reste intacte, seule l'information d'anniversaire est remise a vide.
async function supprimerTousLesAnniversairesMembres() {
  const tous = await db.membres.toArray();
  await db.transaction("rw", db.membres, async () => {
    for (const m of tous) {
      await db.membres.update(m.id, {
        jour_anniversaire: null,
        mois_anniversaire: null,
      });
    }
  });
  await log(
    "anniversaires",
    "suppression_totale",
    `${tous.length} fiches membres remises a zero (anniversaire uniquement)`,
  );
}

// Supprime toutes les cotisations (paiements), tous les dimanches de
// collecte, les anniversaires-du-jour rattaches et les remboursements
// associes, pour repartir de zero. Les membres et la session restent
// intacts : seul l'historique des collectes est efface.
// ------------------------------------------------------------------
// Reinitialise les COTISATIONS, les DETTES et la CAISSE, mais garde la
// LISTE DES COLLECTES (dimanches + qui a ete fete) intacte.
//
// IMPORTANT (lecon apprise) : une version anterieure de cette fonction
// effacait aussi db.dimanches et db.anniversaires_du_jour, ce qui faisait
// disparaitre completement les dates de collecte deja creees quand on
// cliquait sur "Reinitialiser". Ce n'est PAS le comportement voulu : on
// veut remettre les compteurs a zero, pas perdre l'historique des dates.
//
// Comportement actuel :
//  - db.paiements.clear()         -> chaque dimanche repasse a 0/0 cotise
//  - db.remboursements.clear()    -> les dettes redeviennent "impayees"
//  - db.caisse_mouvements.clear() -> les mouvements manuels (dons, achats,
//                                     etc.) sont remis a zero
//  - db.dimanches               -> CONSERVE (les dates de collecte restent)
//  - db.anniversaires_du_jour   -> CONSERVE (qui a ete fete chaque dimanche
//                                     reste visible)
//  - db.membres / db.sessions   -> jamais touches par cette fonction
// ------------------------------------------------------------------
async function reinitialiserCotisations() {
  const nbMembresAvant = await db.membres.count();
  await db.transaction(
    "rw",
    db.paiements,
    db.remboursements,
    db.caisse_mouvements,
    async () => {
      await db.remboursements.clear();
      await db.paiements.clear();
      await db.caisse_mouvements.clear();
    },
  );
  // Garde de securite : la table "membres" n'est meme pas incluse dans la
  // transaction ci-dessus (impossible d'y ecrire depuis ce bloc), mais on
  // verifie quand meme explicitement qu'aucun membre n'a disparu.
  const nbMembresApres = await db.membres.count();
  if (nbMembresApres !== nbMembresAvant) {
    throw new Error(
      `Securite : le nombre de membres a change pendant la reinitialisation des cotisations (${nbMembresAvant} -> ${nbMembresApres}). Operation annulee, contacte le support.`,
    );
  }
  await log(
    "cotisations",
    "reinitialisation_totale",
    `Cotisations, dettes et caisse remises a zero, dimanches conserves (${nbMembresApres} membres conserves)`,
  );
}

async function marquerPaiement(idPaiement, aPaye) {
  const p = await db.paiements.get(idPaiement);
  if (!p) return;
  await db.paiements.update(idPaiement, {
    a_paye: aPaye,
    montant_paye: aPaye ? p.montant_attendu : 0,
  });
  await log("paiement", aPaye ? "marque_paye" : "marque_non_paye", idPaiement);
}

// ------------------------------------------------------------------
// PRETS ENTRE MEMBRES
// ------------------------------------------------------------------
// Cas d'usage : un membre est absent un dimanche, un autre membre present
// avance sa cotisation pour lui. Cote GROUPE, la cotisation est consideree
// payee immediatement (le groupe a bien recu son argent). Le pret est un
// arrangement PERSONNEL entre les deux membres, suivi separement des
// dettes du groupe.
async function enregistrerPretMembre(idPaiement, idPreteur) {
  const p = await db.paiements.get(idPaiement);
  if (!p) return;
  if (p.id_membre === idPreteur)
    throw new Error("Un membre ne peut pas preter a lui-meme.");
  // La date du pret doit etre celle du DIMANCHE concerne (pas la date a
  // laquelle on saisit/enregistre le pret dans l'app, qui peut etre
  // differente si on rattrape une saisie en retard).
  const dim = await db.dimanches.get(p.id_dimanche);
  await db.paiements.update(idPaiement, {
    a_paye: true,
    montant_paye: p.montant_attendu,
  });
  await db.prets_membres.add({
    id: uid(),
    id_dimanche: p.id_dimanche,
    id_paiement: idPaiement,
    id_debiteur: p.id_membre,
    id_preteur: idPreteur,
    montant: p.montant_attendu,
    date: dim ? dim.date : todayISO(),
    rembourse: false,
  });
  await log("pret", "enregistre", idPaiement);
}
async function pretsMembres({ nonRembourseSeulement = false } = {}) {
  let all = await db.prets_membres.toArray();
  if (nonRembourseSeulement) all = all.filter((p) => !p.rembourse);
  return all.sort((a, b) => b.date.localeCompare(a.date));
}
async function marquerPretRembourse(idPret, rembourse) {
  await db.prets_membres.update(idPret, { rembourse });
  await log("pret", rembourse ? "rembourse" : "remise_a_zero", idPret);
}

// ------------------------------------------------------------------
// REGULARITE — signale un membre qui a rate ses 2 DERNIERES cotisations
// (deux dimanches consecutifs non payes, ordre chronologique). Un pret
// enregistre via enregistrerPretMembre() compte comme "paye" (a_paye
// devient true), donc n'est jamais compte comme un rate.
// ------------------------------------------------------------------
// historiquePaiementsMembre : chronologie complete (paye/non paye) d'un
// membre sur tous les dimanches ou il avait une ligne de paiement. Utilisee
// par la fiche membre (timeline) et par membresIrreguliers().
async function historiquePaiementsMembre(idMembre) {
  // Avant : boucle sur tous les dimanches avec 2 `await` sequentiels par
  // dimanche (paiement du membre + anniversaires du jour), sans meme
  // utiliser l'index deja present sur id_membre. Maintenant : la requete
  // paiements est indexee sur id_membre (rapide et cible), et le reste est
  // charge une fois puis assemble en memoire.
  const [dimanches, paiementsMembre, anniv, membres] = await Promise.all([
    db.dimanches.toArray(),
    db.paiements.where("id_membre").equals(idMembre).toArray(),
    db.anniversaires_du_jour.toArray(),
    db.membres.toArray(),
  ]);
  dimanches.sort((a, b) => a.date.localeCompare(b.date));
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const paiementByDim = new Map(paiementsMembre.map((p) => [p.id_dimanche, p]));
  const annivByDim = groupBy(anniv, "id_dimanche");

  const out = [];
  for (const d of dimanches) {
    const p = paiementByDim.get(d.id);
    if (!p) continue;
    const beneficiaires = (annivByDim.get(d.id) || [])
      .map((a) => memById[a.id_membre_fete])
      .filter(Boolean)
      .map((m) => `${m.nom} ${m.prenom}`);
    out.push({
      date: d.date,
      a_paye: p.a_paye,
      montant_attendu: p.montant_attendu,
      beneficiaires,
    });
  }
  return out;
}

async function membresIrreguliers() {
  // Avant : appelait historiquePaiementsMembre() pour CHAQUE membre actif,
  // qui rechargeait a chaque fois toutes les tables -> O(membres x
  // dimanches) allers-retours IndexedDB. Maintenant : un seul chargement
  // de membres/dimanches/paiements, tout le calcul se fait en memoire.
  const [membres, dimanches, paiements] = await Promise.all([
    db.membres.where("statut").equals("Actif").toArray(),
    db.dimanches.toArray(),
    db.paiements.toArray(),
  ]);
  dimanches.sort((a, b) => a.date.localeCompare(b.date));
  const ordreDim = new Map(dimanches.map((d, i) => [d.id, i]));
  const paiementsParMembre = groupBy(paiements, "id_membre");

  const irreguliers = [];
  for (const m of membres) {
    const historique = (paiementsParMembre.get(m.id) || [])
      .slice()
      .sort((a, b) => {
        // Remplace l'operateur "??" (non supporte par Safari avant la
        // version 13.1, donc absent sur TOUT iOS 12) par un ternaire
        // equivalent. Sur Safari 12, "??" provoque une SyntaxError qui
        // empeche l'execution de CE FICHIER ENTIER (db.js), donc casse
        // toute l'app au chargement -- pas juste cette fonction.
        const oa = ordreDim.get(a.id_dimanche);
        const ob = ordreDim.get(b.id_dimanche);
        return (oa !== undefined ? oa : 0) - (ob !== undefined ? ob : 0);
      });
    const n = historique.length;
    if (
      n >= 2 &&
      historique[n - 1].a_paye === false &&
      historique[n - 2].a_paye === false
    ) {
      irreguliers.push(m.id);
    }
  }
  return irreguliers;
}

// membresARelancer : liste d'action combinant deux causes -- une dette
// envers le groupe, et/ou 2 cotisations manquees d'affilee (irregulier).
// Un meme membre peut cumuler les deux raisons.
// membresARelancer accepte optionnellement une liste d'irreguliers deja
// calculee (evite de relancer membresIrreguliers() une 2e fois quand
// l'appelant, comme renderAccueil(), l'a deja calculee juste avant).
async function membresARelancer(irreguliersIdsPrecalcules) {
  const [dettes, irreguliersIds] = await Promise.all([
    dettesList(),
    irreguliersIdsPrecalcules
      ? Promise.resolve(irreguliersIdsPrecalcules)
      : membresIrreguliers(),
  ]);

  const dettesImpayees = dettes.filter((d) => d.statut === "Impayee");
  const parMembre = new Map();

  // ÉTAPE 1 : Traiter les dettes UNIQUEMENT pour établir qui a une dette
  // On ne définit pas encore le flag irregulier ici
  for (const d of dettesImpayees) {
    const key = d.id_membre;
    if (!parMembre.has(key)) {
      const m = await db.membres.get(key);
      if (!m) continue;
      parMembre.set(key, {
        id_membre: key,
        nom: `${m.nom} ${m.prenom}`,
        telephone: m.telephone,
        montantDette: 0,
        hasDebt: true,       // On suit séparément si la membre a une dette
        isIrregulier: false  // On suivra séparément le statut irrégulier
      });
    }
    // On accumule le montant de la dette
    parMembre.get(key).montantDette += d.montant;
  }

  // ÉTAPE 2 : Traiter les membres irréguliers pour définir correctement le flag
  for (const id of irreguliersIds) {
    const m = await db.membres.get(id);
    if (!m) continue;

    if (!parMembre.has(id)) {
      // Le membre n'appartient qu'à la liste des irréguliers (aucune dette)
      parMembre.set(id, {
        id_membre: id,
        nom: `${m.nom} ${m.prenom}`,
        telephone: m.telephone,
        montantDette: 0,
        hasDebt: false,
        isIrregulier: true   // Définit clairement le statut irrégulier
      });
    } else {
      // Le membre figure dans LES DEUX listes - on marque comme irrégulier
      parMembre.get(id).isIrregulier = true;
      parMembre.get(id).hasDebt = true;
    }
  }

  // ÉTAPE 3 : Convertir au format final attendu par le reste du code
  return Array.from(parMembre.values())
    .filter(member => member.isIrregulier || member.hasDebt) // Seulement ceux nécessitant une action
    .map(member => ({
      id_membre: member.id_membre,
      nom: member.nom,
      telephone: member.telephone,
      montantDette: member.montantDette,
      irregulier: member.isIrregulier   // On utilise le nom de propriété attendu
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}

// Garde anti-doublon : renvoie le dimanche existant a cette date (session
// active), ou null si la date est libre.
async function dimancheExisteADate(date) {
  const sessionId = await getOrCreateSessionActive();
  const existant = await db.dimanches
    .where("id_session")
    .equals(sessionId)
    .and((d) => d.date === date)
    .first();
  return existant || null;
}

// ------------------------------------------------------------------
// Passage d'un membre en Inactif : efface ses dettes envers le groupe
// (les lignes de paiement NON payees), mais conserve tout l'historique des
// cotisations DEJA payees (rien n'est perdu de ce qui a reellement eu
// lieu). Les prets ou il est PRETEUR (quelqu'un lui doit de l'argent) ne
// sont pas touches, seuls ceux ou il est DEBITEUR et non rembourse sont
// annules (il n'est plus tenu de rembourser un pret si on le sort du
// systeme de cotisation).
// ------------------------------------------------------------------
async function passerMembreInactif(idMembre) {
  const impayes = await db.paiements
    .where("id_membre")
    .equals(idMembre)
    .and((p) => !p.a_paye)
    .toArray();
  await db.transaction(
    "rw",
    db.membres,
    db.paiements,
    db.prets_membres,
    async () => {
      for (const p of impayes) await db.paiements.delete(p.id);
      const pretsEnCours = await db.prets_membres
        .where("id_debiteur")
        .equals(idMembre)
        .and((pr) => !pr.rembourse)
        .toArray();
      for (const pr of pretsEnCours) await db.prets_membres.delete(pr.id);
      await db.membres.update(idMembre, { statut: "Inactif" });
    },
  );
  await log(
    "membre",
    "passe_inactif",
    `${idMembre} — ${impayes.length} dette(s) effacee(s)`,
  );
  return impayes.length;
}

async function participantsDeLaSession(sessionId) {
  const dims = await db.dimanches
    .where("id_session")
    .equals(sessionId)
    .toArray();
  if (dims.length === 0) {
    // Premier dimanche de la session : pas encore de recensement -> tous les membres actifs
    const actifs = await db.membres.where("statut").equals("Actif").toArray();
    return actifs.map((m) => m.id);
  }
  // A partir du 2e dimanche : le groupe de participants reste FIXE, egal
  // a celui du premier dimanche (tous ceux qui avaient une ligne de
  // paiement, qu'ils aient effectivement paye ou non cette semaine-la).
  // Regle generale : ne pas payer une semaine donnee n'exclut JAMAIS
  // automatiquement quelqu'un des dimanches suivants -- ca cree juste une
  // dette (visible dans l'onglet Dettes). La seule facon de sortir
  // durablement du groupe est un changement MANUEL de statut (Actif ->
  // Inactif) sur la fiche du membre -- c'est ainsi que Nadege et Dodji,
  // par exemple, sont geres : cas particuliers decides a la main, pas une
  // regle automatique liee au non-paiement.
  const ids = new Set();
  for (const d of dims) {
    const ps = await db.paiements.where("id_dimanche").equals(d.id).toArray();
    ps.forEach((p) => ids.add(p.id_membre));
  }
  // Filtre de securite : meme si un membre a un historique de paiement, il
  // ne doit JAMAIS reapparaitre dans un nouveau dimanche si son statut
  // ACTUEL est "Inactif" (bug corrige : avant, seul le tout premier
  // dimanche verifiait le statut -- un membre passe Inactif en cours de
  // route continuait a apparaitre indefiniment sur les dimanches suivants).
  const actifsIds = new Set(
    (await db.membres.where("statut").equals("Actif").toArray()).map(
      (m) => m.id,
    ),
  );
  return Array.from(ids).filter((id) => actifsIds.has(id));
}

async function nouveauDimanche({ date, beneficiaireIds }) {
  const sessionId = await getOrCreateSessionActive();
  const montantBase = await getParam("montant_cotisation_defaut", 500);
  const cadeau = await getParam("montant_cadeau_defaut", 12000);
  // IMPORTANT : on calcule la liste des participants AVANT de creer le
  // dimanche en base. Sinon, participantsDeLaSession() verrait deja le
  // dimanche qu'on est en train de creer (via db.dimanches.add plus bas)
  // et ne le traiterait plus comme "le premier dimanche de la session" ->
  // la regle "aucun dimanche encore = prendre tous les membres actifs" ne
  // se declenchait alors jamais, laissant 0 participant et donc 0
  // paiement cree (bug corrige ici).
  const participantIds = await participantsDeLaSession(sessionId);
  const dimId = uid();
  await db.dimanches.add({
    id: dimId,
    id_session: sessionId,
    date,
    statut: "En cours",
    archivee: false,
  });
  for (const bId of beneficiaireIds) {
    await db.anniversaires_du_jour.add({
      id: uid(),
      id_dimanche: dimId,
      id_membre_fete: bId,
      montant_cadeau: cadeau,
    });
  }
  const nb = Math.max(1, beneficiaireIds.length);
  for (const mId of participantIds) {
    const membre = await db.membres.get(mId);
    const base = (membre && membre.cotisation_personnalisee) || montantBase;
    const montantAttendu = base * nb;
    await db.paiements.add({
      id: uid(),
      id_dimanche: dimId,
      id_membre: mId,
      montant_attendu: montantAttendu,
      a_paye: false,
      montant_paye: 0,
    });
  }
  await log("dimanche", "cree", dimId);
  return dimId;
}

// ---------------------------------------------------------------
// Authentification locale (empeche un membre de trafiquer les donnees
// depuis le telephone partage). Le mot de passe n'est jamais stocke en
// clair : seul un hash SHA-256(sel + mot de passe) est conserve dans
// IndexedDB. C'est une protection "anti-triche" de bon sens, pas une
// securite de niveau serveur : l'app etant 100% locale, elle n'a pas de
// compte serveur ni de recuperation par email.
// ---------------------------------------------------------------
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function isAdminConfigured() {
  const hash = await getParam("admin_hash", null);
  return !!hash;
}
async function setAdminPassword(pw) {
  const salt = uid();
  const hash = await sha256Hex(salt + pw);
  await db.parametres.put({ cle: "admin_salt", valeur: salt });
  await db.parametres.put({ cle: "admin_hash", valeur: hash });
  await log("securite", "mot_de_passe_admin_defini", "");
}
async function verifyAdminPassword(pw) {
  const salt = await getParam("admin_salt", "");
  const hash = await getParam("admin_hash", "");
  if (!hash) return false;
  const test = await sha256Hex(salt + pw);
  return test === hash;
}

async function supprimerDimanche(idDimanche) {
  await db.paiements.where("id_dimanche").equals(idDimanche).delete();
  await db.anniversaires_du_jour
    .where("id_dimanche")
    .equals(idDimanche)
    .delete();
  await db.dimanches.delete(idDimanche);
  await log("dimanche", "supprime", idDimanche);
}

// ---------------------------------------------------------------
// MODULE "ACTIVITES" — independant des cotisations d'anniversaire.
// Une activite = un evenement/groupe (sortie, reunion, camp...) avec ses
// propres participants inscrits et, le cas echeant, des frais a suivre
// (voir plus bas : liste_frais / liste_paiements).
// ---------------------------------------------------------------
async function listesAll({ archiveesSeulement = null } = {}) {
  let all = await db.listes.toArray();
  if (archiveesSeulement === true) all = all.filter((l) => l.archivee);
  if (archiveesSeulement === false) all = all.filter((l) => !l.archivee);
  return all.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
async function creerListe({
  nom,
  description,
  date,
  date_limite,
  montant_demande,
  notes,
  heure,
  lieu,
  id_responsable,
  budget,
  type,
}) {
  const id = uid();
  await db.listes.add({
    id,
    nom: nom.trim(),
    description: (description || "").trim(),
    date: date || todayISO(),
    // date_limite : facultative -- une activite sans date limite reste
    // ouverte indefiniment (voir activiteEstOuverte).
    date_limite: date_limite || null,
    montant_demande: montant_demande || null,
    notes: (notes || "").trim(),
    archivee: false,
    date_creation: todayISO(),
    // Module Activites v2 : heure/lieu/responsable/budget sont tous
    // facultatifs (une sortie improvisee n'a pas forcement de lieu fixe a
    // l'avance) ; type retombe sur "evenement" si non precise.
    heure: heure || null,
    lieu: (lieu || "").trim(),
    id_responsable: id_responsable || null,
    budget: budget || null,
    type: type || "evenement",
    annulee: false,
  });
  await log("liste", "creee", id);
  return id;
}
async function modifierListe(id, patch) {
  await db.listes.update(id, patch);
  await log("liste", "modifiee", id);
}
async function supprimerListe(id) {
  await db.liste_membres.where("id_liste").equals(id).delete();
  await db.listes.delete(id);
  await log("liste", "supprimee", id);
}
async function archiverListe(id, archivee) {
  await db.listes.update(id, { archivee });
  await log("liste", archivee ? "archivee" : "desarchivee", id);
}
async function dupliquerListe(id) {
  const src = await db.listes.get(id);
  if (!src) return null;
  const newId = uid();
  await db.listes.add({
    ...src,
    id: newId,
    nom: src.nom + " (copie)",
    archivee: false,
    cloturee: false,
    annulee: false,
    date_creation: todayISO(),
  });

  // On copie la structure des frais (libelle + montant), mais jamais
  // l'historique de paiement : une activite dupliquee est une nouvelle
  // activite, elle recommence sans argent deja recu.
  const anciensFrais = await listeFraisAll(id);
  const correspondanceFrais = {}; // ancien id_frais -> nouvel id_frais
  for (const f of anciensFrais) {
    const nouvelId = uid();
    correspondanceFrais[f.id] = nouvelId;
    await db.liste_frais.add({
      id: nouvelId,
      id_liste: newId,
      libelle: f.libelle,
      montant: f.montant,
      ordre: f.ordre,
    });
  }

  const membres = await db.liste_membres.where("id_liste").equals(id).toArray();
  for (const lm of membres) {
    await db.liste_membres.add({
      id: uid(),
      id_liste: newId,
      id_membre: lm.id_membre,
      // Le choix des frais est reporte (adapte aux nouveaux id de frais),
      // mais chacun repart avec paye = 0 puisqu'aucun paiement n'est copie.
      frais_choisis: (lm.frais_choisis || [])
        .map((fid) => correspondanceFrais[fid])
        .filter(Boolean),
    });
  }
  await log("liste", "dupliquee", newId);
  return newId;
}
// membresDeListe : renvoie les fiches membres inscrits a une liste, avec
// leurs frais choisis fusionnes dans l'objet.
async function membresDeListe(idListe) {
  const inscriptions = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .toArray();
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  return inscriptions
    .map((ins) =>
      memById[ins.id_membre]
        ? {
            ...memById[ins.id_membre],
            _inscriptionId: ins.id,
            // frais_choisis (v6) : quels postes financiers concernent ce
            // membre pour cette activite -- voir calculerMontantAttendu.
            frais_choisis: ins.frais_choisis || [],
          }
        : null,
    )
    .filter(Boolean)
    .sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom));
}
async function ajouterMembreListe(idListe, idMembre) {
  const existe = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .first();
  if (existe) return;
  await db.liste_membres.add({
    id: uid(),
    id_liste: idListe,
    id_membre: idMembre,
  });
  await log("liste", "membre_ajoute", `${idListe}:${idMembre}`);
}
async function retirerMembreListe(idListe, idMembre) {
  await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .delete();
  await log("liste", "membre_retire", `${idListe}:${idMembre}`);
}

// ---------------------------------------------------------------
// FRAIS D'ACTIVITE (v6) — postes financiers d'une liste/activite. Une
// activite peut n'avoir aucun frais (simple liste de participants sans
// argent), un seul (cas historique "Participation"), ou plusieurs
// (participation + piscine + transport...). Chaque membre choisit ensuite
// lesquels le concernent : le montant attendu se calcule TOUJOURS a partir
// de ce choix, il n'est jamais fige sur la ligne du membre.
// ---------------------------------------------------------------
async function listeFraisAll(idListe) {
  const frais = await db.liste_frais
    .where("id_liste")
    .equals(idListe)
    .toArray();
  return frais.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
}

async function ajouterFraisListe(idListe, { libelle, montant, ordre } = {}) {
  if (!libelle || !libelle.trim())
    throw new Error("Le libelle du frais est obligatoire");
  const m = Number(montant);
  if (!Number.isFinite(m) || m < 0) throw new Error("Montant de frais invalide");
  const id = uid();
  const nbExistants = await db.liste_frais
    .where("id_liste")
    .equals(idListe)
    .count();
  await db.liste_frais.add({
    id,
    id_liste: idListe,
    libelle: libelle.trim(),
    montant: m,
    // "??" n'est pas supporte avant Safari 13.1 (absent sur iOS 12) et
    // casse le PARSING de tout le fichier, pas seulement cette fonction --
    // meme piege que documente plus haut dans ce fichier (voir dettesList).
    ordre: ordre !== undefined ? ordre : nbExistants,
  });
  await log("liste_frais", "cree", `${idListe}:${id}`);
  return id;
}

// modifierFraisListe : change le libelle/montant d'un frais SANS jamais
// toucher a liste_paiements -- l'historique deja encaisse reste intact,
// seul le montant attendu (recalcule a la volee) evolue pour la suite.
async function modifierFraisListe(idFrais, patch) {
  if (patch.montant !== undefined) {
    const m = Number(patch.montant);
    if (!Number.isFinite(m) || m < 0)
      throw new Error("Montant de frais invalide");
    patch.montant = m;
  }
  await db.liste_frais.update(idFrais, patch);
  await log("liste_frais", "modifie", idFrais);
}

async function supprimerFraisListe(idFrais) {
  await db.liste_frais.delete(idFrais);
  // Un frais supprime doit disparaitre des choix de chaque participant qui
  // l'avait selectionne, sinon un id de frais fantome resterait dans
  // frais_choisis et fausserait le calcul du montant attendu.
  const membres = await db.liste_membres.toArray();
  for (const lm of membres) {
    if (lm.frais_choisis && lm.frais_choisis.includes(idFrais)) {
      await db.liste_membres.update(lm.id, {
        frais_choisis: lm.frais_choisis.filter((f) => f !== idFrais),
      });
    }
  }
  await log("liste_frais", "supprime", idFrais);
}

// definirFraisChoisisMembre : enregistre quels postes financiers concernent
// ce membre pour cette activite (ex : Jean prend "Participation" +
// "Piscine" mais pas "Transport"). C'est cette selection, et elle seule,
// qui determine son montant attendu.
async function definirFraisChoisisMembre(idListe, idMembre, fraisIds) {
  const row = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .first();
  if (!row) return;
  await db.liste_membres.update(row.id, { frais_choisis: fraisIds || [] });
}

// calculerMontantAttendu : somme des frais choisis par le membre. Une
// activite "gratuite" (aucun frais defini, ou membre n'ayant rien choisi)
// renvoie naturellement 0 -- les champs financiers ne sont donc jamais
// obligatoires pour une activite.
async function calculerMontantAttendu(idListe, idMembre) {
  const row = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .first();
  if (!row || !row.frais_choisis || !row.frais_choisis.length) return 0;
  const frais = await listeFraisAll(idListe);
  const parId = Object.fromEntries(frais.map((f) => [f.id, f]));
  return row.frais_choisis.reduce(
    (total, fid) => total + (parId[fid] ? parId[fid].montant : 0),
    0,
  );
}

// ---------------------------------------------------------------
// PAIEMENTS D'ACTIVITE (v6) — historique reel, sur le meme principe que le
// module cotisations : on n'ecrase jamais un montant, on ajoute une ligne.
// Le montant paye et le statut se recalculent toujours a partir de cet
// historique, jamais stockes tels quels.
// ---------------------------------------------------------------
async function historiquePaiementsListe(idListe, idMembre) {
  const rows = await db.liste_paiements
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .toArray();
  return rows.sort((a, b) =>
    (b.date + (b.heure || "")).localeCompare(a.date + (a.heure || "")),
  );
}

async function calculerMontantPaye(idListe, idMembre) {
  const historique = await historiquePaiementsListe(idListe, idMembre);
  return historique.reduce((total, p) => total + p.montant, 0);
}

// getStatutPaiementActivite : SEUL endroit ou la regle "non paye / partiel /
// paye / surpaye" est ecrite. Toute l'app (tableau des participants,
// dashboard, export) doit passer par cette fonction pour rester coherente
// -- on evite ainsi de dupliquer ce calcul a plusieurs endroits.
function getStatutPaiementActivite(attendu, paye) {
  if (paye <= 0) return "non_paye";
  if (paye < attendu) return "partiel";
  if (paye === attendu) return "paye";
  return "surpaye";
}

// infosParticipantActivite : point d'entree unique pour l'UI -- regroupe
// attendu/paye/reste/statut/historique d'un participant en un seul appel,
// pour eviter que chaque ecran ne refasse ses propres calculs.
async function infosParticipantActivite(idListe, idMembre) {
  const [attendu, historique] = await Promise.all([
    calculerMontantAttendu(idListe, idMembre),
    historiquePaiementsListe(idListe, idMembre),
  ]);
  const paye = historique.reduce((total, p) => total + p.montant, 0);
  return {
    attendu,
    paye,
    reste: Math.max(0, attendu - paye),
    statut: getStatutPaiementActivite(attendu, paye),
    historique,
  };
}

// ajouterPaiementListeMembre : enregistre UNE nouvelle ligne de paiement
// (jamais un remplacement du montant precedent). C'est la seule fonction a
// utiliser pour encaisser de l'argent sur une activite -- elle garantit
// que l'historique (section 6 du cahier des charges) est toujours complet.
async function ajouterPaiementListeMembre(
  idListe,
  idMembre,
  { montant, commentaire } = {},
) {
  const m = Number(montant);
  if (!Number.isFinite(m) || m <= 0)
    throw new Error("Montant de paiement invalide");
  const membreExiste = await db.membres.get(idMembre);
  if (!membreExiste) throw new Error("Membre introuvable");

  const id = uid();
  const maintenant = new Date();
  await db.liste_paiements.add({
    id,
    id_liste: idListe,
    id_membre: idMembre,
    montant: m,
    date: todayISO(),
    heure: maintenant.toTimeString().slice(0, 5),
    commentaire: (commentaire || "").trim(),
  });
  await log("liste_paiement", "ajoute", `${idListe}:${idMembre}:${m}`);
  return id;
}

// ---------------------------------------------------------------
// CLOTURE D'ACTIVITE (v6) — la date limite ne supprime jamais rien, elle
// change seulement ce que l'utilisateur peut faire (inscription,
// paiement) ; un administrateur peut toujours forcer la reouverture.
// ---------------------------------------------------------------
// activiteEstOuverte : le flag manuel "cloturee" (force par un
// administrateur) a toujours priorite sur le calcul automatique par date.
// Sans flag manuel, l'activite reste ouverte tant qu'aucune date limite
// n'est definie ou qu'elle n'est pas encore depassee.
function activiteEstOuverte(liste) {
  if (typeof liste.cloturee === "boolean") return !liste.cloturee;
  if (!liste.date_limite) return true;
  return todayISO() <= liste.date_limite;
}

async function clotureActivite(idListe, cloturee) {
  await db.listes.update(idListe, { cloturee });
  await log("liste", cloturee ? "cloturee" : "reouverte", idListe);
}

// ---------------------------------------------------------------
// STATISTIQUES D'ACTIVITE (v6) — pour le dashboard. Calculees a la demande
// a partir des memes fonctions centralisees ci-dessus, donc toujours
// coherentes avec ce qu'affiche le tableau des participants.
// ---------------------------------------------------------------
async function statistiquesActivite(idListe) {
  const membres = await membresDeListe(idListe);
  const infos = await Promise.all(
    membres.map((m) => infosParticipantActivite(idListe, m.id)),
  );
  const montantAttendu = infos.reduce((a, i) => a + i.attendu, 0);
  const montantEncaisse = infos.reduce((a, i) => a + i.paye, 0);
  return {
    participants: membres.length,
    payes: infos.filter((i) => i.statut === "paye").length,
    partiels: infos.filter((i) => i.statut === "partiel").length,
    nonPayes: infos.filter((i) => i.statut === "non_paye").length,
    surpayes: infos.filter((i) => i.statut === "surpaye").length,
    montantAttendu,
    montantEncaisse,
    resteAEncaisser: Math.max(0, montantAttendu - montantEncaisse),
    tauxPaiement:
      montantAttendu > 0
        ? Math.round((montantEncaisse / montantAttendu) * 1000) / 10
        : 0,
  };
}

// ---------------------------------------------------------------
// RAPPORT GENERAL — toutes les statistiques utilisees par le tableau de
// bord et les exports PDF du rapport complet. Rassemble ici pour
// n'avoir cette logique ecrite qu'une seule fois.
// ---------------------------------------------------------------
async function rapportStats() {
  const [membres, joursStats, dettesTotal, solde, listes] = await Promise.all([
    listMembres(),
    joursAvecStats(),
    totalDettesImpayees(),
    caisseSolde(),
    listesAll(),
  ]);
  const totalCollecte = joursStats.reduce((a, j) => a + j.totalCollecte, 0);
  const totalDistribue = joursStats.reduce((a, j) => a + j.giftNeeded, 0);

  const parFonction = {};
  membres.forEach((m) => {
    const f = m.fonction || "Membre";
    parFonction[f] = (parFonction[f] || 0) + 1;
  });

  const parMois = MOIS_NOMS.map((nom, i) => ({
    mois: nom,
    nb: membres.filter((m) => m.mois_anniversaire === i + 1).length,
  }));

  const tauxParticipationGlobal = joursStats.length
    ? joursStats.reduce(
        (a, j) => a + (j.nbTotal ? j.nbPayants / j.nbTotal : 0),
        0,
      ) / joursStats.length
    : 0;

  return {
    genereLe: todayISO(),
    totalMembres: membres.length,
    parFonction,
    parMois,
    nbDimanches: joursStats.length,
    totalCollecte,
    totalDistribue,
    solde,
    dettesTotal,
    tauxParticipationGlobal,
    joursStats,
    nbListes: listes.filter((l) => !l.archivee).length,
    nbListesArchivees: listes.filter((l) => l.archivee).length,
  };
}

// ------------------------------------------------------------------
// RAPPORT INDIVIDUEL D'UN MEMBRE — rassemble tout ce qui concerne UN SEUL
// membre pour pouvoir lui envoyer sa propre fiche complete : detail de
// chaque collecte (paye/non paye, montant, pour qui c'etait s'il s'agit
// d'un anniversaire), sa dette envers le GROUPE (detail semaine par
// semaine), et les prets PERSONNELS entre membres ou il est implique --
// aussi bien comme debiteur (il doit a quelqu'un) que comme preteur
// (quelqu'un lui doit).
// ------------------------------------------------------------------
async function rapportIndividuelMembre(idMembre) {
  const membre = await db.membres.get(idMembre);
  if (!membre) throw new Error("Membre introuvable.");

  const historique = await historiquePaiementsMembre(idMembre);
  const totalCollecteAttendu = historique.reduce(
    (a, h) => a + h.montant_attendu,
    0,
  );
  const totalCollectePaye = historique
    .filter((h) => h.a_paye)
    .reduce((a, h) => a + h.montant_attendu, 0);

  // Dette envers le groupe : cotisations non payees de ce membre.
  const detteGroupeDetail = (await dettesList()).filter(
    (d) => d.id_membre === idMembre && d.statut === "Impayee",
  );
  const detteGroupeTotal = detteGroupeDetail.reduce((a, d) => a + d.montant, 0);

  // Prets entre membres : ce membre comme DEBITEUR (il doit rembourser).
  const tousLesPrets = await pretsMembres();
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) =>
    memById[id] ? `${memById[id].nom} ${memById[id].prenom}`.trim() : "?";
  const pretsADevoir = tousLesPrets
    .filter((p) => p.id_debiteur === idMembre)
    .map((p) => ({ ...p, autreMembre: nomOf(p.id_preteur) }));
  const pretsADevoirEnAttente = pretsADevoir.filter((p) => !p.rembourse);
  const pretsADevoirTotal = pretsADevoirEnAttente.reduce(
    (a, p) => a + p.montant,
    0,
  );

  // Prets entre membres : ce membre comme PRETEUR (on lui doit de l'argent).
  const pretsAPRecevoir = tousLesPrets
    .filter((p) => p.id_preteur === idMembre)
    .map((p) => ({ ...p, autreMembre: nomOf(p.id_debiteur) }));
  const pretsARecevoirEnAttente = pretsAPRecevoir.filter((p) => !p.rembourse);
  const pretsARecevoirTotal = pretsARecevoirEnAttente.reduce(
    (a, p) => a + p.montant,
    0,
  );

  return {
    membre,
    genereLe: todayISO(),
    historique,
    totalCollecteAttendu,
    totalCollectePaye,
    detteGroupeDetail,
    detteGroupeTotal,
    pretsADevoir,
    pretsADevoirEnAttente,
    pretsADevoirTotal,
    pretsAPRecevoir,
    pretsARecevoirEnAttente,
    pretsARecevoirTotal,
  };
}