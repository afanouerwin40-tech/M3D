/**
 * @file ui.js - Gestionnaires d'interface utilisateur, modales et notifications.
 * @description Fournit les primitives UI transversales : fenêtres modales superposées
 * (bottom sheets) avec gestion accessible du focus et de la touche Échap, système de toasts,
 * champs de mot de passe sécurisés avec révélateur, et modales d'authentification.
 *
 * ---------------------------------------------------------------------------
 * RÔLE DE CE FICHIER
 * ---------------------------------------------------------------------------
 * Ce fichier ne contient QUE des briques d'affichage réutilisables, appelées par
 * tous les autres modules (finances, membres, cotisations, activites, systeme...).
 *
 * Deux propriétés le caractérisent :
 *
 * 1. INDÉPENDANCE VIS-À-VIS DES DONNÉES
 *    Aucune fonction ici ne lit ni n'écrit dans IndexedDB, et aucune ne connaît
 *    le métier (membres, dettes, cotisations). Tout ce qu'elles reçoivent arrive
 *    en paramètre ou par une fonction de rappel (callback) fournie par
 *    l'appelant — par exemple `confirmWithPassword` appelle `verifyAdminPassword`
 *    sans savoir comment le mot de passe est stocké. C'est ce qui permet de
 *    déplacer ou réécrire `db.js` sans toucher ce fichier.
 *
 * 2. INDÉPENDANCE VIS-À-VIS DU STYLE
 *    Aucune règle CSS n'est écrite ici : on se contente d'ajouter des classes
 *    (`.overlay`, `.sheet`, `.toast`, `.field`...). Le rendu visuel est entièrement
 *    décrit dans `css/components.css`. La séparation permet de retoucher le
 *    design sans risque de casser la logique.
 *
 * ---------------------------------------------------------------------------
 * DEUX FAÇONS DE FABRIQUER DU HTML : `createElement` vs `innerHTML`
 * ---------------------------------------------------------------------------
 * Le DOM (Document Object Model) est la représentation de la page sous forme
 * d'objets JavaScript : chaque balise HTML est un noeud que l'on peut créer,
 * modifier ou supprimer. Deux approches existent :
 *
 * a) `document.createElement("div")` + `.appendChild()` : on crée le noeud
 *    vide, on le configure (classes, texte), puis on l'accroche à la page.
 *    C'est verbeux mais totalement sûr : le contenu est traité comme du DONNÉE,
 *    jamais comme du code. Utilisé ici pour les enveloppes (overlay, toast,
 *    écran d'authentification), dont le contenu vient de `openSheet()`.
 *
 * b) `element.innerHTML = "<div>…</div>"` : on écrit du HTML dans une chaîne
 *    et on demande au navigateur de l'analyser. C'est très pratique pour
 *    construire une fiche entière d'un coup, et c'est le choix fait par les
 *    modules métier.
 *
 * ⚠️ AVERTISSEMENT XSS (Cross-Site Scripting) — à lire avant d'utiliser (b)
 * Tout ce qu'on injecte dans `innerHTML` est interprété comme du balisage. Si
 * une donnée vient de l'utilisateur et contient `<script>alert(1)</script>`,
 * ce code s'exécute. C'est une faille de sécurité majeure.
 * La parade utilisée dans tout le projet est `esc()` (utils.js) : on n'injecte
 * JAMAIS une valeur brute, toujours `esc(valeur)`, qui transforme `<` en `&lt;`
 * et rend le texte inerte. Deux chemins ont déjà été repérés par le passé
 * (le `<title>` des PDF, un indice d'anniversaire) : c'est pour cela que la
 * règle « tout passe par `esc()` » est vérifiée à chaque revue.
 *
 * ---------------------------------------------------------------------------
 * ÉVÉNEMENTS ET FONCTIONS DE RAPPEL (CALLBACKS)
 * ---------------------------------------------------------------------------
 * `element.addEventListener("click", fonction)` enregistre une fonction à
 * exécuter quand l'événement se produit sur cet élément. La fonction passée
 * s'appelle un callback. Elle est « fermée » sur le contexte qui l'a créée :
 * elle peut donc utiliser directement les variables locales du module
 * (`host`, `ov`, `idRembourseur`…) sans avoir à les transmettre en paramètre.
 * C'est exactement ce mécanisme qui permet à `openSheet()` de fournir au
 * code appelant un simple `ov.querySelector(...)` à câbler.
 *
 * Note d'architecture : ce fichier attache ses écouteurs à chaque ouverture de
 * modale. Comme `openSheet()` crée un élément NEUF à chaque appel, aucun
 * écouteur ne s'accumule et rien ne fuite vers les fermetures suivantes.
 */

// ============================================================================
// TOASTS (Notifications d'état éphémères)
// ============================================================================

