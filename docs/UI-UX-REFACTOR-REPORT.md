# Rapport de refonte UI/UX — M3D Gestion

Complète `docs/UI-UX-AUDIT.md` (Phase 1 / audit, conservé tel quel).
Ce document est mis à jour à la fin de chaque phase d'implémentation, avec
pour chacune : ce qui a changé, pourquoi, les fichiers touchés, et l'état
de vérification.

**Règle constante sur toutes les phases** : aucune ligne de `js/db.js`
n'est modifiée pour la refonte elle-même (le fichier garde ses migrations,
son modèle de données et ses calculs exactement tels que fournis) ; toute
modification JS reste validée par `acorn` en `ecmaVersion: 2019` avant
livraison, conformément à la cible Safari 12 / iPad 2012.

---

## Phase A — Design tokens, typographie, couleurs, thème

### Ce qui a changé et pourquoi

1. **`css/variables.css` réécrit intégralement.**
   - Une seule famille de police (`--font-sans`, Inter) au lieu de deux
     polices jamais chargées (`DM Sans`/`DM Serif Display` — voir
     `UI-UX-AUDIT.md` section 0). `--font-display`/`--font-body` restent
     définis comme alias vers `--font-sans` pour ne rien casser tant que
     `components.css` n'a pas été migré (Phase C).
   - Échelle typographique complète Display/H1/H2/H3/Body/Body small/
     Caption (`--text-display` à `--text-caption`), recalée pour Inter
     (les tailles historiques avaient été réglées pour une display serif,
     visuellement plus légère qu'Inter Bold au même corps).
   - Nouvelle hiérarchie de surfaces **cohérente entre les deux thèmes** :
     `surface-muted` (zones recessed : chip inactif, entête de tableau,
     skeleton) `< bg < surface < surface-elevated` (modale, bottom-sheet).
     Avant cette phase, `--surface-2` changeait de sens selon le thème
     (plus sombre que `surface` en clair, plus clair que `surface` en
     sombre) — un même nom, deux rôles opposés.
   - Tokens sémantiques complets avec variante `-subtle` : `accent`,
     `success`, `warning`, `danger`, et un nouveau token `info` (le bleu
     existait déjà mais sans statut officiel dans le système).
   - Correction d'un bug existant : `.k-green::before` (`components.css`)
     consommait `var(--green)`, qui n'était défini nulle part — la couleur
     ne s'affichait donc jamais. `--green` est maintenant un alias de
     `--success`.
   - Tous les anciens noms de tokens encore consommés ailleurs
     (`--surface-2`, `--text-2`, `--text-3`, `--accent-dark`,
     `--accent-light`, `--blue`, `--bg-success`, `--bg-warning`,
     `--bg-danger`) sont conservés en alias explicites : **zéro
     changement visuel non intentionnel** sur `components.css`,
     `layout.css` ou `app.js`, qui n'ont pas encore été touchés.

2. **`css/base.css`**
   - `h1`–`h4` et `html/body` pointent maintenant sur `--font-sans`
     directement (plus besoin de l'alias `--font-display`/`--font-body`
     dans ce fichier fondation).
   - Ajout d'un état `:focus-visible` global (contour `--accent`, 2px) :
     corrige en une seule règle l'essentiel du problème « focus clavier
     quasi invisible » identifié dans l'audit (une seule règle `:focus`
     existait dans tout le CSS). `:focus-visible` ne se déclenche pas au
     clic souris/tactile — aucune régression visuelle pour ces usages.
   - Ajout de classes utilitaires typographiques (`.text-display`,
     `.text-h1`, `.text-h2`, `.text-h3`, `.text-body-sm`, `.text-caption`)
     et d'une classe `.num` (`font-variant-numeric: tabular-nums`) pour
     les chiffres financiers — prêtes à être consommées dès la Phase C, à
     la place des tailles en dur repérées dans `app.js`.
   - Ajout d'un bloc `@media (prefers-reduced-motion: reduce)` : neutralise
     les animations existantes (`fade`, `shimmer`, transitions) pour les
     utilisateurs qui l'ont demandé au niveau système. 0 occurrence
     existait avant cette phase.

