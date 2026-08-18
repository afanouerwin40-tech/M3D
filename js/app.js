// app.js — Routeur + vues. Vanilla JS, pas de framework (choix du cahier des charges).

const fmt = (n) => Math.round(n).toLocaleString("fr-FR") + " F";
const fmtDate = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
const fullName = (m) => (m.nom ? `${m.nom} ${m.prenom}` : m.prenom);

// telechargerFichier() : point unique pour tous les exports (JSON, Word...).
// Avant, target="_blank" etait force EN PERMANENCE "au cas ou" : gros bug,
// car sur un navigateur qui supporte l'attribut "download" (Chrome, Firefox,
// Safari >= 13 -- donc l'iPhone 8 / iPhone SE en iOS recent), le combo
// target="_blank" + download fait que le navigateur ouvre juste un nouvel
// onglet vide AU LIEU de telecharger : "download" est ignore. Ici on
// detecte le vrai support ('download' in a renvoie false sur les Safari
// anterieurs a la version 13, donc sur TOUT iOS 12, meme s'ils comprennent
// l'attribut HTML) et on n'utilise le repli target="_blank" que si le
// navigateur ne sait vraiment pas telecharger.
function telechargerFichier(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  if (!("download" in a)) {
    // Vieux Safari (< 13, tout iOS 12) : pas de support "download" ->
    // ouvrir dans un nouvel onglet pour que l'app ne soit pas remplacee
    // par le contenu brut. L'utilisateur sauvegarde ensuite via le bouton
    // Partager de Safari > "Enregistrer dans Fichiers".
    a.target = "_blank";
    a.rel = "noopener";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delai avant revocation : la revoquer immediatement apres click() peut
  // couper le telechargement en cours sur certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// partagerOuTelechargerFichier() : point d'entree a utiliser pour tout
// export destine a etre SAUVEGARDE par l'utilisateur (JSON de sauvegarde,
// etc.). PROBLEME REEL corrige ici : une fois l'app installee sur l'ecran
// d'accueil (mode "standalone"), telechargerFichier() ci-dessus devient
// peu fiable sous iOS -- le WebKit standalone ignore souvent l'attribut
// "download", et le repli target="_blank" fait alors NAVIGUER LA SEULE
// FENETRE de l'app (il n'y a pas d'onglets en standalone) vers l'URL du
// blob : l'app semble "planter" sur un ecran vide, sans moyen simple d'y
// revenir. On privilegie donc la feuille de partage native du systeme
// (Web Share API avec fichiers), qui fonctionne de facon fiable en mode
// standalone et propose directement "Enregistrer dans Fichiers", Mail,
// WhatsApp, etc. Le telechargement classique reste le repli pour les
// navigateurs/PC qui ne supportent pas le partage de fichiers.
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
    // L'utilisateur a simplement ferme/annule la feuille de partage :
    // ce n'est pas une erreur, on ne bascule pas sur le telechargement.
    if (err && err.name === "AbortError") return "annule";
    // Toute autre erreur (ex. navigator.share indisponible malgre le
    // test canShare sur certains navigateurs) -> on retente via le
    // telechargement classique ci-dessous plutot que de planter.
  }
  telechargerFichier(blob, nomFichier);
  return "telecharge";
}

const initials = (m) =>
  (
    ((m.nom || m.prenom || "?")[0] || "?") + ((m.prenom || "")[0] || "")
  ).toUpperCase();

// ================================================================
// esc() — ECHAPPEMENT HTML ANTI-XSS. NE JAMAIS SUPPRIMER CETTE FONCTION.
// ================================================================
// Toute donnee qui vient d'un formulaire ou d'un import JSON (nom,
// telephone, fonction, libelle, notes, observations, nom de liste...) DOIT
// passer par esc() avant d'etre inseree dans un template `...${xxx}...`
// utilise avec innerHTML OU dans une fenetre d'impression
// (writePrintableDocument, qui utilise document.write — c'est du DOM en
// direct, encore plus sensible qu'un simple innerHTML).
//
// Sans ca, si quelqu'un tape comme nom "<img src=x onerror=alert(1)>"
// (dans le formulaire d'ajout de membre, ou via un fichier de sauvegarde
// JSON trafique), ce code s'executerait directement des que le nom
// s'affiche n'importe ou dans l'app. C'est une faille XSS stockee.
//
// Regle : `${maVariable}` dans un template qui finit dans innerHTML ->
// si maVariable vient d'un utilisateur (formulaire, import JSON), utiliser
// `${esc(maVariable)}`. Si c'est un nombre/une date deja formatee par
// fmt()/fmtDate(), pas besoin, ce n'est pas du texte libre.
const esc = (s) =>
  String(s === null || s === undefined ? "" : s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// ================================================================
// safeColor() — la couleur d'une liste (l.couleur) est inseree directement
// dans un attribut style="..." (border-left, background, color), PAS dans
// du texte : esc() ne suffit pas a proteger un attribut de ce type. En
// usage normal la couleur vient d'une palette fixe (LISTE_COULEURS), donc
// aucun risque via l'interface. Mais une sauvegarde JSON importee peut
// contenir n'importe quelle valeur pour ce champ : sans validation, une
// couleur trafiquee du type `red;" onmouseover="alert(1)` casserait
// l'attribut et executerait du JS (faille XSS stockee). safeColor()
// n'accepte qu'un hex #rrggbb strict, sinon retombe sur la couleur par
// defaut de l'app.
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : "#2563EB");

// --- Listes deroulantes reutilisables (date d'anniversaire + fonction) ---
function dayOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  for (let d = 1; d <= 31; d++)
    out += `<option value="${d}"${Number(selected) === d ? " selected" : ""}>${d}</option>`;
  return out;
}
function monthOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  MOIS_NOMS.forEach((nom, i) => {
    const v = i + 1;
    out += `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${nom}</option>`;
  });
  return out;
}
const FONCTIONS = [
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
];
function fonctionOptionsHTML(selected) {
  const known = FONCTIONS.includes(selected);
  let out = FONCTIONS.map(
    (f) =>
      `<option value="${f}"${f === selected ? " selected" : ""}>${f}</option>`,
  ).join("");
  out += `<option value="__autre__"${!known && selected ? " selected" : ""}>Autre</option>`;
  return out;
}
// Branche le comportement "Autre -> champ libre" sur un couple select/input.
// selectId: id du <select>, wrapId: id du conteneur du champ libre, inputId: id de l'input libre.
function wireFonctionAutre(selectId, wrapId, inputId, currentValue) {
  const select = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  const known = FONCTIONS.includes(currentValue);
  if (currentValue && !known) {
    wrap.style.display = "";
    input.value = currentValue;
  }
  select.addEventListener("change", () => {
    wrap.style.display = select.value === "__autre__" ? "" : "none";
  });
}
function fonctionValueFrom(selectId, inputId) {
  const select = document.getElementById(selectId);
  if (select.value === "__autre__")
    return document.getElementById(inputId).value.trim() || "Autre";
  return select.value;
}

const app = document.getElementById("app-content");
const TABS = ["accueil", "membres", "dimanche", "dettes", "plus"];
let currentTab = "accueil";

// ---------------------------------------------------------------
// Theme (exception : localStorage, lu de facon synchrone avant le
// premier rendu pour eviter un flash du mauvais theme)
// ---------------------------------------------------------------
function applyTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem("m3d_theme", mode);
  } catch (e) {}
}
function initTheme() {
  let mode;
  try {
    mode = localStorage.getItem("m3d_theme");
  } catch (e) {}
  if (!mode)
    mode = matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  applyTheme(mode);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
}

// ---------------------------------------------------------------
// Authentification (inscription du mot de passe admin au 1er lancement,
// puis connexion a chaque ouverture de l'app / rechargement)
// ---------------------------------------------------------------
const LOGO_SVG = `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" class="brand-logo" fill="none">
  <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="2"/>
  <path d="M12 26V14l8 8 8-8v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function authOverlay(innerHTML) {
  const el = document.createElement("div");
  el.className = "auth-screen";
  el.innerHTML = `<div class="auth-box">${innerHTML}</div>`;
  document.body.appendChild(el);
  wirePasswordToggles(el);
  return el;
}

// Champ mot de passe avec bouton oeil pour afficher/masquer la saisie
function pwField(id, labelText, autocomplete) {
  return `<div class="field">
    <label>${labelText}</label>
    <div class="pw-wrap">
      <input id="${id}" type="password" autocomplete="${autocomplete || "current-password"}">
      <button type="button" class="pw-toggle" data-target="${id}" aria-label="Afficher le mot de passe">
        <svg class="icon-eye" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        <svg class="icon-eye-off" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 7 11 7a17.4 17.4 0 0 1-3.06 4.06M6.1 6.1A17.5 17.5 0 0 0 1 12s4 7 11 7a10.9 10.9 0 0 0 4.9-1.14"/></svg>
      </button>
    </div>
  </div>`;
}
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

function showSetupScreen() {
  const el = authOverlay(`
    <div class="auth-logo" style="color:var(--accent);">${LOGO_SVG}</div>
    <h2>Bienvenue sur M3D Gestion</h2>
    <p class="small-note">Cree un mot de passe administrateur. Il sera demande a chaque ouverture de l'app et pour toute suppression, afin d'eviter les manipulations non autorisees.</p>
    ${pwField("su_pw", "Mot de passe", "new-password")}
    ${pwField("su_pw2", "Confirme le mot de passe", "new-password")}
    <div class="auth-error" id="su_err"></div>
    <button class="btn btn-primary" id="su_go">Creer et continuer</button>
  `);
  el.querySelector("#su_go").addEventListener("click", async () => {
    const pw = el.querySelector("#su_pw").value;
    const pw2 = el.querySelector("#su_pw2").value;
    const errEl = el.querySelector("#su_err");
    if (pw.length < 4) {
      errEl.textContent = "4 caracteres minimum.";
      return;
    }
    if (pw !== pw2) {
      errEl.textContent = "Les deux mots de passe ne correspondent pas.";
      return;
    }
    await setAdminPassword(pw);
    try {
      sessionStorage.setItem("m3d_authed", "1");
      localStorage.removeItem("m3d_hidden_at");
    } catch (e) {}
    el.remove();
    showTab("accueil");
  });
}

function showLoginScreen() {
  const el = authOverlay(`
    <div class="auth-logo" style="color:var(--accent);">${LOGO_SVG}</div>
    <h2>Jeunesse M3D</h2>
    <p class="small-note">Entre le mot de passe administrateur pour acceder a l'application.</p>
    ${pwField("li_pw", "Mot de passe")}
    <div class="auth-error" id="li_err"></div>
    <button class="btn btn-primary" id="li_go">Se connecter</button>
  `);
  const doLogin = async () => {
    const pw = el.querySelector("#li_pw").value;
    const ok = await verifyAdminPassword(pw);
    if (!ok) {
      el.querySelector("#li_err").textContent = "Mot de passe incorrect.";
      return;
    }
    try {
      sessionStorage.setItem("m3d_authed", "1");
      localStorage.removeItem("m3d_hidden_at");
    } catch (e) {}
    el.remove();
    showTab("accueil");
  };
  el.querySelector("#li_go").addEventListener("click", doLogin);
  el.querySelector("#li_pw").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

// Boite de confirmation qui exige le mot de passe admin (utilisee pour les
// suppressions et l'import qui remplace toutes les donnees).
function confirmWithPassword(message) {
  return new Promise((resolve) => {
    const ov = openSheet(`
      <button class="sheet-close" data-close>&times;</button>
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
    ov.querySelector("[data-close]").addEventListener("click", () =>
      finish(false),
    );
    ov.querySelector("#cwp_cancel").addEventListener("click", () =>
      finish(false),
    );
    ov.querySelector("#cwp_go").addEventListener("click", async () => {
      const pw = ov.querySelector("#cwp_pw").value;
      const ok = await verifyAdminPassword(pw);
      if (!ok) {
        ov.querySelector("#cwp_err").textContent = "Mot de passe incorrect.";
        return;
      }
      finish(true);
    });
  });
}

// ---------------------------------------------------------------
// Verrouillage automatique apres 5 minutes en arriere-plan
// ---------------------------------------------------------------
// AVANT (bugue) : un timestamp etait pose a la CONNEXION et compare a
// "maintenant" a chaque changement d'onglet. Deux problemes concrets :
//  1. Un utilisateur qui reste plus de 5 min sur le MEME ecran (ex. saisie
//     d'une longue collecte) se faisait deconnecter en pleine action, des
//     qu'il touchait enfin un autre onglet -- alors qu'il n'avait jamais
//     quitte l'app.
//  2. A l'inverse, si l'app etait mise en arriere-plan (telephone verrouille,
//     changement d'appli) puis reprecisement rouverte SUR LE MEME onglet
//     (sans navigation), aucun controle ne se declenchait : le mot de passe
//     n'etait JAMAIS redemande, quelle que soit la duree passee en arriere-
//     plan -- exactement le cas que la fonctionnalite est censee couvrir.
// MAINTENANT : on horodate le moment ou l'app devient VRAIMENT invisible
// (onglet cache, appli mise en arriere-plan, ecran verrouille -- l'event
// standard "visibilitychange") et on ne verifie l'ecart QUE quand elle
// redevient visible, quel que soit l'ecran ou l'utilisateur se trouvait.
// Duree avant reverrouillage automatique (mot de passe redemande) quand
// l'app reste en arriere-plan. Passe de 5 a 30 minutes sur demande — pour
// ajuster, il suffit de changer ce seul nombre (en minutes).
const SESSION_TIMEOUT_MINUTES = 30;
const SESSION_TIMEOUT_MS = SESSION_TIMEOUT_MINUTES * 60 * 1000;

function verrouillerSiExpire() {
  try {
    const authed = sessionStorage.getItem("m3d_authed") === "1";
    if (!authed) return false;
    const hiddenAt = localStorage.getItem("m3d_hidden_at");
    if (!hiddenAt) return false;
    if (Date.now() - parseInt(hiddenAt, 10) > SESSION_TIMEOUT_MS) {
      sessionStorage.removeItem("m3d_authed");
      localStorage.removeItem("m3d_hidden_at");
      // Ferme toute fiche ouverte pour ne rien laisser visible derriere
      // l'ecran de verrouillage (dette d'un membre, montant en caisse...).
      while (sheetStack.length) closeSheet();
      showLoginScreen();
      return true;
    }
  } catch (e) {}
  return false;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    try {
      localStorage.setItem("m3d_hidden_at", Date.now().toString());
    } catch (e) {}
  } else {
    verrouillerSiExpire();
  }
});

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------
function toast(msg, kind = "success") {
  const t = document.createElement("div");
  t.className = `toast toast-${kind}`;
  t.textContent = msg;
  document.getElementById("toast-host").appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 2200);
}

// ---------------------------------------------------------------
// Sheet (bottom sheet / dialog)
// ---------------------------------------------------------------
let sheetStack = [];
function openSheet(html) {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="sheet">${html}</div>`;
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeSheet();
  });
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("show"));
  sheetStack.push(ov);
  return ov;
}
function closeSheet() {
  const ov = sheetStack.pop();
  if (!ov) return;
  ov.classList.remove("show");
  setTimeout(() => ov.remove(), 200);
}

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------
async function showTab(tab) {
  currentTab = tab;
  document
    .querySelectorAll(".tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  app.innerHTML = `<div class="skeleton-block"></div><div class="skeleton-block"></div>`;
  window.scrollTo(0, 0);
  try {
    if (tab === "accueil") await renderAccueil();
    if (tab === "membres") await renderMembres();
    if (tab === "dimanche") await renderDimanche();
    if (tab === "dettes") await renderDettes();
    if (tab === "plus") await renderPlus();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty">Une erreur est survenue en chargeant cet ecran. Reessaie ou reviens a l'accueil.<br><span class="small-note">${err.message}</span></div>`;
  }
}
document
  .querySelectorAll(".tab")
  .forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------------------------------------------------------------
// ACCUEIL (Tableau de bord)
// ---------------------------------------------------------------
function activityLabel(a) {
  const map = {
    "membre:cree": "Nouveau membre ajoute",
    "membre:modifie": "Fiche membre modifiee",
    "membre:statut_modifie": "Statut d'un membre change",
    "dimanche:cree": "Nouveau dimanche de collecte",
    "dimanche:supprime": "Dimanche supprime",
    "paiement:marque_paye": "Cotisation marquee payee",
    "paiement:marque_non_paye": "Cotisation marquee non payee",
    "remboursement:cree": "Remboursement enregistre",
    "caisse:mouvement_manuel": "Mouvement de caisse manuel",
    "liste:creee": "Nouvelle liste creee",
    "liste:modifiee": "Liste modifiee",
    "liste:supprimee": "Liste supprimee",
    "liste:archivee": "Liste archivee",
    "liste:desarchivee": "Liste desarchivee",
    "liste:dupliquee": "Liste dupliquee",
    "liste:membre_ajoute": "Membre ajoute a une liste",
    "liste:membre_retire": "Membre retire d'une liste",
    "anniversaires:suppression_totale": "Anniversaires reinitialises",
    "cotisations:reinitialisation_totale": "Cotisations reinitialisees",
    "securite:mot_de_passe_admin_defini":
      "Mot de passe administrateur mis a jour",
    "systeme:seed": "Donnees initiales chargees",
  };
  return map[`${a.entite}:${a.action}`] || `${a.entite} — ${a.action}`;
}

