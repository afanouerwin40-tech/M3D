# AUDIT INITIAL M3D — Chantier Comptabilité

Produit en réponse au document *"M3D — Phase G : Refonte métier,
comptabilité associative, rapports, sécurité et préparation production"*
et à *"Règles comptables clarifiées — M3D"*.

**Aucun fichier applicatif n'a été modifié pour produire ce document.**
Chaque constat ci-dessous a été vérifié par lecture directe de `js/db.js`
(2248 lignes, lu intégralement) et par recherche croisée dans `js/app.js`,
`README.md` et `docs/`. Rien n'est supposé.

Note de nommage : ce document appelle le chantier ci-dessus **"Chantier
Comptabilité"** pour ne pas le confondre avec la "Phase G" de la refonte
UI/UX en cours (qui désignait Dettes/Caisse/Prêts et est déjà livrée).

---

## Architecture actuelle

- **Aucun build, aucune dépendance serveur.** HTML/CSS/JS chargés
  directement (`index.html`), Dexie.js pour IndexedDB, jsPDF/SheetJS pour
  les exports (à confirmer dans `index.html`, non ré-audité ici — hors
  périmètre financier).
- **`js/db.js`** : couche données + logique métier, 68 fonctions, aucune
  classe, pas de découpage en services nommés — mais déjà organisée en
  sections commentées cohérentes (Caisse, Prêts, Dettes, Activités,
  Sécurité...). Ce n'est pas un fourre-tout : c'est un module unique, mais
  discipliné.
- **`js/app.js`** (3600+ lignes après la refonte UI/UX en cours) : rendu
  des écrans et orchestration des événements. Ne contient **aucune règle
  financière** — il appelle toujours les fonctions de `db.js`
  (`marquerPaiement`, `ajouterPaiementListeMembre`, `ajusterCaisse`...),
  jamais de calcul financier ou d'écriture directe dans une table Dexie.
  La séparation UI ↔ logique métier demandée en section 5/6 du prompt
  **existe déjà** au niveau du fichier, même sans découpage en fichiers de
  service.

## Forces (vérifiées, pas supposées)

1. **Principe déjà en place : ne jamais stocker un total, toujours le
   recalculer depuis l'historique.** Documenté explicitement en tête de
   fichier (`js/db.js` lignes 2-4) : *"Paiements est la seule source de
   vérité pour l'argent lié aux collectes. Dettes et le volet collecte de
   la Caisse ne sont JAMAIS stockés."* Le même principe est répété et
   appliqué pour les activités (commentaire v6, ligne ~153 : *"liste_paiements
   est la seule source de vérité pour l'argent d'une activité, comme
   paiements l'est pour les cotisations"*). C'est exactement l'esprit du
   Grand Livre demandé en section 18-19 du prompt — la différence est que
   cette vérité est **répartie sur plusieurs tables cohérentes** plutôt que
   centralisée dans une seule table d'écritures.
2. **Le "tarif figé" (price snapshot) existe déjà pour les cotisations.**
   `nouveauDimanche()` (ligne 1646) calcule `montant_attendu` une seule
   fois à la création du dimanche et l'enregistre sur chaque paiement — un
   changement ultérieur du montant par défaut n'affecte jamais les
   dimanches déjà créés. La section 33/23 du prompt demande exactement
   ceci ; c'est fait pour les cotisations, pas encore vérifié pour les
   activités (à confirmer en Phase 1, `liste_frais`/`frais_choisis`
   semblent figés par membre au moment du choix, mais je n'ai pas retracé
   ce qui se passe si un frais est modifié après coup).
3. **La classification paiement (non_payé/partiel/payé/surpayé) existe
   déjà** pour les activités, centralisée dans une seule fonction
   (`getStatutPaiementActivite`, ligne 2027) explicitement commentée comme
   *"seul endroit où la règle est écrite"*. C'est précisément la
   discipline "validation centralisée" demandée en section 7.
4. **Les migrations Dexie (8 versions) sont toutes additives,
   idempotentes et documentées avec leur raison métier.** Aucune ne
   supprime de table ni de champ. La v5 corrige un vrai bug de production
   (index manquant causant un SchemaError) sans perdre de données ; la v6
   migre l'ancien modèle "listes" vers le nouveau avec une garde explicite
   contre la double-migration (`if (fraisExistants > 0) continue`). C'est
   exactement la discipline demandée en section 49.
5. **`reinitialiserCotisations()` utilise déjà une transaction Dexie
   atomique** (`db.transaction("rw", ...)`) avec une vérification de
   sécurité post-transaction (le nombre de membres ne doit pas avoir
   changé). Ce n'est pas un exemple isolé de bonne pratique : c'est du
   code déjà en production.
6. **Un journal d'audit existe déjà et est utilisé de façon cohérente** :
   la fonction `log(entite, action, detail)` est appelée à chaque
   opération financière ou sensible que j'ai inspectée (paiement, prêt,
   ajustement de caisse, clôture d'activité, paramètre modifié,
   réinitialisation, mot de passe admin). Ce n'est pas la structure riche
   demandée en section 17 (pas de `old_value`/`new_value`/`user_id`
   séparés), mais ce n'est pas un vide non plus.
