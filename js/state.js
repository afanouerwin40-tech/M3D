/**
 * @file state.js - Gestion de l'état applicatif et de la session utilisateur.
 * @description Centralise l'état global du thème (clair/sombre), la gestion
 * de l'authentification administrateur, le délai de reverrouillage automatique
 * après inactivité en arrière-plan, et l'onglet actif.
 */

// ============================================================================
// ÉTAT GLOBAL APPLICATIF
// ============================================================================

/** @type {string} Onglet actuellement affiché dans l'interface */
let currentTab = "accueil";

/** @type {string|null} Identifiant de la session annuelle active en cours */
let activeSessionId = null;

/**
 * Retourne l'identifiant de l'onglet actif.
 * @returns {string}
 */
function getCurrentTab() {
  return currentTab;
}

/**
 * Définit l'identifiant de l'onglet actif.
 * @param {string} tab - Nom de l'onglet ("accueil", "membres", etc.).
 */
function setCurrentTab(tab) {
  currentTab = tab;
}

/**
 * Retourne l'identifiant de la session annuelle active.
 * @returns {string|null}
 */
function getActiveSessionId() {
  return activeSessionId;
}

/**
 * Définit l'identifiant de la session annuelle active.
 * @param {string} id
 */
function setActiveSessionId(id) {
  activeSessionId = id;
}

// ============================================================================
// GESTION DU THÈME VISUEL (Clair / Sombre)
// ============================================================================

/**
 * Applique un thème visuel au document et le persiste dans le localStorage.
 *
 * @param {"light"|"dark"} mode - Mode de thème à appliquer.
 */
function applyTheme(mode) {
  const safeMode = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", safeMode);
  try {
    localStorage.setItem("m3d_theme", safeMode);
  } catch (e) {
    /* Ignore l'indisponibilité du localStorage en navigation privée stricte */
  }
  // Synchronise la barre système (theme-color) avec le thème réellement
  // appliqué : sans ceci, la balise meta restait figée sur sa valeur par
  // défaut même après une bascule manuelle clair/sombre.
  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) {
    metaTheme.setAttribute("content", safeMode === "dark" ? "#18181B" : "#F5F4F1");
  }
}

/**
 * Initialise le thème dès le chargement du script afin d'éviter tout flash visuel.
 * Si aucun choix n'est mémorisé, applique le thème système de l'appareil.
 */
function initTheme() {
  let mode;
  try {
    mode = localStorage.getItem("m3d_theme");
  } catch (e) {}

  if (!mode && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    mode = "dark";
  }
  applyTheme(mode || "light");
}

/**
 * Bascule dynamiquement entre le thème clair et le thème sombre.
 * @returns {"light"|"dark"} Le nouveau thème appliqué.
 */
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

// ============================================================================
// AUTHENTIFICATION & VÉROUILLAGE AUTOMATIQUE
// ============================================================================

/**
 * Vérifie si la session actuelle est authentifiée.
 * @returns {boolean}
 */
function isSessionAuthed() {
  try {
    return sessionStorage.getItem("m3d_authed") === "1";
  } catch (e) {
    return false;
  }
}

/**
 * Définit l'état d'authentification de la session courante.
 * @param {boolean} authed - Vrai si l'administrateur s'est connecté.
 */
function setSessionAuthed(authed) {
  try {
    if (authed) {
      sessionStorage.setItem("m3d_authed", "1");
      localStorage.removeItem("m3d_hidden_at");
    } else {
      sessionStorage.removeItem("m3d_authed");
      localStorage.removeItem("m3d_hidden_at");
    }
  } catch (e) {}
}

/**
 * Vérifie si l'application a dépassé la durée maximale d'inactivité en arrière-plan.
 * Si le délai est dépassé, clôt la session en mémoire et déclenche la fonction de verrouillage.
 *
 * @param {() => void} [onLockCallback] - Fonction appelée en cas de verrouillage.
 * @returns {boolean} Vrai si la session a été verrouillée pour expiration.
 */
function verrouillerSiExpire(onLockCallback) {
  try {
    if (!isSessionAuthed()) return false;
    const hiddenAt = localStorage.getItem("m3d_hidden_at");
    if (!hiddenAt) return false;

    const tempsInactif = Date.now() - parseInt(hiddenAt, 10);
    if (tempsInactif > SESSION_TIMEOUT_MS) {
      setSessionAuthed(false);
      if (typeof onLockCallback === "function") {
        onLockCallback();
      }
      return true;
    }
  } catch (e) {}
  return false;
}

/**
 * Initialise l'observateur d'arrière-plan (visibilitychange) pour détecter
 * la mise en veille de l'écran ou le changement d'application sans faux positifs.
 *
 * @param {() => void} onLockCallback - Fonction à déclencher si la session expire.
 */
function initVisibilityWatcher(onLockCallback) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try {
        localStorage.setItem("m3d_hidden_at", Date.now().toString());
      } catch (e) {}
    } else {
      verrouillerSiExpire(onLockCallback);
    }
  });
}
