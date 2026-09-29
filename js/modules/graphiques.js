/**
 * @file graphiques.js
 * @description Module de visualisation de données utilisant l'API Canvas 2D.
 * Ce module permet de générer des graphiques (courbes, barres, anneaux) pour le tableau
 * de bord sans aucune dépendance externe (pas de Chart.js ou autre bibliothèque).
 *
 * Il communique principalement avec :
 * - `app.js` qui fournit les données agrégées lors du rendu de l'accueil.
 * - Le DOM pour accéder aux éléments `<canvas>` et aux variables CSS.
 *
 * Choix de conception :
 * - Rendu haute densité (multiplié par 2) pour la netteté sur écrans Retina/Mobile.
 * - Réactivité au redimensionnement avec un anti-rebond (debounce).
 * - Utilisation des variables CSS (`--accent`, `--text`, etc.) pour le respect du thème.
 */

/** @type {number|null} Minuteur anti-rebond pour le redimensionnement d'écran */
let resizeTimer = null;

/**
 * Mémoire cache locale (mémoïsation) pour le redimensionnement instantané des graphiques.
 * Évite de recalculer les agrégats depuis la base de données lors d'une simple rotation.
 */
let lastJoursStats = [];
let lastMembres = [];
let lastDepensesCat = {};

// ============================================================================
// GRAPHIQUES CANVAS 2D (Sans dépendance externe)
// ============================================================================

/**
 * Redessine les graphiques de l'accueil en conservant les données mémoïsées.
 * @sideEffect Oui : modifie le contenu des `<canvas>` dans le DOM.
 * @returns {void}
 * @why Cette fonction est appelée après un redimensionnement ou un changement d'onglet
 * pour rafraîchir visuellement sans requête DB supplémentaire (grâce au cache).
 */
function redrawAccueilCharts() {
  if (getCurrentTab() !== "accueil") return;
  if (!document.getElementById("chartCaisse")) return;
  drawCaisseChart(lastJoursStats);
  drawMonthBarChart(lastMembres);
  drawDonutChart(lastJoursStats[0]);
  drawDepensesCategorieChart(lastDepensesCat);
}

/**
 * Gestionnaire d'ajustement réactif lors de rotations d'écran ou redimensionnements.
 * @sideEffect Oui : planifie un redessin différé via un minuteur.
 * @returns {void}
 * @why Utilise un anti-rebond (debounce) de 150 ms car `resize` est déclenché
 * des centaines de fois par seconde pendant un glissement de fenêtre.
 */
function onViewportChange() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redrawAccueilCharts, 150);
}

// Trois événements couvrent les cas de figure : la fenêtre du navigateur change
// de taille (resize), l'appareil est retourné (orientationchange), ou la zone
// visible rétrécit sans que la fenêtre entière bouge — cas du clavier virtuel
// sur mobile, que seul `visualViewport` voit. D'où l'existence du test défensif.
window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
}

/**
 * Trace le graphique d'évolution linéaire de la caisse.
 * @param {any[]} joursStats — liste de jours avec `solde` cumulatif.
 * @sideEffect Oui : dessine sur le `<canvas id="chartCaisse">`.
 * @returns {void}
 * @why Les données sont inversées (`reverse`) pour afficher le plus ancien
 * d'abord ; le cumul (`cumul +=`) reconstruit l'évolution temporelle. Le
 * remplissage dégradé sous la courbe est un choix visuel (pas de donnée).
 */
