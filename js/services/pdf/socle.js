/**
 * @file socle.js - Fondations communes a tous les exports PDF/imprimables.
 *
 * Ce que contient ce fichier : tout ce qui se repete d'un rapport a l'autre,
 * ecrit UNE SEULE FOIS : la palette de couleurs, la feuille de style
 * d'impression, l'en-tete, le pied de page pagine, l'assemblage du document
 * et l'ouverture de la fenetre d'impression.
 *
 * Ce que cela permet : un rapport (rapports.js) ne fournit que ses donnees
 * (du HTML de corps de document) et n'a plus a se soucier ni de la mise en
 * page, ni de la pagination, ni des reglages papier. Trois lignes au lieu de
 * cent, et un changement de charte graphique se fait a un seul endroit.
 *
 * Avec quoi il communique :
 *   - modules/exports.js, qui definit openPrintableWindow(), l'unique point
 *     d'ouverture de fenetre utilise par toute l'application ;
 *   - js/utils.js, pour esc() (echappement HTML, securite XSS) ;
 *   - services/pdf/composants.js et services/pdf/rapports.js, qui consomment
 *     ce socle. Attention a l'ordre de chargement dans index.html : socle.js
 *     doit venir apres exports.js.
 *
 * Pourquoi du HTML imprime plutot qu'un vrai fichier PDF ?
 * Un fichier PDF se construit octet par octet (coordonnees, polices
 * embarquees...) : cela suppose d'embarquer un moteur PDF, lourd et
 * complexe. Ici, on produit une page HTML complete que l'on ouvre dans une
 * fenetre, et c'est le navigateur qui sait deja mettre en page, paginer et
 * imprimer. Resultat : aucune dependance, un rendu identique sur tous les
 * systemes, et l'utilisateur peut au choix imprimer ou enregistrer en PDF.
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

/**
 * Palette de couleurs des documents imprimes.
 *
 * Meme palette que l'application (cf. css/variables.css), pour que le papier
 * sorti de l'imprimante ressemble a l'ecran. Ce sont des valeurs en dur,
 * jamais des couleurs saisies par un utilisateur : c'est aussi ce qui evite
 * d'avoir a revalider une couleur dans ce contexte.
 *
 * `Object.freeze(...)` fige l'objet : toute tentative d'ecriture ulterieure
 * (PDF_COULEURS.accent = "...") echoue silencieusement en mode strict et
 * surtout ne peut pas modifier la valeur pour les appels suivants. Ca evite
 * qu'un rapport modifie la charte des autres.
 *
 * @type {Readonly<Object<string, string>>}
 */
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
 * Renvoie la feuille de style CSS du document imprime, sous forme de texte.
 *
 * Ce qu'est une "feuille de style d'impression" : c'est du CSS classique,
 * mais avec quelques regles reservees au papier. La plus importante est
 * `@page { size: A4; }`, qui indique au navigateur le format du papier :
 * A4 (210 x 297 mm) et non Letter, ce qui evite les rapports debordant de
 * quelques millimetres sur la plupart des imprimantes. La regle `margin`
 * qui suit definit les marges de la zone imprimable.
 *
 * Les sauts de page et l'evitement des coupures de lignes/tableaux sont
 * geres ici plutot que dans chaque rapport, parce qu'ils doivent etre
 * identiques partout. Concretement :
 *   - `break-after: avoid` sur les h2 : un titre ne doit pas rester seul
 *     en bas de page, la section qui le suit doit partir avec lui ;
 *   - `break-inside: avoid` sur les lignes de tableau : une ligne ne doit
 *     pas etre coupee en deux par un saut de page.
 * Chaque propriete est ecrite deux fois (`break-*` est la forme moderne,
 * `page-break-*` la forme historique) : c'est la facon la plus simple de
 * rester compatible avec les vieux moteurs d'impression.
 *
 * Pourquoi c'est une fonction : le CSS est injecte dans une chaine de
 * caracteres via un gabarit (`${...}`). Il faut pouvoir y injecter les
 * couleurs de PDF_COULEURS, qui sont des valeurs JavaScript. Le reste du
 * CSS est du texte fixe, et reste ainsi lisible dans l'editeur.
 *
 * @returns {string} Le CSS complet, a placer dans une balise <style>.
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
 * Le logo est un petit SVG (image vectorielle, dessinee par le navigateur)
 * inline dans le HTML : pas de fichier image a charger, donc un rendu
 * correct meme en mode hors ligne, et un document autonome.
 *
 * Regle de securite : les trois valeurs variables (organisation, session,
 * titre) passent par esc(). esc() remplace les caracteres speciaux du HTML
 * (`<`, `>`, `"`, `&`) par des equivalents, de sorte qu'un nom de membre
 * contenant des balises s'affiche litteralement au lieu d'etre interprete
 * comme du HTML. C'est la protection contre les attaques XSS.
 *
 * @param {object} o - Objet regroupant les informations d'en-tete.
 * @param {string} o.organisation - Nom affiche en tete.
 * @param {string} o.titre - Titre du rapport.
 * @param {string} [o.session] - Session pastorale, facultatif. Si elle est
 *   absente ou vide, la ligne de session n'est pas rendue du tout.
 * @returns {string} Fragment HTML de l'en-tete.
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
 * Construit le pied de page, repete au bas de chaque page imprimee.
 *
 * La pagination repose sur deux classes CSS speciales, remplies par le
 * navigateur au moment de l'impression : `page` pour le numero de la page
 * courante et `pages` pour le total.
 *
 * Pourquoi on n'affiche donc que « Page N » et pas « Page N sur M » : le
 * compteur `pages` n'est pas pris en charge par tous les moteurs
 * d'impression (certains l'ignorent silencieusement). En n'utilisant que
 * `page`, la pagination degrade proprement partout : si le navigateur ne
 * sait pas la remplir, le document affiche "Page 1" plutot que de laisser
 * un trou.
 *
 * Le CSS de `.pied` utilise `position: fixed` : en impression, un element
 * fixe est redessine sur chaque page, ce qui est exactement le comportement
 * souhaite pour un pied de page.
 *
 * @returns {string} Fragment HTML du pied de page.
 */