// Recherche globale instantanee : Nom, Prenom, Telephone, Fonction,
// Anniversaire, Liste, Cotisation. Resultats groupes par categorie,
// mis a jour a chaque frappe, sans requete reseau (tout est local).
let globalSearchTimer = null;
function wireGlobalSearch() {
  const input = document.getElementById("globalSearch");
  const box = document.getElementById("globalSearchResults");
  if (!input) return;
  input.addEventListener("input", () => {
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(
      () => runGlobalSearch(input.value, box),
      120,
    );
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) box.innerHTML = "";
  });
}
async function runGlobalSearch(qRaw, box) {
  const q = qRaw.trim().toLowerCase();
  if (!q) {
    box.innerHTML = "";
    return;
  }
  const [membres, listes, joursStats] = await Promise.all([
    listMembres(),
    listesAll(),
    joursAvecStats(),
  ]);
  const matchMembres = membres
    .filter(
      (m) =>
        fullName(m).toLowerCase().includes(q) ||
        (m.telephone || "").includes(q) ||
        (m.fonction || "").toLowerCase().includes(q) ||
        (m.jour_anniversaire &&
          `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`.includes(
            q,
          )) ||
        (m.mois_anniversaire &&
          MOIS_NOMS[m.mois_anniversaire - 1].toLowerCase().includes(q)),
    )
    .slice(0, 5);
  const matchListes = listes
    .filter((l) => l.nom.toLowerCase().includes(q))
    .slice(0, 5);
  const matchCotis = joursStats
    .filter(
      (j) =>
        j.beneficiaires.join(" ").toLowerCase().includes(q) ||
        fmtDate(j.dimanche.date).includes(q),
    )
    .slice(0, 5);

  if (!matchMembres.length && !matchListes.length && !matchCotis.length) {
    box.innerHTML = `<div class="global-search-empty">Aucun resultat pour "${qRaw}"</div>`;
    box.classList.add("show");
    return;
  }
  const section = (title, items) =>
    items.length ? `<div class="gsr-title">${title}</div>${items}` : "";
  box.innerHTML =
    section(
      "Membres",
      matchMembres
        .map(
          (m) =>
            `<div class="gsr-item" data-go="membre" data-id="${m.id}"><span class="avatar" style="width:28px;height:28px;font-size:11px;">${initials(m)}</span>${esc(fullName(m))}</div>`,
        )
        .join(""),
    ) +
    section(
      "Listes",
      matchListes
        .map(
          (l) =>
            `<div class="gsr-item" data-go="liste" data-id="${l.id}"><span class="liste-icon" style="width:28px;height:28px;background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone, 14)}</span>${esc(l.nom)}</div>`,
        )
        .join(""),
    ) +
    section(
      "Cotisations",
      matchCotis
        .map(
          (j) =>
            `<div class="gsr-item" data-go="dimanche" data-id="${j.dimanche.id}">${fmtDate(j.dimanche.date)} — ${esc(j.beneficiaires.join(", ")) || "Collecte"}</div>`,
        )
        .join(""),
    );
  box.classList.add("show");
  box.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => {
      box.innerHTML = "";
      box.classList.remove("show");
      if (el.dataset.go === "membre") {
        showTab("membres").then(() => openMemberDetail(el.dataset.id));
      }
      if (el.dataset.go === "liste") {
        renderListes().then(() => openListeDetail(el.dataset.id));
      }
      if (el.dataset.go === "dimanche") {
        showTab("dimanche").then(() => openWeekDetail(el.dataset.id));
      }
    }),
  );
}

function openARelancerSheet(liste) {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>A relancer</h3>
    <div class="small-note" style="margin-bottom:12px;">Membres avec une dette envers le groupe et/ou 2 cotisations manquees d'affilee.</div>
    <div id="relancer_list"></div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  const box = document.getElementById("relancer_list");
  box.innerHTML = liste.length
    ? liste
        .map(
          (x) => `
    <div class="row" style="cursor:default;">
      <div class="avatar">${(x.nom[0] || "?").toUpperCase()}</div>
      <div class="info">
        <div class="name">${esc(x.nom)}</div>
        <div class="meta">${[x.montantDette > 0 ? `Dette ${fmt(x.montantDette)}` : "", x.irregulier ? "Irregulier" : ""].filter(Boolean).join(" &middot; ")}</div>
      </div>
      ${x.telephone ? `<a href="tel:${esc(x.telephone)}" class="badge badge-yes" style="text-decoration:none;">Appeler</a>` : ""}
    </div>`,
        )
        .join("")
    : emptyHTML("Personne a relancer, tout le monde est a jour !");
}

async function renderAccueil() {
  // Optimisation : toutes les requetes independantes partent EN PARALLELE
  // (Promise.all) au lieu de s'enchainer. membresIrreguliers() n'est
  // calcule QU'UNE FOIS ici et est ensuite transmis a membresARelancer()
  // (avant : calcule 2 fois a chaque affichage de l'accueil). Idem,
  // totalDettesImpayees()/caisseSolde() ne font plus de boucle par
  // dimanche cote db.js (voir db.js), donc les appeler restent legers.
  const [
    membres,
    joursStats,
    dettesTotal,
    solde,
    prochains,
    listes,
    irreguliersIds,
    pretsEnAttente,
    derniereSauvegarde,
    sessionId,
    membresMois,
  ] = await Promise.all([
    listMembres(),
    joursAvecStats(),
    totalDettesImpayees(),
    caisseSolde(),
    prochainAnniversaire(),
    listesAll({ archiveesSeulement: false }),
    membresIrreguliers(),
    pretsMembres({ nonRembourseSeulement: true }),
    getParam("derniere_sauvegarde", null),
    getParam("session_active"),
    membresAnniversaireCeMoisRestants(new Date().getMonth() + 1),
  ]);
  // compterCotisants() = nombre de membres ACTIFS ayant reellement paye
  // au moins une fois sur la session active (voir db.js pour le detail du
  // bug corrige : l'ancien calcul pouvait afficher un nombre negatif).
  const participantsCount = await compterCotisants(sessionId);
  const totalCollecte = joursStats.reduce((a, j) => a + j.totalCollecte, 0);
  const now = new Date();
  const mois = now.getMonth() + 1;
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const aRelancer = await membresARelancer(irreguliersIds);

  // Rappel de sauvegarde : la seule copie des donnees vit sur cet appareil.
  // Pas de sauvegarde recente = risque de tout perdre si le telephone est
  // perdu/casse/vole. On alerte au-dela de 14 jours (ou si jamais faite).
  const joursDepuisSauvegarde = derniereSauvegarde
    ? Math.floor((now - new Date(derniereSauvegarde)) / 86400000)
    : null;
  const sauvegardeAlerte =
    joursDepuisSauvegarde === null || joursDepuisSauvegarde > 14;

  app.innerHTML = `
    <div class="search-wrap" style="position:relative;">
      <input class="search" id="globalSearch" placeholder="Rechercher un membre, une liste, une cotisation...">
      <div id="globalSearchResults" class="global-search-results"></div>
    </div>
    ${
      sauvegardeAlerte
        ? `
    <div class="card" id="backupWarnBox" style="margin-bottom:16px;background:var(--bg-warning);border-color:transparent;cursor:pointer;">
      <div class="detail-row" style="border:none;padding:0;"><span class="k" style="color:var(--warning);font-weight:600;">${derniereSauvegarde ? `Derniere sauvegarde il y a ${joursDepuisSauvegarde} jours` : "Aucune sauvegarde n'a jamais ete faite"}</span></div>
      <div class="small-note" style="margin-top:4px;">Toutes les donnees ne vivent que sur cet appareil. Touche ici pour exporter une sauvegarde JSON maintenant.</div>
    </div>`
        : ""
    }
    <div class="kpi-grid">
      <div class="kpi k-navy"><div class="lbl">Membres</div><div class="val">${membres.length}</div></div>
      <div class="kpi k-blue"><div class="lbl">Cotisants</div><div class="val">${participantsCount}</div></div>
      <div class="kpi k-purple"><div class="lbl">Dimanches</div><div class="val">${joursStats.length}</div></div>
      <div class="kpi k-teal"><div class="lbl">Solde</div><div class="val" style="font-size:14.5px;">${fmt(solde)}</div></div>
      <div class="kpi k-red"><div class="lbl">Dettes</div><div class="val" style="font-size:14.5px;">${fmt(dettesTotal)}</div></div>
      <div class="kpi k-purple"><div class="lbl">Listes</div><div class="val">${listes.length}</div></div>
      <div class="kpi k-red clickable" id="kpiIrreguliers"><div class="lbl">Irreguliers</div><div class="val">${irreguliersIds.length}</div></div>
      <div class="kpi k-amber clickable" id="kpiPrets"><div class="lbl">Prets en attente</div><div class="val">${pretsEnAttente.length}</div></div>
      <div class="kpi k-navy clickable" id="kpiRelancer"><div class="lbl">A relancer</div><div class="val">${aRelancer.length}</div></div>
    </div>

    <div class="section-title"><h2>Anniversaires de ${MOIS_NOMS[mois - 1]}</h2></div>
    <div class="card list-card" id="moisBox" style="margin-bottom:8px;"></div>
    <div class="small-note" style="margin-bottom:22px;"></div>

    <div class="section-title" style="margin-top:8px;"><h2>Prochains anniversaires</h2></div>
    <div class="card list-card" id="prochainsBox" style="margin-bottom:22px;"></div>

    <div class="charts-grid">
      <div class="card chart-card">
        <div class="chart-title">Evolution de la caisse</div>
        <canvas id="chartCaisse" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="chart-title">Anniversaires par mois</div>
        <canvas id="chartMois" height="160"></canvas>
      </div>
      <div class="card chart-card">
        <div class="chart-title">Dernier dimanche</div>
        <canvas id="chartDonut" height="160"></canvas>
        <div id="donutLegend" class="donut-legend"></div>
      </div>
    </div>

    <div class="section-title"><h2>Recapitulatif des dernieres collectes</h2></div>
    <div id="dash-weeks"></div>
  `;

  const backupWarnBox = document.getElementById("backupWarnBox");
  if (backupWarnBox)
    backupWarnBox.addEventListener("click", () => showTab("plus"));
  document
    .getElementById("kpiIrreguliers")
    .addEventListener("click", () =>
      openARelancerSheet(aRelancer.filter((x) => x.irregulier)),
    );
  document
    .getElementById("kpiPrets")
    .addEventListener("click", () => renderPretsMembres());
  document
    .getElementById("kpiRelancer")
    .addEventListener("click", () => openARelancerSheet(aRelancer));

  wireGlobalSearch();

  document.getElementById("prochainsBox").innerHTML =
    prochains
      .slice(0, 5)
      .map((x) => {
        const bdayIso = dateToIso(x.bday),
          dimIso = dateToIso(x.dimanche);
        const diff = bdayIso !== dimIso;
        return `<div class="row" data-id="${x.membre.id}">
      <div class="avatar">${initials(x.membre)}</div>
      <div class="info"><div class="name">${esc(fullName(x.membre))}</div>
        <div class="meta">Anniversaire le ${fmtDate(bdayIso)}${diff ? ` &middot; cotisation le dimanche ${fmtDate(dimIso)}` : " &middot; tombe un dimanche"}</div>
      </div>
      <span class="badge badge-yes">12 000 F</span>
    </div>`;
      })
      .join("") || emptyHTML("Aucune date d'anniversaire connue.");
  document
    .querySelectorAll("#prochainsBox .row")
    .forEach((el) =>
      el.addEventListener("click", () => openMemberDetail(el.dataset.id)),
    );

  document.getElementById("moisBox").innerHTML =
    membresMois
      .map(
        (m) => `
    <div class="row" data-id="${m.id}">
      <div class="avatar" style="background:var(--bg-warning);color:var(--warning);">${initials(m)}</div>
      <div class="info"><div class="name">${esc(fullName(m))}</div><div class="meta">${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}</div></div>
    </div>`,
      )
      .join("") || emptyHTML("Aucun anniversaire restant ce mois-ci.");
  document
    .querySelectorAll("#moisBox .row")
    .forEach((el) =>
      el.addEventListener("click", () => openMemberDetail(el.dataset.id)),
    );

  const last = joursStats.slice(0, 3);
  document.getElementById("dash-weeks").innerHTML =
    last.map((j) => weekCardDetailedHTML(j, memById)).join("") ||
    emptyHTML("Aucune collecte enregistree.");
  attachWeekCardHandlers();

  lastJoursStats = joursStats;
  lastMembres = membres;
  drawCaisseChart(joursStats);
  drawMonthBarChart(membres);
  drawDonutChart(joursStats[0]);
}

// ---------------------------------------------------------------
// Redimensionnement automatique des graphiques (rotation d'ecran,
// passage mobile/tablette/desktop, redimensionnement de fenetre)
// ---------------------------------------------------------------
let lastJoursStats = [],
  lastMembres = [];
function redrawAccueilCharts() {
  if (currentTab !== "accueil") return;
  if (!document.getElementById("chartCaisse")) return;
  drawCaisseChart(lastJoursStats);
  drawMonthBarChart(lastMembres);
  drawDonutChart(lastJoursStats[0]);
}
let resizeTimer;
function onViewportChange() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redrawAccueilCharts, 150);
}
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);
if (window.visualViewport)
  window.visualViewport.addEventListener("resize", onViewportChange);

function weekCardDetailedHTML(j, memById) {
  const tagClass =
    j.solde > 0 ? "tag-surplus" : j.solde < 0 ? "tag-manque" : "tag-exact";
  const tagText =
    j.solde > 0
      ? `+ ${fmt(j.solde)} pour la caisse`
      : j.solde < 0
        ? `Manque ${fmt(Math.abs(j.solde))}`
        : "Montant exact";
  const who = j.beneficiaires.length
    ? esc(j.beneficiaires.join(", "))
    : "Aucun anniversaire cette semaine";
  const nonPayeurs = j.paiements
    .filter((p) => !p.a_paye)
    .map((p) =>
      memById[p.id_membre] ? esc(fullName(memById[p.id_membre])) : "?",
    );
  return `<div class="week-card" data-dimanche="${j.dimanche.id}">
    <div class="top"><span class="date">${fmtDate(j.dimanche.date)}</span><span class="amount">${fmt(j.totalCollecte)}</span></div>
    <div class="desc">${who}</div>
    <div class="detail-row" style="border:none;padding:6px 0 2px;"><span class="k">Ont cotise</span><span class="v" style="color:var(--success);">${j.nbPayants} / ${j.nbTotal}</span></div>
    ${nonPayeurs.length ? `<div class="detail-row" style="border:none;padding:0 0 6px;"><span class="k">N'ont pas cotise</span><span class="v" style="color:var(--danger);text-align:right;">${nonPayeurs.join(", ")}</span></div>` : ""}
    <div class="detail-row" style="border:none;padding:0 0 6px;"><span class="k">Montant par membre</span><span class="v">${fmt(j.montantAttendu)}</span></div>
    <div class="tag-row"><span class="tag ${tagClass}">${tagText}</span></div>
  </div>`;
}

function drawCaisseChart(joursStats) {
  const canvas = document.getElementById("chartCaisse");
  if (!canvas) return;
  const ordered = [...joursStats].reverse();
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2),
    H = (canvas.height = 160 * 2);
  ctx.clearRect(0, 0, W, H);
  if (ordered.length === 0) {
    emptyCanvasMsg(ctx, W, H);
    return;
  }
  let running = 0;
  const points = ordered.map((j) => (running += j.solde));
  const max = Math.max(...points, 1),
    min = Math.min(...points, 0);
  const pad = 40,
    x0 = pad,
    x1 = W - pad,
    y0 = H - pad,
    y1 = pad + 10;
  const stepX = points.length > 1 ? (x1 - x0) / (points.length - 1) : 0;
  const sy = (v) => y0 - ((v - min) / (max - min || 1)) * (y0 - y1);
  const accent = cssVar("--accent");
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  points.forEach((v, i) => {
    const x = x0 + stepX * i,
      y = sy(v);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = accent + "1A";
  ctx.lineTo(x0 + stepX * (points.length - 1), y0);
  ctx.lineTo(x0, y0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  points.forEach((v, i) => {
    const x = x0 + stepX * i,
      y = sy(v);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, 7);
    ctx.fill();
  });
}

function drawMonthBarChart(membres) {
  const canvas = document.getElementById("chartMois");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2),
    H = (canvas.height = 160 * 2);
  ctx.clearRect(0, 0, W, H);
  const counts = Array(12).fill(0);
  membres.forEach((m) => {
    if (m.mois_anniversaire) counts[m.mois_anniversaire - 1]++;
  });
  const max = Math.max(...counts, 1);
  const pad = 30,
    bottom = H - 34,
    top = 16;
  const w = (W - pad * 2) / 12;
  const accent = cssVar("--purple");
  const labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  ctx.font = "20px 'Plus Jakarta Sans', sans-serif";
  ctx.fillStyle = cssVar("--text-3");
  ctx.textAlign = "center";
  counts.forEach((c, i) => {
    const h = (c / max) * (bottom - top - 10);
    const x = pad + w * i + w * 0.2,
      bw = w * 0.6;
    ctx.fillStyle = c > 0 ? accent : cssVar("--border");
    roundRectTop(ctx, x, bottom - h, bw, Math.max(h, 3), 4);
    ctx.fillStyle = cssVar("--text-3");
    ctx.fillText(labels[i], x + bw / 2, H - 10);
    if (c > 0) {
      ctx.fillStyle = cssVar("--text-2");
      ctx.fillText(String(c), x + bw / 2, bottom - h - 8);
    }
  });
}
function roundRectTop(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawDonutChart(jourDernier) {
  const canvas = document.getElementById("chartDonut");
  const legend = document.getElementById("donutLegend");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2),
    H = (canvas.height = 160 * 2);
  ctx.clearRect(0, 0, W, H);
  if (!jourDernier) {
    emptyCanvasMsg(ctx, W, H);
    if (legend) legend.innerHTML = "";
    return;
  }
  const paye = jourDernier.nbPayants,
    nonPaye = jourDernier.nbTotal - jourDernier.nbPayants;
  const total = paye + nonPaye || 1;
  const cx = W / 2,
    cy = H / 2 - 6,
    r = Math.min(W, H) / 2 - 20,
    rInner = r * 0.62;
  const segs = [
    { v: paye, color: cssVar("--success") },
    { v: nonPaye, color: cssVar("--danger") },
  ];
  let start = -Math.PI / 2;
  segs.forEach((s) => {
    const angle = (s.v / total) * Math.PI * 2;
    if (s.v > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + angle);
      ctx.arc(cx, cy, rInner, start + angle, start, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
    }
    start += angle;
  });
  ctx.fillStyle = cssVar("--text");
  ctx.textAlign = "center";
  ctx.font = "bold 30px 'Sora', sans-serif";
  ctx.fillText(Math.round((paye / total) * 100) + "%", cx, cy + 10);
  if (legend) {
    legend.innerHTML = `
      <span><i style="background:${cssVar("--success")}"></i>Ont paye (${paye})</span>
      <span><i style="background:${cssVar("--danger")}"></i>N'ont pas paye (${nonPaye})</span>`;
  }
}
function emptyCanvasMsg(ctx, W, H) {
  ctx.fillStyle = "#9CA3AF";
  ctx.font = "22px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Pas encore de donnees", W / 2, H / 2);
}
function cssVar(name) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    "#2563EB"
  );
}

