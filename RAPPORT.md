# Rapport — Refonte "Listes personnalisees" -> "Activites" (M3D Gestion)

## 1. Analyse

L'ancien systeme stockait un montant unique par liste (`listes.montant_demande`)
et un simple booleen par membre (`liste_membres.paye`). Aucun historique, aucun
frais multiple, aucune date limite. Le reste de l'app (module cotisations)
suivait deja le bon modele a imiter : montant attendu / montant paye toujours
recalcules depuis un historique de paiements, jamais stockes en dur.

## 2. Fichiers modifies

- `js/db.js` — schema (v6, additif), migration retroactive, logique metier
- `js/app.js` — UI complete du module (creation, detail, frais, paiements,
  historique, dashboard, filtres/tri, cloture, export PDF)
- `css/style.css` — styles additifs (dashboard, badges de statut, cartes
  participant responsives), aucune classe existante modifiee

`index.html` n'a pas eu besoin d'etre touche (les ecrans sont construits
dynamiquement en JS, comme le reste de l'app).

## 3. Fonctionnalites ajoutees

- Frais multiples par activite (participation, piscine, transport...),
  chaque participant choisit lesquels le concernent
- Historique reel des paiements (jamais ecrase), avec date/heure/commentaire
- Statuts automatiques : non paye / partiel / paye / surpaye, calcules par
  une seule fonction centrale (`getStatutPaiementActivite`)
- Dashboard de l'activite (participants, payes/partiels/non payes, montants,
  taux de paiement)
- Recherche, filtres par statut, tri (nom / montant paye / reste / statut /
  presence) sur les participants
- Date limite + cloture manuelle (avec reouverture exceptionnelle possible),
  sans jamais supprimer de donnees
- Activites sans aucun frais (simple liste de participants) toujours prises
  en charge
- Export PDF mis a jour (frais, statuts, montants, dernier paiement)
- Duplication d'activite : copie la structure des frais, jamais les
  paiements deja recus

## 4. Structure des donnees

```
listes            : ... + date_limite, cloturee
liste_frais       : id, id_liste, libelle, montant, ordre
liste_membres     : ... + frais_choisis (tableau d'ids de liste_frais)
liste_paiements   : id, id_liste, id_membre, montant, date, heure, commentaire
```
Le montant attendu = somme des frais choisis par le membre.
Le montant paye = somme de son historique dans `liste_paiements`.
Rien n'est jamais stocke "en dur" : tout est recalcule a la demande.

## 5. Compatibilite avec l'existant

Migration additive `db.version(6).upgrade()` : chaque ancien
`montant_demande` devient un frais "Participation" ; chaque ancien
`paye: true` devient une ligne d'historique retroactive. Idempotente,
aucune table supprimee/renommee. L'argent des activites reste separe du
solde de la Caisse generale (confirme avec toi).

## 6. Tests reellement executes (pas seulement decrits)

Deux scripts (fournis a part, non livres avec l'app) :
- `test_activites.mjs` — logique metier pure (Dexie + fake-indexeddb) :
  25 assertions couvrant les cas 1 a 9 du cahier des charges + migration
- `test_ui.mjs` — DOM complet (jsdom), chargement reel de `index.html` +
  `db.js` + `app.js`, clics/saisies sur les vrais boutons/formulaires :
  creation d'activite, ajout de 3 frais, ajout d'un participant, choix de
  frais partiel, 2 paiements successifs, historique, dashboard, filtres,
  tri, cloture/reouverture, export PDF, duplication

**Resultat : tous les tests passent.**

## 7. Points restants (identifies, non implementes car hors perimetre demande)

- Pas de notion d'utilisateur/operateur multiple : "utilisateur ayant
  enregistre le paiement" (section 6) n'est pas trackee, l'app n'a qu'un
  seul admin.
- Recherche par telephone dans les participants non ajoutee (recherche par
  nom uniquement, comme le reste de l'app).
- L'export PDF ne detaille pas l'historique complet ligne par ligne (juste
  le dernier paiement) pour rester lisible sur une seule page ; l'historique
  complet reste consultable dans l'app.
