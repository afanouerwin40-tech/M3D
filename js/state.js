/**
 * @file state.js - Gestion de l'état applicatif et de la session utilisateur.
 *
 * ROLE DE CE FICHIER
 * ------------------
 * Ce fichier est le "mémoire vive" de l'application. Il contient les quelques
 * informations qui :
 *   - sont connues à un moment donné (onglet affiché, session annuelle active),
 *   - doivent être accessibles depuis n'importe quel module du programme,
 *   - ne doivent PAS être perdues quand on change d'onglet ou qu'on rerend un
 *     composant de l'interface.
 *
 * QU'EST-CE QUE L'ÉTAT GLOBAL ?
 * ----------------------------
 * L'"état" (state en anglais), c'est l'ensemble des données dont la valeur
 * influence ce que l'application affiche. Sans état, l'application serait une
 * page figée.
 *
 * Exemples d'état dans M3D Gestion :
 *   - "l'onglet Membres est actuellement affiché" -> currentTab
 *   - "la session annuelle 2026 est en cours"        -> activeSessionId
 *   - "l'utilisateur est connecté en admin"         -> sessionStorage
 *   - "le thème est sombre"                          -> localStorage
 *
 * DANS UNE APPLICATION GRANDE, L'ÉTAT EST GÉRÉ PAR UN "STORE" (magasin) :
 * un objet unique qui regroupe tout l'état et des méthodes pour le lire ou le
 * modifier. L'accès se fait alors toujours par des fonctions dédiées
 * (getCurrentTab / setCurrentTab), jamais en écrivant directement dans la
 * variable. C'est exactement ce que fait ce fichier, mais à l'échelle d'une
 * application sans-framework.
 *
 * POURQUOI UN FICHIER DÉDIÉ PLUTÔT QUE DES VARIABLES PARTOUT ?
 * -----------------------------------------------------------
 *   1. UN SEUL ENDROIT À CONSULTER : on sait où chercher l'état.
 *   2. PAS DE CONFLIT D'IMPORTATION : JavaScript n'a pas de système de
 *      modules ES ici (pas de "import/export" utilisé dans ce projet) ; tous
 *      les scripts partagent le même espace global. Un fichier dédié vérifie
 *      qu'une seule variable "currentTab" existe dans tout le programme.
 *   3. SÉPARATION DES RESPONSABILITÉS (voir CLAUDE.md, section 19) : state.js
 *      est le SEUL fichier autorisé à modifier l'état global. Un module métier
 *      qui change l'onglet passe par setCurrentTab(), ce qui laisse une porte
 *      unique pour ajouter plus tard de la journalisation ou des vérifications.
 *
 * COMMUNICATION AVEC D'AUTRES FICHIERS
 * -------------------------------------
 * Dépend de config.js (SESSION_TIMEOUT_MS) et du DOM.
 * Est utilisé par app.js, modules/* et les vues pour lire l'onglet courant ou
 * l'identifiant de session active, et pour appliquer/verrouiller la session.
 *
 * RÉFLEXE DE LECTURE
 * ------------------
 * Dans ce fichier, `let` (et non `const`) est utilisé pour currentTab et
 * activeSessionId : ces deux valeurs sont censées changer pendant la vie de
 * l'application. Toutes les autres valeurs (fonctions, constantes techniques)
 * restent fixes.
 */

// ============================================================================
// ÉTAT GLOBAL APPLICATIF
// ============================================================================

/**
 * Onglet actuellement affiché dans l'interface.
 *
 * "accueil" est la valeur initiale : au démarrage de l'application, on atterrit
 * toujours sur le tableau de bord, jamais sur une page vide.
 *
 * Pourquoi une variable `let` (modifiable) plutôt qu'une constante ? Parce que
 * l'utilisateur change d'onglet en cours de session : showTab("membres") puis
 * showTab("accueil") font muter cette valeur à chaque navigation.
 *
 * @type {string}
 */
let currentTab = "accueil";

/**
 * Identifiant de la session annuelle active en cours (ex: l'année 2026).
 *
 * Qu'est-ce qu'une "session annuelle" ? Dans une association, les cotisations
 * et la caisse sont réinitialisées chaque année. L'application garde donc une
 * notion de session (un exercice comptable) pour séparer les données de 2025
 * de celles de 2026.
 *
 * La valeur est `null` au démarrage : la session réelle est chargée depuis la
 * base de données au moment du démarrage (voir app.js, fonction start()).
 *
 * @type {string|null}
 */
let activeSessionId = null;

/**
 * Retourne l'identifiant de l'onglet actif.
 *
 * POURQUOI une fonction au lieu d'accéder directement à la variable ?
 * Parce que currentTab est déclarée avec `let` dans un fichier global : la lire
 * directement depuis un autre fichier est possible en JavaScript, mais passer
 * par une fonction documente l'intention ("on veut lire l'onglet" plutôt que
 * "on lit une variable par hasard") et laisse la porte ouverte à une future
 * journalisation. C'est le rôle des fonctions "getter".
 *
 * @returns {string} Identifiant de l'onglet actif.
 */