function weekCardHTML(j) {
  const tagClass =
    j.solde > 0 ? "tag-surplus" : j.solde < 0 ? "tag-manque" : "tag-exact";
  const tagText =
    j.solde > 0
      ? `+ ${fmt(j.solde)} pour la caisse`
      : j.solde < 0
        ? `Manque ${fmt(Math.abs(j.solde))}`
        : "Montant exact";
  const who = j.beneficiaires.length
    ? esc(j.beneficiaires.join(", "))
    : "Aucun anniversaire cette semaine";
  return `<div class="week-card" data-dimanche="${j.dimanche.id}">
    <div class="top"><span class="date">${fmtDate(j.dimanche.date)}</span><span class="amount">${fmt(j.totalCollecte)}</span></div>
    <div class="desc">${who} &middot; ${j.nbPayants}/${j.nbTotal} ont cotise &middot; ${fmt(j.montantAttendu)}/membre</div>
    <div class="tag-row"><span class="tag ${tagClass}">${tagText}</span></div>
  </div>`;
}
function attachWeekCardHandlers() {
  document
    .querySelectorAll(".week-card")
    .forEach((el) =>
      el.addEventListener("click", () => openWeekDetail(el.dataset.dimanche)),
    );
}
function emptyHTML(text) {
  return `<div class="empty">${text}</div>`;
}

