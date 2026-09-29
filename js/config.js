/**
 * @file config.js - Constantes et configurations de l'application M3D Gestion.
 *
 * ROLE DE CE FICHIER
 * ------------------
 * Ce fichier regroupe toutes les valeurs "fixes" de l'application : des données
 * qui ne changent jamais pendant l'exécution du programme (les mois de l'année,
 * les rôles des membres, les catégories de dépenses, etc.).
 *
 * POURQUOI CENTRALISER LES CONSTANTES ICI ?
 * -----------------------------------------
 * Principe DRY (Don't Repeat Yourself = "Ne te répète pas") : si la liste des
 * fonctions associatives doit changer, on la modifie en UN seul endroit au lieu
 * de traquer toutes les copies dispersées dans le code. Sans ce fichier, la même
 * liste pourrait se retrouver dans membres.js, exports.js, rapports.js... avec
 * le risque que certaines copies soient oubliées lors d'une mise à jour.
 *
 * CONSTANTE vs VARIABLE
 * ----------------------
 * Une VARIABLE (mot-clé "let") peut être réassignée : let x = 5; x = 10; // OK
 * Une CONSTANTE (mot-clé "const") ne peut pas être réassignée :
 *   const x = 5; x = 10; // ERREUR !
 * Mais attention : "const" protège l'assignation, pas le contenu d'un tableau.
 *   const tab = [1, 2]; tab.push(3); // OK ! Le tableau est modifié.
 * C'est pour ça qu'on utilise Object.freeze() (voir ci-dessous).
 *
 * Object.freeze() : PROTECTION PROFONDE
 * ---------------------------------------
 * Object.freeze(valeur) "gèle" un tableau ou un objet : toute tentative de
 * modification (ajout, suppression, modification d'élément) est silencieusement
 * ignorée en mode normal, ou lève une erreur en mode strict.
 *   const arr = Object.freeze(["a", "b"]);
 *   arr.push("c"); // ignoré silencieusement (ou erreur en "use strict")
 *   arr[0] = "z"; // ignoré aussi
 * Résultat : nos listes sont véritablement immuables, ce qui empêche un bug
 * accidentel dans un autre module de corrompre les données de référence.
 *
 * COMMUNICATION AVEC D'AUTRES FICHIERS
 * -------------------------------------
 * config.js est le PREMIER fichier chargé (après Dexie.js). Il n'importe rien,
 * mais tout le reste en dépend : utils.js, db.js, modules/*, etc.
 * Les constantes déclarées ici sont disponibles globalement dans toute l'app.
 */

// ============================================================================
// CALENDRIER & DATES
// ============================================================================

/**
 * Noms complets des douze mois en français pour l'affichage et les filtres.
 *
 * POURQUOI ce tableau ?
 * JavaScript connaît les mois via l'objet Date, mais dans la langue du système
 * de l'utilisateur, ce qui est imprévisible. En définissant nous-mêmes cette
 * liste, l'affichage est toujours en français, quelle que soit la langue du
 * téléphone ou du navigateur.
 *
 * L'index 0 correspond à Janvier, l'index 11 à Décembre. Attention : dans
 * l'objet Date de JavaScript, les mois vont aussi de 0 (Janvier) à 11
 * (Décembre) — d'où l'expression courante "mois + 1" pour afficher des chiffres
 * lisibles par un humain.
 *
 * Object.freeze() rend ce tableau immuable (voir l'en-tête du fichier).
 *
 * @type {readonly string[]}
 */
const MOIS_NOMS = Object.freeze([
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
]);

// ============================================================================
// MEMBRES & ORGANISATION
// ============================================================================

