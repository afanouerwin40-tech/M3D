/**
 * @file rapports.js - Les cinq rapports PDF personnalisables.
 * @description Un rapport = un fonction. Elle collecte ses donnees, appelle
 * pdfTableau/pdfResume pour la mise en forme, puis delegue l'assemblage et
 * l'impression au socle. Aucune de ces fonctions ne reconstruit de feuille
 * de style ni de formatteur monetaire.
 *
 * Chaque fonction lit l'organisation et la session depuis les parametres :
 * les documents ne sont donc plus figes sur « Jeunesse M3D ».
 */

/**
 * Identite affichee en tete de tous les rapports.
 * Le nom de l'organisation est configurable (Systeme > Parametres) ; la
 * session provient de la session pastorale active.
 *
 * On passe par getOrCreateSessionActive() plutot que par une lecture directe
 * du parametre « session_active » : apres un import de sauvegarde, ce
 * parametre peut pointer vers une session disparue, et un simple getParam
 * renverrait alors un en-tete sans session alors que l'application, elle,
 * affiche bien « Session 2026 ».
 *
 * @returns {Promise<{organisation: string, session: string|null}>}
 */
async function pdfIdentite() {
  const [organisation, sessionId] = await Promise.all([
    getParam("organisation_nom", "Jeunesse M3D"),
    getOrCreateSessionActive(),
  ]);
  const s = sessionId ? await db.sessions.get(sessionId) : null;
  return {
    organisation: organisation || "Jeunesse M3D",
    session: s && s.nom ? s.nom : null,
  };
}

// ---------------------------------------------------------------------------
// 1. FICHE MEMBRE
// ---------------------------------------------------------------------------

/**
 * Fiche financiere et organisationnelle complete d'un membre.
 * @param {string} idMembre
 */