// ---------------------------------------------------------------
// MEMBRES
// ---------------------------------------------------------------
let memberQuery = "";
let memberSort = "alpha";
let memberFilterFonction = "";
let memberFilterMois = "";
let memberFilterStatut = "";
function memberFiltersActive() {
  return (
    !!(memberFilterFonction || memberFilterMois || memberFilterStatut) ||
    memberSort !== "alpha"
  );
}
async function renderMembres() {
  app.innerHTML = `
    <input class="search" id="memberSearch" placeholder="Rechercher un membre..." value="${esc(memberQuery)}">
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${memberFiltersActive() ? "active" : ""}" id="memberFiltersBtn">Filtrer &amp; trier${memberFiltersActive() ? " ●" : ""}</button>
    </div>
    <div class="card list-card" id="memberList"></div>
    <div class="fab-zone"><button class="fab" id="addMemberBtn" aria-label="Ajouter un membre"><svg viewBox="0 0 24 24" width="24" height="24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
  `;
  document.getElementById("memberSearch").addEventListener("input", (e) => {
    memberQuery = e.target.value;
    renderMemberList();
  });
  document
    .getElementById("addMemberBtn")
    .addEventListener("click", openAddMember);
  document
    .getElementById("memberFiltersBtn")
    .addEventListener("click", openMemberFiltersSheet);
  await renderMemberList();
}
function openMemberFiltersSheet() {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Filtrer &amp; trier</h3>
    <div class="field"><label>Trier par</label>
      <select id="mf_sort">
        <option value="alpha"${memberSort === "alpha" ? " selected" : ""}>Ordre alphabetique (nom)</option>
        <option value="date"${memberSort === "date" ? " selected" : ""}>Date d'ajout (plus recent)</option>
        <option value="fonction"${memberSort === "fonction" ? " selected" : ""}>Fonction</option>
      </select>
    </div>
    <div class="field"><label>Fonction</label>
      <select id="mf_fonction"><option value="">Toutes</option>${FONCTIONS.map((f) => `<option value="${f}"${memberFilterFonction === f ? " selected" : ""}>${f}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Mois d'anniversaire</label>
      <select id="mf_mois"><option value="">Tous</option>${MOIS_NOMS.map((nom, i) => `<option value="${i + 1}"${memberFilterMois === String(i + 1) ? " selected" : ""}>${nom}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Statut</label>
      <select id="mf_statut"><option value="">Tous</option><option value="Actif"${memberFilterStatut === "Actif" ? " selected" : ""}>Actif</option><option value="Inactif"${memberFilterStatut === "Inactif" ? " selected" : ""}>Inactif</option></select>
    </div>
    <button class="btn btn-primary" id="mf_apply" style="margin-bottom:8px;">Appliquer</button>
    <button class="btn btn-ghost" id="mf_reset">Reinitialiser les filtres</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document.getElementById("mf_apply").addEventListener("click", () => {
    memberSort = document.getElementById("mf_sort").value;
    memberFilterFonction = document.getElementById("mf_fonction").value;
    memberFilterMois = document.getElementById("mf_mois").value;
    memberFilterStatut = document.getElementById("mf_statut").value;
    closeSheet();
    renderMembres();
  });
  document.getElementById("mf_reset").addEventListener("click", () => {
    memberSort = "alpha";
    memberFilterFonction = "";
    memberFilterMois = "";
    memberFilterStatut = "";
    closeSheet();
    renderMembres();
  });
}
async function renderMemberList() {
  const q = memberQuery.trim().toLowerCase();
  const all = await listMembres();
  let list = all.filter(
    (m) =>
      fullName(m).toLowerCase().includes(q) || (m.telephone || "").includes(q),
  );
  if (memberFilterFonction)
    list = list.filter(
      (m) => (m.fonction || "Membre") === memberFilterFonction,
    );
  if (memberFilterMois)
    list = list.filter(
      (m) => String(m.mois_anniversaire || "") === memberFilterMois,
    );
  if (memberFilterStatut)
    list = list.filter((m) => m.statut === memberFilterStatut);
  if (memberSort === "date")
    list.sort((a, b) =>
      (b.date_adhesion || "").localeCompare(a.date_adhesion || ""),
    );
  else if (memberSort === "fonction")
    list.sort(
      (a, b) =>
        (a.fonction || "Membre").localeCompare(b.fonction || "Membre") ||
        fullName(a).localeCompare(fullName(b)),
    );
  // "alpha" est deja l'ordre par defaut renvoye par listMembres()
  const irreguliers = new Set(await membresIrreguliers());
  const box = document.getElementById("memberList");
  if (!box) return;
  box.innerHTML =
    list
      .map(
        (m) => `
    <div class="row" data-id="${m.id}">
      <div class="avatar" style="${m.statut === "Inactif" ? "opacity:.45" : ""}">${initials(m)}</div>
      <div class="info"><div class="name">${esc(fullName(m))}${irreguliers.has(m.id) ? ' <span class="badge badge-no" style="margin-left:6px;font-size:10.5px;vertical-align:middle;">⚠ Irregulier</span>' : ""}</div>
      <div class="meta">${m.jour_anniversaire ? String(m.jour_anniversaire).padStart(2, "0") + "/" + String(m.mois_anniversaire).padStart(2, "0") : "Date inconnue"} &middot; ${esc(m.fonction || "Membre")}</div></div>
      <span class="badge ${m.statut === "Actif" ? "badge-yes" : "badge-no"}">${m.statut}</span>
    </div>`,
      )
      .join("") || emptyHTML("Aucun membre trouve.");
  box
    .querySelectorAll(".row")
    .forEach((el) =>
      el.addEventListener("click", () => openMemberDetail(el.dataset.id)),
    );
}
async function openMemberDetail(id) {
  const m = await db.membres.get(id);
  const dettes = (await dettesList()).filter((d) => d.id_membre === id);
  const dettesTot = dettes
    .filter((d) => d.statut === "Impayee")
    .reduce((a, d) => a + d.montant, 0);
  const sessionId = await getParam("session_active");
  const part = await isParticipant(id, sessionId);
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>${esc(fullName(m))}</h3>
    <div class="small-note" style="margin-bottom:10px;">${m.id}${m.observations ? " &middot; " + esc(m.observations) : ""}</div>
    <div class="detail-row"><span class="k">Anniversaire</span><span class="v">${m.jour_anniversaire ? String(m.jour_anniversaire).padStart(2, "0") + "/" + String(m.mois_anniversaire).padStart(2, "0") : "Inconnue"}</span></div>
    <div class="detail-row"><span class="k">Telephone</span><span class="v">${esc(m.telephone || "—")}</span></div>
    <div class="detail-row"><span class="k">Fonction</span><span class="v">${esc(m.fonction)}</span></div>
    <div class="detail-row"><span class="k">Cotisation hebdo.</span><span class="v">${m.cotisation_personnalisee ? fmt(m.cotisation_personnalisee) + " (personnalisee)" : "Montant par defaut"}</span></div>
    <div class="detail-row"><span class="k">Statut</span><span class="v">${m.statut}</span></div>
    <div class="detail-row"><span class="k">Participe (session active)</span><span class="v">${part ? "Oui" : "Non"}</span></div>
    <div class="detail-row"><span class="k">Dettes en cours</span><span class="v">${fmt(dettesTot)}</span></div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="historiqueBtn" style="margin-bottom:8px;">Voir l'historique des cotisations</button>
      <button class="btn btn-ghost" id="exportFicheBtn" style="margin-bottom:8px;">Envoyer sa fiche complete (PDF)</button>
      <button class="btn btn-ghost" id="editMemberBtn" style="margin-bottom:8px;">Modifier fonction / cotisation</button>
      <button class="btn btn-ghost" id="toggleStatutBtn">${m.statut === "Actif" ? "Marquer inactif" : "Reactiver"}</button>
    </div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document
    .getElementById("exportFicheBtn")
    .addEventListener("click", () => exportMembreIndividuelPDF(id));
  document
    .getElementById("toggleStatutBtn")
    .addEventListener("click", async () => {
      if (m.statut === "Actif") {
        const nbEffacees = await passerMembreInactif(id);
        closeSheet();
        toast(
          nbEffacees > 0
            ? `Membre passe Inactif — ${nbEffacees} dette(s) effacee(s)`
            : "Membre passe Inactif",
        );
      } else {
        await db.membres.update(id, { statut: "Actif" });
        await log("membre", "statut_modifie", id);
        closeSheet();
        toast("Membre reactive");
      }
      renderMemberList();
    });
  document.getElementById("editMemberBtn").addEventListener("click", () => {
    closeSheet();
    setTimeout(() => openEditMember(m), 200);
  });
  document
    .getElementById("historiqueBtn")
    .addEventListener("click", () => openHistoriqueMembre(m));
}
async function openHistoriqueMembre(m) {
  const historique = await historiquePaiementsMembre(m.id);
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Historique — ${esc(fullName(m))}</h3>
    <div class="small-note" style="margin-bottom:12px;">${historique.length} dimanche(s) ou ${esc(m.prenom)} etait attendu(e).</div>
    <div id="histo_list"></div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  const box = document.getElementById("histo_list");
  box.innerHTML = historique.length
    ? historique
        .slice()
        .reverse()
        .map(
          (h) => `
    <div class="detail-row">
      <span class="k">${fmtDate(h.date)}${h.beneficiaires.length ? ` <span class="small-note" style="display:inline;">(${esc(h.beneficiaires.join(", "))})</span>` : ""}</span>
      <span class="v" style="color:${h.a_paye ? "var(--success)" : "var(--danger)"};">${h.a_paye ? "Paye" : "Non paye"}</span>
    </div>`,
        )
        .join("")
    : emptyHTML("Aucun dimanche enregistre pour ce membre pour l'instant.");
}
function openEditMember(m) {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Modifier ${esc(fullName(m))}</h3>
    <div class="field-row">
      <div class="field"><label>Nom</label><input id="em_nom" type="text" value="${esc(m.nom || "")}"></div>
      <div class="field"><label>Prenom</label><input id="em_prenom" type="text" value="${esc(m.prenom || "")}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Jour anniv.</label><select id="em_jj">${dayOptionsHTML(m.jour_anniversaire)}</select></div>
      <div class="field"><label>Mois anniv.</label><select id="em_mm">${monthOptionsHTML(m.mois_anniversaire)}</select></div>
    </div>
    <div class="field"><label>Fonction</label><select id="em_fonction_select">${fonctionOptionsHTML(m.fonction || "Membre")}</select></div>
    <div class="field" id="em_fonction_autre_wrap" style="display:none;"><label>Preciser la fonction</label><input id="em_fonction_autre" type="text" placeholder="Ex: Responsable des enfants"></div>
    <div class="field"><label>Telephone</label><input id="em_tel" type="tel" value="${esc(m.telephone || "")}"></div>
    <div class="field"><label>Cotisation hebdomadaire personnalisee (FCFA)</label><input id="em_cotis" type="number" placeholder="Laisser vide = montant par defaut" value="${m.cotisation_personnalisee || ""}"></div>
    <div class="small-note" style="margin-bottom:12px;">Ex. le President cotise 1000 F au lieu des 500 F habituels : indique 1000 ici pour lui.</div>
    <div class="field"><label>Statut</label>
      <select id="em_statut">
        <option value="Actif"${m.statut === "Actif" ? " selected" : ""}>Actif (cotise, apparait dans les prochains dimanches)</option>
        <option value="Inactif"${m.statut === "Inactif" ? " selected" : ""}>Inactif (ne cotise plus, n'apparait plus)</option>
      </select>
    </div>
    <div class="field"><label>Observations</label><input id="em_obs" type="text" value="${esc(m.observations || "")}" placeholder="Facultatif"></div>
    <button class="btn btn-primary" id="em_save" style="margin-top:14px;">Enregistrer</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  wireFonctionAutre(
    "em_fonction_select",
    "em_fonction_autre_wrap",
    "em_fonction_autre",
    m.fonction || "Membre",
  );
  document.getElementById("em_save").addEventListener("click", async () => {
    const prenom = document.getElementById("em_prenom").value.trim();
    if (!prenom) {
      toast("Le prenom est obligatoire", "error");
      return;
    }
    const cotisVal = document.getElementById("em_cotis").value;
    const nouveauStatut = document.getElementById("em_statut").value;
    const passageEnInactif =
      m.statut === "Actif" && nouveauStatut === "Inactif";
    await db.membres.update(m.id, {
      nom: document.getElementById("em_nom").value.trim(),
      prenom,
      jour_anniversaire: Number(document.getElementById("em_jj").value) || null,
      mois_anniversaire: Number(document.getElementById("em_mm").value) || null,
      fonction: fonctionValueFrom("em_fonction_select", "em_fonction_autre"),
      telephone: document.getElementById("em_tel").value.trim(),
      cotisation_personnalisee: cotisVal ? Number(cotisVal) : null,
      statut: nouveauStatut,
      observations: document.getElementById("em_obs").value.trim(),
    });
    await log("membre", "modifie", m.id);
    if (passageEnInactif) {
      // passerMembreInactif() efface les dettes (paiements non payes) mais
      // remet a jour le statut une 2e fois -- inoffensif, deja "Inactif".
      const nbEffacees = await passerMembreInactif(m.id);
      closeSheet();
      toast(
        nbEffacees > 0
          ? `Membre passe Inactif — ${nbEffacees} dette(s) effacee(s)`
          : "Membre passe Inactif",
      );
    } else {
      closeSheet();
      toast("Membre mis a jour");
    }
    renderMemberList();
  });
}
function openAddMember() {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Nouveau membre</h3>
    <div class="field"><label>Nom</label><input id="f_nom" type="text"></div>
    <div class="field"><label>Prenom</label><input id="f_prenom" type="text" required></div>
    <div class="field-row">
      <div class="field"><label>Jour anniv.</label><select id="f_jj">${dayOptionsHTML(null)}</select></div>
      <div class="field"><label>Mois anniv.</label><select id="f_mm">${monthOptionsHTML(null)}</select></div>
    </div>
    <div class="field"><label>Telephone</label><input id="f_tel" type="tel"></div>
    <div class="field"><label>Fonction</label><select id="f_fonction_select">${fonctionOptionsHTML("Membre")}</select></div>
    <div class="field" id="f_fonction_autre_wrap" style="display:none;"><label>Preciser la fonction</label><input id="f_fonction_autre" type="text" placeholder="Ex: Responsable des enfants"></div>
    <div class="field"><label>Cotisation hebdomadaire (FCFA)</label><input id="f_cotis" type="number" placeholder="Laisser vide = montant par defaut"></div>
    <button class="btn btn-primary" id="saveMemberBtn">Ajouter</button>
    <div class="small-note">Le nouveau membre rejoint le registre general. Il participera aux collectes a partir de la prochaine session, sauf si tu l'ajoutes manuellement a un dimanche.</div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  wireFonctionAutre(
    "f_fonction_select",
    "f_fonction_autre_wrap",
    "f_fonction_autre",
    "Membre",
  );
  document
    .getElementById("saveMemberBtn")
    .addEventListener("click", async () => {
      const prenom = document.getElementById("f_prenom").value.trim();
      if (!prenom) {
        toast("Le prenom est obligatoire", "error");
        return;
      }
      const id = "M" + String(Date.now()).slice(-6);
      await db.membres.add({
        id,
        nom: document.getElementById("f_nom").value.trim(),
        prenom,
        jour_anniversaire:
          Number(document.getElementById("f_jj").value) || null,
        mois_anniversaire:
          Number(document.getElementById("f_mm").value) || null,
        telephone: document.getElementById("f_tel").value.trim(),
        fonction: fonctionValueFrom("f_fonction_select", "f_fonction_autre"),
        cotisation_personnalisee:
          Number(document.getElementById("f_cotis").value) || null,
        statut: "Actif",
        date_adhesion: todayISO(),
        observations: "",
      });
      await log("membre", "cree", id);
      closeSheet();
      toast("Membre ajoute");
      renderMemberList();
    });
}

// ---------------------------------------------------------------
// DIMANCHE DE COLLECTE
// ---------------------------------------------------------------
let dimancheShowArchives = false;
async function renderDimanche() {
  const joursStats = await joursAvecStats();
  const visibles = joursStats.filter((j) =>
    dimancheShowArchives ? j.dimanche.archivee : !j.dimanche.archivee,
  );
  app.innerHTML = `
    <div class="section-title" style="margin-top:0;"><h2>Dimanches</h2></div>
    <button class="btn btn-primary" id="newSundayBtn" style="margin-bottom:14px;">+ Nouveau dimanche</button>
    <div class="row" style="border:none;padding:0 4px 14px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!dimancheShowArchives ? "active" : ""}" id="dim_filtre_actifs">Actifs</button>
      <button class="btn-chip ${dimancheShowArchives ? "active" : ""}" id="dim_filtre_archives">Archives</button>
    </div>
    <div id="weeksFull"></div>
  `;
  document
    .getElementById("newSundayBtn")
    .addEventListener("click", openNewSunday);
  document.getElementById("dim_filtre_actifs").addEventListener("click", () => {
    dimancheShowArchives = false;
    renderDimanche();
  });
  document
    .getElementById("dim_filtre_archives")
    .addEventListener("click", () => {
      dimancheShowArchives = true;
      renderDimanche();
    });
  document.getElementById("weeksFull").innerHTML =
    visibles.map(weekCardHTML).join("") ||
    emptyHTML(
      dimancheShowArchives
        ? "Aucun dimanche archive."
        : "Aucune collecte enregistree. Cree le premier dimanche.",
    );
  attachWeekCardHandlers();
}
async function openNewSunday() {
  const membres = await listMembres({ actifsSeulement: true });
  const initialDate = todayISO();
  const suggested = await membresAnniversaireCeDimanche(initialDate);
  const suggestedIds = new Set(suggested.map((m) => m.id));
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Nouveau dimanche</h3>
    <div class="field"><label>Date</label><input id="nd_date" type="date" value="${initialDate}"></div>
    <div class="field"><label>Anniversaire(s) ce dimanche</label>
      <select id="nd_benef" multiple size="5">
        ${membres.map((m) => `<option value="${m.id}" ${suggestedIds.has(m.id) ? "selected" : ""}>${esc(fullName(m))}</option>`).join("")}
      </select>
    </div>
    <div class="small-note" id="nd_hint">${suggested.length ? `Detecte automatiquement : ${suggested.map(fullName).join(", ")}. Modifie la selection si besoin (Ctrl/Cmd + clic).` : "Aucun anniversaire detecte automatiquement pour cette date. Selectionne manuellement si besoin."}</div>
    <div class="small-note">Tous les membres partiront de "Non paye" — tu coches au fur et a mesure que chacun cotise, ca s'enregistre seul.</div>
    <button class="btn btn-primary" id="createSundayBtn" style="margin-top:14px;">Creer le dimanche</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document.getElementById("nd_date").addEventListener("change", async (e) => {
    const sug = await membresAnniversaireCeDimanche(e.target.value);
    const sugIds = new Set(sug.map((m) => m.id));
    document.querySelectorAll("#nd_benef option").forEach((o) => {
      o.selected = sugIds.has(o.value);
    });
    document.getElementById("nd_hint").textContent = sug.length
      ? `Detecte automatiquement : ${sug.map(fullName).join(", ")}. Modifie la selection si besoin.`
      : "Aucun anniversaire detecte automatiquement pour cette date. Selectionne manuellement si besoin.";
  });
  document
    .getElementById("createSundayBtn")
    .addEventListener("click", async () => {
      const date = document.getElementById("nd_date").value;
      if (!date) {
        toast("Choisis une date", "error");
        return;
      }
      const existant = await dimancheExisteADate(date);
      if (existant) {
        const continuer = confirm(
          `Un dimanche existe deja a cette date (${fmtDate(date)}). Creer quand meme un 2e dimanche a la meme date ?`,
        );
        if (!continuer) {
          toast("Dimanche non cree — ouvre plutot celui qui existe deja");
          return;
        }
      }
      const benef = Array.from(
        document.getElementById("nd_benef").selectedOptions,
      ).map((o) => o.value);
      const id = await nouveauDimanche({ date, beneficiaireIds: benef });
      closeSheet();
      toast("Dimanche cree");
      showTab("dimanche");
      setTimeout(() => openWeekDetail(id), 150);
    });
}
// paiementRowHTML : un seul gabarit pour la ligne "membre + statut" d'une
// collecte. Avant, ce template etait duplique mot pour mot (initial +
// refreshWeekRows), avec le risque classique de corriger un bug a un seul
// endroit et pas l'autre — c'est d'ailleurs comme ca que le bouton "Pret"
// avait fini legerement desaligne du bouton "Paye/Non paye" (tailles de
// police/padding differentes entre .toggle et .btn-chip). Maintenant les
// 3 etats (Paye / Non paye / Paye via pret) utilisent tous la classe
// .toggle, avec la MEME taille — seule la couleur change — donc "Pret"
// est visuellement aligne comme "Paye"/"Non paye" au lieu d'etre un
// bouton a part de style different.
function paiementRowHTML(p, memById, preteurParPaiement) {
  const m = memById[p.id_membre] || { nom: "?", prenom: "" };
  const idPreteur = preteurParPaiement[p.id];
  const preteur = idPreteur ? memById[idPreteur] : null;
  let etatClasse = "off",
    label = "Non paye";
  if (p.a_paye && preteur) {
    etatClasse = "loan";
    label = `Pret (${esc(fullName(preteur))})`;
  } else if (p.a_paye) {
    etatClasse = "on";
    label = "Paye";
  }
  return `<div class="chip-row" data-paiement="${p.id}">
    <span class="name">${esc(fullName(m))}</span>
    <div class="chip-actions">
      ${!p.a_paye ? `<button class="toggle toggle-ghost" data-pret="${p.id}" title="Un autre membre a paye a sa place">Pret</button>` : ""}
      <button class="toggle ${etatClasse}" data-toggle-paiement="${p.id}">${label}</button>
    </div>
  </div>`;
}

async function openWeekDetail(dimId) {
  const dim = await db.dimanches.get(dimId);
  if (!dim) return;
  const [paiements, anniv, membres, pretsDuJour] = await Promise.all([
    db.paiements.where("id_dimanche").equals(dimId).toArray(),
    db.anniversaires_du_jour.where("id_dimanche").equals(dimId).toArray(),
    db.membres.toArray(),
    db.prets_membres.where("id_dimanche").equals(dimId).toArray(),
  ]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  let preteurParPaiement = Object.fromEntries(
    pretsDuJour.map((pr) => [pr.id_paiement, pr.id_preteur]),
  );
  const benefNames =
    anniv
      .map((a) =>
        memById[a.id_membre_fete]
          ? esc(fullName(memById[a.id_membre_fete]))
          : "?",
      )
      .join(", ") || "Collecte normale";
  const total = paiements.reduce((a, p) => a + p.montant_paye, 0);
  const montantAttendu = paiements[0] ? paiements[0].montant_attendu : 0;

  const triParNom = (a, b) =>
    fullName(memById[a.id_membre] || {}).localeCompare(
      fullName(memById[b.id_membre] || {}),
    );

  const totalId = "wd_total_" + dimId;
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>${benefNames}</h3>
    <div class="field" style="margin-top:10px;">
      <label>Date du dimanche</label>
      <input type="date" id="wd_date" value="${dim.date}">
    </div>
    <div class="small-note" style="margin-bottom:8px;" id="${totalId}">Total cotise : <b>${fmt(total)}</b> (${fmt(montantAttendu)}/membre)</div>
    <div id="wd_rows">${paiements
      .slice()
      .sort(triParNom)
      .map((p) => paiementRowHTML(p, memById, preteurParPaiement))
      .join("")}</div>
    <div class="sheet-actions">
      <button class="btn btn-ghost" id="wd_export" style="margin-bottom:8px;">Exporter cette cotisation (PDF)</button>
      <button class="btn btn-ghost" id="wd_archive" style="margin-bottom:8px;">${dim.archivee ? "Desarchiver" : "Archiver"} ce dimanche</button>
      <button class="btn btn-ghost" id="wd_delete" style="color:var(--danger);">Supprimer ce dimanche</button>
    </div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#wd_export").addEventListener("click", () =>
    exportCotisationPDF(dimId),
  );
  ov.querySelector("#wd_archive").addEventListener("click", async () => {
    await db.dimanches.update(dimId, { archivee: !dim.archivee });
    await log("dimanche", dim.archivee ? "desarchive" : "archive", dimId);
    closeSheet();
    toast(dim.archivee ? "Dimanche desarchive" : "Dimanche archive");
    renderDimanche();
  });
  ov.querySelector("#wd_date").addEventListener("change", async (e) => {
    await db.dimanches.update(dimId, { date: e.target.value });
    await log("dimanche", "date_modifiee", dimId);
    toast("Date mise a jour");
  });

  // Delegation d'evenements : UN SEUL listener sur le conteneur des lignes,
  // au lieu de re-attacher un listener par bouton a chaque rafraichissement
  // (comme avant). Plus simple, plus rapide, et il n'y a plus qu'UN
  // endroit ou le bug "id_paiement non indexe" (corrige dans db.js, voir
  // migration version 5) pouvait se reproduire.
  const rowsBox = ov.querySelector("#wd_rows");
  rowsBox.addEventListener("click", async (e) => {
    const toggleBtn = e.target.closest("[data-toggle-paiement]");
    const pretBtn = e.target.closest("[data-pret]");
    if (toggleBtn) {
      const pid = toggleBtn.dataset.togglePaiement;
      const nextPaye =
        !toggleBtn.classList.contains("on") &&
        !toggleBtn.classList.contains("loan");
      await marquerPaiement(pid, nextPaye);
      if (!nextPaye) {
        // On repasse "Non paye" a la main : si un pret entre membres etait
        // associe a ce paiement, il n'a plus lieu d'etre. (Cette requete
        // necessite l'index id_paiement sur prets_membres — voir la
        // migration version 5 dans db.js : avant, elle plantait ici.)
        const prets = await db.prets_membres
          .where("id_paiement")
          .equals(pid)
          .toArray();
        for (const pr of prets) await db.prets_membres.delete(pr.id);
      }
      await refreshWeekRows();
      notifyAutresEcrans();
    } else if (pretBtn) {
      openPretPicker(pretBtn.dataset.pret);
    }
  });

  async function refreshWeekRows() {
    const [freshPaiements, freshPrets] = await Promise.all([
      db.paiements.where("id_dimanche").equals(dimId).toArray(),
      db.prets_membres.where("id_dimanche").equals(dimId).toArray(),
    ]);
    preteurParPaiement = Object.fromEntries(
      freshPrets.map((pr) => [pr.id_paiement, pr.id_preteur]),
    );
    rowsBox.innerHTML = freshPaiements
      .slice()
      .sort(triParNom)
      .map((p) => paiementRowHTML(p, memById, preteurParPaiement))
      .join("");
    const newTotal = freshPaiements.reduce((a, p) => a + p.montant_paye, 0);
    const totalEl = ov.querySelector("#" + totalId + " b");
    if (totalEl) totalEl.textContent = fmt(newTotal);
  }

  // notifyAutresEcrans : met a jour l'ecran actif SANS bloquer l'UI de la
  // fiche ouverte. Avant, chaque coche relancait immediatement un
  // renderAccueil()/renderDimanche() complet en attendant sa fin ; les
  // fonctions de db.js sont maintenant optimisees (plus de N+1), donc ce
  // re-render est deja tres rapide, mais on evite quand meme de le faire
  // attendre inutilement l'interaction suivante de l'utilisateur.
  function notifyAutresEcrans() {
    if (currentTab === "accueil") renderAccueil();
    else if (currentTab === "dimanche") renderDimanche();
    else if (currentTab === "dettes") renderDettes();
  }

  function openPretPicker(idPaiement) {
    const autresParticipants = paiements
      .filter((p) => p.id !== idPaiement)
      .map((p) => memById[p.id_membre])
      .filter(Boolean);
    const ov = openSheet(`
      <button class="sheet-close" data-close>&times;</button>
      <h3>Qui a avance l'argent ?</h3>
      <div class="small-note" style="margin-bottom:10px;">La cotisation sera marquee payee immediatement pour le groupe. Le pret entre les deux membres sera suivi a part (Plus &rarr; Prets entre membres).</div>
      <div id="pret_list"></div>
    `);
    const box = document.getElementById("pret_list");
    box.innerHTML = autresParticipants.length
      ? autresParticipants
          .map(
            (m) => `
      <div class="row" data-preteur="${m.id}" style="cursor:pointer;">
        <div class="avatar">${initials(m)}</div>
        <div class="info"><div class="name">${esc(fullName(m))}</div></div>
      </div>`,
          )
          .join("")
      : emptyHTML("Aucun autre participant sur ce dimanche.");
    ov.querySelector("[data-close]").addEventListener("click", closeSheet);
    box.querySelectorAll("[data-preteur]").forEach((el) =>
      el.addEventListener("click", async () => {
        try {
          await enregistrerPretMembre(idPaiement, el.dataset.preteur);
          closeSheet();
          toast("Pret enregistre — cotisation marquee payee");
          await refreshWeekRows();
          notifyAutresEcrans();
        } catch (err) {
          toast(err.message || "Erreur", "error");
        }
      }),
    );
  }
  ov.querySelector("#wd_delete").addEventListener("click", async () => {
    const ok = await confirmWithPassword(
      "Cette suppression est definitive et efface tous les paiements de ce dimanche. Confirme avec le mot de passe administrateur.",
    );
    if (!ok) return;
    await supprimerDimanche(dimId);
    closeSheet();
    toast("Dimanche supprime");
    showTab(currentTab === "plus" ? "dimanche" : currentTab);
  });
}

// ---------------------------------------------------------------
// DETTES
// ---------------------------------------------------------------
async function renderDettes() {
  const dettes = await dettesList();
  const impayees = dettes.filter((d) => d.statut === "Impayee");
  const remboursees = dettes.filter((d) => d.statut === "Remboursee");
  const total = impayees.reduce((a, d) => a + d.montant, 0);
  app.innerHTML = `
    <div class="card" style="text-align:center;padding:20px;margin-bottom:18px;">
      <div class="small-note">Total impaye</div>
      <div style="font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--danger);margin-top:2px;">${fmt(total)}</div>
    </div>
    <div class="section-title" style="margin-top:0;"><h2>Impayees (${impayees.length})</h2></div>
    <div class="card list-card" id="dettesImpayees"></div>
    ${remboursees.length ? `<div class="section-title"><h2>Remboursees (${remboursees.length})</h2></div><div class="card list-card" id="dettesRemb"></div>` : ""}
  `;
  const rowHTML = (d, actionable) => `
    <div class="row" ${actionable ? `data-paiement="${d.id_paiement}"` : ""}>
      <div class="avatar" style="background:var(--bg-danger);color:var(--danger);">${(d.membre[0] || "?").toUpperCase()}</div>
      <div class="info"><div class="name">${esc(d.membre)}</div><div class="meta">${fmtDate(d.date)}</div></div>
      <span class="badge" style="background:var(--bg-danger);color:var(--danger);">${fmt(d.montant)}</span>
    </div>`;
  document.getElementById("dettesImpayees").innerHTML =
    impayees.map((d) => rowHTML(d, true)).join("") ||
    emptyHTML("Aucune dette en cours.");
  document
    .querySelectorAll("#dettesImpayees .row")
    .forEach((el) =>
      el.addEventListener("click", () => openRembourser(el.dataset.paiement)),
    );
  if (remboursees.length)
    document.getElementById("dettesRemb").innerHTML = remboursees
      .map((d) => rowHTML(d, false))
      .join("");
}
function openRembourser(idPaiement) {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Marquer comme remboursee</h3>
    <div class="field"><label>Montant</label><input id="rb_montant" type="number"></div>
    <div class="field"><label>Note (facultatif)</label><input id="rb_note" type="text"></div>
    <button class="btn btn-primary" id="rb_save">Confirmer le remboursement</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document.getElementById("rb_save").addEventListener("click", async () => {
    const p = await db.paiements.get(idPaiement);
    const montant =
      Number(document.getElementById("rb_montant").value) || p.montant_attendu;
    await db.remboursements.add({
      id: uid(),
      id_membre: p.id_membre,
      id_paiement_concerne: idPaiement,
      date_remboursement: todayISO(),
      montant,
      note: document.getElementById("rb_note").value.trim(),
    });
    await db.caisse_mouvements.add({
      id: uid(),
      date: todayISO(),
      type: "Entree",
      montant,
      libelle: `Remboursement de dette (${p.id_membre})`,
    });
    await log("remboursement", "cree", idPaiement);
    closeSheet();
    toast("Remboursement enregistre");
    renderDettes();
  });
}

// ---------------------------------------------------------------
// MODULE "MES LISTES" — independant des cotisations d'anniversaire.
// ---------------------------------------------------------------
const LISTE_ICONES = {
  star: `<path stroke-linecap="round" stroke-linejoin="round" d="m12 3 2.6 5.9L21 9.6l-4.8 4.2L17.6 21 12 17.6 6.4 21l1.4-7.2L3 9.6l6.4-.7Z"/>`,
  calendar: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16M7 3v4M17 3v4M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/>`,
  users: `<path stroke-linecap="round" stroke-linejoin="round" d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1a4 4 0 0 0-3-3.87M15 4.13a3.5 3.5 0 0 1 0 6.74"/>`,
  tent: `<path stroke-linecap="round" stroke-linejoin="round" d="m4 20 8-15 8 15M8 20l4-9 4 9M2 20h20"/>`,
  music: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>`,
  map: `<path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/>`,
  flag: `<path stroke-linecap="round" stroke-linejoin="round" d="M5 21V4m0 1 5-1.5c2.5-.7 4 1.5 6.5.8L18 4v10l-1.5.4c-2.5.7-4-1.5-6.5-.8L5 14"/>`,
  book: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5ZM4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>`,
};
const LISTE_ICONE_KEYS = Object.keys(LISTE_ICONES);
function listeIconSVG(icone, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2">${LISTE_ICONES[icone] || LISTE_ICONES.star}</svg>`;
}
const LISTE_COULEURS = [
  "#2563EB",
  "#059669",
  "#D97706",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#4B5563",
];

// ---------------------------------------------------------------
// PRETS ENTRE MEMBRES — vue de gestion (voir aussi exportPretsMembresPDF)
// ---------------------------------------------------------------
let pretsShowRembourses = false;
async function renderPretsMembres() {
  app.innerHTML = `
    <button class="btn-chip" id="pretsBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Prets entre membres</h2></div>
    <div class="small-note" style="margin-bottom:12px;">Quand un membre absent se fait avancer sa cotisation par un autre (bouton "Pret" sur un dimanche), c'est ici que ca se retrouve. Ce n'est pas une dette envers le groupe : le groupe a deja recu l'argent.</div>
    <div class="row" style="border:none;padding:0 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!pretsShowRembourses ? "active" : ""}" id="prets_filtre_attente">En attente</button>
      <button class="btn-chip ${pretsShowRembourses ? "active" : ""}" id="prets_filtre_rembourses">Rembourses</button>
    </div>
    <button class="btn btn-ghost" id="pretsExportBtn" style="margin-bottom:16px;">Exporter en PDF</button>
    <div id="pretsBox"></div>
  `;
  document
    .getElementById("pretsBackBtn")
    .addEventListener("click", () => showTab("plus"));
  document
    .getElementById("prets_filtre_attente")
    .addEventListener("click", () => {
      pretsShowRembourses = false;
      renderPretsMembres();
    });
  document
    .getElementById("prets_filtre_rembourses")
    .addEventListener("click", () => {
      pretsShowRembourses = true;
      renderPretsMembres();
    });
  document
    .getElementById("pretsExportBtn")
    .addEventListener("click", exportPretsMembresPDF);

  const prets = await pretsMembres({
    nonRembourseSeulement: !pretsShowRembourses,
  });
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const box = document.getElementById("pretsBox");
  box.innerHTML = prets.length
    ? prets
        .map((p) => {
          const debiteur = memById[p.id_debiteur];
          const preteur = memById[p.id_preteur];
          return `<div class="card" style="margin-bottom:10px;">
      <div class="detail-row" style="border:none;padding:0 0 4px;">
        <span class="k" style="font-weight:600;color:var(--text);">${debiteur ? esc(fullName(debiteur)) : "?"} doit a ${preteur ? esc(fullName(preteur)) : "?"}</span>
        <span class="v">${fmt(p.montant)}</span>
      </div>
      <div class="small-note" style="margin-bottom:10px;">${fmtDate(p.date)}${p.rembourse ? " &middot; Rembourse" : ""}</div>
      <button class="btn-chip ${p.rembourse ? "" : "active"}" data-toggle-pret="${p.id}">${p.rembourse ? "Marquer non rembourse" : "Marquer rembourse"}</button>
    </div>`;
        })
        .join("")
    : emptyHTML(
        pretsShowRembourses
          ? "Aucun pret rembourse pour l'instant."
          : "Aucun pret en attente. Tout le monde est a jour !",
      );
  box.querySelectorAll("[data-toggle-pret]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.dataset.togglePret;
      const pret = prets.find((p) => p.id === id);
      await marquerPretRembourse(id, !pret.rembourse);
      toast(pret.rembourse ? "Marque non rembourse" : "Marque rembourse");
      renderPretsMembres();
    }),
  );
}