/**
 * Affiche une notification toast temporaire en haut de l'écran.
 *
 * Un « toast » est une petite bulle d'information qui s'affiche par-dessus
 * l'interface puis disparaît seule : l'utilisateur n'a rien à fermer, et
 * l'information est confirmée sans interrompre sa tâche. C'est le retour
 * standard de l'application pour signaler une réussite ou une erreur.
 *
 * Le cycle de vie repose entièrement sur `setTimeout(fn, delai)`, qui planifie
 * l'exécution de `fn` dans `delai` millisecondes. Deux minuteries en cascade
 * produisent une sortie propre :
 *   - 2200 ms : on retire la classe `show`, ce qui déclenche la transition CSS
 *     de disparition (l'élément reste dans la page pendant l'animation) ;
 *   - +250 ms : on appelle `remove()`, qui détache définitivement l'élément du
 *     DOM. Retirer l'élément avant la fin de l'animation provoquerait un
 *     clignotement, d'où ce second délai.
 *
 * Le message est écrit avec `textContent` et non `innerHTML` : ici le contenu
 * est traité comme du texte brut, ce qui écarte toute injection de HTML.
 *
 * @param {string} msg - Message informatif.
 * @param {"success"|"error"} [kind="success"] - Type de notification.
 * @returns {void}
 */
function toast(msg, kind = "success") {
  const host = document.getElementById("toast-host");
  if (!host) return; // hôte absent (page pas encore montée) : on ignore

  const t = document.createElement("div");
  t.className = `toast ${kind === "error" ? "toast-error" : ""}`;
  // `role` est un attribut d'accessibilité lu par les lecteurs d'écran :
  // "alert" interrompt la lecture (erreur), "status" est discret (succès).
  t.setAttribute("role", kind === "error" ? "alert" : "status");
  t.textContent = msg;

  host.appendChild(t);
  // `requestAnimationFrame` diffère l'appel d'un cycle de rendu : la classe
  // est ajoutée après le premier affichage, ce qui laisse le navigateur voir
  // l'état initial (sans `show`) et déclencher ensuite la transition CSS.
  requestAnimationFrame(() => t.classList.add("show"));

  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// ============================================================================
// MODALES (SHEETS) & DIALOGUES ACCESSIBLES
// ============================================================================

/**
 * Pile active des modales ouvertes.
 *
 * Un « bottom-sheet » (feuille glissante) est une modale qui monte du bas de
 * l'écran sur mobile et se comporte comme une boîte centrée sur desktop : le
 * contenu de la page derrière reste visible mais neutralisé. C'est le format
 * privilégié de l'application car il reste utilisable au pouce.
 *
 * Les modales sont EMPILABLES : depuis une fiche membre on peut ouvrir une
 * fiche d'activité, puis une confirmation. `sheetStack` est la pile (un simple
 * tableau) qui retient l'ordre d'ouverture : le dernier élément poussé est
 * celui affiché au-dessus, et `closeSheet()` pops toujours le sommet. Sans
 * cette pile, la touche Échap ou le clic extérieur fermeraient la mauvaise
 * modale.
 *
 * @type {HTMLElement[]}
 */
const sheetStack = [];

/**
 * Ouvre une nouvelle modale (bottom-sheet) avec animation et gestion ARIA.
 * Empilable : permet d'ouvrir une sous-fiche par-dessus une fiche parente.
 *
 * ARIA (Accessible Rich Internet Applications) est un ensemble d'attributs
 * standard qui décritent le rôle d'un élément pour les technologies
 * d'assistance. `role="dialog"` + `aria-modal="true"` annoncent « une fenêtre
 * de dialogue est ouverte, le reste de la page est inerte ».
 *
 * La méthode `querySelector` sert ensuite à retrouver un élément à l'intérieur
 * de la modale à partir d'un sélecteur CSS : c'est ce qui permet à l'appelant
 * de brancher ses propres gestionnaires sur les champs qu'il a lui-même
 * décrits, sans que ce fichier ait à les connaître.
 *
 * @param {string} html - Balisage interne de la modale. ATTENTION : ce contenu
 *   est injecté tel quel dans `innerHTML` ; l'appelant est responsable d'avoir
 *   passé toute donnée utilisateur par `esc()`.
 * @returns {HTMLElement} L'élément conteneur overlay inséré.
 */
function openSheet(html) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");

  ov.innerHTML = `<div class="sheet">${html}</div>`;

  // Fermeture par clic en dehors du panneau.
  // `e.target` est l'élément exact sur lequel le clic a atterri. En comparant
  // l'overlay lui-même, on ne ferme que si le clic n'a pas atteint un enfant :
  // un clic DANS le panneau (sur un champ, un bouton) ne doit pas le fermer.
  ov.addEventListener("click", (e) => {
    if (e.target === ov) {
      closeSheet();
    }
  });

  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("show"));
  sheetStack.push(ov);

  // Maintien du focus clavier à l'intérieur de la modale.
  // Le premier champ focusable reçoit le focus pour que la saisie au clavier
  // fonctionne immédiatement. `setTimeout` de 60 ms laisse à l'overlay le
  // temps d'être réellement dans la page avant de déplacer le focus.
  const firstFocusable = ov.querySelector("input, select, textarea, button:not(.sheet-close)");
  if (firstFocusable) {
    setTimeout(() => firstFocusable.focus(), 60);
  }

  return ov;
}