/**
 * Fonctions et responsabilités officielles au sein de la Jeunesse M3D.
 * Utilisées pour le filtrage et les sélecteurs du formulaire membre.
 *
 * POURQUOI une liste figée ?
 * Avoir une liste officielle évite les fautes de frappe et les doublons dans
 * la base de données ("Tresorier" vs "trésorier" vs "Trésorière"). Elle
 * alimente directement le menu déroulant du formulaire d'ajout/édition de
 * membre, garantissant une saisie normalisée.
 *
 * "Membre" est placé en premier car c'est la valeur par défaut : la plupart
 * des inscriptions ne précisent pas de rôle particulier.
 *
 * @type {readonly string[]}
 */
const FONCTIONS = Object.freeze([
  "Membre",
  "President",
  "Vice-president",
  "Secretaire",
  "Secretaire adjoint",
  "Tresorier",
  "Tresorier adjoint",
  "Conseiller",
  "Charge des activites",
  "Charge de communication",
  "Responsable protocole",
  "Responsable priere",
  "Responsable musique",
]);

// ============================================================================
// CAISSE & DEPENSES
// ============================================================================

/**
 * Catégories standard pour la ventilation et le suivi des sorties de caisse.
 * Indexées dans le schéma IndexedDB (v8) pour le rapport de dépenses.
 *
 * POURQUOI des catégories prédéfinies ?
 * Elles permettent de regrouper les dépenses pour les rapports : "combien
 * avons-nous dépensé en transport ce mois-ci ?". Sans catégorisation, chaque
 * dépense est une ligne isolée et les totaux par poste sont impossibles.
 *
 * Ces catégories sont intentionnellement génériques pour couvrir la grande
 * majorité des dépenses d'une association paroissiale de jeunesse.
 *
 * @type {readonly string[]}
 */
const CATEGORIES_DEPENSE = Object.freeze([
  "Transport",
  "Nourriture",
  "Impression",
  "Sono",
  "Divers",
]);

// ============================================================================
// MODULE ACTIVITES
// ============================================================================

/**
 * Types d'activités organisationnelles et leurs libellés d'affichage.
 *
 * POURQUOI un objet clé/valeur et pas un simple tableau ?
 * La clé (ex: "sortie") est ce qui est stocké dans la base de données : une
 * valeur courte, sans accent, insensible à la langue. Le libellé (ex: "Sortie")
 * est ce qui est affiché à l'utilisateur. Cette séparation permet de changer
 * l'affichage sans toucher les données stockées.
 *
 * Record<string, string> signifie : un objet dont toutes les clés et valeurs
 * sont des chaînes de caractères.
 *
 * @type {Readonly<Record<string, string>>}
 */
const TYPE_ACTIVITE_LABELS = Object.freeze({
  sortie: "Sortie",
  reunion: "Reunion",
  voyage: "Voyage",
  collecte: "Collecte",
  anniversaire: "Anniversaire",
  evenement: "Evenement",
});

/**
 * Liste des clés (identifiants techniques) des types d'activité.
 * Généré automatiquement depuis TYPE_ACTIVITE_LABELS pour éviter de maintenir
 * deux listes en parallèle (principe DRY).
 *
 * Object.keys() retourne un tableau des noms de propriétés d'un objet :
 *   Object.keys({ a: 1, b: 2 }) => ["a", "b"]
 *
 * @type {readonly string[]}
 */
const TYPE_ACTIVITE_KEYS = Object.freeze(Object.keys(TYPE_ACTIVITE_LABELS));

