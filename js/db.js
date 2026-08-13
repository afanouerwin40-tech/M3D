// db.js — Schema IndexedDB (Dexie) + donnees de depart + requetes derivees
// Principe : Paiements est la seule source de verite pour l'argent lie aux
// collectes. Dettes et le volet "collecte" de la Caisse ne sont JAMAIS
// stockes : ils sont toujours recalcules a la volee depuis Paiements.

// Polyfill Object.fromEntries : cette methode n'existe PAS sur Safari 12.0
// (elle n'a ete ajoutee qu'en Safari 12.1). Comme certains vieux iPad
// restent bloques en 12.0/12.1 selon le modele, on la definit nous-memes
// si absente, plutot que de faire confiance a la version exacte du WebKit
// de l'appareil. Utilisee 8 fois dans app.js/db.js -- sans ce polyfill,
// chaque appel plante avec "Object.fromEntries is not a function".
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

const db = new Dexie("m3d_db");

db.version(1).stores({
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
  caisse_mouvements: "id, date, type",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
});

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
// uid() : genere un identifiant unique. crypto.randomUUID() n'existe pas
// avant Safari 15.4 (donc absent sur iOS 12, comme sur un iPad mini 2).
// On utilise crypto.getRandomValues (supporte depuis Safari 6 / iOS 6.1)
// avec un repli sur Math.random si crypto n'est pas du tout disponible.
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const MOIS_NOMS = [
  "Janvier",
  "Fevrier",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Aout",
  "Septembre",
  "Octobre",
  "Novembre",
  "Decembre",
];

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
  const rembByPaiement = new Set(remb.map((r) => r.id_paiement_concerne));
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));

  const rows = [];
  for (const p of impayes) {
    const rembourse = rembByPaiement.has(p.id);
    const dim = dimById[p.id_dimanche];
    rows.push({
      id_paiement: p.id,
      id_membre: p.id_membre,
      membre: memById[p.id_membre]
        ? `${memById[p.id_membre].nom} ${memById[p.id_membre].prenom}`.trim()
        : "?",
      telephone: memById[p.id_membre] ? memById[p.id_membre].telephone : "",
      date: dim ? dim.date : "?",
      montant: p.montant_attendu,
      statut: rembourse ? "Remboursee" : "Impayee",
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
  });
  await log("caisse", "ajustement", `${avant.solde} F -> ${montantReel} F`);
  return { ecart };
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
function isoToDate(iso) {
  return new Date(iso + "T00:00:00");
}
function dateToIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  for (const d of dettesImpayees) {
    const key = d.id_membre;
    if (!parMembre.has(key))
      parMembre.set(key, {
        id_membre: key,
        nom: d.membre,
        telephone: d.telephone,
        montantDette: 0,
        irregulier: false,
      });
    parMembre.get(key).montantDette += d.montant;
  }
  for (const id of irreguliersIds) {
    if (!parMembre.has(id)) {
      const m = await db.membres.get(id);
      if (!m) continue;
      parMembre.set(id, {
        id_membre: id,
        nom: `${m.nom} ${m.prenom}`,
        telephone: m.telephone,
        montantDette: 0,
        irregulier: true,
      });
    } else {
      parMembre.get(id).irregulier = true;
    }
  }
  return Array.from(parMembre.values()).sort((a, b) =>
    a.nom.localeCompare(b.nom),
  );
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
// MODULE "MES LISTES" — independant des cotisations d'anniversaire.
// Une liste = un evenement/groupe (sortie, reunion, camp...) avec ses
// propres membres inscrits, chacun marque present/absent/en attente.
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
  couleur,
  icone,
  montant_demande,
  notes,
}) {
  const id = uid();
  await db.listes.add({
    id,
    nom: nom.trim(),
    description: (description || "").trim(),
    date: date || todayISO(),
    couleur: couleur || "#2563EB",
    icone: icone || "star",
    montant_demande: montant_demande || null,
    notes: (notes || "").trim(),
    archivee: false,
    date_creation: todayISO(),
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
    date_creation: todayISO(),
  });
  const membres = await db.liste_membres.where("id_liste").equals(id).toArray();
  for (const lm of membres) {
    await db.liste_membres.add({
      id: uid(),
      id_liste: newId,
      id_membre: lm.id_membre,
      presence: "attente",
    });
  }
  await log("liste", "dupliquee", newId);
  return newId;
}
// membresDeListe : renvoie les fiches membres inscrits a une liste, avec leur
// statut de presence ("present" | "absent" | "attente") fusionne dans l'objet.
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
            presence: ins.presence || "attente",
            paye: !!ins.paye,
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
    presence: "attente",
    paye: false,
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
async function definirPresenceListe(idListe, idMembre, presence) {
  const row = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .first();
  if (!row) return;
  await db.liste_membres.update(row.id, { presence });
}
// definirPaiementListe : suivi du paiement de la participation demandee
// (liste.montant_demande), independant de la presence. Utile pour une
// sortie/un camp payant ou l'on veut savoir qui a regle sa part.
async function definirPaiementListe(idListe, idMembre, paye) {
  const row = await db.liste_membres
    .where("id_liste")
    .equals(idListe)
    .and((x) => x.id_membre === idMembre)
    .first();
  if (!row) return;
  await db.liste_membres.update(row.id, { paye });
}