7. **Compatibilité Safari 12 activement maintenue**, pas juste déclarée :
   polyfill `Object.fromEntries` avec commentaire précis sur la version
   Safari exacte concernée (12.0 vs 12.1), évitement documenté de `??`
   (nullish coalescing, absent avant Safari 13.1) à au moins 2 endroits
   trouvés en lisant le fichier.

## Faiblesses et écarts réels avec le prompt (vérifiés)

1. **Pas de table de Grand Livre unifiée.** La vérité financière est
   correcte mais répartie sur 5 tables (`paiements`, `liste_paiements`,
   `caisse_mouvements`, `remboursements`, `prets_membres`), chacune avec
   son propre vocabulaire de statut. Pas de type d'écriture normalisé
   (`MEMBERSHIP_PAYMENT`, `CONTRIBUTION`, etc. demandés section 20).
2. **Pas de FIFO d'allocation de dettes.** Ce n'est pas qu'il soit mal
   implémenté : le besoin ne se présente pas de la même façon
   qu'imaginé dans le prompt. Chaque dimanche crée une ligne `paiements`
   **individuelle et déjà indépendante** par membre (`nouveauDimanche`,
   ligne 1679) : une dette n'est jamais un montant agrégé à répartir,
   c'est déjà une ligne atomique par semaine. Un paiement bascule
   **une** ligne à la fois (`marquerPaiement`, binaire payé/non-payé). Il
   n'existe aujourd'hui aucun geste "je paie une grosse somme, répartis-la
   automatiquement sur mes semaines en retard" — voir section "Ambiguïtés"
   plus bas, point A.
