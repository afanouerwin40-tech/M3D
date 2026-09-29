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