function drawCaisseChart(joursStats) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartCaisse"));
  if (!canvas) return;

  const ordered = [...joursStats].reverse();
  // `getContext("2d")` récupère l'objet de dessin 2D. Le canvas est dimensionné
  // au double de sa largeur CSS (×2) pour une résolution doublée : sur un écran
  // Retina (densité 2x), 1 pixel physique = 2 pixels CSS, le rendu est donc net.
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  if (ordered.length < 2) {
    emptyCanvasMsg(ctx, W, H, "Collectes insuffisantes");
    return;
  }

  // `map()` transforme chaque élément en un autre élément et renvoie un nouveau
  // tableau. L'affectation dans la flèche (`cumul += j.solde`) fait office de
  // accumulateur : chaque entrée ajoute son solde journalier au précédent, ce qui
  // donne la courbe d'évolution de la caisse au fil du temps.
  let cumul = 0;
  const values = ordered.map((j) => (cumul += j.solde));
  // L'échelle inclut toujours 0 et au moins 1 : sans cela, une caisse nulle
  // produirait une division par zéro dans le calcul d'interpolation en Y.
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padX = 50;
  const padY = 40;

  // Conversion valeur → coordonnées pixel : on répartit N points sur la largeur
  // utile, puis on projette verticalement entre `min` et `max`. Le `|| 1` protège
  // le cas d'une courbe plate (min === max), qui rendrait le dénominateur nul.
  const pts = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * (W - 2 * padX),
    y: H - padY - ((v - min) / (max - min || 1)) * (H - 2 * padY),
  }));

  ctx.clearRect(0, 0, W, H);

  // Ligne de solde nul si présent dans la plage
  if (min < 0 && max > 0) {
    const y0 = H - padY - ((-min) / (max - min)) * (H - 2 * padY);
    ctx.strokeStyle = cssVar("--border") || "#E5E7EB";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, y0);
    ctx.lineTo(W - padX, y0);
    ctx.stroke();
  }

  // Remplissage dégradé sous la courbe. `createLinearGradient` définit un dégradé
  // vertical (opaque en haut, transparent en bas) qui donne du volume à l'aire
  // sous la courbe. Le tracé ferme le chemin pour revenir à l'axe horizontal.
  const grad = ctx.createLinearGradient(0, padY, 0, H - padY);
  grad.addColorStop(0, "rgba(99, 102, 241, 0.35)");
  grad.addColorStop(1, "rgba(99, 102, 241, 0.0)");

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, H - padY);
  ctx.lineTo(pts[0].x, H - padY);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Trait de la courbe
  ctx.strokeStyle = cssVar("--accent") || "#6366F1";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Points de repère
  ctx.fillStyle = cssVar("--accent") || "#6366F1";
  pts.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Trace le graphique à barres des anniversaires par mois.
 * @param {any[]} membres — liste des membres, chaque objet portant `mois_anniversaire` (1-12).
 * @sideEffect Oui : dessine sur le `<canvas id="chartMois">`.
 * @returns {void}
 * @why Le mois courant est mis en avant par la couleur : c'est l'information la
 * plus utile ici (qui fête bientôt), le reste sert de contexte de répartition.
 */
function drawMonthBarChart(membres) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartMois"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  // Tableau de 12 compteurs initialisés à zéro : un par mois, dans l'ordre
  // janvier → décembre. Le tri à plat (index 0 = janvier) est ce qui permet
  // ensuite d'aligner `MOIS_NOMS[i]` sous chaque barre.
  const counts = Array(12).fill(0);
  // Le double test borne la valeur : un mois absent (0) ou hors limites ne doit
  // pas créer un index -1, qui增高rait silencieusement la dernière case.
  membres.forEach((m) => {
    if (m.mois_anniversaire && m.mois_anniversaire >= 1 && m.mois_anniversaire <= 12) {
      counts[m.mois_anniversaire - 1]++;
    }
  });

  // Plancher à 1 pour éviter une division par zéro si personne n'a d'anniversaire.
  const max = Math.max(1, ...counts);
  const curMonth = new Date().getMonth();
  const padX = 30;
  const padY = 50;
  const barW = (W - 2 * padX) / 12;

  ctx.clearRect(0, 0, W, H);

  // `roundRectTop` est une fonction utilitaire (définie ailleurs) qui trace une
  // barre au sommet arrondi. La largeur de barre est réduite (`* 0.7`) avec un
  // décalage latéral (`* 0.15`) pour laisser un espacement visuel entre colonnes.
  counts.forEach((c, i) => {
    const h = (c / max) * (H - 2 * padY);
    const x = padX + i * barW + barW * 0.15;
    const y = H - padY - h;
    const w = barW * 0.7;

    ctx.fillStyle = i === curMonth ? (cssVar("--accent") || "#6366F1") : (cssVar("--surface-2") || "#E2E8F0");
    roundRectTop(ctx, x, y, w, h, 6);

    ctx.fillStyle = cssVar("--text-3") || "#64748B";
    ctx.font = "20px -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(MOIS_NOMS[i].slice(0, 3), x + w / 2, H - padY + 26);

    if (c > 0) {
      ctx.fillStyle = cssVar("--text") || "#0F172A";
      ctx.font = "bold 20px -apple-system, sans-serif";
      ctx.fillText(String(c), x + w / 2, y - 8);
    }
  });
}

/**
 * Trace le graphique en anneau de participation de la dernière collecte.
 * @param {any} jourDernier — objet avec `nbPayants` (payés) et `nbTotal` (total attendu).
 * @sideEffect Oui : dessine sur `<canvas id="chartDonut">` et met à jour la légende DOM.
 * @returns {void}
 * @why L'anneau rend immédiatement visible le ratio payé/non-payé sans nécessiter
 * de lecture de nombres petits ; le pourcentage au centre renforce l'impact.
 */
