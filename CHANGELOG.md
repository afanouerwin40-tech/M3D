# Changelog - M3D Gestion

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

## [v1.9.0] - 2026-09-29
Refonte des exports PDF, module Dons, suivi du remboursement des dettes,
fiabilisation de l'ouverture de la base. Schéma v8 → v9, service worker
v38 → v39. Détail complet dans [REFACTORING_REPORT.md](REFACTORING_REPORT.md).

### Ajouté
- **Module Dons** (`js/modules/dons.js`) : enregistrement de dons de montant
  libre, rattachés à un membre, avec activité facultative, date et note.
  Écran global avec recherche, filtre par activité, bornes de dates et tri ;
  récapitulatif par activité. Export PDF.
- **Table `dons`** (schéma v9, migration additive, aucune donnée existante
  touchée) et ses fonctions de lecture `donsList()` / `syntheseDons()`.
- **Suivi des remboursements** : le remboursement enregistre qui a payé
  (`id_membre_rembourseur`) ainsi qu'un nom figé (`nom_rembourseur`).
  L'écran Dettes affiche désormais montant, date et personne ayant remboursé.
- **5 rapports PDF** (`js/services/pdf/`) : membre, activité, cotisation,
  dons, financier. En-tête professionnel, pied de page, alignement des
  colonnes chiffrées, terrain des lignes et totaux mis en évidence.
- **Nom de l'organisation paramétrable** (Système → Paramètres), imprimé en
  en-tête de tous les exports. Valeur par défaut : « Jeunesse M3D ».
- **111 assertions de test** dans `tools/` (`test-dettes.js`,
  `test-donnees-test.js`, `test-logique.js`, `test-pdf.js`) et
  `verify-globals.js` qui contrôle que les 118 identifiants globaux attendus
  existent. Aucune dépendance npm : le projet reste sans build.

### Modifié
- **Sécurité — XSS dans la fenêtre d'impression** : le titre du document et
  la fonction d'un membre étaient injectés sans échappement. Un nom
  contenant `</title><script>` s'exécutait dans la fenêtre d'impression.
  Les trois chemins sont fermés via `esc()`.
- **Sécurité — ouverture de base explicite** (`ouvrirBase()` dans
  `js/db.js`) : l'application attend désormais l'ouverture de la base et
  vérifie sa version avant toute lecture. Un délai de 10 s évite qu'une base
  bloquée par un autre onglet n'entraîne un écran vide sans message.
- **Exports PDF** : palette indigo `#6366F1` remplacée par le terracotta de
  l'application ; « Jeunesse M3D » n'est plus écrit en dur dans les corps de
  document ; les cas « aucune donnée » affichent un message au lieu d'un
  cadre vide.
- `js/app.js` : 3 657 → 1 092 lignes (orchestration seule).
- `js/modules/exports.js` : ne contient plus de mise en forme, délègue au
  socle PDF. Les sept points d'entrée existants sont conservés.
- `js/modules/systeme.js` : champ « Nom de l'organisation ».
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md` : réécrits. La
  version précédente décrivait un schéma v6, un service worker v17, et cinq
  tables supprimées depuis longtemps (`cotisations`, `depenses`, `presences`,
  `evenements`, `config`).

### Supprimé
- `writePrintableDocument()` : remplacé par `pdfOuvrirEtImprimer()`, qui
  échappe le titre. Plus aucun appel dans le dépôt.
- `safeColor()` : plus aucun appel dans le code depuis que les activités ne
  portent plus de couleur personnalisée (`listes.couleur` et `listes.icone`
  avait déjà été retirés du schéma). La documentation technique le mentionnait
  encore comme protection active : cette version la rectifie.
   Le rapport financier produit des couleurs en dur via `PDF_COULEURS`, pas
  via des valeurs saisies par l'utilisateur — `esc()` reste la seule
  protection XSS à maintenir.

### Non réalisé (décision explicite)
- **Anonymisation après N mois** : non implémentée, à votre demande. Il n'y
  a donc ni durée configurable, ni purge, ni journal de purge. Les noms
  complets restent visibles dans l'historique et dans les exports.
- **Suppression de la dette après remboursement** : non implémentée. La
  dette est soldée et quitte la liste active, mais reste dans l'historique —
  sinon le mouvement de caisse resterait sans dette correspondante et aucun
  écran ne signalerait l'écart.

### Signalé, non corrigé
- **`TABS` (`js/config.js`) est du code mort.** La constante décrit l'ancienne
  barre d'onglets (`accueil, membres, dimanche, dettes, plus`) alors que
  `index.html` en définit cinq autres (`finance`, `activites`), et que
  `showTab()` n'en connaît que cinq. Elle n'est référencée nulle part.
  La laisser en place entretient l'illusion qu'elle pilote la navigation, et
  `verify-globals.js` la vérifie — ce qui la rend indiscernable d'une constante
  vivante. À supprimer dans un changement dédié, pas en même temps qu'une
  modification de navigation : sinon deux causes possibles pour un onglet
  cassé, et on ne saura pas laquelle tester.

---

## [Non publié] - YYYY-MM-DD
### Ajouté
- Aucun

### Modifié
- Aucun

### Supprimé
- Aucun

## [v1.7.4] - 2026-09-22
### Modifié
- **js/modules/accueil.js** : Ajout du paramètre `memById` à `construireAuJourdhuiItems` et passage de ce paramètre à `openPretsEnAttenteSheet`
- **js/app.js** : 
  - Mise à jour de l'appel à `accueilModule.construireAuJourdhuiItems` pour lui passer `memById`
  - Modification de `openPretsEnAttenteSheet` pour accepter `memById` en paramètre et l'utiliser directement
  - Correction des noms de propriétés dans `openPretsEnAttenteSheet` (de `preteur_id`/`beneficiaire_id` vers `id_preteur`/`id_debiteur`)
- **index.html** : Ajout du script pour charger `js/modules/accueil.js`
### Corrections
- Fix de l'affichage "Inconnu → Inconnu" dans la section "pret en attente" du tableau de bord d'accueil