async function rapportMembrePDF(idMembre) {
  const [identite, r] = await Promise.all([pdfIdentite(), rapportIndividuelMembre(idMembre)]);
  const nom = fullName(r.membre);

  const collecte = r.historique
    .slice()
    .reverse()
    .map((h) => `<tr>
      <td>${esc(fmtDate(h.date))}</td>
      <td>${h.a_paye ? "Paye" : "Non paye"}</td>
      <td class="num">${esc(fmt(h.montant_attendu))}</td>
      <td>${esc(h.beneficiaires.length ? h.beneficiaires.join(", ") : "—")}</td>
    </tr>`);

  const dettes = r.detteGroupeDetail.map(
    (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
  );

  const pretsADevoir = r.pretsADevoirEnAttente.map(
    (p) => `<tr><td>${esc(p.autreMembre)}</td><td class="num">${esc(fmt(p.montant))}</td><td>${esc(fmtDate(p.date))}</td></tr>`,
  );

  const pretsARecevoir = r.pretsARecevoirEnAttente.map(
    (p) => `<tr><td>${esc(p.autreMembre)}</td><td class="num">${esc(fmt(p.montant))}</td><td>${esc(fmtDate(p.date))}</td></tr>`,
  );

  const corps = `
    <h1>Fiche individuelle</h1>
    <div class="meta">${esc(nom)} &middot; ${esc(r.membre.fonction || "Membre")} &middot; Genere le ${esc(fmtDate(r.genereLe))}</div>

    <h2>Resume financier</h2>
    ${pdfResume([
      ["Total collecte attendu (toutes semaines)", esc(fmt(r.totalCollecteAttendu))],
      ["Total effectivement paye", esc(fmt(r.totalCollectePaye))],
      ["Dette envers le groupe", esc(fmt(r.detteGroupeTotal))],
      ["Prets a rembourser a d'autres membres", esc(fmt(r.pretsADevoirTotal))],
      ["Prets a recevoir d'autres membres", esc(fmt(r.pretsARecevoirTotal))],
    ])}

    <h2>Collecte — detail (${r.historique.length} dimanches)</h2>
    ${pdfTableau(["Date", "Statut", "Montant", "Beneficiaire(s)"], collecte, {
      numEnDroite: [2],
      messageVide: "Aucune collecte enregistree pour ce membre",
    })}

    <h2>Dette envers le groupe</h2>
    ${pdfTableau(["Date", "Montant"], dettes, { numEnDroite: [1], messageVide: "Aucune dette" })}
    ${pdfLigneTotal("Total dette", esc(fmt(r.detteGroupeTotal)))}

    <h2>Prets a rembourser (${r.pretsADevoirEnAttente.length})</h2>
    ${pdfTableau(["Preteur", "Montant", "Date"], pretsADevoir, {
      numEnDroite: [1],
      messageVide: "Aucun pret en attente",
    })}
    ${pdfLigneTotal("Total a rembourser", esc(fmt(r.pretsADevoirTotal)))}

    <h2>Prets a recevoir (${r.pretsARecevoirEnAttente.length})</h2>
    ${pdfTableau(["Debiteur", "Montant", "Date"], pretsARecevoir, {
      numEnDroite: [1],
      messageVide: "Aucun pret a recevoir",
    })}
    ${pdfLigneTotal("Total a recevoir", esc(fmt(r.pretsARecevoirTotal)))}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Fiche — ${nom}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 2. RAPPORT ACTIVITE
// ---------------------------------------------------------------------------

/**
 * Fiche de participation et de financement d'une activite.
 * @param {string} idListe
 */
async function rapportActivitePDF(idListe) {
  const l = await db.listes.get(idListe);
  if (!l) {
    toast("Activite introuvable", "error");
    return;
  }
  const [identite, membres, frais, dons] = await Promise.all([
    pdfIdentite(),
    membresDeListe(idListe),
    listeFraisAll(idListe),
    donsList({ idActivite: idListe }),
  ]);
  const infos = await Promise.all(membres.map((m) => infosParticipantActivite(idListe, m.id)));

  const identiteHTML = [];
  if (l.date) identiteHTML.push("Date : " + fmtDate(l.date));
  if (l.heure) identiteHTML.push("Heure : " + l.heure);
  if (l.lieu) identiteHTML.push("Lieu : " + l.lieu);
  if (l.id_responsable) {
    const resp = await db.membres.get(l.id_responsable);
    if (resp) identiteHTML.push("Responsable : " + fullName(resp));
  }

  const participants = membres.map((m, i) => {
    const inf = infos[i];
    return `<tr>
      <td>${esc(m.nom || "")}</td><td>${esc(m.prenom || "")}</td>
      <td>${esc(m.telephone || "—")}</td>
      <td class="num">${esc(fmt(inf.attendu))}</td>
      <td class="num">${esc(fmt(inf.paye))}</td>
      <td class="num">${esc(fmt(inf.reste))}</td>
      <td>${esc(STATUT_PAIEMENT_LABEL[inf.statut] || inf.statut)}</td>
    </tr>`;
  });

  const fraisLignes = frais
    .slice()
    .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
    .map(
      (f) => `<tr><td>${esc(f.libelle)}</td><td class="num">${esc(fmt(f.montant))}</td></tr>`,
    );
  const totalFrais = frais.reduce((a, f) => a + (f.montant || 0), 0);

  const synth = syntheseDons(dons);
  const donsLignes = dons
    .map(
      (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.donateur || "?")}</td>
        <td>${esc(d.commentaire || "—")}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
    );

  const totalAttendu = infos.reduce((a, i) => a + (i.attendu || 0), 0);
  const totalPaye = infos.reduce((a, i) => a + (i.paye || 0), 0);

  const corps = `
    <h1>Activite — ${esc(l.nom)}</h1>
    <div class="meta">${esc(identiteHTML.join(" · "))} &middot; ${membres.length} participant(s)</div>
    ${l.description ? `<p>${esc(l.description)}</p>` : ""}

    <h2>Frais (${frais.length})</h2>
    ${pdfTableau(["Libelle", "Montant"], fraisLignes, {
      numEnDroite: [1],
      messageVide: "Aucun frais defini",
    })}
    ${pdfLigneTotal("Total des frais", esc(fmt(totalFrais)))}

    <h2>Participation (${membres.length})</h2>
    ${pdfTableau(["Nom", "Prenom", "Telephone", "Attendu", "Paye", "Reste", "Statut"], participants, {
      numEnDroite: [3, 4, 5],
      messageVide: "Aucun participant inscrit",
    })}
    ${pdfLigneTotal("Total encaisse / attendu", esc(fmt(totalPaye)) + " / " + esc(fmt(totalAttendu)))}

    <h2>Dons recus (${dons.length})</h2>
    ${pdfTableau(["Date", "Donateur", "Commentaire", "Montant"], donsLignes, {
      numEnDroite: [3],
      messageVide: "Aucun don enregistre pour cette activite",
    })}
    ${pdfLigneTotal("Total des dons", esc(fmt(synth.total)))}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Activite — ${l.nom}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 3. RAPPORT COTISATION
// ---------------------------------------------------------------------------

/**
 * Feuille de collecte d'un dimanche : qui a paye, qui n'a pas paye.
 * @param {string} idDimanche
 */
async function rapportCotisationPDF(idDimanche) {
  const jours = await joursAvecStats();
  const j = jours.find((x) => x.dimanche.id === idDimanche);
  if (!j) {
    toast("Dimanche introuvable", "error");
    return;
  }
  const [identite, membres] = await Promise.all([pdfIdentite(), db.membres.toArray()]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));

  const lignes = j.paiements.map((p) => {
    const m = memById[p.id_membre];
    return `<tr>
      <td>${esc(m ? m.nom : "?")}</td><td>${esc(m ? m.prenom : "?")}</td>
      <td>${esc(m ? m.telephone || "—" : "—")}</td>
      <td class="num">${esc(fmt(p.montant_paye))}</td>
      <td>${p.a_paye ? esc(fmtDate(j.dimanche.date)) : "—"}</td>
      <td>${p.a_paye ? "Paye" : "Non paye"}</td>
    </tr>`;
  });

  const nonPayants = j.paiements
    .filter((p) => !p.a_paye)
    .map((p) => memById[p.id_membre])
    .filter(Boolean)
    .map((m) => fullName(m));

  const corps = `
    <h1>Feuille de collecte</h1>
    <div class="meta">Dimanche du ${esc(fmtDate(j.dimanche.date))} &middot; ${
      esc(j.beneficiaires.join(", ") || "Collecte normale")
    }</div>
    ${pdfTableau(["Nom", "Prenom", "Telephone", "Montant paye", "Date", "Statut"], lignes, {
      numEnDroite: [3],
      messageVide: "Aucun participant pour ce dimanche",
    })}

    <h2>Recapitulatif</h2>
    ${pdfResume([
      ["Participants total", esc(j.nbTotal)],
      ["Ont cotise", esc(j.nbPayants)],
      ["N'ont pas cotise", esc(j.nbTotal - j.nbPayants)],
      ["Montant attendu / personne", esc(fmt(j.montantAttendu))],
      ["Total encaisse", esc(fmt(j.totalCollecte))],
    ])}

    <h2>Membres n'ayant pas paye (${nonPayants.length})</h2>
    ${pdfListe(nonPayants, "Tous les membres ont cotise")}
  `;

  pdfOuvrirEtImprimer(identite.organisation, `Cotisation du ${fmtDate(j.dimanche.date)}`, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 4. RAPPORT DONS
// ---------------------------------------------------------------------------

/**
 * Listing des dons, avec synthese et ventilation par activite.
 * @param {object} [o]
 * @param {string} [o.idActivite] - Restreint a une activite ; "" = dons generaux.
 * @param {string} [o.du] / @param {string} [o.au] - Bornes de periode (ISO).
 * @param {string} [o.titre] - Titre force, sinon deduit.
 */
async function rapportDonsPDF(o = {}) {
  const [identite, tous] = await Promise.all([pdfIdentite(), donsList()]);

  let lignes = tous;
  if (o.idActivite !== undefined) {
    lignes = lignes.filter((d) => (d.id_activite || "") === o.idActivite);
  }
  if (o.du) lignes = lignes.filter((d) => (d.date || "") >= o.du);
  if (o.au) lignes = lignes.filter((d) => (d.date || "") <= o.au);

  const synth = syntheseDons(lignes);

  const detail = lignes
    .map(
      (d) => `<tr>
        <td>${esc(fmtDate(d.date))}</td>
        <td>${esc(d.donateur || "?")}</td>
        <td>${esc(d.activite || "Don general")}</td>
        <td>${esc(d.commentaire || "—")}</td>
        <td class="num">${esc(fmt(d.montant))}</td>
      </tr>`,
    );

  // Ventilation par activite : c'est la question qu'on pose le plus
  // souvent sur un écran « Dons ».
  const parActivite = {};
  for (const d of lignes) {
    const cle = d.activite || "Don general";
    parActivite[cle] = (parActivite[cle] || 0) + (d.montant || 0);
  }
  const ventilation = Object.entries(parActivite)
    .sort((a, b) => b[1] - a[1])
    .map(([nom, total]) => `<tr><td>${esc(nom)}</td><td class="num">${esc(fmt(total))}</td></tr>`);

  let titre = o.titre || "Rapport des dons";
  if (o.idActivite === "" && !o.titre) titre = "Rapport des dons generals";

  const corps = `
    <h1>${esc(titre)}</h1>
    <div class="meta">Genere le ${esc(fmtDate(todayISO()))} &middot; ${
      lignes.length
    } don(s) &middot; ${synth.nbDonateurs} donateur(s)</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Montant total recu", esc(fmt(synth.total))],
      ["Nombre de dons", esc(synth.nbDons)],
      ["Donateurs distincts", esc(synth.nbDonateurs)],
      ["Don moyen par donateur", esc(fmt(synth.moyenne))],
    ])}
    ${pdfLigneTotal("Total recu", esc(fmt(synth.total)))}

    <h2>Ventilation par activite</h2>
    ${pdfTableau(["Activite", "Montant"], ventilation, {
      numEnDroite: [1],
      messageVide: "Aucun don a ventiler",
    })}

    <h2>Detail des dons</h2>
    ${pdfTableau(["Date", "Donateur", "Activite", "Commentaire", "Montant"], detail, {
      numEnDroite: [4],
      messageVide: "Aucun don enregistre sur cette periode",
    })}
  `;

  pdfOuvrirEtImprimer(identite.organisation, titre, corps, identite.session);
}

// ---------------------------------------------------------------------------
// 5. RAPPORT FINANCIER
// ---------------------------------------------------------------------------

/**
 * Rapport financier consolide : collecte, caisse, dettes, prets, dons.
 * C'est le document de synthesse destine a l'assemblee.
 */
async function rapportFinancierPDF() {
  const [identite, r, dettes, prets, dons, membres] = await Promise.all([
    pdfIdentite(),
    rapportStats(),
    dettesList(),
    pretsMembres({ nonRembourseSeulement: true }),
    donsList(),
    db.membres.toArray(),
  ]);
  const memById = Object.fromEntries(membres.map((m) => [m.id, m]));
  const nomOf = (id) => (memById[id] ? fullName(memById[id]) : "?");

  const dettesImpayees = dettes.filter((d) => d.statut === "Impayee");
  const pretsEnAttente = prets;
  const synthDons = syntheseDons(dons);

  const totalDettes = dettesImpayees.reduce((a, d) => a + d.montant, 0);
  const totalPrets = pretsEnAttente.reduce((a, p) => a + (p.montant || 0), 0);

  const pretsLignes = pretsEnAttente.map(
    (p) => `<tr>
      <td>${esc(nomOf(p.id_debiteur))}</td>
      <td>${esc(nomOf(p.id_preteur))}</td>
      <td class="num">${esc(fmt(p.montant))}</td>
      <td>${esc(fmtDate(p.date))}</td>
    </tr>`,
  );

  // Mouvements de caisse : le detail le plus long, il merite sa propre page.
  const mouvements = (await db.caisse_mouvements.toArray())
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(
      (m) => `<tr>
        <td>${esc(fmtDate(m.date))}</td>
        <td>${m.type === "Entree" ? "Entree" : "Sortie"}</td>
        <td>${esc(m.libelle || "—")}</td>
        <td>${esc(m.categorie || "—")}</td>
        <td class="num">${esc(fmt(m.montant))}</td>
      </tr>`,
    );

  // Dettes : on affiche aussi qui a rembourse, pour que le document imprime
  // reste aussi informatif que l'ecran.
  const dettesLignes = dettes
    .filter((d) => d.statut === "Remboursee")
    .map(
      (d) => `<tr>
        <td>${esc(fmtDate(d.date))}</td>
        <td>${esc(d.membre)}</td>
        <td>${d.remb_date ? esc(fmtDate(d.remb_date)) : "—"}</td>
        <td>${esc(d.remb_par || "—")}</td>
        <td class="num">${esc(fmt(d.remb_montant != null ? d.remb_montant : d.montant))}</td>
      </tr>`,
    );

  const corps = `
    <h1>Rapport financier</h1>
    <div class="meta">Genere le ${esc(fmtDate(r.genereLe))}</div>

    <h2>Synthese</h2>
    ${pdfResume([
      ["Total collecte", esc(fmt(r.totalCollecte))],
      ["Total des dons recus", esc(fmt(synthDons.total))],
      ["Solde en caisse", esc(fmt(r.solde))],
      ["Dettes impayees", esc(fmt(totalDettes))],
      ["Prets entre membres en attente", esc(fmt(totalPrets))],
      ["Taux de participation moyen", esc(Math.round(r.tauxParticipationGlobal * 100) + "%")],
    ])}

    <h2>Dettes impayees (${dettesImpayees.length})</h2>
    ${pdfTableau(
      ["Date", "Membre", "Telephone", "Montant"],
      dettesImpayees.map(
        (d) => `<tr><td>${esc(fmtDate(d.date))}</td><td>${esc(d.membre)}</td>
          <td>${esc(d.telephone || "—")}</td><td class="num">${esc(fmt(d.montant))}</td></tr>`,
      ),
      { numEnDroite: [3], messageVide: "Aucune dette en cours" },
    )}
    ${pdfLigneTotal("Total des dettes", esc(fmt(totalDettes)))}

    <h2>Dettes soldees (${dettes.length - dettesImpayees.length})</h2>
    ${pdfTableau(["Date", "Membre", "Rembourse le", "Rembourse par", "Montant"], dettesLignes, {
      numEnDroite: [4],
      messageVide: "Aucun remboursement enregistre",
    })}

    <h2>Prets entre membres en attente (${pretsEnAttente.length})</h2>
    ${pdfTableau(["Debiteur", "Preteur", "Montant", "Date"], pretsLignes, {
      numEnDroite: [2],
      messageVide: "Aucun pret en attente",
    })}
    ${pdfLigneTotal("Total des prets", esc(fmt(totalPrets)))}

    <h2>Mouvements de caisse (${mouvements.length})</h2>
    ${pdfTableau(["Date", "Type", "Libelle", "Categorie", "Montant"], mouvements, {
      numEnDroite: [4],
      messageVide: "Aucun mouvement de caisse",
    })}
  `;

  pdfOuvrirEtImprimer(identite.organisation, "Rapport financier", corps, identite.session);
}
