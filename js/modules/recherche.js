/**
 * @file recherche.js - Recherche globale multi-critères.
 * @description Barre de recherche unique de l'accueil, interrogeant les membres,
 * les listes d'activités et les dimanches de collecte avec anti-rebond (debounce).
 */

// ============================================================================
// RECHERCHE GLOBALE MULTI-CRITÈRES (Membres, Listes, Dimanches)
// ============================================================================

/** @type {number|null} Minuteur anti-rebond pour la recherche globale */
let globalSearchTimer = null;

/** @type {boolean} Drapeau empêchant la duplication d'écouteurs globaux */
let globalSearchListenerWired = false;

/**
 * Configure la saisie dans le champ de recherche globale avec anti-rebond (debounce).
 * La fermeture au clic externe est attachée une seule fois sur le document (évite les fuites mémoire).
 */
function wireGlobalSearch() {
  const input = document.getElementById("globalSearch");
  const box = document.getElementById("globalSearchResults");
  if (!input || !box) return;

  input.addEventListener("input", () => {
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(() => runGlobalSearch(input.value, box), 120);
  });

  if (!globalSearchListenerWired) {
    globalSearchListenerWired = true;
    document.addEventListener("click", (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      if (!target.closest(".search-wrap")) {
        const results = document.getElementById("globalSearchResults");
        if (results) {
          results.innerHTML = "";
          results.classList.remove("show");
        }
      }
    });
  }
}

/**
 * Exécute la recherche multi-entités et insère les résultats dans la liste déroulante.
 *
 * @param {string} qRaw - Requête brute saisie par l'utilisateur.
 * @param {HTMLElement} box - Conteneur des résultats.
 */
async function runGlobalSearch(qRaw, box) {
  const q = qRaw.trim().toLowerCase();
  if (!q) {
    box.innerHTML = "";
    box.classList.remove("show");
    return;
  }

  const [membres, listes, joursStats] = await Promise.all([
    listMembres(),
    listesAll(),
    joursAvecStats(),
  ]);

  const matchMembres = membres.filter((m) =>
    fullName(m).toLowerCase().includes(q) ||
    (m.telephone || "").includes(q) ||
    (m.fonction || "").toLowerCase().includes(q) ||
    (m.jour_anniversaire && `${String(m.jour_anniversaire).padStart(2, "0")}/${String(m.mois_anniversaire).padStart(2, "0")}`.includes(q)) ||
    (m.mois_anniversaire && MOIS_NOMS[m.mois_anniversaire - 1].toLowerCase().includes(q)),
  ).slice(0, 5);

  const matchListes = listes.filter((l) => l.nom.toLowerCase().includes(q)).slice(0, 5);
  const matchCotis = joursStats.filter((j) =>
    j.beneficiaires.join(" ").toLowerCase().includes(q) ||
    fmtDate(j.dimanche.date).includes(q),
  ).slice(0, 5);

  if (!matchMembres.length && !matchListes.length && !matchCotis.length) {
    box.innerHTML = `<div class="global-search-empty">Aucun resultat pour "${esc(qRaw)}"</div>`;
    box.classList.add("show");
    return;
  }

  const section = (title, items) => (items.length ? `<div class="gsr-title">${title}</div>${items}` : "");

  box.innerHTML =
    section("Membres", matchMembres.map((m) =>
      `<div class="gsr-item" data-go="membre" data-id="${m.id}"><span class="avatar" style="width:28px;height:28px;font-size:11px;">${initials(m)}</span>${esc(fullName(m))}</div>`,
    ).join("")) +
    section("Listes", matchListes.map((l) =>
      `<div class="gsr-item" data-go="liste" data-id="${l.id}">${esc(l.nom)}</div>`,
    ).join("")) +
    section("Cotisations", matchCotis.map((j) =>
      `<div class="gsr-item" data-go="dimanche" data-id="${j.dimanche.id}">${fmtDate(j.dimanche.date)} — ${esc(j.beneficiaires.join(", ")) || "Collecte"}</div>`,
    ).join(""));

  box.classList.add("show");

  box.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => {
      box.innerHTML = "";
      box.classList.remove("show");
      const go = /** @type {HTMLElement} */ (el).dataset.go;
      const id = /** @type {HTMLElement} */ (el).dataset.id;
      if (go === "membre") {
        showTab("membres").then(() => openMemberDetail(id));
      } else if (go === "liste") {
        renderListes().then(() => openListeDetail(id));
      } else if (go === "dimanche") {
        showTab("dimanche").then(() => openWeekDetail(id));
      }
    }),
  );
}