3. **`css/responsive.css` — thème d'impression corrigé.**
   Le bloc `@media print` forçait encore l'ancienne identité Indigo
   (`--accent: #6366F1`, gris froid `#F1F5F9`/`#CBD5E1`) sur tout document
   exporté ou imprimé, indépendamment du thème réellement affiché à
   l'écran. Réaligné sur la palette terracotta actuelle, avec les anciens
   ET nouveaux noms de tokens fixés explicitement (nécessaire ici car ce
   bloc doit imposer ses valeurs même si le thème sombre est actif).

4. **Métadonnées système resynchronisées** (`index.html`,
   `manifest.webmanifest`) : le `theme-color`/`theme_color` pointait
   encore vers l'ancien Indigo `#6366F1` (barre système Android, splash
   screen) alors que l'accent réel est `#C4714A` depuis un précédent
   changement de palette resté partiel. `background_color` du manifest
   aligné sur `--bg` clair (`#F5F4F1`, au lieu de `#F8FAFC`, une teinte
   froide qui ne correspond à aucun token actuel).

5. **`js/state.js` — synchronisation dynamique du `theme-color`.**
   Seule modification JS de cette phase, minimale et additive : la
   fonction `applyTheme()` (déjà responsable de poser `data-theme` sur
   `<html>` et de persister le choix) met maintenant aussi à jour le
   `content` de la balise `<meta id="meta-theme-color">` pour qu'elle
   reflète le thème **réellement appliqué** (choix manuel de
   l'utilisateur ou préférence système), et non une valeur figée. Sans
   ceci, la barre système restait sur sa couleur par défaut même après
   une bascule manuelle vers le thème sombre.

6. **`sw.js`** : version de cache incrémentée (`v19` → `v20`) pour que
   les fichiers modifiés soient effectivement servis aux utilisateurs déjà
   installés en PWA. Liste `ASSETS` inchangée (aucun fichier ajouté ou
   supprimé dans cette phase).

### Ce qui n'a délibérément pas été touché dans cette phase

- `css/components.css`, `css/layout.css` : contiennent encore des
  couleurs en dur (`.k-navy`, `.k-amber`, `.k-teal`) et les 4 variantes de
  carte redondantes identifiées dans l'audit — traité en Phase C
  (composants), pas ici, pour ne pas mélanger « changer les tokens » et
  « migrer les composants » dans le même lot de risque.
- Les 182 styles inline de `js/app.js` — traités progressivement à partir
  de la Phase C, une fois les classes utilitaires et composants
  disponibles pour les remplacer par un vrai système sémantique (pas un
  renommage 1:1).
- `js/db.js` : aucune ligne touchée.

### Vérifications effectuées

- Tous les tokens CSS consommés dans le projet (`grep -ohr 'var(--...'`
  sur tous les fichiers `.css`/`.js`/`index.html`) recalculés après
  modification et confrontés un par un à `variables.css` : **aucun
  token orphelin**.
- Les 6 fichiers `.css` validés par un parseur CSS strict (`css-tree`) :
  aucune erreur de syntaxe.
- Les 6 fichiers `.js` validés par `acorn` en `ecmaVersion: 2019` : tous
  passent (y compris `js/state.js`, seul fichier JS modifié dans cette
  phase — pas d'optional chaining, pas de nullish coalescing, compatible
  Safari 12).
- Diff complet relu ligne à ligne contre le zip original fourni (pas
  contre l'historique Git, qui contient déjà des changements non liés à
  cette refonte) : seuls `css/variables.css`, `css/base.css`,
  `css/responsive.css`, `index.html`, `manifest.webmanifest`, `sw.js` et
  `js/state.js` diffèrent, et chaque différence correspond à un point
  listé ci-dessus — rien d'involontaire.

### Point de vigilance signalé pour la suite

Avant de démarrer cette phase, le dossier de travail contenait des
fichiers déjà modifiés que je n'avais pas écrits (anomalie d'environnement
constatée et signalée en conversation). Par précaution, tout le travail de
cette phase a été refait depuis une réextraction strictement propre du zip
original, avec vérification par comparaison directe (`diff`) avant de
commencer. Aucun contenu non vérifié n'a été conservé.

---

## Phase B — Navigation, layout, sidebar desktop

### Ce qui a changé et pourquoi