let listesQuery = "";
let listesShowArchivees = false;
async function renderListes() {
  app.innerHTML = `
    <button class="btn-chip" id="listesBackBtn" style="margin-bottom:12px;">&larr; Retour</button>
    <div class="section-title" style="margin-top:0;"><h2>Mes listes</h2></div>
    <input class="search" id="listesSearch" placeholder="Rechercher une liste..." value="${esc(listesQuery)}">
    <div class="row" style="border:none;padding:6px 4px 12px;justify-content:flex-start;gap:8px;">
      <button class="btn-chip ${!listesShowArchivees ? "active" : ""}" id="lst_filtre_actives">Actives</button>
      <button class="btn-chip ${listesShowArchivees ? "active" : ""}" id="lst_filtre_archivees">Archivees</button>
    </div>
    <div id="listesBox"></div>
    <div class="fab-zone"><button class="fab" id="addListeBtn" aria-label="Creer une liste"><svg viewBox="0 0 24 24" width="24" height="24"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg></button></div>
  `;
  document
    .getElementById("listesBackBtn")
    .addEventListener("click", () => showTab("plus"));
  document.getElementById("listesSearch").addEventListener("input", (e) => {
    listesQuery = e.target.value;
    renderListesList();
  });
  document
    .getElementById("addListeBtn")
    .addEventListener("click", openCreerListe);
  document
    .getElementById("lst_filtre_actives")
    .addEventListener("click", () => {
      listesShowArchivees = false;
      renderListes();
    });
  document
    .getElementById("lst_filtre_archivees")
    .addEventListener("click", () => {
      listesShowArchivees = true;
      renderListes();
    });
  await renderListesList();
}
async function renderListesList() {
  const q = listesQuery.trim().toLowerCase();
  const all = await listesAll({ archiveesSeulement: listesShowArchivees });
  const filtered = all.filter((l) => l.nom.toLowerCase().includes(q));
  const box = document.getElementById("listesBox");
  if (!box) return;
  if (filtered.length === 0) {
    box.innerHTML = emptyHTML(
      listesShowArchivees
        ? "Aucune liste archivee."
        : "Aucune liste. Cree la premiere avec le bouton +.",
    );
    return;
  }
  const cardsHtml = await Promise.all(
    filtered.map(async (l) => {
      const membres = await membresDeListe(l.id);
      const frais = await listeFraisAll(l.id);
      const stats = frais.length ? await statistiquesActivite(l.id) : null;
      const fermee = !activiteEstOuverte(l);
      return `<div class="card liste-card" data-id="${l.id}" style="border-left:4px solid ${safeColor(l.couleur)};">
      <div class="liste-card-top">
        <span class="liste-icon" style="background:${safeColor(l.couleur)}22;color:${safeColor(l.couleur)};">${listeIconSVG(l.icone)}</span>
        <div class="info"><div class="name">${esc(l.nom)}${fermee ? ` <span class="badge badge-no" style="margin-left:4px;">Cloturee</span>` : ""}</div><div class="meta">${fmtDate(l.date)} &middot; ${membres.length} participant${membres.length > 1 ? "s" : ""}${stats ? ` &middot; ${stats.payes} paye${stats.payes > 1 ? "s" : ""}/${membres.length}` : ""}</div></div>
      </div>
      ${l.description ? `<div class="small-note" style="margin-top:6px;">${esc(l.description)}</div>` : ""}
    </div>`;
    }),
  );
  box.innerHTML = cardsHtml.join("");
  box
    .querySelectorAll(".liste-card")
    .forEach((el) =>
      el.addEventListener("click", () => openListeDetail(el.dataset.id)),
    );
}

function openCreerListe() {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Nouvelle activite</h3>
    <div class="field"><label>Nom</label><input id="l_nom" type="text" placeholder="Ex. Sortie jeunesse, Camp 2026..."></div>
    <div class="field"><label>Description</label><input id="l_desc" type="text" placeholder="Facultatif"></div>
    <div class="field-row">
      <div class="field"><label>Date de l'activite</label><input id="l_date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>Date limite (facultatif)</label><input id="l_date_limite" type="date"></div>
    </div>
    <div class="field"><label>Couleur</label><div class="swatch-row" id="l_couleur_row">${LISTE_COULEURS.map((c, i) => `<button type="button" class="swatch ${i === 0 ? "active" : ""}" data-c="${c}" style="background:${c};"></button>`).join("")}</div></div>
    <div class="field"><label>Icone</label><div class="swatch-row" id="l_icone_row">${LISTE_ICONE_KEYS.map((k, i) => `<button type="button" class="swatch-icon ${i === 0 ? "active" : ""}" data-i="${k}">${listeIconSVG(k, 18)}</button>`).join("")}</div></div>
    <div class="field"><label>Notes</label><input id="l_notes" type="text" placeholder="Facultatif"></div>
    <div class="small-note">Les frais (participation, transport, repas...) se configurent juste apres la creation, depuis la fiche de l'activite. Une activite sans frais fonctionne normalement : elle sert juste a suivre des participants.</div>
    <button class="btn btn-primary" id="l_save" style="margin-top:12px;">Creer l'activite</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  let couleur = LISTE_COULEURS[0],
    icone = LISTE_ICONE_KEYS[0];
  document.querySelectorAll("#l_couleur_row .swatch").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("#l_couleur_row .swatch")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      couleur = b.dataset.c;
    }),
  );
  document.querySelectorAll("#l_icone_row .swatch-icon").forEach((b) =>
    b.addEventListener("click", () => {
      document
        .querySelectorAll("#l_icone_row .swatch-icon")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      icone = b.dataset.i;
    }),
  );
  document.getElementById("l_save").addEventListener("click", async () => {
    const nom = document.getElementById("l_nom").value.trim();
    if (!nom) {
      toast("Le nom est obligatoire", "error");
      return;
    }
    const dateLimite = document.getElementById("l_date_limite").value || null;
    const date = document.getElementById("l_date").value || todayISO();
    if (dateLimite && dateLimite > date) {
      // Section 24 du cahier des charges : date limite incoherente. La
      // date limite d'inscription/paiement ne peut pas tomber APRES le
      // jour de l'activite elle-meme.
      toast("La date limite doit etre avant ou le jour de l'activite", "error");
      return;
    }
    const id = await creerListe({
      nom,
      description: document.getElementById("l_desc").value,
      date,
      date_limite: dateLimite,
      couleur,
      icone,
      notes: document.getElementById("l_notes").value,
    });
    closeSheet();
    toast("Activite creee");
    renderListes();
    setTimeout(() => openListeDetail(id), 200);
  });
}

let listeDetailQuery = "";
async function openListeDetail(id) {
  listeDetailQuery = "";
  await renderListeDetailSheet(id);
}

// Vocabulaire d'affichage pour getStatutPaiementActivite() (db.js) --
// c'est la seule fonction qui decide du statut, ici on se contente de le
// traduire en libelle/couleur pour l'ecran.
const STATUT_PAIEMENT_LABEL = {
  non_paye: "Non paye",
  partiel: "Partiel",
  paye: "Paye",
  surpaye: "Surpaye",
};
const STATUT_PAIEMENT_BADGE = {
  non_paye: "badge-no",
  partiel: "badge-partiel",
  paye: "badge-yes",
  surpaye: "badge-surpaye",
};

// renderListeDetailSheet : construit la coquille complete de la fenetre.
// Appelee a l'ouverture, et apres toute action qui change la STRUCTURE de
// l'ecran (ajout/suppression d'un frais, cloture, tri, changement de
// filtre) -- pour tout le reste (paiement, choix de frais d'un membre,
// ajout/retrait d'un participant), refreshListeDetailBody() suffit et
// preserve le focus du champ de recherche.
async function renderListeDetailSheet(id) {
  const l = await db.listes.get(id);
  if (!l) return;
  const ouverte = activiteEstOuverte(l);
  const frais = await listeFraisAll(id);

  const html = `
    <button class="sheet-close" data-close>&times;</button>
    <div class="liste-detail-head" style="border-left:4px solid ${safeColor(l.couleur)};padding-left:12px;">
      <div><h3 style="margin:0;">${esc(l.nom)}</h3><div class="small-note" style="margin:2px 0 0;">${fmtDate(l.date)}${l.date_limite ? " &middot; Limite : " + fmtDate(l.date_limite) : ""}${l.archivee ? " &middot; Archivee" : ""}</div></div>
    </div>
    ${!ouverte ? `<div class="cloture-banner"><span>Activite cloturee -- les inscriptions sont fermees mais les paiements deja enregistres restent modifiables.</span></div>` : ""}
    ${l.description ? `<p class="small-note">${esc(l.description)}</p>` : ""}

    <div id="ld_stats"></div>

    <div class="section-title" style="margin-top:6px;"><h2>Frais de l'activite</h2><button class="link" id="ld_add_frais">+ Ajouter</button></div>
    <div id="ld_frais"></div>
    ${!frais.length ? `<div class="small-note">Aucun frais defini : cette activite fonctionne comme une simple liste de participants, sans argent a suivre.</div>` : ""}
    ${l.notes ? `<div class="detail-row"><span class="k">Notes</span><span class="v">${esc(l.notes)}</span></div>` : ""}

    <div class="section-title" style="margin-top:16px;"><h2>Participants</h2></div>
    <div class="small-note" style="margin-bottom:6px;">${frais.length ? "Coche les membres concernes, puis les frais qui s'appliquent a chacun." : "Coche les membres qui participent."}</div>
    <input class="search" id="ld_search" placeholder="Filtrer la liste des membres..." value="${esc(listeDetailQuery)}">
    <div id="ld_members"></div>

    <div class="sheet-actions" style="margin-top:16px;">
      <button class="btn btn-ghost" id="ld_export_pdf" style="margin-bottom:8px;">Exporter en PDF</button>
      <button class="btn btn-ghost" id="ld_cloture" style="margin-bottom:8px;">${ouverte ? "Cloturer l'activite" : "Reouvrir l'activite"}</button>
      <button class="btn btn-ghost" id="ld_duplicate" style="margin-bottom:8px;">Dupliquer cette activite</button>
      <button class="btn btn-ghost" id="ld_archive" style="margin-bottom:8px;">${l.archivee ? "Desarchiver" : "Archiver"}</button>
      <button class="btn btn-ghost" id="ld_delete" style="color:var(--danger);">Supprimer l'activite</button>
    </div>
  `;
  let ov;
  const already = sheetStack[sheetStack.length - 1];
  const isRefresh =
    already && already.dataset && already.dataset.listeId === id;
  if (isRefresh) {
    already.querySelector(".sheet").innerHTML = html;
    ov = already;
  } else {
    ov = openSheet(html);
    ov.dataset.listeId = id;
  }

  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#ld_search").addEventListener("input", (e) => {
    listeDetailQuery = e.target.value;
    refreshListeDetailBody(id);
  });

  ov.querySelector("#ld_add_frais").addEventListener("click", () =>
    openFraisForm(id),
  );

  ov.querySelector("#ld_export_pdf").addEventListener("click", () =>
    exportListePDF(id),
  );
  ov.querySelector("#ld_cloture").addEventListener("click", async () => {
    // ouverte capture l'etat AVANT clic : on cloture si elle etait
    // ouverte, on reouvre (exceptionnellement) si elle etait fermee.
    await clotureActivite(id, ouverte);
    toast(ouverte ? "Activite cloturee" : "Activite reouverte");
    renderListeDetailSheet(id);
  });
  ov.querySelector("#ld_duplicate").addEventListener("click", async () => {
    const newId = await dupliquerListe(id);
    closeSheet();
    toast("Activite dupliquee");
    renderListes();
    setTimeout(() => openListeDetail(newId), 200);
  });
  ov.querySelector("#ld_archive").addEventListener("click", async () => {
    await archiverListe(id, !l.archivee);
    toast(
      l.archivee
        ? "Activite desarchivee"
        : "Activite archivee (les donnees restent consultables)",
    );
    closeSheet();
    renderListes();
  });
  ov.querySelector("#ld_delete").addEventListener("click", async () => {
    const ok = await confirmWithPassword(
      "Cette suppression est definitive. Confirme avec le mot de passe administrateur.",
    );
    if (!ok) return;
    await supprimerListe(id);
    closeSheet();
    toast("Activite supprimee");
    renderListes();
  });

  await refreshListeDetailBody(id);
}

