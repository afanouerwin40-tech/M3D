/**
 * @file config.js - Constantes et configurations de l'application M3D Gestion.
 * @description Centralise l'ensemble des valeurs fixes du domaine metier :
 * rôles associatifs, catégories de dépenses, types d'activités, palettes graphiques,
 * jeux d'icônes SVG et délais de sécurité de session.
 */

// ============================================================================
// CALENDRIER & DATES
// ============================================================================

/**
 * Noms complets des douze mois en français pour l'affichage et les filtres.
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

/** @type {readonly string[]} */
const TYPE_ACTIVITE_KEYS = Object.freeze(Object.keys(TYPE_ACTIVITE_LABELS));

/**
 * Libellés associés au statut temporel d'une activité.
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
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_ACTIVITE_BADGE = Object.freeze({
  a_venir: "badge-info",
  en_cours: "badge-partiel",
  terminee: "badge-yes",
  annulee: "badge-danger",
});

/**
 * Libellés associés au statut financier d'un participant sur une activité.
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
 * @type {Readonly<Record<string, string>>}
 */
const STATUT_PAIEMENT_BADGE = Object.freeze({
  non_paye: "badge-no",
  partiel: "badge-partiel",
  paye: "badge-yes",
  surpaye: "badge-surpaye",
});

/**
 * Palette de couleurs sélectionnables pour identifier visuellement les activités.
 * @type {readonly string[]}
 */
const LISTE_COULEURS = Object.freeze([
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#4B5563",
]);

/**
 * Tracés SVG des icônes d'activités (sans balise <svg> englobante).
 * @type {Readonly<Record<string, string>>}
 */
const LISTE_ICONES = Object.freeze({
  star: `<path stroke-linecap="round" stroke-linejoin="round" d="m12 3 2.6 5.9L21 9.6l-4.8 4.2L17.6 21 12 17.6 6.4 21l1.4-7.2L3 9.6l6.4-.7Z"/>`,
  calendar: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M7 3v4M17 3v4M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/>`,
  users: `<path stroke-linecap="round" stroke-linejoin="round" d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1a4 4 0 0 0-3-3.87M15 4.13a3.5 3.5 0 0 1 0 6.74"/>`,
  tent: `<path stroke-linecap="round" stroke-linejoin="round" d="m4 20 8-15 8 15M8 20l4-9 4 9M2 20h20"/>`,
  music: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>`,
  map: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/>`,
  flag: `<path stroke-linecap="round" stroke-linejoin="round" d="M5 21V4m0 1 5-1.5c2.5-.7 4 1.5 6.5.8L18 4v10l-1.5.4c-2.5.7-4-1.5-6.5-.8L5 14"/>`,
  book: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5ZM4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>`,
});

/** @type {readonly string[]} */
const LISTE_ICONE_KEYS = Object.freeze(Object.keys(LISTE_ICONES));

/**
 * Génère le balisage SVG complet pour une icône d'activité donnée.
 *
 * @param {string} icone - Clé de l'icône dans LISTE_ICONES.
 * @param {number} [size=18] - Dimension (largeur/hauteur en pixels).
 * @returns {string} Balise SVG prête à l'insertion HTML.
 */
function listeIconSVG(icone, size = 18) {
  const content = LISTE_ICONES[icone] || LISTE_ICONES.star;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${content}</svg>`;
}

// ============================================================================
// NAVIGATION & SÉCURITÉ DE SESSION
// ============================================================================

/**
 * Identifiants des onglets de navigation principale.
 * @type {readonly string[]}
 */
const TABS = Object.freeze(["accueil", "membres", "dimanche", "dettes", "plus"]);

/**
 * Durée d'inactivité en arrière-plan (en minutes) avant reverrouillage automatique.
 * L'application exige alors à nouveau le mot de passe administrateur.
 * @type {number}
 */
const SESSION_TIMEOUT_MINUTES = 30;

/** @type {number} */
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

/**
 * Logo vectoriel officiel de la Jeunesse M3D.
 * @type {string}
 */
const LOGO_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" class="brand-logo" fill="none" aria-hidden="true">
  <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="2"/>
  <path d="M12 26V14l8 8 8-8v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