L'ancienne navigation (Accueil / Membres / Dimanche / Dettes / **Plus**)
avait un onglet « Plus » fourre-tout mélangeant Caisse, Prêts, Listes,
Calendrier, Paramètres, Sauvegarde, données de démo, export PDF, apparence
et une zone dangereuse — voir `UI-UX-AUDIT.md` section 5. Nouvelle
organisation, par domaine métier :

**Accueil · Membres · Cotisations · Finance · Activités**, plus un espace
**Système** volontairement séparé des 5 domaines (icône dédiée dans la
topbar, jamais un 6ᵉ onglet).

- **Cotisations** = l'ancien onglet « Dimanche », **seul le libellé change**
  (`data-tab="dimanche"` conservé tel quel en interne : fonctions
  `renderDimanche*`, logique métier, tout reste identique — aucun risque).
- **Finance** = nouveau hub regroupant Caisse (déplacée hors de Plus),
  Dettes (ancien onglet racine) et Prêts (déplacé hors de Plus). Chaque
  destination garde son contenu strictement inchangé ; seule la façon d'y
  accéder change. `renderDettes()` et `renderPretsMembres()` n'avaient
  jamais eu besoin de bouton retour tant qu'ils étaient des destinations
  racines ou des liens depuis Plus dans un sens fixe — un bouton « ←
  Retour » vers Finance a été ajouté à `renderDettes()` (elle n'en avait
  aucun) pour ne pas laisser d'impasse.
- **Activités** = nouveau hub regroupant Listes/Activités et Calendrier
  (tous deux déplacés hors de Plus, contenu inchangé).
- **Système** = tout ce qu'il restait de Plus une fois Finance et Activités
  extraits : Paramètres, Sauvegarde, Données de test, Export & impression,
  Apparence, À propos, Zone dangereuse. Reste accessible depuis n'importe
  quel écran via une icône dédiée dans la topbar (mobile et desktop), pas
  depuis la barre d'onglets — conformément à la demande de garder les
  fonctions système dans un espace séparé. Le bouton retour restaure
  l'onglet réellement actif avant l'ouverture (`systemeReturnTab`), pas une
  destination fixe.
- **Sidebar desktop** : elle existait déjà (transformation CSS pure de la
  tabbar à partir de 900px, dans `responsive.css`) — l'audit initial ne
  l'avait pas assez mise en valeur. Aucun nouveau CSS de structure n'a été
  nécessaire : les 5 nouveaux onglets en héritent automatiquement, avec le
  même nombre d'éléments (5) qu'avant.
- Deux ombres CSS figées sur l'ancien Indigo (`rgba(99, 102, 241, ...)`)
  trouvées en cours de route dans `layout.css` (glow du tab actif sur
  mobile, ombre du FAB) — corrigées vers l'équivalent terracotta.

### Fichiers modifiés

`index.html` (topbar + tabbar), `css/layout.css` (`.topbar-actions`,
correction des ombres), `js/app.js` (module Plus éclaté en `renderFinance`,
`renderCaisse`, `renderActivites`, `renderSysteme` + `openSysteme` ;
routeur `showTab()` mis à jour ; tous les boutons retour et liens internes
qui pointaient vers l'ancien Plus/Dettes redirigés vers leur nouvelle
destination), `sw.js` (cache `v20` → `v21`).

**`js/db.js` : aucune ligne modifiée.**

### Ce qui n'a délibérément pas été touché

- Le contenu visuel de Caisse, Dettes, Prêts, Listes, Calendrier, et de
  toutes les sections de Système : strictement copié-collé depuis l'ancien
  Plus. Leur redesign réel est prévu aux Phases G (Dettes/Caisse/Prêts),
  H (Activités/Calendrier) et I (Système), une fois les composants de la
  Phase C disponibles.
- Le hub Finance/Activités utilise le même patron « cartes-liens vers un
  écran plein » que l'ancien Plus (pas de sous-onglets en direct) — choix
  délibéré pour rester à risque minimal en Phase B ; la Phase G construira
  une vraie navigation interne unifiée avec le composant Tabs/
  SegmentedControl de la Phase C.
- La séparation visuelle entre bouton « Charger les données de test »
  (primaire) et « Effacer toutes les données » (destructeur, même carte,
  seule la couleur de texte les distingue) n'a pas été retravaillée ici —
  contenu simplement déplacé tel quel vers Système. Traitement visuel réel
  prévu en Phase I, conformément à la directive sur les actions
  dangereuses.