// refreshListeDetailBody : rafraichit les zones de contenu (#ld_stats,
// #ld_frais, #ld_members) sans jamais toucher au champ de recherche -> le
// focus clavier et la position du curseur sont preserves pendant la
// frappe. C'est ici que vivent les calculs d'un seul coup pour tous les
// participants, en reutilisant infosParticipantActivite() (db.js) comme
// unique source de verite pour attendu/paye/reste/statut.
async function refreshListeDetailBody(id) {
  const ov = sheetStack[sheetStack.length - 1];
  if (!ov || ov.dataset.listeId !== id) return;
  const l = await db.listes.get(id);
  if (!l) return;
  const ouverte = activiteEstOuverte(l);
  const frais = await listeFraisAll(id);
  const inscrits = await membresDeListe(id);
  const inscritsParId = Object.fromEntries(inscrits.map((m) => [m.id, m]));
  const q = listeDetailQuery.trim().toLowerCase();

  // Un seul aller-retour pour calculer attendu/paye/reste/statut de tous
  // les INSCRITS -- un membre non inscrit n'a par definition rien attendu.
  const infosParMembre = {};
  await Promise.all(
    inscrits.map(async (m) => {
      infosParMembre[m.id] = await infosParticipantActivite(id, m.id);
    }),
  );

  // --- Dashboard (juste l'essentiel, pas de vocabulaire "caisse") ---
  const statsBox = ov.querySelector("#ld_stats");
  if (statsBox) {
    const valeurs = Object.values(infosParMembre);
    const payes = valeurs.filter((i) => i.statut === "paye").length;
    const partiels = valeurs.filter((i) => i.statut === "partiel").length;
    const totalRecu = valeurs.reduce((a, i) => a + i.paye, 0);
    statsBox.innerHTML = `
      <div class="activite-stats-grid">
        <div class="activite-stat"><div class="lbl">Total inscrits</div><div class="val">${inscrits.length}</div></div>
        ${
          frais.length
            ? `
        <div class="activite-stat"><div class="lbl">Payes</div><div class="val">${payes}</div></div>
        <div class="activite-stat"><div class="lbl">Partiels</div><div class="val">${partiels}</div></div>
        <div class="activite-stat"><div class="lbl">Total recu</div><div class="val">${fmt(totalRecu)}</div></div>`
            : ""
        }
      </div>`;
  }

  // --- Liste des frais (section 3/14) -- boutons texte, pas d'icones ---
  const fraisBox = ov.querySelector("#ld_frais");
  if (fraisBox) {
    fraisBox.innerHTML = frais
      .map(
        (f) => `
      <div class="frais-chip" data-frais-id="${f.id}">
        <span class="name">${esc(f.libelle)}</span>
        <span class="amount">${fmt(f.montant)}</span>
        <div class="frais-chip-actions">
          <button class="link" data-edit-frais="${f.id}">Modifier</button>
          <button class="link link-danger" data-del-frais="${f.id}">Supprimer</button>
        </div>
      </div>`,
      )
      .join("");
    fraisBox.querySelectorAll("[data-edit-frais]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openFraisForm(
          id,
          frais.find((f) => f.id === btn.dataset.editFrais),
        ),
      ),
    );
    fraisBox.querySelectorAll("[data-del-frais]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await supprimerFraisListe(btn.dataset.delFrais);
        toast("Frais supprime");
        renderListeDetailSheet(id);
      }),
    );
  }

  // --- Participants : formulaire avec TOUS les membres de l'association
  // (actifs comme inactifs), plutot qu'une recherche membre par membre.
  // Cocher "Participe" inscrit/desinscrit ; cocher un frais implique
  // automatiquement la participation. Les montants attendus sont
  // remplaces par les libelles exacts des frais coches (section demandee
  // par l'utilisateur : plus de chiffre agrege, les postes exacts).
  const tousMembres = await listMembres();
  const filtres = tousMembres.filter((m) =>
    fullName(m).toLowerCase().includes(q),
  );
  filtres.sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "Actif" ? -1 : 1;
    return fullName(a).localeCompare(fullName(b));
  });

  const membersBox = ov.querySelector("#ld_members");
  membersBox.innerHTML = filtres.length
    ? filtres
        .map((m) => {
          const estInscrit = !!inscritsParId[m.id];
          const inscription = inscritsParId[m.id];
          const info = estInscrit ? infosParMembre[m.id] : null;
          const fraisChoisis = new Set(
            (inscription && inscription.frais_choisis) || [],
          );
          const peutCocher = ouverte || estInscrit;
          return `
    <div class="participant-form-row" data-membre="${m.id}">
      <label class="participe-check">
        <input type="checkbox" data-participe="${m.id}" ${estInscrit ? "checked" : ""} ${peutCocher ? "" : "disabled"}>
        <span class="name">${esc(fullName(m))}</span>
        ${m.statut === "Inactif" ? `<span class="tag-inactif">Inactif</span>` : ""}
      </label>
      ${
        frais.length
          ? `<div class="frais-inline-row">${frais
              .map(
                (f) => `
        <label class="frais-inline">
          <input type="checkbox" data-frais="${m.id}|${f.id}" ${fraisChoisis.has(f.id) ? "checked" : ""} ${peutCocher ? "" : "disabled"}>
          ${esc(f.libelle)} <span class="amount">(${fmt(f.montant)})</span>
        </label>`,
              )
              .join("")}</div>`
          : ""
      }
      ${
        estInscrit && frais.length
          ? `<div class="small-note">Paye : <b>${fmt(info.paye)}</b> &middot; Reste : <b>${fmt(info.reste)}</b></div>
             <div class="participant-actions">
               <button class="btn-chip" data-payer="${m.id}">Enregistrer un paiement</button>
               ${info.historique.length ? `<button class="btn-chip" data-historique="${m.id}">Historique (${info.historique.length})</button>` : ""}
             </div>`
          : ""
      }
    </div>`;
        })
        .join("")
    : emptyHTML("Aucun membre ne correspond a cette recherche.");

  membersBox.querySelectorAll("[data-participe]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const mid = cb.dataset.participe;
      if (cb.checked) await ajouterMembreListe(id, mid);
      else await retirerMembreListe(id, mid);
      refreshListeDetailBody(id);
      renderListesList();
    }),
  );
  membersBox.querySelectorAll("[data-frais]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const [mid, fid] = cb.dataset.frais.split("|");
      // Cocher un frais implique la participation, meme si la case
      // "Participe" n'a pas ete cochee explicitement en premier.
      if (!inscritsParId[mid]) await ajouterMembreListe(id, mid);
      const inscription = inscritsParId[mid];
      const actuels = new Set(
        (inscription && inscription.frais_choisis) || [],
      );
      if (cb.checked) actuels.add(fid);
      else actuels.delete(fid);
      await definirFraisChoisisMembre(id, mid, [...actuels]);
      refreshListeDetailBody(id);
    }),
  );
  membersBox.querySelectorAll("[data-payer]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openAjouterPaiementActivite(id, inscritsParId[btn.dataset.payer]),
    ),
  );
  membersBox.querySelectorAll("[data-historique]").forEach((btn) =>
    btn.addEventListener("click", () =>
      openHistoriquePaiementsActivite(
        id,
        inscritsParId[btn.dataset.historique],
      ),
    ),
  );
}

// openFraisForm : creation OU modification d'un frais (meme formulaire) --
// si fraisExistant est fourni, on pre-remplit et on modifie au lieu de
// creer. Ouvert par-dessus la fiche d'activite (sheetStack empile), donc
// closeSheet() ici ne ferme que ce petit formulaire.
function openFraisForm(idListe, fraisExistant) {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>${fraisExistant ? "Modifier le frais" : "Ajouter un frais"}</h3>
    <div class="field"><label>Libelle</label><input id="fr_libelle" type="text" placeholder="Ex. Participation, Transport, Repas..." value="${fraisExistant ? esc(fraisExistant.libelle) : ""}"></div>
    <div class="field"><label>Montant (FCFA)</label><input id="fr_montant" type="number" min="0" value="${fraisExistant ? fraisExistant.montant : ""}"></div>
    ${fraisExistant ? `<div class="small-note">Changer le montant ne modifie pas les paiements deja recus : seul le montant attendu des prochains calculs change.</div>` : ""}
    <button class="btn btn-primary" id="fr_save" style="margin-top:12px;">Enregistrer</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#fr_save").addEventListener("click", async () => {
    const libelle = ov.querySelector("#fr_libelle").value;
    const montant = ov.querySelector("#fr_montant").value;
    try {
      if (fraisExistant) {
        await modifierFraisListe(fraisExistant.id, { libelle: libelle.trim(), montant });
      } else {
        await ajouterFraisListe(idListe, { libelle, montant });
      }
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    closeSheet();
    toast(fraisExistant ? "Frais modifie" : "Frais ajoute");
    renderListeDetailSheet(idListe);
  });
}