function getCurrentTab() {
  return currentTab;
}

/**
 * Définit l'identifiant de l'onglet actif.
 *
 * Appelée par app.js lors de la navigation (quand l'utilisateur tape sur un
 * onglet de la barre du bas). C'est le "setter" qui modifie currentTab.
 *
 * @param {string} tab - Nom de l'onglet ("accueil", "membres", etc.).
 * @returns {void}
 */
function setCurrentTab(tab) {
  currentTab = tab;
}

/**
 * Retourne l'identifiant de la session annuelle active.
 *
 * Utilisé par de nombreux modules (cotisations, finances, exports PDF) qui ont
 * besoin de savoir dans quel exercice comptable se situer.
 *
 * @returns {string|null} Identifiant de session, ou null si aucune session
 *   n'est encore chargée (typiquement au tout premier démarrage).
 */
function getActiveSessionId() {
  return activeSessionId;
}

/**
 * Définit l'identifiant de la session annuelle active.
 *
 * Appelée au démarrage de l'application (dans start()) une fois la session
 * chargée depuis la base, et lors du changement d'année par l'utilisateur.
 *
 * @param {string} id - Identifiant de la session à activer.
 * @returns {void}
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
 * COMMENT UN THÈME EST APPLIQUÉ EN HTML/CSS ?
 * Le fichier CSS (variables.css) définit des variables qui ont DEUX jeux de
 * valeurs, un par thème :
 *   :root                { --bg: #F5F4F1; --text: #1C1917; }   (clair)
 *   [data-theme="dark"]  { --bg: #18181B; --text: #FAFAF9; }   (sombre)
 * En JavaScript, il suffit de poser l'attribut data-theme="dark" ou "light" sur
 * l'élément <html>. Le CSS fait le reste, automatiquement. C'est le principe du
 * thème dynamique sans recharger la page.
 *
 * Le paramètre est "durci" avant usage : il ne peut valoir que "dark" ou
 * "light". Si une valeur inattendue arrive (bug, valeur corrompue en
 * localStorage), on retombe sur "light" plutôt que d'injecter un attribut
 * invalide dans le DOM.
 *
 * Le thème est ensuite sauvegardé dans localStorage pour qu'il survive au
 * rechargement de la page.
 *
 * @param {"light"|"dark"} mode - Mode de thème à appliquer.
 * @returns {void}
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
  // theme-color est une balise <meta> spéciale : sur Android/iOS, elle
  // colore la barre d'adresse ou d'état du navigateur. Sans cette
  // synchronisation, la barre resterait claire même en thème sombre.
  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) {
    metaTheme.setAttribute("content", safeMode === "dark" ? "#18181B" : "#F5F4F1");
  }
}

/**
 * Initialise le thème dès le chargement du script afin d'éviter tout flash visuel.
 * Si aucun choix n'est mémorisé, applique le thème système de l'appareil.
 *
 * POURQUOI "dès le chargement du script" et pas plus tard ?
 * Un "flash" (clignotement) se produit si la page s'affiche d'abord en thème
 * clair, puis bascule en sombre une fraction de seconde plus tard quand le
 * script s'exécute. Pour l'éviter, cette fonction est appelée le plus tôt
 * possible dans le chargement de index.html, avant le rendu complet.
 *
 * Le thème système : window.matchMedia("(prefers-color-scheme: dark)") permet
 * de détecter si l'appareil de l'utilisateur est réglé en mode sombre. .matches
 * renvoie true si la media query est vraie. On respecte ainsi la préférence
 * système sans rien demander à l'utilisateur.
 *
 * @returns {void}
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
 *
 * L'attribut data-theme est lu sur le document pour savoir dans quel mode on
 * se trouve, puis on applique l'inverse. La valeur retournée permet à
 * l'appelant (l'icône du bouton, par exemple) de se mettre à jour.
 *
 * @returns {"light"|"dark"} Le nouveau thème appliqué.
 */
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

// ============================================================================
// AUTHENTIFICATION & VERROUILLAGE AUTOMATIQUE
// ============================================================================