function drawDonutChart(jourDernier) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDonut"));
  const legend = document.getElementById("donutLegend");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  // Le contrôle `!nbTotal` couvre deux cas d'un coup : pas de dernier dimanche
  // du tout, et dernier dimanche sans aucun membre attendu. Dans les deux cas
  // le ratio serait indéfini, on affiche donc un message plutôt qu'un anneau vide.
  if (!jourDernier || !jourDernier.nbTotal) {
    emptyCanvasMsg(ctx, W, H, "Aucune donnee recente");
    if (legend) legend.innerHTML = "";
    return;
  }

  const payes = jourDernier.nbPayants;
  const nonPayes = jourDernier.nbTotal - payes;
  const total = jourDernier.nbTotal;
  const cx = W / 2;
  const cy = H / 2;
  const rOut = Math.min(cx, cy) - 20;
  const rIn = rOut * 0.65;

  ctx.clearRect(0, 0, W, H);

  // Le tracé d'un segment d'anneau consiste à dessiner deux arcs concentriques
  // (grand rayon puis petit rayon, sens horaire opposé) et à fermer le chemin.
  // On démarre à -PI/2, soit midi sur l'horloge, pour que la première tranche
  // commence en haut. `start` est ensuite avancé, il sert de curseur d'angle.
  let start = -Math.PI / 2;
  const slices = [
    { count: payes, color: cssVar("--success") || "#16A34A" },
    { count: nonPayes, color: cssVar("--danger") || "#DC2626" },
  ];

  slices.forEach((s) => {
    const angle = (s.count / total) * Math.PI * 2;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(cx, cy, rOut, start, start + angle);
    ctx.arc(cx, cy, rIn, start + angle, start, true);
    ctx.closePath();
    ctx.fill();
    start += angle;
  });

  const pct = Math.round((payes / total) * 100);
  ctx.fillStyle = cssVar("--text") || "#0F172A";
  ctx.font = "bold 44px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${pct}%`, cx, cy);

  if (legend) {
    // La légende est du HTML injecté : les valeurs `payes` et `nonPayes` sont
    // des nombres entiers issus d'un comptage, jamais une saisie utilisateur,
    // d'où l'absence d'échappement ici.
    legend.innerHTML = `
      <span><i style="background:${cssVar("--success") || "#16A34A"}"></i>Paye (${payes})</span>
      <span><i style="background:${cssVar("--danger") || "#DC2626"}"></i>Non paye (${nonPayes})</span>
    `;
  }
}

/**
 * Trace la répartition des dépenses par catégorie sous forme de barres horizontales.
 * @param {Record<string, number>} depensesCat — objet associant nom de catégorie à montant total.
 * @sideEffect Oui : dessine sur le `<canvas id="chartDepenses">`.
 * @returns {void}
 * @why Barres horizontales car les libellés de catégories sont longs : en vertical
 * ils seraient illisibles. Seules les catégories réellement dépensées sont
 * affichées, l'ordre vient de la constante métier `CATEGORIES_DEPENSE`.
 */
function drawDepensesCategorieChart(depensesCat) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDepenses"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  // `filter()` renvoie un nouveau tableau ne contenant que les éléments pour
  // lesquels la condition est vraie : on ne dessine pas de barre à zéro.
  // `reduce()` cumule : il additionne toutes les valeurs de l'objet en partant
  // de 0, ce qui donne le total général des dépenses.
  const categories = CATEGORIES_DEPENSE.filter((c) => (depensesCat[c] || 0) > 0);
  const total = Object.values(depensesCat).reduce((a, v) => a + v, 0);

  if (!categories.length || total === 0) {
    emptyCanvasMsg(ctx, W, H, "Aucune depense enregistree");
    return;
  }

  // Barre la plus longue sert de référence : toutes les largeurs sont relatives
  // au maximum, ce qui rend les catégories directement comparables entre elles.
  const max = Math.max(...categories.map((c) => depensesCat[c]));
  // Marge gauche de 140 px réservée aux libellés de catégories, alignés à droite.
  const padX = 140;
  const padY = 30;
  const barH = (H - 2 * padY) / categories.length;

  ctx.clearRect(0, 0, W, H);

  // `textAlign` détermine le point d'ancrage du texte. On l'alterne entre chaque
  // itération : la catégorie est alignée à droite (juste avant sa barre), le
  // montant à gauche (juste après), pour éviter tout recouvrement.
  categories.forEach((cat, i) => {
    const val = depensesCat[cat];
    // 100 px de marge droite réservée à l'affichage du montant formaté.
    const w = ((val / (max || 1)) * (W - padX - 100));
    const y = padY + i * barH + barH * 0.15;
    const h = barH * 0.7;

    ctx.fillStyle = cssVar("--text-2") || "#334155";
    ctx.font = "bold 20px -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(cat, padX - 16, y + h / 2 + 7);

    ctx.fillStyle = cssVar("--accent") || "#6366F1";
    roundRectTop(ctx, padX, y, w, h, 6);

    ctx.fillStyle = cssVar("--text-3") || "#64748B";
    ctx.font = "18px -apple-system, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmt(val), padX + w + 12, y + h / 2 + 6);
  });
}