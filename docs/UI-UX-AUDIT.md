# Audit UI/UX — M3D Gestion

Document produit en **Phase 1** de la refonte UI/UX (voir prompt de refonte).
Toutes les observations ci-dessous sont vérifiées directement dans le code
livré (`M3D__2_.zip`), avec référence de fichier/ligne quand c'est pertinent.
Rien n'est supposé : chaque constat a été confirmé par lecture ou recherche
dans le dépôt (y compris l'historique Git : 32 commits, très majoritairement
des corrections ponctuelles — cohérent avec une base fonctionnelle mature
mais jamais reprise du point de vue design d'ensemble).

Légende de gravité : **P0** bloquant · **P1** important · **P2** amélioration · **P3** détail

---

## 0. Constat central : un rebranding inachevé

C'est la cause racine de la majorité des incohérences visuelles du projet,
et elle est vérifiable précisément :

- `docs/CHANGELOG.md` (entrée `[16.0.0]`) et `docs/ARCHITECTURE.md` décrivent
  explicitement l'identité **« police Inter, palette Indigo »**.
- `css/variables.css` (état actuel) définit une identité **totalement
  différente** : palette terracotta/ardoise (`--clay`, `--slate`, `--teal`,
  `--accent: #C4714A`) et typographie **DM Sans + DM Serif Display**.
- Mais `index.html` (ligne 19) ne charge toujours que la police **Inter**
  depuis Google Fonts — ni DM Sans, ni DM Serif Display ne sont chargées.
- Résultat concret : `--font-display` et `--font-body` pointent vers des
  polices absentes du navigateur. Les titres (`h1`–`h4`, `base.css` L22-24)
  retombent sur `Georgia, serif` et le corps de texte sur la pile système
  (`-apple-system, Segoe UI`). **Inter, la seule police réellement chargée,
  n'est utilisée nulle part.**
- L'en-tête de commentaire de `css/style.css` affirme lui-même *« Typographie
  Inter »* — en contradiction directe avec `variables.css`, importé juste
  après dans le même fichier.
- La bascule de palette n'a pas été répercutée dans les métadonnées système :
  `index.html` (`<meta name="theme-color" content="#6366F1">`) et
  `manifest.webmanifest` (`theme_color: #6366F1`, `background_color:
  #F8FAFC`) affichent toujours l'ancien Indigo, alors que l'accent réel de
  l'app est `#C4714A` (terracotta).

**Conclusion :** le design a été repensé une fois (nouvelle palette,
nouvelle typographie) mais seul `variables.css` a suivi. Tout le reste —
chargement de police, métadonnées PWA, documentation — est resté sur
l'ancienne identité. C'est exactement l'incohérence typographique décrite
en section 3 du brief, avec sa cause exacte identifiée.

**Recommandation (Phase 2)** : trancher une fois pour toutes. Vu le
contexte (app de gestion financière, lisibilité des chiffres prioritaire,
police déjà chargée et donc gratuite en performance), la recommandation est
de **conserver Inter comme unique famille** (poids 400/500/600/700 déjà
chargés couvrent tous les besoins de hiérarchie) plutôt que d'ajouter deux
polices supplémentaires. `--font-display`/`--font-body` seront alignés sur
Inter, et les métadonnées système (meta theme-color, manifest, doc) seront
resynchronisées sur le terracotta actuel.

---

## 1. Typographie — P0

Voir section 0. À cela s'ajoute : l'échelle typographique existe déjà
(`--text-h1` à `--text-caption` dans `variables.css`) mais son usage réel
dans `components.css`/`base.css` n'est pas systématique — plusieurs tailles
sont encore données en dur dans `js/app.js` via des styles inline (ex.
`font-size:28px` L2521, `font-size:14.5px` répété à plusieurs endroits du
dashboard). Ces valeurs devront rejoindre l'échelle officielle plutôt que
d'être redéfinies au cas par cas.

---

## 2. Design tokens couleur — P0

`variables.css` a déjà une base solide (bg / surface / surface-2 / border /
text / text-2 / text-3 / accent / accent-dark / accent-light / success /
warning / danger / purple, en light **et** dark). Ce qui manque par rapport
au système cible du brief (section 4) :

- Pas de palier **« surface elevated »** distinct de `surface` (les cartes
  s'appuient uniquement sur `box-shadow`, pas sur un ton de fond dédié) —
  utile pour les modales/sheets qui se superposent à une carte.
- Pas de **« surface muted »** nommée (le rôle est partiellement tenu par
  `surface-2`, mais sans convention claire de quand l'utiliser).
- Pas de token **« info »** (le bleu `--blue` existe mais sert à la fois de
  lien et d'info ponctuelle sans statut officiel dans le système).
- `--clay`, `--clay-dk`, `--slate`, `--teal`, `--violet` (palette de marque
  brute, L9-13) sont définies mais quasiment jamais consommées directement
  — l'essentiel des composants utilise les tokens sémantiques dérivés
  (`--accent`, etc.). À trancher : soit ces variables de marque brutes
  disparaissent (si elles ne servent qu'à documenter l'origine de
  `--accent`), soit elles gagnent un vrai rôle.
- **Couleurs codées en dur dans `js/app.js`** en dehors du système de
  tokens : au moins 13 valeurs hexadécimales distinctes trouvées par
  recherche (`#6366F1`, `#E5E7EB`, `#DC2626`, `#64748B`, `#0F172A`,
  `#F3F4F6`, `#E2E8F0`, `#D1D5DB`, `#6B7280`, `#334155`, `#111827`, etc.),
  essentiellement dans le rendu des graphiques Canvas (courbes, donut) et
  quelques styles inline. Ce sont pour la plupart des couleurs de l'**ancien**
  système Indigo — un changement de thème ne les affecte pas.

---

## 3. Styles inline dans `js/app.js` — P0 (priorité pour la maintenabilité)

**182 occurrences** de `style="..."` générées depuis `js/app.js` (176 via
template `style="${...}"`, le reste en dur), contre seulement 3 dans
`js/ui.js` et 0 dans `js/db.js`/`js/state.js`/`js/utils.js`/`index.html`.
`js/app.js` concentre donc la quasi-totalité de la dette de style inline —
cohérent avec le fait que c'est le fichier qui construit tous les écrans
(3464 lignes, aucune vue extraite dans un module séparé — voir section 8).

Exemple représentatif (`renderPlus`, L2519-2528) : une carte de solde de
caisse entièrement stylée en inline (couleur, padding, taille de police,
bordures conditionnelles) alors qu'un composant `FinancialSummary`
réutilisable couvrirait ce besoin sur au moins 4 écrans (Accueil, Plus/Caisse,
Dettes, Activités).

---

## 4. Accessibilité — P1

- **Focus clavier quasiment invisible** : une seule règle `:focus` existe
  dans l'ensemble des CSS (`css/components.css` L142-145, sur `.search`
  uniquement). Aucun état focus défini pour `.btn`, `.tab`, `.icon-btn`,
  `.card` cliquable, `.kpi.clickable`, les lignes de liste cliquables, etc.
  Combiné à `-webkit-tap-highlight-color: transparent` (`base.css` L7), la
  navigation clavier est aujourd'hui pratiquement impossible à suivre
  visuellement sur la majorité des éléments interactifs.
- Pas de `prefers-reduced-motion` nulle part dans le projet (0 occurrence),
  alors que des animations existent déjà (`fade`, `shimmer`, transitions de
  cartes/boutons/modales).
- **Points positifs à conserver** : `aria-label`/`aria-hidden` déjà posés
  sur la tabbar et une bonne partie des icônes SVG de `app.js` (26+14
  occurrences) ; la tabbar utilise déjà `role="tab"`/`aria-selected` ; les
  toasts ont `role="status"`/`role="alert"` selon le type ; `ui.js` gère
  déjà une pile de modales avec piégeage du focus et fermeture au clavier
  (`Échap`) — une vraie base d'accessibilité existe, elle doit être
  complétée (focus visible, labels de formulaire) plutôt que reconstruite.

---

## 5. Navigation principale et module « Plus » — P1

La tabbar actuelle (Accueil / Membres / Dimanche / Dettes / Plus) est
correcte pour les 4 premiers domaines, mais **« Plus » est aujourd'hui une
page unique qui empile 10 sections sans rapport hiérarchique clair**
(`renderPlus`, `js/app.js` L2484-2695) :

1. Listes & Activités (lien)
2. Calendrier (lien)
3. Prêts entre membres (lien)
4. Caisse — solde, détail des mouvements, dépenses par catégorie, dettes
   impayées, 2 boutons d'action, liste des mouvements manuels
5. Paramètres (cotisation/cadeau par défaut)
6. Sauvegarde (export/import JSON)
7. Données de test & démonstration
8. Export & impression (4 boutons PDF)
9. Apparence (thème clair/sombre)
10. À propos
11. Zone dangereuse (2 actions destructrices)

Problème concret le plus grave : le bouton **« Effacer toutes les données »**
(L2568) et le bouton **« Charger les données de test »** (L2567) sont tous
deux dans la même carte, avec la **même classe visuelle** (`.btn-primary`/
`.btn-ghost`), distingués uniquement par une couleur de texte rouge en
style inline. Un geste rapide sur mobile suffit à se tromper de bouton dans
une zone qui contient une action irréversible. Section 26 du brief demande
explicitement une séparation visuelle nette entre données réelles et
données de démo/dangereuses — ce n'est pas le cas aujourd'hui.

La Caisse en particulier — une fonctionnalité financière centrale — est
« enterrée » à mi-page dans Plus plutôt que d'avoir sa propre place de
premier niveau, alors qu'elle a autant d'importance que Dettes.

---

## 6. Accueil / Dashboard — P1

`renderAccueil` (`js/app.js` L122-241) affiche, dans l'ordre : une barre de
recherche globale, une alerte de sauvegarde optionnelle, une bannière de
bienvenue optionnelle, **une grille de 11 KPI de poids visuel identique**
(Membres, Cotisants, Dimanches, Solde, Recettes mois, Dépenses mois, Dettes,
Listes, Irréguliers, Prêts en attente, À relancer), puis 3 blocs de liste
(prochaines activités, anniversaires du mois, prochains anniversaires), puis
une grille de 4 graphiques Canvas, puis un récapitulatif des dernières
collectes.

C'est très exactement « l'accumulation de KPI » que la section 8 du brief
demande d'éviter : les informations qui réclament une action immédiate
(Irréguliers, À relancer, Prêts en attente, alerte de sauvegarde) ont
aujourd'hui la même taille de carte et la même position dans la grille que
des métriques purement informatives (Dimanches, Cotisants). Rien ne guide
l'œil vers ce qui compte en premier.

---

## 7. Composants répétés / incohérents — P2

Au moins **4 variantes de « carte »** coexistent sans règle documentée :
`.card`, `.card.list-card`, `.liste-card`, `.week-card` (voir inventaire de
classes dans `components.css`). C'est exactement le symptôme « composants
répétés mais légèrement différents » cité en section 2 du brief.

Sur l'inventaire de composants demandé en section 15, l'état actuel est :

| Composant demandé | État actuel |
|---|---|
| Button / IconButton | ✅ `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-chip`, `.icon-btn` |
| Badge / Chip | ✅ `.badge` (+ variantes statut) / ⚠️ `.tag` fait office de chip, nommage à unifier |
| Card / StatCard | ⚠️ 4 variantes non unifiées (voir ci-dessus) ; pas de StatCard dédiée (le KPI en tient lieu partiellement) |
| Avatar | ✅ `.avatar` |
| SearchInput | ✅ `.search` / `.search-wrap` |
| FilterButton | ❌ absent |
| EmptyState | ⚠️ `.empty` existe mais générique, pas de variante par écran |
| Alert | ⚠️ confondu avec Toast, pas de composant bannière persistante distinct |
| ProgressBar | ❌ absent (le taux de paiement des activités n'a aujourd'hui aucune représentation visuelle progressive) |
| DataTable | ❌ absent à l'écran — les `<table>` existants (`js/app.js` L3035+) ne servent qu'aux exports PDF/impression, pas à l'affichage interactif |
| Modal / BottomSheet / Drawer | ✅ Sheet géré par `ui.js` (pile, focus, Échap) / ❌ pas de vrai Drawer distinct |
| FormField / Tabs / SegmentedControl | ✅ `.field` / ✅ tabbar mais pas de composant Tabs générique réutilisable / ❌ SegmentedControl absent |
| Toast | ✅ `.toast`/`.toast-error` |
| Skeleton | ✅ existe mais rangé dans `base.css` au lieu de `components.css` — incohérence de rangement, pas de bug |
| PageHeader / SectionHeader | ⚠️ `.section-title` couvre SectionHeader ; pas de PageHeader dédié (titre de page géré au cas par cas) |
| FinancialSummary | ❌ absent en tant que composant — le résumé caisse est reconstruit en inline à chaque écran qui en a besoin |

---

## 8. Architecture `app.js` — P2

`js/app.js` fait **3464 lignes** et concentre l'intégralité du rendu de
tous les écrans (14 fonctions `render*` identifiées, de `renderAccueil` à
`renderPlus`), alors que `config.js`, `utils.js`, `db.js`, `state.js`,
`ui.js` sont déjà proprement séparés par responsabilité, avec JSDoc
systématique et un ordre de chargement strict documenté dans `index.html`
(L61-67). La base de séparation en couches (config / utils / accès données
/ état / UI transverse / rendu) existe déjà et est saine — il manque
seulement la dernière étape : extraire les fonctions `render*` par domaine
dans `js/views/*.js`, sans toucher à la logique métier qu'elles appellent
(déjà bien isolée dans `db.js`). C'est un chantier de découpage, pas de
réécriture.

---

## 9. Responsive — P2

Un seul point de rupture structurel réel existe : `900px`
(`responsive.css` L11, plus deux ajustements ponctuels de composants à
`640px` et `520px` dans `layout.css`/`components.css`). Tout ce qui est
en dessous de 900px — un téléphone à 320px comme une tablette portrait à
890px — reçoit exactement la même disposition mobile. Le brief demande une
vérification explicite de 320px à 1440px+ (section 18) : ce n'est pas
qu'une disposition binaire mobile/desktop soit fausse en soi, mais elle n'a
manifestement pas été validée sur toute la plage, en particulier pour les
écrans les plus denses en données (Membres, Activités).

---

## 10. PWA / Service Worker — Point positif, à ne pas casser

`sw.js` (cache `m3d-cache-v19`, stratégie cache-first + mise à jour en
tâche de fond) référence bien l'intégralité des fichiers CSS/JS modulaires
actuels — aucune incohérence détectée entre les fichiers réellement présents
et la liste `ASSETS`. Le `manifest.webmanifest` est cohérent côté structure
(icônes, `start_url`, `scope`, `display: standalone`) ; seule sa couleur
(`theme_color`/`background_color`, voir section 0) doit être resynchronisée
avec la palette actuelle. **Aucune régression PWA à corriger en Phase 1** —
uniquement une mise à jour de couleur et, plus tard, l'ajout des éventuels
nouveaux fichiers issus du découpage de `app.js` (section 8) à la liste
`ASSETS`, avec incrément de version du cache.

---

## Synthèse et priorités pour la suite

| # | Sujet | Gravité | Phase concernée |
|---|---|---|---|
| 0 | Rebranding inachevé (police, theme-color, manifest, doc) | P0 | Phase 2 |
| 1 | Typographie : tailles en dur hors échelle | P0 | Phase 2 |
| 2 | Design tokens couleur incomplets / couleurs en dur en JS | P0 | Phase 2 |
| 3 | 182 styles inline dans app.js | P0 | Phase 4 (composants) puis Phase 5 (écrans) |
| 4 | Focus clavier quasi absent / pas de reduced-motion | P1 | Phase 2 + Phase 4 |
| 5 | "Plus" = page fourre-tout, dangers mal séparés | P1 | Phase 3 (navigation) + Phase 5 |
| 6 | Dashboard = accumulation de KPI sans hiérarchie | P1 | Phase 5 |
| 7 | Composants "carte" redondants, inventaire incomplet | P2 | Phase 4 |
| 8 | app.js monolithique (3464 lignes, tout dans un seul fichier) | P2 | Après Phase 5, en fin de refonte |
| 9 | Responsive validé uniquement en binaire mobile/desktop | P2 | Phase 5, écran par écran |
| — | PWA / Service Worker | Sain | Vérifier seulement après chaque phase |

Rien dans cet audit ne remet en cause la logique métier existante (Dexie,
migrations, calculs financiers recalculés depuis les données, sécurité XSS,
verrouillage de session) : tout est à **préserver strictement**, conformément
aux sections 27-28 du brief. Le travail restant est un chantier
design/frontend, pas un chantier de logique applicative.