3. **Le surpaiement n'est détecté que pour les activités, pas pour les
   cotisations — et même pour les activités, l'excédent n'est
   pas réaffectable.** `getStatutPaiementActivite` retourne bien
   `"surpaye"`, mais rien dans le code ne convertit cet excédent en
   crédit/avance mobilisable ailleurs (section 5 des règles comptables) :
   l'argent n'est pas perdu (il reste compté dans le total encaissé de
   l'activité), mais il reste "collé" à cette activité, pas transférable.
   Pour les **cotisations**, le surpaiement ne peut structurellement pas
   se produire aujourd'hui : `marquerPaiement` est un bouton bascule
   (payé/non payé), il n'y a **aucun champ de saisie de montant** dans ce
   flux — voir Ambiguïtés, point B.
4. **Pas de détection de montant anormal (×2/×5/×10).** Absent car il n'y
   a nulle part de saisie libre de montant pour les cotisations, et pour
   les activités (`ajouterPaiementListeMembre`) la seule validation
   actuelle est `montant > 0` (ligne 2062) — aucune comparaison au montant
   attendu.
5. **Pas de protection anti double-clic explicite** sur les boutons de
   paiement (aucun `disabled` pendant l'écriture Dexie repéré dans les
   gestionnaires de clic de `app.js` que j'ai inspectés pour les
   paiements). Risque réel mais mineur en pratique : Dexie traite les
   écritures séquentiellement et une double activation créerait au pire
   un doublon de mouvement, pas une incohérence silencieuse.
6. **Pas de statut `CANCELLED`/`ACTIVE` sur les paiements ou mouvements.**
   Une correction se fait aujourd'hui soit par re-bascule du booléon
   `a_paye` (perd la trace du "pourquoi"), soit par suppression complète
   via les fonctions de réinitialisation (`.clear()`, une vraie
   suppression physique, pas un archivage). Écart réel avec les sections
   15/18 du prompt et section 18 des règles comptables.
7. **Aucun rôle ni permission.** Un seul mot de passe administrateur
   partagé (`sha256Hex(sel + mdp)`, ligne 1700) protège les actions
   sensibles — pas de notion d'utilisateur, donc pas de
   Président/Trésorier/Secrétaire/Conseiller possible sans un changement
   d'architecture bien plus large qu'un ajout de champ. Voir Ambiguïtés,
   point C — **c'est la divergence la plus importante entre ce que le
   prompt demande et ce que l'architecture actuelle peut faire sans
   refonte profonde.**
8. **Pas de notion de "présence" distincte du paiement.** Le README le dit
   lui-même : *"Pointage des présences et des cotisations en un seul
   geste."* `a_paye` sert de proxy pour les deux. Si une distinction fine
   devient nécessaire (ex. présent mais pas encore payé), cela demande un
   nouveau champ, pas juste une lecture différente de l'existant.
9. **Aucun test automatisé** dans le dépôt (recherche `*test*` : aucun
   résultat en dehors de `.git`). Tout le point 57 du prompt est donc à
   construire de zéro — je le note sans le considérer comme une "faute" du
   projet existant : ce n'était simplement pas dans le périmètre jusqu'ici.

## Risques critiques à ne pas sous-estimer

- **Le principe actuel ("tout recalculer depuis l'historique brut") est
  ce qui protège aujourd'hui l'intégrité financière.** Toute migration
  vers un Grand Livre doit **dériver** ses écritures de cet historique
  existant, jamais l'inverse (ne jamais faire du Grand Livre la source
  saisie à la main pendant que les tables actuelles continuent d'exister
  en parallèle — cela créerait exactement la double comptabilité que la
  section 19 du prompt interdit explicitement).
- **`reinitialiserCotisations()` et `reinitialiserToutesDonnees()` sont
  des suppressions physiques (`.clear()`), pas des annulations.** Tant
  qu'un statut `CANCELLED` n'existe pas, introduire l'un sans l'autre
  créerait deux façons différentes et incohérentes de "supprimer" une
  donnée financière dans la même application.