/**
 * Ferme la modale située au sommet de la pile avec animation de sortie.
 *
 * `Array.prototype.pop()` retire ET renvoie le dernier élément : d'un coup on
 * à la fois sort de la pile et on récupère l'élément à fermer. La fermeture est
 * en deux temps, comme pour le toast : on retire d'abord la classe `show`
 * (déclenche la transition CSS de fermeture), puis on supprime l'élément du DOM
 * 200 ms plus tard, une fois l'animation terminée.
 *
 * @returns {void}
 */
function closeSheet() {
  const ov = sheetStack.pop();
  if (!ov) return; // pile vide : rien à fermer (garde-fou, la touche Échap appelle ici)
  ov.classList.remove("show");
  setTimeout(() => ov.remove(), 200);
}

/**
 * Ferme l'ensemble des modales ouvertes dans l'application.
 *
 * Utilisé notamment lors du verrouillage automatique : sans cela, une
 * modale resterait visible par-dessus l'écran d'authentification.
 *
 * @returns {void}
 */
function closeAllSheets() {
  while (sheetStack.length > 0) {
    closeSheet();
  }
}

// Écouteur global pour fermer la modale supérieure avec la touche Échap.
// Placé sur `document` (et non sur chaque modale) car l'écouteur n'existe qu'une
// fois, alors que les modales, elles, sont recréées à chaque ouverture.
// `e.preventDefault()` neutralise le comportement par défaut de la touche
// Échap, qui annulerait par ailleurs la soumission d'un formulaire ouvert.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheetStack.length > 0) {
    e.preventDefault();
    closeSheet();
  }
});

// ============================================================================
// CHAMPS DE MOT DE PASSE & BASCULE OEIL
// ============================================================================

/**
 * Génère le balisage d'un champ mot de passe avec bouton pour afficher/masquer.
 *
 * Le champ est de type `password` : le navigateur masque alors la saisie et
 * propose de ne pas l'enregistrer. Le bouton « œil » permet à l'utilisateur de
 * vérifier ce qu'il tape, ce qui limite les fautes de saisie sur ce type de
 * champ, source classique de blocages.
 *
 * La fonction ne fait que produire une CHAÎNE HTML : elle ne touche pas au DOM
 * et ne crée aucun écouteur. C'est une fonction de gabarit (« template »),
 * réutilisable partout.
 *
 * @param {string} id - Identifiant HTML de l'élément input.
 * @param {string} labelText - Libellé du champ.
 * @param {string} [autocomplete="current-password"] - Directive de saisie automatique.
 *   "new-password" convient à un changement de mot de passe.
 * @returns {string} Balisage HTML.
 */
function pwField(id, labelText, autocomplete = "current-password") {
  return `<div class="field">
    <label for="${id}">${labelText}</label>
    <div class="pw-wrap">
      <input id="${id}" type="password" autocomplete="${autocomplete}">
      <button type="button" class="pw-toggle" data-target="${id}" aria-label="Afficher ou masquer le mot de passe">
        <svg class="icon-eye" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg class="icon-eye-off" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a17.4 17.4 0 0 1-3.06 4.06M6.1 6.1A17.5 17.5 0 0 0 1 12s4 7 11 7a10.9 10.9 0 0 0 4.9-1.14"/></svg>
      </button>
    </div>
  </div>`;
}

/**
 * Attache les écouteurs de bascule afficher/masquer sur les boutons de mot de passe.
 *
 * L'attribution se fait par PARCOURS de `querySelectorAll` : on sélectionne
 * tous les descendants correspondant au sélecteur, puis on branche un
 * gestionnaire sur chacun. `btn.dataset.target` lit l'attribut HTML
 * `data-target`, qui mémorise l'id du champ concerné : le bouton n'a donc pas
 * besoin de connaître la structure de la modale qui l'accueille.
 *
 * Bascule de type `password` vers `text` : ce sont les deux seuls types
 * acceptés par cette logique.
 *
 * @param {HTMLElement} root - Élément conteneur parent.
 * @returns {void}
 */
