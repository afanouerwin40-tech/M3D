/**
 * @file composants.js - Briques de tableau reutilisables par les rapports.
 *
 * Ce que contient ce fichier : quatre petites fonctions qui construisent du
 * HTML de mise en page — un tableau, un resume « libelle / valeur », une
 * ligne de total, une liste a puces. Ce ne sont pas des composants
 * d'interface (aucun ecouteur d'evenement, aucune animation) : ce sont des
 * briques de chaine de caracteres, au meme titre qu'un gabarit.
 *
 * Ce que cela permet : les cinq rapports de rapports.js n'ont plus a
 * reecrire a la main les memes cas limites (zero ligne, une ligne, cent
 * lignes, colonne de nombres a aligner a droite). Une correction — par
 * exemple le message affiche quand un tableau est vide — se fait une seule
 * fois et s'applique partout.
 *
 * Avec quoi il communique :
 *   - socle.js, pour esc() et la classe CSS .num (alignement a droite) ;
 *   - rapports.js, seul appelant de ces quatre fonctions.
 *
 * Vocabulaire utilise dans ce fichier, defini ici :
 *   - `.map()` : methode de tableau qui construit un NOUVEAU tableau en
 *     appliquant une fonction a chaque element. Exemple :
 *     [1, 2, 3].map(x => x * 2) donne [2, 4, 6].
 *   - `.join("")` : recolle les elements d'un tableau en une seule chaine,
 *     ici sans separateur. C'est ce qui transforme une liste de `<tr>` en
 *     du HTML continu.
 *   - `o = {}` : parametre par defaut. Si l'appelant ne passe rien,
 *     `o` vaut un objet vide plutot que `undefined` ; on peut donc lire
 *     `o.vide` sans verifier d'abord que `o` existe.
 *   - `o.vide !== undefined ? o.vide : !lignesHtml.length` : test de
 *     presence. `!== undefined` verifie « la valeur est-elle definie ». Si
 *     l'appelant a fourni le champ `vide`, on respecte sa valeur ; sinon
 *     on deduit qu'un tableau sans ligne est vide. Cela laisse la main a
 *     l'appelant quand la realite ne se deduit pas de l'array (par exemple
 *     un rapport qui filtre une liste pour n'afficher que les cas
 *     interessants).
 */

/**
 * Construit un tableau HTML a partir d'entetes et de lignes.
 *
 * Le cas « aucune donnee » est gere ici : il produit une seule ligne
 * d'information a la place d'un tableau vide, ce qui donnait auparavant un
 * cadre vide sans explication a l'impression. Un cadre vide est un bug
 * visible ; un message « Aucun membre a paye » est une information utile.
 *
 * Pourquoi le cas vide est traite ICI et pas dans chaque rapport : parce
 * que c'est le meme probleme partout, qu'il se pose a chaque export, et que
 * le taux d'oublier un cas est proportionnel au nombre de rapports. Une
 * regle qui doit etre respectee a dix endroits n'est plus une regle. En le
 * confondant dans la fonction, il devient impossible a oublier.
 * Securite : les libelles d'en-tete passent par esc(), de meme que le
 * message du cas vide. Les cellules, elles, sont inserees telles quelles :
 * c'est au rapport de les avoir echappees en amont, car elles contiennent
 * souvent du HTML complexe (un montant formate, un lien).
 *
 * @param {string[]} entetes - Libelles de colonnes, echappes ici.
 * @param {string[]} lignesHtml - Cellules deja construites et echappees par
 *   l'appelant, une chaine `<tr>...</tr>` par ligne.
 * @param {object} [o] - Options de rendu.
 * @param {number[]} [o.numEnDroite] - Index (position, a partir de 0) des
 *   colonnes dont les valeurs doivent etre alignees a droite. Un tableau
 *   de nombres aligne a gauche est difficile a lire : l'oeil ne trouve pas
 *   les unites. L'index, et non le libelle, permet d'aligner la colonne
 *   "Montant" du 3e rapport comme celle du 1er.
 * @param {boolean} [o.vide] - Force l'affichage du message « aucune donnee »
 *   meme si `lignesHtml` contient des lignes (utile apres un filtre).
 * @param {string} [o.messageVide] - Texte affiche quand le tableau est vide.
 * @returns {string} Fragment HTML du tableau.
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
 * Construit le tableau de synthese « libelle / valeur » utilise par les
 * resumes de tous les rapports.
 *
 * Le format est un tableau a deux colonnes, sans en-tete : la premiere
 * colonne porte le libelle, la seconde la valeur, alignee a droite
 * (classe CSS `num`). Pas de ligne d'en-tete parce qu'il n'y a rien a
 * nommer : le libelle de chaque ligne l'est deja.
 *
 * La valeur est inseree sans esc() car elle arrive deja formatee par
 * l'appelant, typiquement via fmt() (qui produit « 12 000 F ») ou
 * fmtDate(). Ces fonctions ne renvoient que des caracteres sans risque.
 * Le libelle, lui, peut contenir un nom de personne : il est echappe.
 *
 * @param {Array<[string, string]>} paires - Liste de couples [libelle,
 *   valeur]. La notation entre crochets [] est un tableau, le couple entre
 *   crochets dans un tableau est en fait un tableau de deux elements ;
 *   `.map(([libelle, valeur]) => ...)` utilise la « decomposition » pour
 *   nommer les deux elements directement, sans passer par `p[0]` et `p[1]`.
 * @returns {string} Fragment HTML du resume.
 */
function pdfResume(paires) {
  const lignes = paires.map(
    ([libelle, valeur]) => `<tr><th>${esc(libelle)}</th><td class="num">${valeur}</td></tr>`,
  );
  return `<table><tbody>${lignes.join("")}</tbody></table>`;
}

/**
 * Ligne de total finale, mise en evidence.
 *
 * Elle porte la classe CSS `ligne-total`, definie dans le socle : fond
 * terracotta clair, gras, et surtout une regle anti-rupture de page
 * heritee, pour qu'un total ne se retrouve pas seul en bas d'une page,
 * separe de ses lignes.
 *
 * Fonction distincte de pdfResume() et non un cas particulier de celui-ci,
 * parce que la mise en page differe (fond, gras) : la difference tient dans
 * une classe CSS, mais c'est cette difference qui rend le total lisible.
 *
 * @param {string} libelle - Intitule du total, echappe ici.
 * @param {string} valeur - Valeur deja formatee par l'appelant (fmt()).
 * @returns {string} Fragment HTML de la ligne de total.
 */
function pdfLigneTotal(libelle, valeur) {
  return `<table><tbody><tr class="ligne-total">
    <th>${esc(libelle)}</th><td class="num">${valeur}</td>
  </tr></tbody></table>`;
}

/**
 * Liste a puces simple, pour les resumes non tabulaires (ex. membres
 * n'ayant pas paye). Le cas vide produit un message, pas une liste vide :
 * une section vide sans explication se lit comme une erreur de generation.
 *
 * Contrairement a pdfTableau(), les elements passent par esc() ici. C'est
 * coherent avec ce que la fonction accepte : du texte brut, que le
 * rapport n'a pas besoin de composer. Le contrat est donc « texte » et non
 * « HTML » — ce qui rend l'appel moins facile a oublier.
 *
 * @param {string[]} elements - Les textes a lister, un par puce.
 * @param {string} [messageVide] - Message affiche si la liste est vide.
 * @returns {string} Fragment HTML : soit une <ul>, soit un paragraphe.
 */
function pdfListe(elements, messageVide) {
  if (!elements.length) return `<p class="vide">${esc(messageVide || "Aucun element")}</p>`;
  return `<ul>${elements.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
}