- **Le module Cotisations et le module Activités ont deux logiques de
  paiement différentes** (bascule binaire vs. historique de montants
  libres). Un Grand Livre unique doit absorber les deux sans forcer l'un
  dans le moule de l'autre — sans quoi on casserait soit le geste rapide
  de pointage du dimanche (section 54 du prompt lui-même : "rechercher un
  membre, enregistrer un paiement... doivent être rapides"), soit la
  souplesse des paiements d'activité.

## Modèle de données (tables Dexie actuelles, v8)

`membres`, `sessions`, `dimanches`, `anniversaires_du_jour`, `paiements`
(cotisations, 1 ligne = 1 membre × 1 dimanche), `remboursements`,
`caisse_mouvements` (entrées/sorties, dépenses = sorties enrichies d'une
catégorie depuis v8), `parametres`, `activity_log`, `listes` (activités),
`liste_membres`, `liste_frais`, `liste_paiements` (historique paiements
d'activité), `prets_membres` (prêts personnels entre membres, distincts
des dettes du groupe).

## Flux financiers (vérifiés dans le code, pas déduits)

- **Cotisation** : `nouveauDimanche()` crée une ligne `paiements` par
  membre actif avec un `montant_attendu` figé → `marquerPaiement()`
  bascule payé/non payé (montant = attendu ou 0, jamais un montant libre).
- **Dette** : dérivée à la volée = tout `paiements` où `a_paye = false`
  (`dettesList()`). Aucune table "dettes" séparée.
- **Caisse** : dérivée à la volée = `Σ paiements.montant_paye − Σ
  anniversaires_du_jour.montant_cadeau + Σ caisse_mouvements(Entrée) − Σ
  caisse_mouvements(Sortie)` (`caisseDetail()`, ligne 989).
- **Activité** : `ajouterPaiementListeMembre()` ajoute une ligne
  `liste_paiements` (jamais de remplacement) → `calculerMontantPaye()`
  fait la somme → `getStatutPaiementActivite()` classifie.
- **Prêt entre membres** : `enregistrerPretMembre()` marque la cotisation
  payée côté groupe ET crée une ligne `prets_membres` distincte, suivie
  séparément (remboursement = booléen, pas un montant partiel possible
  actuellement).

## Architecture cible proposée (à valider avant tout code)

Convergence progressive, dans l'esprit de la section 74 du prompt :

1. **Ne pas créer un Grand Livre "à côté"** des tables actuelles. Créer
   une nouvelle table `ecritures` (ou nom à valider) alimentée
   **automatiquement** à chaque écriture existante (paiement, mouvement,
   remboursement, prêt) via un point d'entrée centralisé — sans dupliquer
   la logique de calcul déjà correcte.
2. **Introduire les services demandés progressivement**, en extrayant
   d'abord `ValidationService` (le plus sûr et le moins risqué : pas
   d'écriture Dexie, juste des fonctions pures) puis `AuditService`
   (enrichir `log()` existant plutôt que le remplacer).
3. **Ne toucher au module Cotisations qu'après avoir validé le point A
   des ambiguïtés ci-dessous** — c'est le module le plus utilisé et le
   plus sensible aux régressions (section 54 du prompt).

## Plan de migration recommandé (P0 → P2, sans coder avant validation)

- **P0 (sécurisation, risque le plus faible)** : centraliser
  `validateAmount()`, ajouter une désactivation de bouton pendant l'écriture
  (anti double-clic), documenter les règles métier ambiguës ci-dessous
  pour décision. Aucune migration Dexie nécessaire.
- **P1** : `AuditService` enrichi (old_value/new_value structurés en plus
  du `detail` texte actuel, pour rester lisible ET requêtable), statut
  `CANCELLED` sur `caisse_mouvements` et `paiements` (migration Dexie
  additive, dans l'esprit des 8 précédentes).
- **P2** : table d'écritures dérivée (Grand Livre), alimentée en
  parallèle des tables actuelles dans un premier temps (double lecture
  possible, une seule écriture) avant toute bascule des rapports dessus.

## Tests nécessaires en priorité

Paiement cotisation (bascule, double-bascule, suppression du dimanche
parent), paiement activité (normal, partiel, surpaiement, montant ≤ 0
rejeté), FIFO une fois la règle validée (voir Ambiguïté A), migration
Dexie v8 → v9 sur une copie de données réelles exportées, non-régression
de `caisseDetail()`/`totalDettesImpayees()` après chaque changement de
schéma (ce sont les deux fonctions dont dépend tout le reste).

## Risques de régression pour la refonte UI/UX en cours

Les Phases A-G (UI/UX) déjà livrées **ne touchent aucune ligne de
`js/db.js`** — vérifié à chaque phase par comparaison caractère pour
caractère avec le zip original. Le chantier Comptabilité pourra donc
démarrer sans avoir à refaire ce travail. En sens inverse : toute
modification de `js/db.js` pour ce chantier devra être revalidée contre
les écrans déjà livrés (Finance/Caisse/Dettes/Prêts en particulier,
Phase G UI/UX), qui appellent directement `caisseDetail()`,
`dettesList()`, `pretsMembres()`.

---

## Ambiguïtés à trancher avant tout code (règle section 65 du prompt)

### A — FIFO d'allocation des dettes

**Constat** : chaque dimanche impayé est déjà une dette individuelle et
identifiable (pas un total agrégé). Aujourd'hui, rattraper 3 dimanches en
retard = 3 bascules manuelles individuelles (rapide, un tap chacune).

- **Option A — Garder le geste actuel.** Rien à changer : rattraper 3
  dimanches reste 3 taps. Le "problème" FIFO ne se pose que si on veut un
  jour saisir *un seul montant global* et laisser le système répartir.
- **Option B — Ajouter un mode "règlement groupé".** Un membre en retard
  sur plusieurs dimanches pourrait saisir un seul montant, réparti
  automatiquement du plus ancien au plus récent (FIFO), avec reliquat
  visible si le montant ne couvre pas tout.
- **Recommandation** : Option A tant qu'aucun trésorier n'a signalé que
  saisir plusieurs taps est un problème réel — Option B ajoute de la
  complexité (et un vrai risque d'erreur d'allocation) pour un geste qui
  ne prend aujourd'hui que quelques secondes de plus.

### B — Montant libre pour les cotisations (préalable au surpaiement)

**Constat** : `marquerPaiement` est binaire ; il n'y a pas de champ de
saisie de montant pour une cotisation, contrairement aux activités.

- **Option A — Ne rien changer.** Le montant de cotisation est fixe et
  connu à l'avance (barème hebdomadaire) ; un surpaiement de cotisation
  n'a normalement pas de raison métier d'exister.
- **Option B — Ajouter une saisie de montant libre** aux cotisations
  (comme pour les activités), ce qui rendrait le surpaiement possible et
  nécessaire à gérer — mais changerait le geste principal de l'app (un
  tap → un formulaire), à l'encontre de la section 54 du prompt
  ("rapide, au téléphone").
- **Recommandation** : Option A. Introduire la détection de surpaiement
  seulement là où un montant est réellement saisi (activités), pas
  imposer une saisie là où un simple tap suffit aujourd'hui.

### C — Rôles et permissions vs. authentification actuelle

**Constat** : un seul mot de passe administrateur partagé protège les
actions sensibles ; aucune notion de compte utilisateur.

- **Option A — Rôles déclaratifs simples**, sans vrais comptes : le champ
  `fonction` du membre (déjà existant : Président, Trésorier...) sert
  uniquement à filtrer l'affichage de certains boutons, mais la
  protection réelle reste le mot de passe admin unique (pas de vraie
  séparation des pouvoirs).
- **Option B — Vrais comptes utilisateurs** (identifiant + mot de passe
  par personne), nécessaires pour une vraie séparation Président/
  Trésorier/Secrétaire/Conseiller avec contrôle serveur... sauf qu'il n'y
  a pas de serveur (app 100% locale/offline). Cela impliquerait soit un
  compte par appareil partagé (peu réaliste sur un téléphone commun),
  soit une refonte vers un backend — hors du périmètre "PWA offline-first"
  actuel.
- **Recommandation** : clarifier d'abord un point factuel avant de
  choisir — **l'application est-elle utilisée sur un appareil partagé par
  plusieurs responsables, ou chacun a-t-il son propre téléphone avec sa
  propre installation ?** La réponse change complètement la faisabilité
  de vrais rôles. Sans cette information, je recommande l'Option A
  (déclarative) comme seule extension sûre à court terme.

### D — Portée du Grand Livre : nouvelle table ou vue dérivée ?

Voir "Architecture cible" ci-dessus : je recommande une table alimentée
automatiquement (jamais saisie à la main) plutôt qu'une vraie double
comptabilité. À valider avant la Phase 3 du prompt (section 66).

---

**Aucun fichier applicatif n'a été modifié.** J'attends ta validation sur
les 4 points ci-dessus (et sur le plan P0/P1/P2) avant de commencer la
moindre implémentation, conformément à la section 71 de ton document.