// ---------------------------------------------------------------
// RAPPORT GENERAL — toutes les statistiques utilisees par le tableau de
// bord et les exports (PDF/Excel) du rapport complet. Rassemble ici pour
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

  // Regularite : sur l'ensemble des dimanches, combien de fois chaque membre a paye / n'a pas paye.
  const compteur = {};
  membres.forEach((m) => {
    compteur[m.id] = { membre: m, paye: 0, total: 0 };
  });
  for (const j of joursStats) {
    for (const p of j.paiements) {
      if (!compteur[p.id_membre]) continue;
      compteur[p.id_membre].total++;
      if (p.a_paye) compteur[p.id_membre].paye++;
    }
  }
  const regularite = Object.values(compteur)
    .filter((c) => c.total > 0)
    .map((c) => ({
      membre: c.membre,
      taux: c.paye / c.total,
      paye: c.paye,
      total: c.total,
    }));
  // AVANT : plusReguliers et absents venaient du MEME classement (le meme
  // tableau "regularite"), juste trie dans un sens puis dans l'autre, avec
  // un simple "top 10" de chaque cote. Probleme : avec peu de membres ayant
  // assez d'historique, un membre plutot regulier (ex. 65% de presence)
  // pouvait finir dans le "top 10 des plus absents" simplement parce qu'il
  // etait en bas du classement -- alors qu'il n'est pas vraiment absent.
  // MAINTENANT : deux seuils clairs et INDEPENDANTS. Un membre n'apparait
  // dans "les plus reguliers" que s'il a un taux de presence >= 80%, et
  // dans "les plus absents" que s'il a un taux <= 40%. Un membre "moyen"
  // (entre les deux) n'apparait dans aucune des deux listes -- c'est
  // volontaire : il n'est ni notablement regulier, ni notablement absent.
  const SEUIL_REGULIER = 0.8;
  const SEUIL_ABSENT = 0.4;
  // Liste COMPLETE (pas de slice(0, 10)) : le rapport doit montrer tous
  // les membres concernes, pas seulement les 10 premiers.
  const plusReguliers = regularite
    .filter((r) => r.total >= 2 && r.taux >= SEUIL_REGULIER)
    .sort((a, b) => b.taux - a.taux || b.total - a.total);
  const absents = regularite
    .filter((r) => r.total >= 2 && r.taux <= SEUIL_ABSENT)
    .sort((a, b) => a.taux - b.taux || b.total - a.total);

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
    plusReguliers,
    absents,
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