/**
 * @file composants.js - Briques de tableau reutilisables par les rapports.
 * @description Ces fonctions encapsulent les cas limites (0, 1, 100+ lignes)
 * qui etaient reecrits a la main dans chaque export : ligne « aucune
 * donnee », ligne de total, colonne alignee a droite.
 */

/**
 * Construit un tableau HTML a partir d'entetes et de lignes.
 *
 * Le cas « aucune donnee » est gere ici : il produit une seule ligne
 * d'information a l'place d'un tableau vide, ce qui donnait auparavant un
 * cadre vide sans explication a l'impression.
 *
 * @param {string[]} entetes - Libelles de colonnes.
 * @param {string[]} lignesHtml - Cellules deja construites, une par ligne.
 * @param {object} [o]
 * @param {string[]} [o.numEnDroite] - Index de colonnes alignees a droite.
 * @param {boolean} [o.vide] - Vrai si le tableau ne contient aucune ligne.
 * @param {string} [o.messageVide] - Texte affiche quand `vide`.
 * @returns {string}
 */
function pdfTableau(entetes, lignesHtml, o = {}) {
  const numEnDroite = o.numEnDroite || [];
  const vide = o.vide !== undefined ? o.vide : !lignesHtml.length;
  const cligne = (i) => (numEnDroite.includes(i) ? ' class="num"' : "");

  const thead = `<tr>${entetes
    .map((h, i) => `<th${cligne(i)}>${esc(h)}</th>`)
    .join("")}</tr>`;

  if (vide) {
    return `<table><thead>${thead}</thead><tbody>
      <tr><td colspan="${entetes.length}" class="vide">${esc(
        o.messageVide || "Aucune donnee",
      )}</td></tr>
    </tbody></table>`;
  }

  return `<table><thead>${thead}</thead><tbody>${lignesHtml.join("")}</tbody></table>`;
}

/**
 * Construit le tableau de synthese "libelle / valeur" utilise par les
 * resumes de tous les rapports.
 *
 * @param {Array<[string, string]>} paires - Libelle et valeur deja formatees.
 * @returns {string}
 */
function pdfResume(paires) {
  const lignes = paires.map(
    ([libelle, valeur]) => `<tr><th>${esc(libelle)}</th><td class="num">${valeur}</td></tr>`,
  );
  return `<table><tbody>${lignes.join("")}</tbody></table>`;
}

/**
 * Ligne de total finale, mise en evidence.
 * @param {string} libelle
 * @param {string} valeur - Deja formatee.
 * @returns {string}
 */
function pdfLigneTotal(libelle, valeur) {
  return `<table><tbody><tr class="ligne-total">
    <th>${esc(libelle)}</th><td class="num">${valeur}</td>
  </tr></tbody></table>`;
}

/**
 * Liste a puces simple, pour les resumes non tabulaires (ex. membres
 * n'ayant pas paye). Le cas vide produit un message, pas une liste vide.
 *
 * @param {string[]} elements - Texte deja echappe ou a echapper ici.
 * @param {string} [messageVide]
 * @returns {string}
 */
function pdfListe(elements, messageVide) {
  if (!elements.length) return `<p class="vide">${esc(messageVide || "Aucun element")}</p>`;
  return `<ul>${elements.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
}