### Vérifications effectuées

- Recherche exhaustive de toute référence résiduelle à l'ancien onglet
  « plus » ou à `renderPlus` dans le code : deux appels oubliés retrouvés
  et corrigés (`openAddMouvement`, `openAjusterCaisse`, qui rafraîchissaient
  l'écran après une action — ils rafraîchissent maintenant `renderCaisse()`).
- Chaque `getElementById(...)` des fonctions touchées confronté
  automatiquement à la liste des `id="..."` réellement présents dans son
  propre template : aucun identifiant manquant.
- Les 6 fichiers `.js` revalidés avec `acorn` en `ecmaVersion: 2019`
  (Safari 12) après les changements : tous passent, y compris `js/app.js`
  (le plus modifié).
- Les 6 fichiers `.css` revalidés avec un parseur strict : aucune erreur.
- Comparaison directe avec le zip original : seuls `index.html`,
  `css/layout.css`, `js/app.js`, `sw.js` diffèrent en plus des fichiers de
  la Phase A ci-dessus ; `js/db.js` confirmé identique caractère pour
  caractère.
- Parcours de navigation revérifiés manuellement un par un (voir tableau) :

| Action | Avant | Après |
|---|---|---|
| Ouvrir Caisse | Plus → (scroll) | Finance → Caisse → retour Finance |
| Ouvrir Dettes | Onglet racine, aucun retour | Finance → Dettes → retour Finance (nouveau) |
| Ouvrir Prêts | Plus → Prêts → retour Plus | Finance → Prêts → retour Finance |
| Ouvrir Listes/Calendrier | Plus → ... → retour Plus | Activités → ... → retour Activités |
| Ouvrir Paramètres/Sauvegarde/Export | Onglet Plus | Icône Système → retour à l'onglet d'origine |
| Alerte "sauvegarde requise" sur Accueil | → Plus | → Système, retour → Accueil |

### Point de vigilance pour la suite

Les liens directs depuis le tableau de bord (KPI "Prêts en attente", KPI
"Listes") ouvrent toujours `renderPretsMembres()`/`renderListes()`
directement sans passer par le hub — comportement identique à avant (ils
ne passaient pas non plus par Plus). Leur bouton retour ramène maintenant
vers Finance/Activités au lieu de l'ancien Plus, ce qui est plus cohérent
qu'avant mais ne revient toujours pas exactement sur Accueil. Comportement
pré-existant, non aggravé par cette phase — à reconsidérer si la Phase D
(dashboard) change ces liens.

---

## Phase C — Composants réutilisables

### Principe suivi

Avant d'ajouter quoi que ce soit, chaque élément de la liste demandée a été
confronté à l'existant (voir `UI-UX-AUDIT.md` section 7) : plusieurs
composants existaient déjà et fonctionnaient bien, ils ont seulement été
**documentés** comme tels plutôt que dupliqués :

- **Chip / FilterButton** : `.btn-chip` + `.active` faisait déjà ce travail
  (filtres Prêts, bascule Mois/Agenda du Calendrier) — non recréé.
- **Badge** vs **Tag** : deux pilules déjà distinctes (coin légèrement
  arrondi et statut pour Badge, pilule complète et non-interactive pour
  Tag) — non fusionnées, juste commentées pour clarifier quand utiliser
  laquelle.
- **SectionHeader** : `.section-title` remplissait déjà ce rôle.
- **Détail clé/valeur** : `.detail-row`/`.k`/`.v` existait déjà — réutilisé
  tel quel à l'intérieur du nouveau composant FinancialSummary plutôt que
  redéfini.

Ce qui manquait réellement a été ajouté dans `css/components.css` :
**PageHeader, StatCard, FinancialSummary, Alert, ProgressBar, DataTable,
Segmented**, plus une extension optionnelle d'EmptyState (icône/titre/
action, rétrocompatible avec `emptyHTML()` texte seul).

### Consolidation du composant Card

L'audit avait repéré 4 variantes de carte non reliées entre elles
(`.card`, `.list-card`, `.liste-card`, `.week-card`). Après inspection
réelle du HTML généré :
- `.list-card` et `.liste-card` étaient déjà utilisées **combinées** à
  `.card` dans le HTML (`class="card list-card"`) — ce sont maintenant des
  alias documentés d'un même modificateur `.card--list`, valeurs
  strictement inchangées.