// openAjouterPaiementActivite : enregistre UN nouveau versement (section 9
// du cahier des charges). N'ecrase jamais le paiement precedent -- voir
// ajouterPaiementListeMembre() dans db.js.
async function openAjouterPaiementActivite(idListe, membre) {
  if (!membre) return;
  const info = await infosParticipantActivite(idListe, membre.id);
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Paiement -- ${esc(fullName(membre))}</h3>
    <div class="detail-row"><span class="k">Montant attendu</span><span class="v">${fmt(info.attendu)}</span></div>
    <div class="detail-row"><span class="k">Deja paye</span><span class="v">${fmt(info.paye)}</span></div>
    <div class="detail-row"><span class="k">Reste</span><span class="v">${fmt(info.reste)}</span></div>
    <div class="field" style="margin-top:14px;"><label>Nouveau paiement (FCFA)</label><input id="pa_montant" type="number" min="1" placeholder="${info.reste > 0 ? info.reste : ""}"></div>
    <div class="field"><label>Commentaire (facultatif)</label><input id="pa_commentaire" type="text" placeholder="Ex. Verse en especes le jour du dimanche"></div>
    <button class="btn btn-primary" id="pa_save">Enregistrer le paiement</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  ov.querySelector("#pa_save").addEventListener("click", async () => {
    const montant = ov.querySelector("#pa_montant").value;
    const commentaire = ov.querySelector("#pa_commentaire").value;
    try {
      await ajouterPaiementListeMembre(idListe, membre.id, {
        montant,
        commentaire,
      });
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    closeSheet();
    toast("Paiement enregistre");
    refreshListeDetailBody(idListe);
  });
}

// openHistoriquePaiementsActivite : lecture seule (section 6) -- chaque
// versement recu reste visible individuellement, jamais fusionne.
async function openHistoriquePaiementsActivite(idListe, membre) {
  if (!membre) return;
  const historique = await historiquePaiementsListe(idListe, membre.id);
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Historique -- ${esc(fullName(membre))}</h3>
    <div id="ph_list">
      ${
        historique.length
          ? historique
              .map(
                (p) => `
        <div class="paiement-histo-item">
          <div><div>${fmt(p.montant)}</div>${p.commentaire ? `<div class="meta">${esc(p.commentaire)}</div>` : ""}</div>
          <span class="meta montant">${fmtDate(p.date)}${p.heure ? " &middot; " + esc(p.heure) : ""}</span>
        </div>`,
              )
              .join("")
          : emptyHTML("Aucun paiement enregistre pour l'instant.")
      }
    </div>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
}

async function exportListePDF(id) {
  const win = openPrintableWindow();
  const l = await db.listes.get(id);
  const frais = await listeFraisAll(id);
  const fraisParId = Object.fromEntries(frais.map((f) => [f.id, f]));
  const membres = await membresDeListe(id);
  const infos = {};
  for (const m of membres) infos[m.id] = await infosParticipantActivite(id, m.id);

  const rows = membres
    .map((m) => {
      const i = infos[m.id];
      const dernierPaiement = i.historique[0]; // deja trie du plus recent au plus ancien
      const fraisNoms = (m.frais_choisis || [])
        .map((fid) => (fraisParId[fid] ? fraisParId[fid].libelle : null))
        .filter(Boolean)
        .join(", ");
      return `<tr>
        <td>${esc(m.nom || "")}</td>
        <td>${esc(m.prenom || "")}</td>
        <td>${esc(m.telephone || "\u2014")}</td>
        ${frais.length ? `<td>${esc(fraisNoms || "\u2014")}</td><td>${fmt(i.paye)}</td><td>${fmt(i.reste)}</td><td>${STATUT_PAIEMENT_LABEL[i.statut]}</td><td>${dernierPaiement ? fmtDate(dernierPaiement.date) : "\u2014"}</td>` : ""}
      </tr>`;
    })
    .join("");

  const totalRecu = Object.values(infos).reduce((a, i) => a + i.paye, 0);
  const payesComplets = Object.values(infos).filter((i) => i.statut === "paye").length;
  const partiels = Object.values(infos).filter((i) => i.statut === "partiel").length;
  const colonnesFinancieres = frais.length
    ? "<th>Frais</th><th>Paye</th><th>Reste</th><th>Statut</th><th>Dernier paiement</th>"
    : "";

  const body = `
    <h1>${esc(l.nom)}</h1>
    <div class="meta">${fmtDate(l.date)}${l.date_limite ? " &middot; Date limite : " + fmtDate(l.date_limite) : ""}${l.description ? " &middot; " + esc(l.description) : ""}</div>
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th>${colonnesFinancieres}</tr>${rows || `<tr><td colspan="${frais.length ? 8 : 3}">Aucun participant inscrit</td></tr>`}</table>

    ${
      frais.length
        ? `<h2>Frais de l'activite</h2>
    <table><tr><th>Libelle</th><th>Montant</th></tr>${frais.map((f) => `<tr><td>${esc(f.libelle)}</td><td>${fmt(f.montant)}</td></tr>`).join("")}</table>`
        : ""
    }

    <h2>Recapitulatif</h2>
    <table>
      <tr><th>Total inscrits</th><td>${membres.length}</td></tr>
      ${frais.length ? `<tr><th>Payes</th><td>${payesComplets}</td></tr>` : ""}
      ${frais.length ? `<tr><th>Paiements partiels</th><td>${partiels}</td></tr>` : ""}
      ${frais.length ? `<tr><th>Total recu</th><td>${fmt(totalRecu)}</td></tr>` : ""}
      <tr><th>Date d'impression</th><td>${fmtDate(todayISO())}</td></tr>
    </table>
    ${l.notes ? `<h2>Notes</h2><p>${esc(l.notes)}</p>` : ""}
  `;
  if (win) writePrintableDocument(win, l.nom, body);
}

// ---------------------------------------------------------------
// PLUS (Caisse, Parametres, Export, A propos)
// ---------------------------------------------------------------
async function renderPlus() {
  const cd = await caisseDetail();
  const solde = cd.solde;
  const manuels = (await db.caisse_mouvements.toArray()).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const montantCotis = await getParam("montant_cotisation_defaut", 500);
  const montantCadeau = await getParam("montant_cadeau_defaut", 12000);
  const pretsEnAttente = (await pretsMembres({ nonRembourseSeulement: true }))
    .length;

  app.innerHTML = `
    <div class="section-title" style="margin-top:0;"><h2>Mes listes</h2></div>
    <div class="card list-card" id="plusListesBox" style="margin-bottom:16px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--accent-light);color:var(--accent);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg></span>
        <div class="info"><div class="name">Listes personnalisees</div><div class="meta">Sorties, reunions, camps, evenements...</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>
    <div class="card list-card" id="plusPretsBox" style="margin-bottom:24px;cursor:pointer;">
      <div class="row" style="border:none;padding:2px 4px;">
        <span class="liste-icon" style="background:var(--bg-warning);color:var(--warning);"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2M9 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2H11a2 2 0 0 0-2 2v9Z"/></svg></span>
        <div class="info"><div class="name">Prets entre membres</div><div class="meta">${pretsEnAttente > 0 ? `${pretsEnAttente} en attente de remboursement` : "Aucun pret en attente"}</div></div>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-3)" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m9 6 6 6-6 6"/></svg>
      </div>
    </div>

    <div class="section-title" style="margin-top:0;"><h2>Caisse</h2></div>
    <div class="card" style="text-align:center;padding:20px;margin-bottom:14px;">
      <div class="small-note">Solde actuel</div>

      <div style="font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--success);margin-top:2px;">${fmt(solde)}</div>
    </div>
    <div class="card list-card" style="margin-bottom:14px;">
      <div class="detail-row"><span class="k">Cotisations encaissees</span><span class="v" style="color:var(--success);">+ ${fmt(cd.totalCollecte)}</span></div>
      <div class="detail-row"><span class="k">Cadeaux d'anniversaire verses</span><span class="v" style="color:var(--danger);">− ${fmt(cd.totalCadeauxVerses)}</span></div>
      <div class="detail-row"><span class="k">Entrees manuelles</span><span class="v" style="color:var(--success);">+ ${fmt(cd.entreesManuelles)}</span></div>
      <div class="detail-row"><span class="k">Sorties manuelles</span><span class="v" style="color:var(--danger);">− ${fmt(cd.sortiesManuelles)}</span></div>
      <div class="detail-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px;"><span class="k" style="font-weight:700;color:var(--text);">= Solde de la caisse</span><span class="v" style="font-size:16px;">${fmt(cd.solde)}</span></div>
    </div>
    <div class="card" style="margin-bottom:18px;background:var(--bg-warning);border-color:transparent;">
      <div class="detail-row" style="border:none;padding:0;"><span class="k" style="color:var(--warning);">Dettes impayees (non incluses ci-dessus)</span><span class="v" style="color:var(--warning);">${fmt(cd.dettesImpayees)}</span></div>
      <div class="small-note" style="margin-top:6px;">Cet argent n'est pas encore dans la caisse : il correspond aux cotisations encore dues par des membres. Des qu'un membre paie sa dette, elle bascule automatiquement en "Cotisations encaissees" ci-dessus.</div>
    </div>
    <button class="btn btn-ghost" id="addMouvBtn" style="margin-bottom:10px;">+ Mouvement manuel (achat, depense...)</button>
    <button class="btn btn-ghost" id="ajusterCaisseBtn" style="margin-bottom:18px;">Ajuster la caisse (montant reel en main)</button>
    <div class="card list-card" id="mouvList" style="margin-bottom:24px;"></div>

    <div class="section-title"><h2>Parametres</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <div class="field"><label>Cotisation par defaut (FCFA)</label><input id="p_cotis" type="number" value="${montantCotis}"></div>
      <div class="field"><label>Cadeau par defaut (FCFA)</label><input id="p_cadeau" type="number" value="${montantCadeau}"></div>
      <button class="btn btn-primary" id="saveParamsBtn">Enregistrer</button>
    </div>

    <div class="section-title"><h2>Sauvegarde</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <button class="btn btn-ghost" id="exportJsonBtn">Exporter une sauvegarde (JSON)</button>
      <label class="btn btn-ghost" style="display:block;text-align:center;margin-top:10px;cursor:pointer;">
        Importer une sauvegarde
        <input type="file" id="importJsonInput" accept="application/json" style="display:none;">
      </label>
      <div class="small-note">Utilise ceci pour changer de telephone ou dupliquer les donnees sur un second appareil. L'import remplace toutes les donnees et demande le mot de passe administrateur.</div>
    </div>

    <div class="section-title"><h2>Export &amp; impression</h2></div>
    <div class="card" style="margin-bottom:24px;">
      <button class="btn btn-ghost" id="exportMembresPdfBtn" style="margin-bottom:10px;">Membres — PDF</button>
      <button class="btn btn-ghost" id="exportDettesPdfBtn" style="margin-bottom:10px;">Dettes du groupe — PDF</button>
      <button class="btn btn-ghost" id="exportPretsPdfBtn" style="margin-bottom:10px;">Prets entre membres — PDF</button>
      <button class="btn btn-ghost" id="exportRapportPdfBtn" style="margin-bottom:10px;">Rapport complet — PDF</button>
      <div class="small-note">Ces documents sont prets a etre envoyes ou imprimes depuis n'importe quelle application. Pour exporter une cotisation precise (un dimanche donne), ouvre-le depuis l'onglet Dimanches. Les prets entre membres sont exportes a part des dettes du groupe : ce sont deux choses differentes.</div>
    </div>

    <div class="section-title"><h2>Apparence</h2></div>
    <div class="card" style="margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;">
      <span class="small-note" style="margin:0;">Theme sombre</span>
      <button class="theme-switch" id="themeToggleBtn" aria-label="Changer de theme">
        <svg class="icon-sun" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        <svg class="icon-moon" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
      </button>
    </div>

    <div class="section-title"><h2>A propos</h2></div>
    <div class="card small-note" style="margin-bottom:24px;">
      Application installee et 100% hors-ligne : toutes les donnees restent sur cet appareil (IndexedDB).
      Pour l'installer comme une icone, utilise "Ajouter a l'ecran d'accueil" depuis le menu de ton navigateur.
    </div>

    <div class="section-title"><h2>Zone dangereuse</h2></div>
    <div class="card" style="margin-bottom:24px;border-color:var(--danger);">
      <button class="btn btn-ghost" id="resetAnnivBtn" style="margin-bottom:10px;color:var(--danger);">Supprimer tous les anniversaires</button>
      <div class="small-note" style="margin-bottom:16px;">Efface la date d'anniversaire de tous les membres (a recommencer a zero). Les membres eux-memes ne sont pas supprimes : nom, telephone, statut, fonction, etc. restent intacts.</div>
      <button class="btn btn-ghost" id="resetCotisBtn" style="color:var(--danger);">Reinitialiser cotisations, dettes et caisse</button>
      <div class="small-note">Remet a zero les paiements, les dettes et les mouvements de caisse. Les dimanches deja crees (dates, anniversaires fetes ce jour-la) restent visibles, ainsi que les membres.</div>
    </div>
  `;

  document.getElementById("mouvList").innerHTML =
    manuels
      .map(
        (m) => `
    <div class="row">
      <div class="avatar" style="background:${m.type === "Entree" ? "var(--bg-success)" : "var(--bg-danger)"};color:${m.type === "Entree" ? "var(--success)" : "var(--danger)"};">${m.type === "Entree" ? "+" : "-"}</div>
      <div class="info"><div class="name">${esc(m.libelle)}</div><div class="meta">${fmtDate(m.date)}</div></div>
      <span class="badge" style="background:${m.type === "Entree" ? "var(--bg-success)" : "var(--bg-danger)"};color:${m.type === "Entree" ? "var(--success)" : "var(--danger)"};">${m.type === "Entree" ? "+" : "-"}${fmt(m.montant)}</span>
    </div>`,
      )
      .join("") || emptyHTML("Aucun mouvement manuel.");

  document
    .getElementById("plusListesBox")
    .addEventListener("click", renderListes);
  document
    .getElementById("plusPretsBox")
    .addEventListener("click", renderPretsMembres);
  document
    .getElementById("addMouvBtn")
    .addEventListener("click", openAddMouvement);
  document
    .getElementById("ajusterCaisseBtn")
    .addEventListener("click", openAjusterCaisse);
  document
    .getElementById("saveParamsBtn")
    .addEventListener("click", async () => {
      await setParam(
        "montant_cotisation_defaut",
        Number(document.getElementById("p_cotis").value) || 500,
      );
      await setParam(
        "montant_cadeau_defaut",
        Number(document.getElementById("p_cadeau").value) || 12000,
      );
      toast("Parametres enregistres");
    });
  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    toggleTheme();
    redrawAccueilCharts();
  });
  document
    .getElementById("exportJsonBtn")
    .addEventListener("click", exportBackup);
  document
    .getElementById("importJsonInput")
    .addEventListener("change", importBackup);
  document
    .getElementById("exportMembresPdfBtn")
    .addEventListener("click", exportMembresPDF);
  document
    .getElementById("exportDettesPdfBtn")
    .addEventListener("click", exportDettesPDF);
  document
    .getElementById("exportPretsPdfBtn")
    .addEventListener("click", exportPretsMembresPDF);
  document
    .getElementById("exportRapportPdfBtn")
    .addEventListener("click", exportRapportPDF);
  document
    .getElementById("resetAnnivBtn")
    .addEventListener("click", async () => {
      const ok = await confirmWithPassword(
        "Ceci va effacer la date d'anniversaire de TOUS les membres (les membres eux-memes seront conserves). Cette action est definitive. Confirme avec le mot de passe administrateur.",
      );
      if (!ok) return;
      await supprimerTousLesAnniversairesMembres();
      toast("Tous les anniversaires ont ete supprimes");
      showTab("plus");
    });
  document
    .getElementById("resetCotisBtn")
    .addEventListener("click", async () => {
      const ok = await confirmWithPassword(
        "Ceci va remettre a zero les paiements, les dettes et les mouvements de caisse. Les dimanches deja crees et les membres ne sont JAMAIS touches par cette action. Confirme avec le mot de passe administrateur.",
      );
      if (!ok) return;
      const avant = await db.membres.count();
      await reinitialiserCotisations();
      const apres = await db.membres.count();
      toast(
        `Cotisations reinitialisees — ${apres} membres toujours presents (${avant} avant)`,
      );
      showTab("plus");
    });
}