/**
 * Libellés lisibles associés au statut temporel d'une activité.
 *
 * Les statuts sont calculés dynamiquement à partir de la date de l'activité
 * (pas stockés en base), ce qui garantit qu'une activité passée bascule
 * automatiquement en "terminee" sans intervention manuelle.
 *
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_ACTIVITE_LABEL = Object.freeze({
  a_venir: "A venir",
  en_cours: "En cours",
  terminee: "Terminee",
  annulee: "Annulee",
});

/**
 * Classes CSS de badges associées au statut d'une activité.
 *
 * POURQUOI séparer les labels des classes CSS ?
 * Parce que la présentation (CSS) est distincte des données (labels). Si
 * demain on renomme la classe "badge-info" en "badge-bleu", on ne change
 * qu'ici, sans toucher aux libellés ni à la logique métier.
 *
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_ACTIVITE_BADGE = Object.freeze({
  a_venir: "badge-info",
  en_cours: "badge-partiel",
  terminee: "badge-yes",
  annulee: "badge-danger",
});

/**
 * Libellés lisibles associés au statut financier d'un participant sur une activité.
 *
 * Un participant peut être dans quatre situations :
 * - "non_paye" : n'a encore rien versé
 * - "partiel" : a versé une partie de la somme demandée
 * - "paye" : a versé exactement la somme demandée
 * - "surpaye" : a versé plus que demandé (avance ou erreur)
 *
 * Ces statuts sont recalculés à chaque affichage depuis l'historique des
 * paiements (principe Event Sourcing de l'application).
 *
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_PAIEMENT_LABEL = Object.freeze({
  non_paye: "Non paye",
  partiel: "Partiel",
  paye: "Paye",
  surpaye: "Surpaye",
});

/**
 * Classes CSS de badges associées au statut de paiement d'un participant.
 * Même logique de séparation données/présentation que pour STATUT_ACTIVITE_BADGE.
 *
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_PAIEMENT_BADGE = Object.freeze({
  non_paye: "badge-no",
  partiel: "badge-partiel",
  paye: "badge-yes",
  surpaye: "badge-surpaye",
});

// ============================================================================
// NAVIGATION & SÉCURITÉ DE SESSION
// ============================================================================

/**
 * Identifiants techniques des onglets de navigation principale de l'application.
 *
 * Ces identifiants servent de valeurs de routage interne : quand l'utilisateur
 * tape sur "Membres", l'app appelle showTab("membres"), qui cherche cet
 * identifiant dans la liste pour afficher le bon contenu.
 *
 * "accueil" est le premier onglet affiché au démarrage.
 * "plus" est le menu secondaire regroupant les fonctions avancées.
 *
 * @type {readonly string[]}
 */
const TABS = Object.freeze(["accueil", "membres", "dimanche", "dettes", "plus"]);

/**
 * Durée maximale d'inactivité en arrière-plan avant reverrouillage automatique.
 * Exprimée en minutes pour être lisible par un humain dans le code source.
 *
 * POURQUOI 30 minutes ?
 * C'est un compromis entre confort (ne pas avoir à ressaisir le mot de passe
 * toutes les 5 minutes) et sécurité (si quelqu'un oublie son téléphone
 * déverrouillé, l'accès admin expire dans un délai raisonnable).
 *
 * @type {number}
 */
const SESSION_TIMEOUT_MINUTES = 30;

/**
 * Durée maximale d'inactivité convertie en millisecondes.
 *
 * POURQUOI convertir en millisecondes ?
 * Parce que toutes les fonctions JavaScript qui mesurent le temps
 * (Date.now(), setTimeout, setInterval) travaillent en millisecondes.
 * Stocker la valeur "humaine" (30 min) séparément de la valeur "machine"
 * (1 800 000 ms) évite de refaire ce calcul dans chaque fichier.
 *
 * Calcul : 30 min × 60 secondes × 1000 ms = 1 800 000 ms
 *
 * @type {number}
 */
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Logo vectoriel officiel de la Jeunesse M3D au format SVG inline.
 *
 * POURQUOI stocker le SVG ici et pas dans un fichier séparé ?
 * Un SVG inline peut être coloré directement via CSS (propriété "color" /
 * "currentColor"), ce qui permet au logo de s'adapter automatiquement aux
 * thèmes clair et sombre sans avoir besoin de deux images différentes.
 * Un fichier PNG ou SVG externe ne bénéficierait pas de cette flexibilité.
 *
 * "aria-hidden='true'" indique aux lecteurs d'écran que cette image est
 * purement décorative et peut être ignorée.
 *
 * @type {string}
 */
const LOGO_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" class="brand-logo" fill="none" aria-hidden="true">
  <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="2"/>
  <path d="M12 26V14l8 8 8-8v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
