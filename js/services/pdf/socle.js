/**
 * @file socle.js - Fondations communes a tous les exports PDF/imprimables.
 * @description Tout ce qui se repete d'un rapport a l'autre est ecrit ICI une
 * seule fois : feuille de style, en-tete, pied de page pagine, ouverture de
 * fenetre et injection du document. Un rapport ne fournit que ses donnees.
 *
 * Regle de couleur : les exports utilisent le meme terracotta que
 * l'application (--accent). Les exports precedents etaient en indigo
 * #6366F1, ce qui donnait des rapports sans rapport avec l'interface.
 *
 * Regle de securite : aucune valeur saisie par l'utilisateur n'est injectee
 * sans esc(). Le <title> du document est notamment echappe (il ne l'etait
 * pas : un nom de membre contenant "</title><script>" s'echappait de la
 * balise et s'executait dans la fenetre d'impression).
 */

// Couleurs : meme palette que l'application (cf. css/variables.css).
const PDF_COULEURS = Object.freeze({
  accent: "#C4714A",
  accentClair: "#FBF3F0",
  texte: "#1F2937",
  texteDoux: "#6B7280",
  bordure: "#D8D3CE",
  fondTableau: "#F7F5F3",
  total: "#1F2937",
});

/**
 * Feuille de style du document imprime. Les sauts de page et l'evitement
 * des coupures de lignes.tables sont geres ici plutot que dans chaque
 * rapport, parce qu'ils doivent etre identiques partout.
 * @returns {string}
 */
function pdfFeuilleStyle() {
  return `
    @page { size: A4; margin: 14mm 12mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", -apple-system, Arial, sans-serif;
      color: ${PDF_COULEURS.texte};
      margin: 0; font-size: 11px; line-height: 1.45;
    }

    /* --- En-tete professionnel, repete sur chaque page --- */
    .entete {
      display: flex; align-items: center; gap: 10px;
      border-bottom: 2px solid ${PDF_COULEURS.accent};
      padding-bottom: 8px; margin-bottom: 14px;
    }
    .entete-logo { width: 30px; height: 30px; flex: 0 0 auto; color: ${PDF_COULEURS.accent}; }
    .entete-texte { flex: 1 1 auto; min-width: 0; }
    .entete-org { font-size: 13px; font-weight: 700; letter-spacing: .2px; }
    .entete-session { font-size: 10px; color: ${PDF_COULEURS.texteDoux}; }
    .entete-titre { font-size: 15px; font-weight: 700; text-align: right; }

    h1 { font-size: 16px; margin: 0 0 2px; }
    h2 {
      font-size: 12.5px; margin: 18px 0 6px; padding-bottom: 3px;
      border-bottom: 1px solid ${PDF_COULEURS.bordure};
      break-after: avoid; page-break-after: avoid;
    }
    p { margin: 0 0 8px; }
    .meta { color: ${PDF_COULEURS.texteDoux}; font-size: 10.5px; margin-bottom: 12px; }

    /* --- Tableaux --- */
    table { border-collapse: collapse; width: 100%; margin-top: 6px; }
    th, td {
      border: 1px solid ${PDF_COULEURS.bordure};
      padding: 5px 7px; text-align: left; vertical-align: top;
    }
    th { background: ${PDF_COULEURS.fondTableau}; font-weight: 600; }
    tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .num { text-align: right; white-space: nowrap; }
    /* Une ligne de total ne doit jamais etre isolee en bas de page. */
    .ligne-total { background: ${PDF_COULEURS.accentClair}; font-weight: 700; }
    .vide { color: ${PDF_COULEURS.texteDoux}; font-style: italic; padding: 8px 0; }

    /* --- Pied de page pagine --- */
    .pied {
      position: fixed; bottom: 0; left: 0; right: 0;
      display: flex; justify-content: space-between;
      border-top: 1px solid ${PDF_COULEURS.bordure};
      padding-top: 4px; font-size: 9.5px; color: ${PDF_COULEURS.texteDoux};
    }

    .print-bar { margin-bottom: 16px; }
    .print-bar button {
      font: inherit; padding: 9px 16px; border-radius: 8px; border: none;
      background: ${PDF_COULEURS.accent}; color: #fff; cursor: pointer;
    }
    @media print { .print-bar { display: none; } }
  `;
}

/**
 * Construit l'en-tete commun (logo, organisation, session, titre du rapport).
 *
 * @param {object} o
 * @param {string} o.organisation - Nom affiche en tete.
 * @param {string} o.titre - Titre du rapport.
 * @param {string} [o.session] - Session pastorale, facultatif.
 * @returns {string}
 */
function pdfEntete(o) {
  return `<div class="entete">
    <svg class="entete-logo" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19" stroke="currentColor" stroke-width="2"/>
      <path d="M12 26V14l8 8 8-8v12" stroke="currentColor" stroke-width="2.4"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div class="entete-texte">
      <div class="entete-org">${esc(o.organisation)}</div>
      ${o.session ? `<div class="entete-session">${esc(o.session)}</div>` : ""}
    </div>
    <div class="entete-titre">${esc(o.titre)}</div>
  </div>`;
}

/**
 * Construit le pied de page pagine. Les compteurs CSS `page`/`pages` ne sont
 * pas pris en charge par tous les moteurs d'impression : on affiche donc
 * « Page N » seul, qui degrade proprement sur "Page 1".
 * @returns {string}
 */
function pdfPied() {
  return `<div class="pied">
    <span>Document genere par M3D Gestion</span>
    <span>Page <span class="page"></span></span>
  </div>`;
}

/**
 * Assemble le document complet : style + en-tete + corps + pied de page.
 * Cette fonction est le SEUL point ou du HTML brut est injecte dans une
 * fenetre d'impression.
 *
 * @param {string} organisation
 * @param {string} titre
 * @param {string} corpsHtml - Corps deja produit par le rapport appelant.
 * @param {string} [session] - Session pastorale, facultatif.
 * @returns {string} Document HTML complet.
 */
function pdfDocumentComplet(organisation, titre, corpsHtml, session) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<title>${esc(titre)} — ${esc(organisation)}</title>
<style>
${pdfFeuilleStyle()}
@page { @bottom-center { content: ""; } }
</style></head><body>
<div class="print-bar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>
${pdfEntete({ organisation, titre, session })}
${corpsHtml}
${pdfPied()}
</body></html>`;
}

/**
 * Ouvre la fenetre d'impression et y injecte le document, puis declenche
 * l'impression systeme. Remplace l'ancien duo openPrintableWindow /
 * writePrintableDocument, qui acceptait un titre non echappe.
 *
 * @param {string} organisation
 * @param {string} titre
 * @param {string} corpsHtml
 * @param {string} [session]
 * @returns {Promise<boolean>} true si le document a ete envoye.
 */
function pdfOuvrirEtImprimer(organisation, titre, corpsHtml, session) {
  const win = openPrintableWindow();
  if (!win) return false;

  const html = pdfDocumentComplet(organisation, titre, corpsHtml, session);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  win.location.href = url;

  win.addEventListener("load", () => {
    try {
      win.focus();
      win.print();
    } catch (e) {
      console.warn("[M3D] Impression automatique refusee, imprimez manuellement.", e);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  return true;
}