function wirePasswordToggles(root) {
  root.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.classList.toggle("visible", show);
    });
  });
}

// ============================================================================
// MODALE DE CONFIRMATION AVEC MOT DE PASSE ADMIN
// ============================================================================

/**
 * Ouvre une boîte de dialogue modale exigeant le mot de passe administrateur.
 * Utilisée pour les opérations sensibles (suppression, réinitialisation, import total).
 * Supporte la validation directe par la touche Entrée.
 *
 * FLUX DE VALIDATION ADMIN
 * -----------------------
 * Une « promesse » (Promise) est un objet qui représente une valeur future
 * qu'on ne connaît pas encore. On la crée avec `new Promise(...)` et on
 * « résout » (`resolve`) la valeur au moment où elle est connue ; le
 * `await` de l'appelant attend alors ce moment. Le résultat est donc
 * `await confirmWithPassword(...)` dans le code appelant, et `if (ok) {…}`
 * pour la suite.
 *
 * Étapes de l'écran :
 *   1. la modale est ouverte via `openSheet()` (elle s'empile au-dessus de
 *      l'écran courant, qui reste visible) ;
 *   2. la saisie est captée puis vérifiée par `verifyAdminPassword(pw)`,
 *      fonction de db.js qui compare le SHA-256 du mot de passe à celui stocké.
 *      Ce fichier ne connaît ni le sel ni l'algorithme : c'est ce qui rend
 *      la modale réutilisable sans couplage ;
 *   3. échec → message d'erreur injecté dans la zone dédiée, la modale reste
 *      ouverte pour permettre un nouvel essai ;
 *   4. réussite → `finish(true)`, qui ferme la modale et rend la main à
 *      l'appelant ; annulation, fermeture ou Échap rendent `false`.
 *
 * Le drapeau interne `settled` rend `finish()` idempotente : si deux
 * événements se déclenchent (double clic, Échap pendant la vérification), seul
 * le premier agit, ce qui évite un double `resolve` — une promesse ne peut
 * être résolue qu'une fois.
 *
 * @param {string} message - Avertissement ou explication de l'opération.
 * @returns {Promise<boolean>} Résout à vrai si le mot de passe est validé, faux sinon.
 */
function confirmWithPassword(message) {
  return new Promise((resolve) => {
    const ov = openSheet(`
      <button class="sheet-close" data-close aria-label="Fermer la boîte de dialogue">&times;</button>
      <h3>Confirmation requise</h3>
      <p class="small-note" style="margin-top:0;">${message}</p>
      ${pwField("cwp_pw", "Mot de passe administrateur")}
      <div class="auth-error" id="cwp_err"></div>
      <button class="btn btn-primary" id="cwp_go" style="background:var(--danger);">Confirmer</button>
      <button class="btn btn-ghost" id="cwp_cancel" style="margin-top:8px;">Annuler</button>
    `);

    wirePasswordToggles(ov);

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      closeSheet();
      resolve(val);
    };

    const doSubmit = async () => {
      const pwInput = ov.querySelector("#cwp_pw");
      const pw = pwInput ? pwInput.value : "";
      const ok = await verifyAdminPassword(pw);
      if (!ok) {
        const errEl = ov.querySelector("#cwp_err");
        if (errEl) errEl.textContent = "Mot de passe incorrect.";
        return;
      }
      finish(true);
    };

    ov.querySelector("[data-close]").addEventListener("click", () => finish(false));
    ov.querySelector("#cwp_cancel").addEventListener("click", () => finish(false));
    ov.querySelector("#cwp_go").addEventListener("click", doSubmit);

    const input = ov.querySelector("#cwp_pw");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doSubmit();
        }
      });
    }
  });
}

// ============================================================================
// ÉCRANS D'AUTHENTIFICATION PLEIN ÉCRAN
// ============================================================================

/**
 * Crée un écran plein écran d'authentification ou d'initialisation.
 *
 * Contrairement à la modale, cet écran recouvre TOUTE la page : il sert de
 * barrière quand l'application n'est pas encore authentifiée. Il n'empile
 * rien, et n'est retiré que par son appelant (state.js / app.js).
 *
 * Comme `openSheet`, on utilise `createElement` pour l'enveloppe (contenu non
 * fiable) et `innerHTML` pour l'intérieur — que l'appelant doit avoir échappé.
 *
 * @param {string} innerHTML - Balisage intérieur de la boîte centrale.
 * @returns {HTMLElement} L'élément écran créé.
 */
function authOverlay(innerHTML) {
  const el = document.createElement("div");
  el.className = "auth-screen";
  el.innerHTML = `<div class="auth-box">${innerHTML}</div>`;
  document.body.appendChild(el);
  wirePasswordToggles(el);
  return el;
}