/**
 * Vérifie si la session actuelle est authentifiée.
 *
 * L'authentification de l'administrateur est stockée dans le sessionStorage
 * sous la forme d'un simple drapeau "1" ou rien du tout (voir setSessionAuthed).
 *
 * @returns {boolean} Vrai si l'administrateur est connecté, faux sinon.
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
 *
 * CONCEPT : sessionStorage vs localStorage
 * ----------------------------------------
 * Ces deux APIs font partie du "Web Storage" (stockage web du navigateur). Elles
 * permettent de sauvegarder de petites chaînes de caractères (paires
 * clé/valeur) qui survivent au rechargement de la page. Elles diffèrent par
 * leur durée de vie :
 *
 *   - localStorage : les données persistent INDÉFINIMENT, même après la
 *     fermeture du navigateur, et sont PARTAGÉES par tous les onglets ouverts
 *     sur la même origine (domaine). C'est un stockage permanent, utile pour
 *     les préférences (thème, dernier affichage...).
 *
 *   - sessionStorage : les données ne vivent que pour la session de navigation
 *     courante. Elles disparaissent quand l'onglet est entièrement fermé, et
 *     chaque onglet a sa PROPRE copie (elles ne sont PAS partagées entre
 *     onglets).
 *
 * Pourquoi ce choix ici ?
 * Le thème est stocké dans localStorage parce que c'est une PRÉFÉRENCE : on
 * veut que l'utilisateur retrouve son thème à chaque visite, même demain.
 * L'authentification est stockée dans sessionStorage parce que c'est une
 * SÉCURITÉ : on ne veut pas qu'un mot de passe reste "entré" sur un appareil
 * partagé (borne publique, téléphone d'un ami). Si l'utilisateur ferme
 * l'application, il devra ressaisir le mot de passe.
 *
 * @param {boolean} authed - Vrai si l'administrateur vient de se connecter,
 *   faux s'il se déconnecte ou si la session expire.
 * @returns {void}
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
 * LE PROBLÈME À RÉSOUDRE :
 * Une application qui reste ouverte sur un téléphone oublié dans une poche
 * laisserait les données de l'association accessibles à quiconque prendrait
 * l'appareil. Le verrouillage automatique ferme ce risque.
 *
 * MAIS le minuteur JavaScript ne fonctionne pas de façon fiable quand l'onglet
 * est en arrière-plan : le navigateur peut le suspendre ou le ralentir
 * (économie d'énergie). Un simple setTimeout n'est donc pas fiable.
 *
 * LA SOLUTION (voir initVisibilityWatcher) repose sur deuxCLE :
 *   1. Un horodatage du DERNIER moment où l'application est passée en
 *      arrière-plan est enregistré dans localStorage ("m3d_hidden_at").
 *      localStorage est utilisé ici (et non sessionStorage) parce que cette
 *      valeur doit survivre à un changement d'onglet : si l'utilisateur
 *      bascule dans un autre onglet, puis revient dans l'application, l'onglet
 *      de l'application est "vivant" en arrière-plan et doit pouvoir lire le
 *      timestamp de sa mise en arrière-plan.
 *   2. Au retour au premier plan, on calcule le temps écoulé.
 *
 * CALCUL DU TEMPS ÉCOULÉ :
 *   tempsInactif = Date.now() - parseInt(hiddenAt, 10)
 *   Date.now() : l'heure actuelle en millisecondes depuis 1970 ("epoch").
 *   parseInt(hiddenAt, 10) : convertit la chaîne stockée en nombre (base 10).
 *
 * @param {() => void} [onLockCallback] - Fonction appelée en cas de
 *   verrouillage (typiquement la fonction qui affiche l'écran de mot de passe).
 * @returns {boolean} Vrai si la session a été verrouillée pour expiration,
 *   faux sinon.
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
 * CONCEPT : L'ÉVÉNEMENT "visibilitychange"
 * ----------------------------------------
 * L'API "Page Visibility" du navigateur permet de savoir si un onglet est
 * visible ou caché. L'événement "visibilitychange" est déclenché à chaque
 * changement : quand l'utilisateur minimise la fenêtre, change d'application
 * (sur mobile, en renvoyant l'app en arrière-plan), verrouille son téléphone, ou
 * au contraire quand il revient.
 * La propriété document.hidden vaut true quand l'onglet est caché, false quand
 * il est visible.
 *
 * Ce qui se passe ici :
 *   1. Quand l'application passe en arrière-plan (document.hidden === true),
 *      on enregistre l'heure de départ dans localStorage.
 *   2. Quand l'application revient au premier plan (document.hidden === false),
 *      on appelle verrouillerSiExpire() qui compare le temps écoulé et verrouille
 *      si le délai de 30 minutes est dépassé.
 *
 * POURQUOI NE PAS UTILISER "beforeunload" OU "onblur" ?
 * Ces événements se déclenchent dans des cas où l'utilisateur est toujours
 * devant l'application (par exemple, cliquer en dehors de la fenêtre pour
 * ouvrir un menu système, ou un changement d'onglet très bref). Ils
 * produiraient alors des "faux positifs" : l'application se verrouillerait
 * alors que l'utilisateur n'a fait que regarder ailleurs une demi-seconde.
 * "visibilitychange" ne se déclenche que lors d'un VRAI changement de
 * visibilité, ce qui rend la détection bien plus fiable.
 *
 * @param {() => void} onLockCallback - Fonction à déclencher si la session
 *   expire (affichage de l'écran de verrouillage).
 * @returns {void}
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