- `.week-card` était utilisée **seule** (jamais avec `.card`) : gardée
  autonome mais son `border-radius: 14px` en dur a été retokenisé en
  `var(--radius-lg)` (même valeur, 14px — aucun changement visuel, juste
  plus de cohérence avec le design system).
- Un modificateur `.card--interactive` a été ajouté pour le retour tactile
  au clic (`:active { transform: scale(0.99) }`), déjà présent sur
  `.week-card` et désormais disponible pour toute carte cliquable future.

**Aucun `id`/classe déplacé ni renommé dans le HTML généré** : cette
consolidation s'est faite uniquement côté CSS, donc à risque nul pour
l'existant.

### Nouveaux composants (résumé)

| Composant | Rôle prévu |
|---|---|
| `.page-header` | Titre de page (Phases D à I, au fur et à mesure de la refonte de chaque écran) |
| `.stat-card` | Indicateur mis en avant (niveau 1/2 du tableau de bord, Phase D) — distinct de `.kpi` (tuile dense niveau 3, conservée) |
| `.financial-summary` | Solde/synthèse (Phase G : Finance/Caisse ; réutilisable sur Accueil et Dettes) |
| `.alert` (+ 4 variantes) | Bannière persistante — **déjà utilisé en Phase C** : la bannière de sauvegarde sur Accueil est migrée de styles inline vers `.alert.alert--warning.alert--clickable` (premier exemple concret de suppression de styles inline, section suivante) |
| `.progress-bar` | Progression de paiement (Phase H : Activités) |
| `.data-table` / `.data-table-wrap` | Premier tableau pensé pour l'écran (les `<table>` existants ne servaient qu'à l'impression PDF) — pour Membres desktop (Phase E) |
| `.segmented` | Bascule entre vues exclusives sur piste neutre (Phase G/H, sous-navigation Finance/Activités), distincte visuellement du Chip de filtre (fond accent) |

### Migration concrète (pas seulement de la préparation)

La bannière "sauvegarde requise" de l'Accueil (`js/app.js`, `renderAccueil`)
a été convertie de son ancien habillage 100% inline
(`style="background:var(--bg-warning);border-color:transparent;..."` sur
une `.card` détournée) vers `<div class="alert alert--warning
alert--clickable">`. Même `id="backupWarnBox"`, même comportement de clic
(ouvre Système) — seul l'habillage change, et retire 4 déclarations
`style="..."` du fichier.

### Fichiers modifiés

`css/components.css` (consolidation Card + 7 nouveaux composants),
`js/app.js` (migration de la bannière de sauvegarde vers Alert), `sw.js`
(cache `v21` → `v22`). **`js/db.js` : toujours aucune ligne modifiée.**

### Ce qui n'a délibérément pas été fait

- Pas de composant Drawer : aucun écran n'en a encore un besoin concret
  identifié. Sera ajouté seulement quand une phase de contenu (probablement
  Membres desktop, Phase E) en aura réellement l'usage — cohérent avec la
  consigne de ne pas créer de composant juste pour cocher une case.
- Pas de migration en masse des 182 styles inline de `app.js` vers les
  nouveaux composants : une seule migration concrète a été faite (la
  bannière ci-dessus) pour valider le composant Alert en conditions
  réelles. Le reste sera migré écran par écran, au fil des Phases D à J,
  quand chaque écran est de toute façon réécrit — migrer maintenant un
  style qui sera de nouveau réécrit en Phase D/E/etc. aurait été double
  travail pour rien.
