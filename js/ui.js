/**
 * @file ui.js - Gestionnaires d'interface utilisateur, modales et notifications.
 * @description Fournit les primitives UI transversales : fenêtres modales superposées
 * (bottom sheets) avec gestion accessible du focus et de la touche Échap, système de toasts,
 * champs de mot de passe sécurisés avec révélateur, et modales d'authentification.
 */

// ============================================================================
// TOASTS (Notifications d'état éphémères)
// ============================================================================

/**
 * Affiche une notification toast temporaire en haut de l'écran.
 *
 * @param {string} msg - Message informatif.
 * @param {"success"|"error"} [kind="success"] - Type de notification.
 */
function toast(msg, kind = "success") {
  const host = document.getElementById("toast-host");
  if (!host) return;

  const t = document.createElement("div");
  t.className = `toast ${kind === "error" ? "toast-error" : ""}`;
  t.setAttribute("role", kind === "error" ? "alert" : "status");
  t.textContent = msg;

  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));

  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// ============================================================================
// MODALES (SHEETS) & DIALOGUES ACCESSIBLES
// ============================================================================

/** @type {HTMLElement[]} Pile active des modales ouvertes */
const sheetStack = [];

/**
 * Ouvre une nouvelle modale (bottom-sheet) avec animation et gestion ARIA.
 * Empilable : permet d'ouvrir une sous-fiche par-dessus une fiche parente.
 *
 * @param {string} html - Balisage interne de la modale.
 * @returns {HTMLElement} L'élément conteneur overlay inséré.
 */
function openSheet(html) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");

  ov.innerHTML = `<div class="sheet">${html}</div>`;

  // Fermeture par clic en dehors du panneau
  ov.addEventListener("click", (e) => {
    if (e.target === ov) {
      closeSheet();
    }
  });

  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("show"));
  sheetStack.push(ov);

  // Maintien du focus clavier à l'intérieur de la modale
  const firstFocusable = ov.querySelector("input, select, textarea, button:not(.sheet-close)");
  if (firstFocusable) {
    setTimeout(() => firstFocusable.focus(), 60);
  }

  return ov;
}

/**
 * Ferme la modale située au sommet de la pile avec animation de sortie.
 */
function closeSheet() {
  const ov = sheetStack.pop();
  if (!ov) return;
  ov.classList.remove("show");
  setTimeout(() => ov.remove(), 200);
}

/**
 * Ferme l'ensemble des modales ouvertes dans l'application.
 */
function closeAllSheets() {
  while (sheetStack.length > 0) {
    closeSheet();
  }
}

// Écouteur global pour fermer la modale supérieure avec la touche Échap
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
 * @param {string} id - Identifiant HTML de l'élément input.
 * @param {string} labelText - Libellé du champ.
 * @param {string} [autocomplete="current-password"] - Directive de saisie automatique.
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
 * @param {HTMLElement} root - Élément conteneur parent.
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