function pdfPied() {
  return `<div class="pied">
    <span>Document genere par M3D Gestion</span>
    <span>Page <span class="page"></span></span>
  </div>`;
}

/**
 * Assemble le document complet : style + en-tete + corps + pied de page.
 *
 * Cette fonction est le SEUL point du code ou du HTML brut est injecte dans
 * une fenetre d'impression. Cette centralite est une mesure de securite :
 * il n'y a qu'un seul endroit a relire, un seul endroit a tester, un seul
 * endroit ou une valeur utilisateur pourrait se glisser sans echappement.
 *
 * Regle de securite appliquee ici : le `corpsHtml` est produit par les
 * rapports, qui ont deja echappe leurs donnees via esc(). En revanche
 * `organisation` et `titre` sont echappes ICI aussi, y compris dans la
 * balise <title>. C'etait le trou oublie jusqu'en v1.9.0 : un nom
 * d'organisation contenant `</title><script>...</script>` s'echappait de la
 * balise title et le script s'executait dans la fenetre d'impression. Deux
 * chemins d'injection, un seul traite : c'est exactement le genre d'erreur
 * que la centralisation evite.
 *
 * @param {string} organisation - Nom de l'organisation, affiche en en-tete.
 * @param {string} titre - Titre du rapport. Echappe avant d'etre place dans
 *   le <title> du document ET dans l'en-tete.
 * @param {string} corpsHtml - Corps deja produit par le rapport appelant,
 *   insere tel quel. C'est du HTML de confiance : chaque valeur affichee
 *   doit avoir ete passee par esc() en amont.
 * @param {string} [session] - Session pastorale, facultatif.
 * @returns {string} Le document HTML complet, pret a etre ouvert.
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
 * Ouvre la fenetre d'impression, y injecte le document, puis declenche
 * l'impression systeme. Remplace l'ancien duo openPrintableWindow /
 * writePrintableDocument, qui acceptait un titre non echappe.
 *
 * Deroulement, et chaque notion technique expliquee a sa premiere
 * apparition :
 *
 * 1. `openPrintableWindow()` (defini dans modules/exports.js) ouvre une
 *    fenetre. Elle renvoie `null` si le navigateur l'a bloquee : c'est
 *    courant, car beaucoup de navigateurs bloquent les fenetres qui ne
 *    resultant pas d'un clic direct de l'utilisateur. On renvoie alors
 *    `false` sans planter.
 *
 * 2. Le document est transforme en `Blob` (un objet JavaScript qui contient
 *    des donnees binaires, ici du texte), puis en URL locale temporaire via
 *    `URL.createObjectURL()`. On ecrit le document dans la fenetre en lui
 *    affectant cette URL plutot qu'en ecrivant du HTML dedans. Pourquoi :
 *    affecter une URL est une operation d'un seul coup, alors que ecrire du
 *    HTML par `document.write()` incremente un compteur interne et peut
 *    "sauter" des pages, comportement qui varie selon les navigateurs.
 *
 * 3. `win.addEventListener("load", ...)` attend que la page soit chargee.
 *    Un "event listener" est une fonction fournie a un evenement
 *    ("load" = la page est prete) et automatiquement appelee quand il
 *    survient. On ne peut pas imprimer avant, sinon la fenetre serait
 *    vide ou a moitie rendue.
 *
 * 4. Le `try/catch` (bloc d'essai : s'il leve une erreur, le bloc `catch`
 *    la recupere au lieu de faire echouer toute la page) entoure
 *    l'impression. Certains navigateurs et systemes refusent
 *    l'impression automatique : on prefere un message en console et un
 *    bouton « Imprimer » deja present dans le document, plutot qu'une
 *    erreur fatale.
 *
 * 5. `URL.revokeObjectURL()` libere l'URL temporaire apres 60 s. Sans cela,
 *    le navigateur garderait le document en memoire pour toute la session.
 *    Le delai est long parce que l'impression est asynchrone : il faut que
 *    la fenetre ait eu le temps de lire le contenu.
 *
 * Effets de bord : ouvre une fenetre, demarre l'impression, alloue puis
 * libere une URL temporaire, ecrit un message en console en cas d'echec.
 *
 * @param {string} organisation - Nom de l'organisation.
 * @param {string} titre - Titre du rapport.
 * @param {string} corpsHtml - Corps HTML du rapport, deja echappe.
 * @param {string} [session] - Session pastorale, facultatif.
 * @returns {boolean} true si le document a ete envoye vers la fenetre,
 *   false si la fenetre n'a pas pu etre ouverte.
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
