/**
 * @file utils.js - Fonctions utilitaires transversales pures de l'application M3D.
 * @description Contient les formateurs monétaires et temporels, la sécurisation
 * anti-XSS, la génération d'identifiants uniques, la gestion des exports/partages,
 * la compression d'images et les assistants de manipulation du DOM.
 */

// ============================================================================
// FORMATAGE MONÉTAIRE & DE DONNÉES
// ============================================================================

/**
 * Formate un montant numérique en francs CFA avec séparateur de milliers français.
 * Exemple: 12000 -> "12 000 F".
 *
 * @param {number|string} n - Montant à formater.
 * @returns {string} Montant formaté suivi de l'abréviation "F".
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";

/**
 * Formate une date ISO (YYYY-MM-DD) au format usuel français (JJ/MM/AAAA).
 * L'heure est figée à T00:00:00 afin de neutraliser tout décalage de fuseau horaire.
 *
 * @param {string} iso - Date au format ISO (ex: "2026-08-15").
 * @returns {string} Date au format "15/08/2026".
 */
const fmtDate = (iso) => {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/**
 * Retourne le nom complet d'un membre (Nom Prénom ou Prénom seul).
 *
 * @param {{ nom?: string, prenom?: string }} m - Fiche membre.
 * @returns {string} Nom complet sans espaces superflus.
 */
const fullName = (m) => {
  if (!m) return "?";
  return m.nom ? `${m.nom} ${m.prenom}`.trim() : (m.prenom || "?").trim();
};

/**
 * Génère les initiales (2 lettres majuscules) à partir du nom et prénom d'un membre.
 *
 * @param {{ nom?: string, prenom?: string }} m - Fiche membre.
 * @returns {string} Initiales sur 2 caractères.
 */
const initials = (m) => {
  if (!m) return "??";
  const first = (m.nom || m.prenom || "?")[0] || "?";
  const second = (m.prenom || "")[0] || "";
  return (first + second).toUpperCase();
};

/**
 * Retourne la date courante locale au format ISO "YYYY-MM-DD".
 *
 * @returns {string} Chaîne de date sur 10 caractères.
 */
const todayISO = () => {
  const d = new Date();
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
};

/**
 * Convertit une chaîne ISO "YYYY-MM-DD" en objet Date local (sans décalage UTC).
 *
 * @param {string} iso - Date au format ISO.
 * @returns {Date} Instance de Date.
 */
function isoToDate(iso) {
  const parts = String(iso).slice(0, 10).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/**
 * Convertit un objet Date en chaîne ISO "YYYY-MM-DD".
 *
 * @param {Date} d - Date valide.
 * @returns {string} Date ISO YYYY-MM-DD.
 */
function dateToIso(d) {
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

// ============================================================================
// SÉCURITÉ & ANTI-XSS
// ============================================================================

/**
 * Échappement HTML strict contre les failles XSS (Cross-Site Scripting).
 * Obligatoire pour toute variable provenant d'un formulaire ou d'un import JSON
 * avant injection dans des gabarits HTML ou des documents d'impression.
 *
 * @param {unknown} s - Valeur potentiellement non sécurisée.
 * @returns {string} Chaîne sécurisée avec entités HTML échappées.
 */
const esc = (s) =>
  String(s === null || s === undefined ? "" : s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

/**
 * Valide qu'une couleur est un code hexadécimal strict au format #RRGGBB.
 * Empêche l'injection d'attributs de style malveillants via des données corrompues.
 *
 * @param {string} c - Chaîne de couleur à valider.
 * @param {string} [fallback="#6366F1"] - Couleur de repli sécurisée.
 * @returns {string} Couleur validée ou couleur par défaut.
 */
const safeColor = (c, fallback = "#6366F1") =>
  typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;

// ============================================================================
// IDENTIFIANTS UNIQUES
// ============================================================================

/**
 * Génère un identifiant unique (UUID v4) universellement compatible.
 * Priorise crypto.randomUUID() (navigateurs récents), se replie sur
 * crypto.getRandomValues (Safari 6+, iOS 6+) et enfin sur Math.random.
 *
 * @returns {string} UUID v4 formaté.
 */
function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Génère un identifiant textuel court et lisible pour les membres (ex: "M-A1B2C3").
 * Garanti non-collision avec préfixe d'horodatage et entropie aléatoire.
 *
 * @returns {string} Identifiant membre sécurisé.
 */
function genererIdMembre() {
  const stamp = Date.now().toString(36).toUpperCase();
  const alea = Math.floor(Math.random() * 36)
    .toString(36)
    .toUpperCase();
  return `M-${stamp.slice(-5)}${alea}`;
}

// ============================================================================
// EXPORT & TÉLÉCHARGEMENT DE FICHIERS
// ============================================================================

/**
 * Déclenche le téléchargement d'un Blob sous forme de fichier.
 * Intègre un repli `target="_blank"` pour les navigateurs n'implémentant pas l'attribut download.
 *
 * @param {Blob} blob - Contenu du fichier.
 * @param {string} nomFichier - Nom du fichier cible.
 * @returns {void}
 */
function telechargerFichier(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  if (!("download" in a)) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Partage ou télécharge un fichier de manière résiliente.
 * En mode PWA standalone (écran d'accueil iOS/Android), la Web Share API
 * évite les ruptures de navigation et propose directement les options système.
 *
 * @param {Blob} blob - Contenu du fichier.
 * @param {string} nomFichier - Nom du fichier suggéré.
 * @param {string} [mimeType] - Type MIME.
 * @returns {Promise<"partage"|"telecharge"|"annule">} Résultat de l'action.
 */
async function partagerOuTelechargerFichier(blob, nomFichier, mimeType) {
  try {
    const file = new File([blob], nomFichier, {
      type: mimeType || blob.type || "application/octet-stream",
    });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nomFichier });
      return "partage";
    }
  } catch (err) {
    if (err && err.name === "AbortError") return "annule";
  }
  telechargerFichier(blob, nomFichier);
  return "telecharge";
}

/**
 * Compresse et redimensionne une image côté client via un Canvas HTML5.
 *
 * @param {File} file - Fichier image sélectionné par l'utilisateur.
 * @param {number} [maxDim=960] - Dimension maximale (largeur ou hauteur en pixels).
 * @returns {Promise<string>} Image encodée en data URL base64 JPEG.
 */
function compresserPhoto(file, maxDim = 960) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format d'image non reconnu"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// COMPOSANTS DE FORMULAIRE & SÉLECTEURS PARTAGÉS
// ============================================================================

/**
 * Génère les balises <option> pour les jours du mois (1 à 31).
 *
 * @param {number|string|null} selected - Jour sélectionné.
 * @returns {string} Balises <option>.
 */
function dayOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  for (let d = 1; d <= 31; d++) {
    out += `<option value="${d}"${Number(selected) === d ? " selected" : ""}>${d}</option>`;
  }
  return out;
}

/**
 * Génère les balises <option> pour les 12 mois de l'année.
 *
 * @param {number|string|null} selected - Mois sélectionné (1 à 12).
 * @returns {string} Balises <option>.
 */
function monthOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  MOIS_NOMS.forEach((nom, i) => {
    const v = i + 1;
    out += `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${nom}</option>`;
  });
  return out;
}

/**
 * Génère les options du sélecteur de fonction associative avec repli "Autre".
 *
 * @param {string} selected - Fonction actuellement attribuée.
 * @returns {string} Balises <option>.
 */
function fonctionOptionsHTML(selected) {
  const known = FONCTIONS.includes(selected);
  let out = FONCTIONS.map(
    (f) => `<option value="${f}"${f === selected ? " selected" : ""}>${f}</option>`,
  ).join("");
  out += `<option value="__autre__"${!known && selected ? " selected" : ""}>Autre</option>`;
  return out;
}

/**
 * Connecte le comportement d'affichage dynamique pour le champ libre "Autre" d'une fonction.
 *
 * @param {string} selectId - ID du sélecteur.
 * @param {string} wrapId - ID du conteneur du champ libre.
 * @param {string} inputId - ID du champ de saisie libre.
 * @param {string} currentValue - Valeur initiale de la fonction.
 * @returns {void}
 */
function wireFonctionAutre(selectId, wrapId, inputId, currentValue) {
  const select = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  if (!select || !wrap || !input) return;
  const known = FONCTIONS.includes(currentValue);
  if (currentValue && !known) {
    wrap.style.display = "";
    input.value = currentValue;
  }
  select.addEventListener("change", () => {
    wrap.style.display = select.value === "__autre__" ? "" : "none";
  });
}

/**
 * Récupère la valeur finale de la fonction choisie (standard ou saisie libre).
 *
 * @param {string} selectId - ID du sélecteur.
 * @param {string} inputId - ID du champ texte libre.
 * @returns {string} Valeur de la fonction.
 */
function fonctionValueFrom(selectId, inputId) {
  const select = document.getElementById(selectId);
  if (!select) return "Membre";
  if (select.value === "__autre__") {
    const input = document.getElementById(inputId);
    return input ? input.value.trim() || "Autre" : "Autre";
  }
  return select.value;
}

// ============================================================================
// CANVAS & GRAPHIQUES
// ============================================================================

/**
 * Lit la valeur calculée d'une variable CSS globale sur le document.
 *
 * @param {string} name - Nom de la variable CSS (ex: "--accent").
 * @returns {string} Valeur évaluée.
 */
function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Trace un rectangle avec coins arrondis sur la partie supérieure dans un contexte Canvas 2D.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D.
 * @param {number} x - Abscisse.
 * @param {number} y - Ordonnée.
 * @param {number} w - Largeur.
 * @param {number} h - Hauteur.
 * @param {number} r - Rayon d'arrondi.
 * @returns {void}
 */
function roundRectTop(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  const rad = Math.min(r, h, w / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/**
 * Affiche un message de substitution au centre d'un Canvas sans données.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D.
 * @param {number} W - Largeur du canvas.
 * @param {number} H - Hauteur du canvas.
 * @param {string} [msg="Donnees insuffisantes"] - Texte informatif.
 * @returns {void}
 */
function emptyCanvasMsg(ctx, W, H, msg = "Donnees insuffisantes") {
  ctx.fillStyle = cssVar("--text-3") || "#888";
  ctx.font = "24px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg, W / 2, H / 2);
}

/**
 * Retourne le gabarit HTML standardisé pour un état vide ("aucun élément").
 *
 * @param {string} text - Message explicatif.
 * @returns {string} Balisage HTML de l'état vide.
 */
function emptyHTML(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