// ---------------------------------------------------------------
// Export PDF (fenetre imprimable) et Word (.doc) pour impression. Le
// support Excel (.xlsx) a ete retire : uniquement PDF desormais.
// ---------------------------------------------------------------
// Export PDF sans dependance : on ouvre une fenetre isolee avec un document
// HTML propre et on declenche l'impression du navigateur (l'utilisateur
// choisit "Enregistrer au format PDF" comme destination). Fonctionne 100%
// hors-ligne et sur les tres vieux navigateurs (window.print existe depuis
// toujours). La fenetre doit etre ouverte de facon SYNCHRONE des le clic
// (avant tout await) pour ne pas etre bloquee par les bloqueurs de popup
// de Safari.
// Export PDF sans dependance : on ouvre une fenetre isolee avec un document
// HTML propre et on declenche l'impression du navigateur (l'utilisateur
// choisit "Enregistrer au format PDF" comme destination). Fonctionne 100%
// hors-ligne et sur les tres vieux navigateurs.
//
// IMPORTANT : on construit le document via un Blob + URL.createObjectURL()
// plutot que document.write(). document.write() sur une fenetre popup est
// une API fragile : sur certains navigateurs (dont d'anciens Safari), le
// print() se declenchait AVANT que le CSS ait fini de s'appliquer, ce qui
// donnait un rendu "texte brut" sans mise en forme lors de l'impression/
// export PDF (bug corrige ici). Avec un Blob charge via URL normale, la
// fenetre suit un vrai cycle de chargement de page (comme un lien classique)
// et le CSS est garanti pret avant que "load" se declenche.
function openPrintableWindow() {
  const win = window.open("", "_blank");
  if (!win) {
    toast("Autorise les fenetres popup pour exporter en PDF", "error");
    return null;
  }
  return win;
}
function writePrintableDocument(win, title, bodyHtml) {
  const style = `
    body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111827;margin:24px;}
    h1{color:#2563EB;font-size:21px;margin-bottom:2px;}
    h2{font-size:15px;margin-top:24px;border-bottom:1px solid #E5E7EB;padding-bottom:4px;}
    table{border-collapse:collapse;width:100%;margin-top:8px;}
    td,th{border:1px solid #D1D5DB;padding:6px 8px;font-size:12.5px;text-align:left;}
    th{background:#F3F4F6;}
    .meta{color:#6B7280;font-size:12.5px;margin-bottom:14px;}
    .print-bar{margin-bottom:18px;}
    .print-bar button{font:inherit;padding:9px 16px;border-radius:8px;border:none;background:#2563EB;color:#fff;cursor:pointer;}
    @media print { .print-bar{display:none;} }
  `;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${style}</style></head><body>
    <div class="print-bar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
    ${bodyHtml}
  </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  win.location.href = url;
  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch (e) {}
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

async function exportMembresPDF() {
  const win = openPrintableWindow();
  const membres = await listMembres();
  const rows = membres
    .map(
      (m) => `<tr>
    <td>${esc(m.nom || "")}</td><td>${esc(m.prenom || "")}</td><td>${esc(m.telephone || "—")}</td>
    <td>${esc(m.fonction || "Membre")}</td>
    <td>${m.jour_anniversaire ? String(m.jour_anniversaire).padStart(2, "0") + "/" + String(m.mois_anniversaire).padStart(2, "0") : "—"}</td>
    <td>${m.date_adhesion ? fmtDate(m.date_adhesion) : "—"}</td>
    <td>${m.statut}</td>
  </tr>`,
    )
    .join("");
  const body = `
    <h1>Jeunesse M3D — Liste des membres</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${membres.length} membres</div>
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th><th>Fonction</th><th>Anniversaire</th><th>Date d'ajout</th><th>Statut</th></tr>${rows}</table>
  `;
  if (win) writePrintableDocument(win, "Membres — M3D", body);
}

// exportMembreIndividuelPDF() : fiche complete d'UN SEUL membre, pensee
// pour etre envoyee individuellement (WhatsApp, email...). Contient tout
// ce qui le concerne : le detail de chaque collecte (paye/non paye, pour
// qui c'etait si c'est un anniversaire), sa dette envers le GROUPE
// (semaine par semaine), et les prets PERSONNELS entre membres ou il est
// implique (les deux sens : ce qu'il doit / ce qu'on lui doit).
async function exportMembreIndividuelPDF(idMembre) {
  const win = openPrintableWindow();
  const r = await rapportIndividuelMembre(idMembre);
  const nom = fullName(r.membre);

  const collecteRows =
    r.historique
      .slice()
      .reverse()
      .map(
        (h) => `<tr>
      <td>${fmtDate(h.date)}</td>
      <td>${h.a_paye ? "Paye" : "Non paye"}</td>
      <td>${fmt(h.montant_attendu)}</td>
      <td>${h.beneficiaires.length ? esc(h.beneficiaires.join(", ")) : "—"}</td>
    </tr>`,
      )
      .join("") || `<tr><td colspan="4">Aucune collecte enregistree</td></tr>`;

  const detteRows =
    r.detteGroupeDetail
      .map(
        (d) => `<tr><td>${fmtDate(d.date)}</td><td>${fmt(d.montant)}</td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="2">Aucune dette envers le groupe</td></tr>`;

  const pretsADevoirRows =
    r.pretsADevoirEnAttente
      .map(
        (p) =>
          `<tr><td>${esc(p.autreMembre)}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="3">Aucun pret en attente</td></tr>`;

  const pretsARecevoirRows =
    r.pretsARecevoirEnAttente
      .map(
        (p) =>
          `<tr><td>${esc(p.autreMembre)}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="3">Personne ne doit rembourser ce membre actuellement</td></tr>`;

  const body = `
    <h1>Jeunesse M3D — Fiche individuelle</h1>
    <div class="meta">${esc(nom)} &middot; ${esc(r.membre.fonction || "Membre")} &middot; Genere le ${fmtDate(r.genereLe)}</div>

    <h2>Resume</h2>
    <table>
      <tr><th>Total collecte attendu (toutes les semaines)</th><td>${fmt(r.totalCollecteAttendu)}</td></tr>
      <tr><th>Total effectivement paye</th><td>${fmt(r.totalCollectePaye)}</td></tr>
      <tr><th>Dette envers le groupe</th><td>${fmt(r.detteGroupeTotal)}</td></tr>
      <tr><th>Prets a rembourser (a d'autres membres)</th><td>${fmt(r.pretsADevoirTotal)}</td></tr>
      <tr><th>Prets a recevoir (d'autres membres)</th><td>${fmt(r.pretsARecevoirTotal)}</td></tr>
    </table>

    <h2>Collecte — detail (${r.historique.length} dimanche(s))</h2>
    <table><tr><th>Date</th><th>Statut</th><th>Montant</th><th>Anniversaire(s) du jour</th></tr>${collecteRows}</table>

    <h2>Dette envers le groupe — detail (Total : ${fmt(r.detteGroupeTotal)})</h2>
    <table><tr><th>Date</th><th>Montant</th></tr>${detteRows}</table>

    <h2>Prets entre membres — ce que ${esc(r.membre.prenom)} doit rembourser (Total : ${fmt(r.pretsADevoirTotal)})</h2>
    <table><tr><th>A avance (a rembourser a)</th><th>Montant</th><th>Date</th></tr>${pretsADevoirRows}</table>

    <h2>Prets entre membres — ce qu'on doit a ${esc(r.membre.prenom)} (Total : ${fmt(r.pretsARecevoirTotal)})</h2>
    <table><tr><th>Doit rembourser</th><th>Montant</th><th>Date</th></tr>${pretsARecevoirRows}</table>

    <p class="meta">Fiche individuelle generee automatiquement par l'app M3D Gestion. Le detail des collectes couvre uniquement les dimanches ou ce membre etait inscrit comme participant.</p>
  `;
  if (win) writePrintableDocument(win, `Fiche — ${nom} — M3D`, body);
}

// grouperParMembreHTML() : meme procede utilise partout ou on liste des
// montants lies a des membres (dettes du groupe, prets entre membres...) :
// une section par membre avec son nom, son sous-total, puis le detail
// (lignes individuelles) en dessous -- plutot qu'une seule grande liste
// plate ou tout est melange entre membres.
// - items : tableau d'objets a regrouper
// - cleGroupe : champ utilise pour regrouper (ex. "id_membre")
// - nomEtSousTitre(items) : renvoie { nom, sousTitre } pour l'entete de section
// - montant(item) : renvoie le montant d'une ligne (pour le sous-total)
// - ligneDetail(item) : renvoie le HTML <tr> d'une ligne de detail
// - enteteDetail : HTML des <th> de la table de detail
function grouperParMembreHTML(
  items,
  cleGroupe,
  nomEtSousTitre,
  montant,
  ligneDetail,
  enteteDetail,
) {
  const groupes = Array.from(groupBy(items, cleGroupe).values())
    .map((liste) => {
      const { nom, sousTitre } = nomEtSousTitre(liste);
      return {
        nom,
        sousTitre,
        sousTotal: liste.reduce((a, it) => a + montant(it), 0),
        detail: liste
          .slice()
          .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
      };
    })
    // Plus grosse somme en premier
    .sort((a, b) => b.sousTotal - a.sousTotal);

  const html =
    groupes
      .map(
        (g) => `
    <h2>${esc(g.nom)}${g.sousTitre ? ` &middot; ${esc(g.sousTitre)}` : ""} — Total : ${fmt(g.sousTotal)}</h2>
    <table><tr>${enteteDetail}</tr>${g.detail.map(ligneDetail).join("")}</table>`,
      )
      .join("") || `<p>Aucune donnee.</p>`;

  return { groupes, html };
}

async function exportDettesPDF() {
  const win = openPrintableWindow();
  const dettes = (await dettesList()).filter((d) => d.statut === "Impayee");
  const total = dettes.reduce((a, d) => a + d.montant, 0);

  const { groupes, html: sections } = grouperParMembreHTML(
    dettes,
    "id_membre",
    (liste) => ({ nom: liste[0].membre, sousTitre: liste[0].telephone }),
    (d) => d.montant,
    (d) => `<tr><td>${fmtDate(d.date)}</td><td>${fmt(d.montant)}</td></tr>`,
    `<th>Date</th><th>Montant</th>`,
  );

  const body = `
    <h1>Jeunesse M3D — Dettes du groupe</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${groupes.length} membre(s) concerne(s) &middot; ${dettes.length} dette(s) impayee(s)</div>
    ${sections}
    <h2>Total general</h2>
    <table><tr><th>Total des dettes impayees</th><td>${fmt(total)}</td></tr></table>
    <p class="meta">Ceci ne concerne que l'argent du au GROUPE. Les prets personnels entre membres (quelqu'un qui a avance une cotisation pour un autre) sont exportes separement.</p>
  `;
  if (win) writePrintableDocument(win, "Dettes du groupe — M3D", body);
}

async function exportPretsMembresPDF() {
  const win = openPrintableWindow();
  const prets = await pretsMembres();
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) => (memById[id] ? fullName(memById[id]) : "?");
  const enAttente = prets.filter((p) => !p.rembourse);
  const totalEnAttente = enAttente.reduce((a, p) => a + p.montant, 0);

  // Meme procede que pour les dettes du groupe : une section par membre
  // DEBITEUR (celui qui doit rembourser), avec son total du et le detail
  // (a qui, montant, date) de chaque pret en attente.
  const { groupes, html: sections } = grouperParMembreHTML(
    enAttente,
    "id_debiteur",
    (liste) => ({ nom: nomOf(liste[0].id_debiteur), sousTitre: "" }),
    (p) => p.montant,
    (p) =>
      `<tr><td>${esc(nomOf(p.id_preteur))}</td><td>${fmt(p.montant)}</td><td>${fmtDate(p.date)}</td></tr>`,
    `<th>A avance</th><th>Montant</th><th>Date</th>`,
  );

  const body = `
    <h1>Jeunesse M3D — Prets entre membres</h1>
    <div class="meta">Genere le ${fmtDate(todayISO())} &middot; ${groupes.length} membre(s) concerne(s) &middot; ${enAttente.length} pret(s) en attente de remboursement</div>
    ${sections}
    <h2>Total en attente</h2>
    <table><tr><th>Total des prets non rembourses</th><td>${fmt(totalEnAttente)}</td></tr></table>
    <p class="meta">Ceci concerne des arrangements PERSONNELS entre membres (un membre absent s'est fait avancer sa cotisation par un autre). Cet argent est deja compte comme recu par le groupe et n'apparait donc pas dans les dettes du groupe.</p>
  `;
  if (win) writePrintableDocument(win, "Prets entre membres — M3D", body);
}

async function exportCotisationPDF(idDimanche) {
  const win = openPrintableWindow();
  const jours = await joursAvecStats();
  const j = jours.find((x) => x.dimanche.id === idDimanche);
  if (!j) {
    if (win) win.close();
    toast("Dimanche introuvable", "error");
    return;
  }
  const membres = await db.membres.toArray();
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const rows = j.paiements
    .map((p) => {
      const m = memById[p.id_membre];
      return `<tr>
      <td>${m ? esc(m.nom) : "?"}</td><td>${m ? esc(m.prenom) : "?"}</td><td>${m ? esc(m.telephone || "—") : "—"}</td>
      <td>${fmt(p.montant_paye)}</td><td>${p.a_paye ? fmtDate(j.dimanche.date) : "—"}</td>
      <td>${p.a_paye ? "Paye" : "Non paye"}</td>
    </tr>`;
    })
    .join("");
  const nonPayants = j.paiements
    .filter((p) => !p.a_paye)
    .map((p) => memById[p.id_membre])
    .filter(Boolean);
  const listeNonPayants = nonPayants.length
    ? `<ul>${nonPayants.map((m) => `<li>${esc(fullName(m))}</li>`).join("")}</ul>`
    : `<p>Tous les participants ont cotise.</p>`;
  const body = `
    <h1>Cotisation anniversaire — ${esc(j.beneficiaires.join(", ")) || "—"}</h1>
    <div class="meta">Dimanche du ${fmtDate(j.dimanche.date)}</div>
    <table><tr><th>Nom</th><th>Prenom</th><th>Telephone</th><th>Montant paye</th><th>Date du paiement</th><th>Statut</th></tr>${rows}</table>
    <h2>Recapitulatif</h2>
    <table>
      <tr><th>Nombre de membres</th><td>${j.nbTotal}</td></tr>
      <tr><th>Nombre de participants</th><td>${j.nbPayants}</td></tr>
      <tr><th>Nombre de non-participants</th><td>${j.nbTotal - j.nbPayants}</td></tr>
      <tr><th>Montant attendu (par personne)</th><td>${fmt(j.montantAttendu)}</td></tr>
      <tr><th>Montant recu</th><td>${fmt(j.totalCollecte)}</td></tr>
      <tr><th>Montant restant</th><td>${fmt(j.montantAttendu * j.nbTotal - j.totalCollecte)}</td></tr>
      <tr><th>Date d'impression</th><td>${fmtDate(todayISO())}</td></tr>
    </table>
    <h2>Membres n'ayant pas paye (${nonPayants.length})</h2>
    ${listeNonPayants}
  `;
  if (win) writePrintableDocument(win, "Cotisation — M3D", body);
}

async function exportRapportPDF() {
  const win = openPrintableWindow();
  const r = await rapportStats();
  const fonctionsRows = Object.entries(r.parFonction)
    .map(([f, n]) => `<tr><td>${f}</td><td>${n}</td></tr>`)
    .join("");
  const moisRows = r.parMois
    .map((x) => `<tr><td>${x.mois}</td><td>${x.nb}</td></tr>`)
    .join("");
  const regRows =
    r.plusReguliers
      .map(
        (x) =>
          `<tr><td>${esc(fullName(x.membre))}</td><td>${x.paye}/${x.total}</td><td>${Math.round(x.taux * 100)}%</td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="3">Aucun membre a 80% de presence ou plus</td></tr>`;
  const absRows =
    r.absents
      .map(
        (x) =>
          `<tr><td>${esc(fullName(x.membre))}</td><td>${x.paye}/${x.total}</td><td>${Math.round(x.taux * 100)}%</td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="3">Aucun membre a 40% de presence ou moins</td></tr>`;
  const histRows = r.joursStats
    .map(
      (j) =>
        `<tr><td>${fmtDate(j.dimanche.date)}</td><td>${esc(j.beneficiaires.join(", ")) || "—"}</td><td>${fmt(j.totalCollecte)}</td><td>${j.nbPayants}/${j.nbTotal}</td></tr>`,
    )
    .join("");
  const body = `
    <h1>Jeunesse M3D — Rapport general</h1>
    <div class="meta">Genere le ${fmtDate(r.genereLe)}</div>
    <h2>Resume general</h2>
    <table>
      <tr><th>Membres</th><td>${r.totalMembres}</td></tr>
      <tr><th>Dimanches de collecte realises</th><td>${r.nbDimanches}</td></tr>
      <tr><th>Montant total collecte</th><td>${fmt(r.totalCollecte)}</td></tr>
      <tr><th>Montant distribue (cadeaux)</th><td>${fmt(r.totalDistribue)}</td></tr>
      <tr><th>Montant restant en caisse</th><td>${fmt(r.solde)}</td></tr>
      <tr><th>Dettes impayees</th><td>${fmt(r.dettesTotal)}</td></tr>
      <tr><th>Taux de participation moyen</th><td>${Math.round(r.tauxParticipationGlobal * 100)}%</td></tr>
      <tr><th>Listes personnalisees actives</th><td>${r.nbListes}</td></tr>
    </table>
    <h2>Repartition par fonction</h2>
    <table><tr><th>Fonction</th><th>Membres</th></tr>${fonctionsRows}</table>
    <h2>Anniversaires par mois</h2>
    <table><tr><th>Mois</th><th>Membres</th></tr>${moisRows}</table>
    <h2>Membres les plus reguliers (80%+ de presence)</h2>
    <table><tr><th>Membre</th><th>Cotisations payees</th><th>Taux</th></tr>${regRows}</table>
    <h2>Membres les plus absents (40% ou moins de presence)</h2>
    <table><tr><th>Membre</th><th>Cotisations payees</th><th>Taux</th></tr>${absRows}</table>
    <h2>Historique des cotisations (${r.joursStats.length})</h2>
    <table><tr><th>Date</th><th>Anniversaire(s)</th><th>Total collecte</th><th>Ont cotise</th></tr>${histRows}</table>
  `;
  if (win) writePrintableDocument(win, "Rapport general — M3D", body);
}
async function openAjusterCaisse() {
  const cd = await caisseDetail();
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Ajuster la caisse</h3>
    <div class="small-note" style="margin-bottom:12px;">Solde calcule actuellement : <b>${fmt(cd.solde)}</b>. Indique le montant que tu as REELLEMENT en main : l'app ajoutera automatiquement un mouvement pour combler l'ecart, sans rien effacer de l'historique.</div>
    <div class="field"><label>Montant reel en main (FCFA)</label><input id="aj_montant" type="number" value="${cd.solde}"></div>
    <button class="btn btn-primary" id="aj_save">Ajuster</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document.getElementById("aj_save").addEventListener("click", async () => {
    const montant = Number(document.getElementById("aj_montant").value);
    if (isNaN(montant)) {
      toast("Montant invalide", "error");
      return;
    }
    const { ecart } = await ajusterCaisse(montant);
    closeSheet();
    toast(
      ecart === 0
        ? "Deja a jour, aucun ajustement necessaire"
        : `Caisse ajustee (${ecart > 0 ? "+" : ""}${fmt(ecart)})`,
    );
    renderPlus();
  });
}
function openAddMouvement() {
  const ov = openSheet(`
    <button class="sheet-close" data-close>&times;</button>
    <h3>Nouveau mouvement de caisse</h3>
    <div class="field"><label>Type</label>
      <select id="mv_type"><option value="Sortie">Sortie (depense)</option><option value="Entree">Entree</option></select>
    </div>
    <div class="field"><label>Montant</label><input id="mv_montant" type="number"></div>
    <div class="field"><label>Libelle</label><input id="mv_libelle" type="text" placeholder="Ex. Achat cadeau"></div>
    <button class="btn btn-primary" id="mv_save">Enregistrer</button>
  `);
  ov.querySelector("[data-close]").addEventListener("click", closeSheet);
  document.getElementById("mv_save").addEventListener("click", async () => {
    const montant = Number(document.getElementById("mv_montant").value);
    if (!montant) {
      toast("Montant invalide", "error");
      return;
    }
    await db.caisse_mouvements.add({
      id: uid(),
      date: todayISO(),
      type: document.getElementById("mv_type").value,
      montant,
      libelle:
        document.getElementById("mv_libelle").value.trim() ||
        "Mouvement manuel",
    });
    await log("caisse", "mouvement_manuel", montant);
    closeSheet();
    toast("Mouvement enregistre");
    renderPlus();
  });
}

// ---------------------------------------------------------------
// Sauvegarde / restauration JSON
// ---------------------------------------------------------------
async function exportBackup() {
  const tables = [
    "membres",
    "sessions",
    "dimanches",
    "anniversaires_du_jour",
    "paiements",
    "remboursements",
    "caisse_mouvements",
    "parametres",
    "listes",
    "liste_membres",
    "prets_membres",
  ];
  const data = {};
  for (const t of tables) data[t] = await db[t].toArray();
  const blob = new Blob(
    [
      JSON.stringify(
        { version: 1, exportedAt: new Date().toISOString(), data },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const resultat = await partagerOuTelechargerFichier(
    blob,
    `m3d-sauvegarde-${todayISO()}.json`,
    "application/json",
  );
  if (resultat === "annule") return; // l'utilisateur a ferme la feuille de partage, rien a confirmer
  await setParam("derniere_sauvegarde", new Date().toISOString());
  toast(
    resultat === "partage"
      ? "Sauvegarde prete — choisis ou l'enregistrer (Fichiers, Mail...)."
      : "Sauvegarde prete. Si le fichier ne se telecharge pas tout seul, utilise le bouton Partager > Enregistrer dans Fichiers (pas 'Creer un PDF').",
  );
}
async function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ok = await confirmWithPassword(
    "Importer va REMPLACER les membres, cotisations et listes actuels par le contenu de ce fichier. Verifie bien que c'est le BON fichier de sauvegarde avant de continuer. Confirme avec le mot de passe administrateur.",
  );
  if (!ok) {
    e.target.value = "";
    return;
  }
  try {
    // file.text() n'existe pas avant Safari 14 (absent sur iOS 12/13).
    // On repasse par FileReader, supporte depuis toujours sur iOS.
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    const parsed = JSON.parse(text);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.data !== "object" ||
      parsed.data === null
    ) {
      throw new Error("Structure de sauvegarde invalide.");
    }
    // Liste blanche : doit rester EXACTEMENT synchronisee avec les tables
    // declarees dans db.js (db.version(3).stores({...})). A completer a
    // chaque fois qu'une table est ajoutee au schema. Empeche un fichier
    // trafique d'injecter des cles/tables inattendues dans la base.
    const KNOWN_TABLES = [
      "membres",
      "sessions",
      "dimanches",
      "anniversaires_du_jour",
      "paiements",
      "remboursements",
      "caisse_mouvements",
      "parametres",
      "activity_log",
      "listes",
      "liste_membres",
      "prets_membres",
    ];
    const tables = Object.keys(parsed.data).filter(
      (t) => KNOWN_TABLES.indexOf(t) !== -1 && Array.isArray(parsed.data[t]),
    );
    if (tables.length === 0)
      throw new Error("Aucune table reconnue dans ce fichier.");
    await db.transaction(
      "rw",
      tables.map((t) => db[t]),
      async () => {
        for (const t of tables) {
          await db[t].clear();
          await db[t].bulkAdd(parsed.data[t]);
        }
      },
    );
    toast("Sauvegarde importee");
    showTab("accueil");
  } catch (err) {
    toast(`Fichier invalide : ${err.message || "erreur inconnue"}`, "error");
  }
  e.target.value = "";
}

// ---------------------------------------------------------------
// Demarrage
// ---------------------------------------------------------------
initTheme();
(async function start() {
  await seedIfEmpty();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  const configured = await isAdminConfigured();
  if (!configured) {
    showSetupScreen();
    return;
  }
  let authed = false;
  try {
    authed = sessionStorage.getItem("m3d_authed") === "1";
  } catch (e) {}
  if (!authed) {
    showLoginScreen();
    return;
  }
  // Meme verification qu'au retour de mise en arriere-plan : couvre le cas
  // ou l'app etait deja cachee (ecran verrouille, changement d'appli) au
  // moment ou cette page a ete (re)chargee.
  if (verrouillerSiExpire()) return;

  showTab("accueil");
})();