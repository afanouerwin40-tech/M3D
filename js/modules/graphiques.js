/**
 * @file graphiques.js - Graphiques Canvas 2D de l'accueil (sans dépendance externe).
 * @description Tracé du solde de caisse, des anniversaires par mois, de la
 * participation au dernier dimanche et des dépenses par catégorie.
 * Redessin réactif sur rotation ou redimensionnement de l'écran.
 */

/** @type {number|null} Minuteur anti-rebond pour le redimensionnement d'écran */
let resizeTimer = null;

// Mémoire cache locale pour le redimensionnement instantané des graphiques
let lastJoursStats = [];
let lastMembres = [];
let lastDepensesCat = {};

// ============================================================================
// GRAPHIQUES CANVAS 2D (Sans dépendance externe)
// ============================================================================

/**
 * Redessine les graphiques de l'accueil en conservant les données mémoïsées.
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
 */
function onViewportChange() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(redrawAccueilCharts, 150);
}

window.addEventListener("resize", onViewportChange);
window.addEventListener("orientationchange", onViewportChange);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewportChange);
}

/**
 * Trace le graphique d'évolution linéaire de la caisse.
 * @param {any[]} joursStats
 */
function drawCaisseChart(joursStats) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartCaisse"));
  if (!canvas) return;

  const ordered = [...joursStats].reverse();
  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  if (ordered.length < 2) {
    emptyCanvasMsg(ctx, W, H, "Collectes insuffisantes");
    return;
  }

  let cumul = 0;
  const values = ordered.map((j) => (cumul += j.solde));
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const padX = 50;
  const padY = 40;

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

  // Remplissage dégradé sous la courbe
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
 * @param {any[]} membres
 */
function drawMonthBarChart(membres) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartMois"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  const counts = Array(12).fill(0);
  membres.forEach((m) => {
    if (m.mois_anniversaire && m.mois_anniversaire >= 1 && m.mois_anniversaire <= 12) {
      counts[m.mois_anniversaire - 1]++;
    }
  });

  const max = Math.max(1, ...counts);
  const curMonth = new Date().getMonth();
  const padX = 30;
  const padY = 50;
  const barW = (W - 2 * padX) / 12;

  ctx.clearRect(0, 0, W, H);

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
 * @param {any} jourDernier
 */
function drawDonutChart(jourDernier) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDonut"));
  const legend = document.getElementById("donutLegend");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

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
    legend.innerHTML = `
      <span><i style="background:${cssVar("--success") || "#16A34A"}"></i>Paye (${payes})</span>
      <span><i style="background:${cssVar("--danger") || "#DC2626"}"></i>Non paye (${nonPayes})</span>
    `;
  }
}

/**
 * Trace la répartition des dépenses par catégorie sous forme de barres horizontales.
 * @param {Record<string, number>} depensesCat
 */
function drawDepensesCategorieChart(depensesCat) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("chartDepenses"));
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = (canvas.width = canvas.clientWidth * 2);
  const H = (canvas.height = 320);

  const categories = CATEGORIES_DEPENSE.filter((c) => (depensesCat[c] || 0) > 0);
  const total = Object.values(depensesCat).reduce((a, v) => a + v, 0);

  if (!categories.length || total === 0) {
    emptyCanvasMsg(ctx, W, H, "Aucune depense enregistree");
    return;
  }

  const max = Math.max(...categories.map((c) => depensesCat[c]));
  const padX = 140;
  const padY = 30;
  const barH = (H - 2 * padY) / categories.length;

  ctx.clearRect(0, 0, W, H);

  categories.forEach((cat, i) => {
    const val = depensesCat[cat];
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