- Déplacement de `.skeleton-block` de `base.css` vers `components.css`
  (repéré dans l'audit comme rangement incohérent) : reporté à la Phase J
  ("nettoyage"), comme prévu dans le tableau de synthèse de l'audit —
  aucun impact fonctionnel à le laisser en l'état d'ici là.

### Vérifications effectuées

- Les 6 fichiers `.css` revalidés avec un parseur strict, les 6 fichiers
  `.js` revalidés avec `acorn` en `ecmaVersion: 2019` : tout passe.
- Recherche de sélecteurs CSS dupliqués par erreur de copier-coller dans
  `components.css` : une correspondance trouvée (`.liste-card`), vérifiée
  manuellement — il s'agit de deux règles légitimes et complémentaires
  (padding d'un côté, marge/curseur de l'autre), pas d'un doublon.
- `getElementById(...)` de `renderAccueil` reconfronté à son template
  après la migration de la bannière : aucun identifiant manquant.
- Comparaison avec le zip original : en plus des fichiers des Phases A/B,
  seul `css/components.css` gagne du contenu nouveau ; `js/db.js` toujours
  identique caractère pour caractère.

---

## Phase D — Dashboard

### Ce qui a changé et pourquoi

L'ancien Accueil empilait une grille de 11 KPI de poids visuel identique
(Membres, Cotisants, Dimanches, Solde, Recettes mois, Depenses mois,
Dettes, Listes, Irréguliers, Prêts attente, À relancer), sans hiérarchie —
voir `UI-UX-AUDIT.md` section 6. Nouvelle organisation en 5 niveaux,
chacun avec le traitement visuel qui correspond à son importance réelle :

1. **Aujourd'hui** — ce qui demande une action, et seulement ça. Construit
   dynamiquement : une ligne par sujet réellement en attente (membres
   irréguliers, à relancer, prêts en attente), et **rien de superflu** si
   tout est à jour (un seul message rassurant plutôt que 3 lignes à zéro).
   L'alerte de sauvegarde (déjà un composant Alert depuis la Phase C) reste
   au-dessus, dans la même logique.
2. **Situation financière** — remplace 4 tuiles KPI (Solde, Recettes mois,
   Depenses mois, Dettes) par **un seul composant FinancialSummary** :
   solde en gros au centre, le reste en lignes de détail. Toute la carte
   est cliquable et renvoie vers l'onglet Finance (Phase B).
3. **Activité** — la liste "Prochaines activités" ne change pas de
   contenu ; le compteur "Listes" (ancienne tuile KPI) devient un lien
   discret à côté du titre de section plutôt qu'une tuile à part.
4. **Membres** — Membres et Cotisants passent en StatCard (deux chiffres
   qui méritent d'être vus, mais qui ne demandent aucune action), suivis
   des deux listes d'anniversaires, inchangées.
5. **Statistiques** — les 4 graphiques Canvas et le récapitulatif des
   dernières collectes, explicitement regroupés sous un même intitulé
   "Statistiques" en toute fin de page : la donnée la moins actionnable
   passe en dernier, comme demandé.

Le compteur "Dimanches" (ancienne tuile KPI) n'a pas disparu : il est
maintenant affiché en petite légende à côté du titre "Récapitulatif des
dernières collectes", au plus près de la donnée qu'il décrit plutôt que
comme une tuile isolée sans contexte.

### Fichiers modifiés

`js/app.js` (`renderAccueil` restructurée), `css/components.css`
(`.stat-card-grid`, `.financial-summary--clickable` — 2 petits ajouts liés
à cette mise en page). `sw.js` (cache `v22` → `v23`).
**`js/db.js` : toujours aucune ligne modifiée.**

### Ce qui n'a délibérément pas changé

- **Aucune requête ni calcul modifié.** Toutes les valeurs affichées
  viennent exactement des mêmes fonctions `db.js` qu'avant
  (`caisseSolde()`, `totalDettesImpayees()`, `fluxCaisseMoisCourant()`,
  `membresIrreguliers()`, `membresARelancer()`, `pretsMembres()`,
  `prochainesActivites()`, etc.) — seule la présentation change.
- Les 4 graphiques Canvas gardent exactement les mêmes fonctions de
  dessin (`drawCaisseChart`, `drawMonthBarChart`, `drawDonutChart`,
  `drawDepensesCategorieChart`), les mêmes ids de `<canvas>`, aucune
  modification.
- La bannière de bienvenue "0 membre" et le chargement des données de
  démo depuis l'Accueil restent identiques.
- Les classes `.kpi`/`.kpi-grid`/`.k-navy`/`.k-blue`/etc. ne sont plus
  utilisées nulle part dans le projet après cette phase (elles ne
  servaient qu'à l'ancien Accueil) mais **n'ont pas été supprimées** de
  `components.css` : les retirer n'apporte aucun bénéfice de risque et
  elles pourraient resservir pour une grille dense ailleurs. Décision à
  reconsidérer en Phase J si elles restent inutilisées.
- Je n'ai pas ajouté de métrique "nouveaux membres" pourtant suggérée en
  exemple dans le brief : aucune donnée existante ne permet de la calculer
  aujourd'hui, et en créer une aurait nécessité une nouvelle requête sur
  `db.js` — hors du périmètre "UI uniquement" fixé pour cette refonte.

### Vérifications effectuées

- `getElementById(...)` de `renderAccueil` reconfronté à son template
  après la réécriture complète : aucun identifiant manquant (liste
  complète relue : `aujourdhuiBox`, `financeSummaryBox`, `kpiListes`,
  `backupWarnBox`, `moisBox`, `prochainesActsBox`, `prochainsBox`,
  `accueilLoadDemoBtn`, 4 canvas de graphique, tous présents).
- Les 6 fichiers `.css` et les 6 fichiers `.js` (`acorn` `ecmaVersion:
  2019`) revalidés après la modification : tout passe.
- Comparaison avec le zip original : en plus des fichiers des Phases A/B/C,
  aucun fichier supplémentaire touché ; `js/db.js` toujours identique
  caractère pour caractère.

---

## Phase E — Membres

### Constat de départ (plus positif que prévu par l'audit)

En reprenant `renderMembres()`/`renderMemberList()` en détail avant d'y
toucher, la recherche, les filtres (fonction, mois d'anniversaire, statut)
et le tri (alphabétique, date d'ajout, fonction) **existaient déjà et
fonctionnaient correctement**, via `openMemberFiltersSheet()`. Le vrai
manque, conforme à l'audit, était : aucune disposition tableau pour
desktop (seule une liste mobile existait, simplement étirée en grand
écran).

### Ce qui a changé

- **Tableau desktop** : nouveau `data-table-wrap`/`data-table` (composant
  Phase C, jusque-là non consommé nulle part) affiché à partir de 900px,
  colonnes Nom / Fonction / Anniversaire / Statut. La liste mobile
  existante reste strictement inchangée en dessous de 900px. Les deux
  s'alimentent des **mêmes données déjà filtrées/triées** dans
  `renderMemberList()` — aucune requête dupliquée, aucun risque de
  désynchronisation entre les deux vues.
- Deux nouvelles classes utilitaires **`.mobile-only`/`.desktop-only`**
  ajoutées à `responsive.css`, sur le même palier (900px) que la sidebar
  existante — réutilisables pour les prochaines phases qui auront besoin
  de la même bascule (Activités, Finance).
- **Fiche membre** (`openMemberDetail`) : les lignes de détail existantes
  sont désormais regroupées sous deux repères "Informations" et
  "Finances" (`.text-caption`, composant typographique de la Phase A) —
  mêmes données, mêmes lignes, juste une lecture plus rapide de ce qui
  est administratif vs financier.

### Fichiers modifiés

`js/app.js` (`renderMembres`, `renderMemberList`, `openMemberDetail`),
`css/responsive.css` (`.mobile-only`/`.desktop-only`). `sw.js` (cache
`v23` → `v24`). **`js/db.js` : toujours aucune ligne modifiée.**

### Ce qui n'a délibérément pas changé

- Aucune nouvelle colonne de tri/filtre : le tableau desktop expose les
  mêmes critères que la liste mobile, pas plus. Un tri par en-tête de
  colonne cliquable serait une amélioration naturelle mais non demandée
  explicitement ici — à envisager en Phase J si souhaité ; le tri/filtre
  reste accessible via le bouton "Filtrer & trier" existant.
- La logique de passage Actif/Inactif, l'export PDF individuel et
  l'historique des cotisations restent identiques, boutons et
  comportements inchangés.

### Vérifications effectuées

- `getElementById`/`querySelector` de `renderMembres`, `renderMemberList`
  et `openMemberDetail` confrontés à leurs templates : aucun identifiant
  manquant (les deux références à `memberList`/`memberTable` signalées
  par le script de vérification sont normales — posées par la fonction
  appelante `renderMembres`, lues par `renderMemberList`, comme c'était
  déjà le cas avant cette phase pour `memberList`).
- CSS et JS (acorn ES2019) revalidés : tout passe.
- `js/db.js` confirmé identique caractère pour caractère.

---

## Phases suivantes (à venir)

Phase F (Dimanche/Cotisations) démarre immédiatement à la suite de ce
rapport, dans la continuité de la même session de travail.
