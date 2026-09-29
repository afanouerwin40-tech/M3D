# M3D Gestion — Mémoire Technique

**Version actuelle :** 1.9.0  
**Dernière mise à jour :** 2026-09-29  
**Type :** Progressive Web App (PWA) Vanilla JavaScript  
**Paradigme :** Offline-first, No-Build, Zero Backend  

---

## 1. Description du Projet

**M3D Gestion** est une Progressive Web App développée pour la gestion administrative, financière, événementielle et pastorale de l'association de jeunesse paroissiale **M3D**.

### Caractéristiques Principales
- **100% Offline** : Fonctionne sans connexion Internet
- **Vanilla JavaScript** : Aucun framework (React, Vue, Angular)
- **No-Build** : Pas de transpilation, bundling ou compilation
- **IndexedDB** : Base de données locale via Dexie.js 3.2.4
- **PWA** : Installable sur mobile, tablette et desktop
- **Responsive** : Mobile-first avec adaptation desktop et print

---

## 2. Objectifs Métier

1. **Gestion des Membres** : Annuaire complet avec photos, rôles, anniversaires
2. **Cotisations Hebdomadaires** : Suivi des contributions dominicales (500 FCFA/semaine)
3. **Finances** : Caisse commune, dépenses, dettes, prêts entre membres
4. **Anniversaires** : Cadeaux collectifs financés par cotisations spéciales
5. **Activités** : Organisation d'événements avec frais modulaires et paiements échelonnés
6. **Transparence** : Historique inaltérable, soldes recalculés dynamiquement

---

## 3. Stack Technique

| Technologie | Version | Rôle |
|-------------|---------|------|
| **HTML5** | Standard | Structure sémantique |
| **CSS3** | Standard | Design System modulaire (ITCSS) |
| **JavaScript** | ES6+ | Vanilla, pas de transpilation |
| **Dexie.js** | 3.2.4 | Wrapper IndexedDB |
| **Service Worker** | Standard | Cache offline |
| **Web App Manifest** | Standard | Installation PWA |
| **Canvas API** | Standard | Compression photos, graphiques |

### Polices Externes
- **Inter** (Google Fonts) : Typographie principale
- Chargée via CDN avec fallback système

---

## 4. Architecture

### Principe : Séparation Stricte des Responsabilités

```text
┌─────────────────────────────────────────────────────────┐
│                      index.html                         │
│              (Point d'entrée unique)                    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    Ordre de Chargement                       │
├──────────────────────────────────────────────────────────────┤
│  1. Dexie.js (CDN)     → Wrapper IndexedDB                   │
│  2. config.js          → Constantes métier                   │
│  3. utils.js           → Fonctions utilitaires               │
│  4. db.js              → Couche données                      │
│  5. state.js           → État global (thème, session)        │
│  6. ui.js              → Composants UI (modales, toasts)     │
│  7. modules/accueil.js → Tableau de bord                    │
│  8. modules/membres.js → Gestion membres                    │
│  9. modules/cotisations.js → Cotisations                    │
│ 10. modules/finances.js → Finances, dettes, prêts          │
│ 11. modules/activites.js → Activités, calendrier            │
│ 12. modules/dons.js    → Dons                               │
│ 13. modules/recherche.js → Recherche globale                │
│ 14. modules/graphiques.js → Graphiques Canvas               │
│ 15. modules/exports.js → Points d'entrée des exports        │
│ 16. services/pdf/socle.js → Fondations d'impression         │
│ 17. services/pdf/composants.js → Briques de tableau         │
│ 18. services/pdf/rapports.js → Les 5 rapports PDF           │
│ 19. modules/systeme.js → Système, sauvegarde, paramètres    │
│ 20. app.js             → Orchestrateur                      │
└──────────────────────────────────────────────────────────────┘
```

### Dépendances Entre Modules

```
config.js (0 dépendance)
    ↓
utils.js (config)
    ↓
db.js (config, utils, Dexie)
    ↓
state.js (config)
    ↓
ui.js (utils, state)
    ↓
modules/* (db, utils, config)
    ↓
modules/exports.js  ← définit openPrintableWindow()
    ↓
services/pdf/socle.js      (dépend de openPrintableWindow)
services/pdf/composants.js (dépend de socle.js pour le style)
services/pdf/rapports.js   (dépend des deux précédents)
    ↓
app.js (tous les modules)
```

**RÈGLE ABSOLUE** : Respecter cet ordre dans `index.html` pour éviter les
références non définies.

**Ordre obligatoire pour les services PDF** : `exports.js` doit précéder
`socle.js`, car le socle appelle `openPrintableWindow()`. Ce n'est pas un
problème tant que les identifiants sont résolus à l'appel et non au
chargement — mais inverser l'ordre serait trompeur pour le lecteur.

**Vérification** : `node tools/verify-globals.js` contrôle que les 118
identifiants listés dans `tools/identifiants-attendus.txt` sont
réellement accessibles. À lancer après **tout** ajout de fonction globale.

---

## 5. Structure des Dossiers

```text
M3D/
├── index.html                    # Point d'entrée unique (SPA)
├── manifest.webmanifest          # Configuration PWA
├── sw.js                         # Service Worker v39
├── VERSION                       # Version actuelle (UTF-8, sans BOM)
├── README.md                     # Documentation utilisateur
├── CHANGELOG.md                  # Historique des versions
├── RAPPORT.md                    # Rapport refonte activités (obsolète)
├── REFACTORING_REPORT.md         # Rapport de refonte v1.9.0
├── CLAUDE.md                     # Mémoire technique (ce fichier)
│
├── css/
│   ├── style.css                 # Point d'entrée (@import)
│   ├── variables.css             # Design Tokens
│   ├── base.css                  # Reset, typographie, animations
│   ├── layout.css                # Structure (topbar, tabbar, grilles)
│   ├── components.css            # Composants réutilisables
│   └── responsive.css            # >900px, print, anciens navigateurs
│
├── js/
│   ├── config.js                 # Constantes immuables (164 lignes)
│   ├── utils.js                  # Fonctions utilitaires pures (404)
│   ├── db.js                     # IndexedDB/Dexie (2170 lignes)
│   ├── state.js                  # Gestion état global (176)
│   ├── ui.js                     # Primitives UI (226)
│   ├── app.js                    # Orchestrateur (1092)
│   │
│   ├── modules/
│   │   ├── accueil.js            # Tableau de bord (97)
│   │   ├── membres.js            # Gestion membres (174)
│   │   ├── cotisations.js        # Gestion cotisations (102)
│   │   ├── finances.js           # Finances, dettes, prêts (486)
│   │   ├── activites.js          # Activités, calendrier (951)
│   │   ├── dons.js               # Dons (404)
│   │   ├── recherche.js          # Recherche globale (116)
│   │   ├── graphiques.js         # Graphiques Canvas (275)
│   │   ├── exports.js            # Points d'entrée exports (277)
│   │   └── systeme.js            # Système, sauvegarde (490)
│   │
│   └── services/
│       └── pdf/
│           ├── socle.js          # Fondations impression (187)
│           ├── composants.js     # Briques de tableau (80)
│           └── rapports.js       # Les 5 rapports (452)
│
├── tools/                        # Tests (aucune dépendance npm)
│   ├── test-dettes.js            # 26 assertions
│   ├── test-donnees-test.js      # 29 assertions
│   ├── test-logique.js           # 22 assertions
│   ├── test-pdf.js               # 34 assertions
│   ├── verify-globals.js         # 118 identifiants
│   ├── identifiants-attendus.txt # Liste de référence
│   └── donnees-test.js           # Jeu de données de démonstration
│
├── icons/
│   ├── icon-192.png              # PWA standard
│   └── icon-512.png              # PWA haute résolution
│
└── docs/
    ├── ARCHITECTURE.md           # Réécrit en v1.9.0 (schéma v9, SW v39)
    ├── DEVELOPMENT.md            # Réécrit en v1.9.0 (tests, recettes, pièges)
    ├── CHANGELOG.md              # Historique détaillé
    ├── AUDIT-COMPTABILITE.md     # Audit comptable
    ├── UI-UX-AUDIT.md            # Audit UI/UX
    └── UI-UX-REFACTOR-REPORT.md  # Rapport refonte UI
```

---

## 6. Modules JavaScript

### 6.1 config.js (164 lignes)
**Responsabilité** : Constantes métier immuables

```javascript
const MOIS_NOMS = ["Janvier", "Fevrier", ...];
const FONCTIONS = ["Membre", "President", ...];
const CATEGORIES_DEPENSE = ["Transport", "Nourriture", ...];
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

### 6.2 utils.js (404 lignes)
**Responsabilité** : Fonctions utilitaires pures sans effet de bord

- `fmt(n)` : Formatage monétaire (12000 → "12 000 F")
- `fmtDate(iso)` : Formatage date (2026-09-29 → 29/09/2026)
- `esc(str)` : Protection XSS (échappement HTML)
- `uid()` : Génération UUID v4
- `compressImage()` : Compression JPEG via Canvas
- `telechargerFichier()` : Téléchargement côté client

### 6.3 db.js (2170 lignes)
**Responsabilité** : Couche d'accès aux données

#### Tables IndexedDB (Schéma v9)
```javascript
{
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne, date_remboursement",
  caisse_mouvements: "id, date, type, categorie",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
  listes: "id, nom, date, archivee, type",
  liste_membres: "id, id_liste, id_membre",
  prets_membres: "id, id_dimanche, id_debiteur, id_preteur, id_paiement",
  liste_frais: "id, id_liste",
  liste_paiements: "id, id_liste, id_membre",
  dons: "id, id_activite, id_membre, date"
}
```

#### Principe : Event Sourcing
- **JAMAIS** de totaux stockés
- Tous les montants sont recalculés depuis l'historique
- `montant_paye` = `Σ historique_paiements`
- Garantit cohérence et traçabilité

#### Ouverture explicite de la base
`ouvrirBase()` doit être appelée avant **toute** lecture :

```javascript
const SCHEMA_VERSION = 9;
await ouvrirBase();   // dans start(), avant seedIfEmpty()
```

Deux raisons :
1. Dexie ouvre la base **en tâche de fond** si on ne l'appelle pas. L'app
   démarrait donc quand même, et une erreur (base en v8, table `dons`
   absente) remontait trois secondes plus tard, sans localisation.
2. Une mise à jour bloquée (un autre onglet tient une connexion ouverte sur
   une version antérieure) laisse `db.open()` en attente **indéfinie** :
   ni résolue, ni rejetée. D'où le délai de 10 s, au-delà duquel un message
   explicite s'affiche.

`ouvrirBase()` compare ensuite `db.verno` à `SCHEMA_VERSION` et lève une
erreur si la base est plus ancienne que le code.

### 6.4 state.js (176 lignes)
**Responsabilité** : État global applicatif

- Onglet actif (`currentTab`)
- Session annuelle active (`activeSessionId`)
- Thème clair/sombre (persisté dans localStorage)
- Verrouillage automatique après 30 min d'inactivité
- Détection `visibilitychange` pour mise en veille

### 6.5 ui.js (226 lignes)
**Responsabilité** : Composants UI réutilisables

- `openSheet(html)` : Modales bottom-sheet empilables
- `closeSheet()` : Fermeture avec animation
- `toast(msg, kind)` : Notifications éphémères
- `confirmWithPassword(msg)` : Dialogue admin avec validation
- `pwField()` : Champ mot de passe avec bascule œil

### 6.6 modules/accueil.js (97 lignes)
**Responsabilité** : Logique tableau de bord

- Construction carte "Aujourd'hui"
- Gestion membres irréguliers
- Prêts en attente
- Membres à relancer

### 6.7 modules/membres.js (174 lignes)
**Responsabilité** : Gestion membres

- Rendu liste membres (mobile + desktop)
- Filtres et tri
- Attachement événements

### 6.8 modules/cotisations.js (102 lignes)
**Responsabilité** : Gestion cotisations

- Génération HTML carte semaine
- Rendu liste dimanches
- Attachement gestionnaires événements

### 6.9 modules/finances.js (486 lignes)
**Responsabilité** : Finances, dettes et prêts entre membres

- `renderFinance()` : caisse, dettes, prêts
- `openRembourser()` : enregistre qui a remboursé (voir §8, table
  `remboursements`)
- `renderDettes()` : affiche montant, date et personne ayant remboursé

### 6.10 modules/activites.js (951 lignes)
**Responsabilité** : Activités, listes et calendrier

- Hub activités, fiches d'activité, frais, paiements échelonnés
- Calendrier mois / semaine / jour
- ⚠️ Plus gros module restant : plusieurs écrans dans un seul fichier

### 6.11 modules/dons.js (404 lignes)
**Responsabilité** : Dons

- Écran global (recherche, filtre par activité, bornes de dates, tri)
- Récapitulatif par activité (`renderDonsActivite`)
- Formulaire de saisie (`openDonForm`)
- Export PDF reprenant les filtres affichés

### 6.12 modules/recherche.js (116 lignes)
**Responsabilité** : Recherche globale transversale

### 6.13 modules/graphiques.js (275 lignes)
**Responsabilité** : Graphiques Canvas (évolution caisse, anniversaires)

### 6.14 modules/exports.js (277 lignes)
**Responsabilité** : Points d'entrée des exports

Ne contient **plus** de mise en forme. Conserve les sept entrées historiques
(renommées = régression, elles sont appelées par les boutons de l'interface)
et les délègue au socle PDF ou à l'un des cinq rapports.

`openPrintableWindow()` est définie ici : c'est le seul point d'ouverture de
fenêtre d'impression, appelé à la fois par ce module et par le socle PDF.

### 6.15 services/pdf/socle.js (187 lignes)
**Responsabilité** : Fondations d'impression, écrites une seule fois

- `PDF_COULEURS` : palette terracotta, alignée sur l'application
- `pdfFeuilleStyle()` : `@page` A4, en-tête, tableaux, pied de page
- `pdfEntete()` / `pdfPied()` : en-tête et pagination
- `pdfDocumentComplet()` : **seul** point d'injection de HTML brut
- `pdfOuvrirEtImprimer()` : ouvre la fenêtre, injecte, imprime

**Règle** : toute valeur saisie par l'utilisateur passe par `esc()`, y
compris dans le `<title>`. C'était une faille (deux chemins) corrigée en
v1.9.0.

### 6.16 services/pdf/composants.js (80 lignes)
**Responsabilité** : Briques de tableau réutilisables

- `pdfTableau()` : gère le cas « aucune donnée » en une seule fois
- `pdfResume()`, `pdfLigneTotal()`, `pdfListe()`

### 6.17 services/pdf/rapports.js (452 lignes)
**Responsabilité** : Les cinq rapports PDF

| Fonction | Contenu |
|---|---|
| `rapportMembrePDF(id)` | Fiche individuelle : résumé financier, collecte, dettes, prêts |
| `rapportActivitePDF(id)` | Frais, participants, dons reçus |
| `rapportCotisationPDF(id)` | Feuille de collecte d'un dimanche, non-payants |
| `rapportDonsPDF(o)` | Synthèse, ventilation par activité, détail. Filtres `idActivite` / `du` / `au` |
| `rapportFinancierPDF()` | Synthèse, dettes impayées et soldées, prêts, mouvements de caisse |

`pdfIdentite()` lit le nom de l'organisation (paramètre
`organisation_nom`, défaut « Jeunesse M3D ») et la session active.

### 6.18 modules/systeme.js (490 lignes)
**Responsabilité** : Système, sauvegarde, paramètres

- `renderSysteme()` : paramètres, sauvegarde/restauration, exports, thème
- `TABLES_APPLICATION` : **liste blanche figée des tables sauvegardées**.
  Une table absente de cette liste est **silencieusement perdue** lors d'un
  export JSON. Toute nouvelle table doit y être ajoutée.

### 6.19 app.js (1092 lignes)
**Responsabilité** : Orchestration

- Routage des onglets (`showTab`)
- Enregistrement des gestionnaires d'événements globaux
- Modales transverses (member detail, recherche, verrouillage)
- `start()` : ouvre la base, puis initialise

---

## 7. Base de Données IndexedDB

### Nom de la Base
```javascript
const db = new Dexie("m3d_db");
```

### Schéma Actuel : Version 9

#### Évolution du Schéma
- **v1** : Membres, sessions, dimanches, paiements
- **v2** : Cotisation personnalisée Eric (1000F)
- **v3** : Module listes personnalisées
- **v4** : Prêts entre membres
- **v5** : Index `id_paiement` manquant (fix crash)
- **v6** : Activités multi-frais + historique paiements
- **v7** : Métadonnées événements (lieu, heure, responsable)
- **v8** : Dépenses avec catégories
- **v9** : Dons (table `dons`) — additive, aucune donnée touchée

---

## 8. Schéma des Tables

### membres
```javascript
{
  id: string (PK, format "M-XXXXX"),
  nom: string,
  prenom: string,
  telephone: string,
  fonction: string ("Membre" | "President" | ...),
  statut: string ("Actif" | "Inactif"),
  photo: string (Data URL base64 JPEG),
  jour_anniversaire: number (1-31),
  mois_anniversaire: number (1-12),
  cotisation_personnalisee: number (optionnel, ex: 1000)
}
```

### paiements (Cotisations)
```javascript
{
  id: string (PK, UUID),
  id_dimanche: string (FK → dimanches.id),
  id_membre: string (FK → membres.id),
  montant_attendu: number,
  a_paye: boolean,
  montant_paye: number
}
```

### listes (Activités)
```javascript
{
  id: string (PK, UUID),
  nom: string,
  description: string,
  date: string (ISO YYYY-MM-DD),
  date_limite: string (ISO, optionnel),
  heure: string (HH:MM, optionnel),
  lieu: string,
  id_responsable: string (FK → membres.id, optionnel),
  budget: number (optionnel),
  type: string ("sortie" | "reunion" | "voyage" | ...),
  cloturee: boolean,
  archivee: boolean,
  annulee: boolean
}
```

> ⚠️ `couleur` et `icone` ne font **plus** partie de l'activité. Ils ont été
> retirés du schéma et de l'interface ; la couleur d'affichage est dérivée du
> `type`. Conséquence : `safeColor()` n'a plus aucun appel dans le code.

### liste_frais (Frais d'une activité)
```javascript
{
  id: string (PK, UUID),
  id_liste: string (FK → listes.id),
  libelle: string ("Participation", "Transport", ...),
  montant: number,
  ordre: number
}
```

### liste_paiements (Historique paiements activité)
```javascript
{
  id: string (PK, UUID),
  id_liste: string (FK → listes.id),
  id_membre: string (FK → membres.id),
  montant: number,
  date: string (ISO YYYY-MM-DD),
  heure: string (HH:MM),
  commentaire: string
}
```

### dons (Dons, schéma v9)
```javascript
{
  id: string (PK, UUID),
  id_membre: string (FK → membres.id),
  id_activite: string (FK → listes.id, optionnel — don général si absent),
  montant: number,
  date: string (ISO YYYY-MM-DD),
  note: string
}
```

Lecture : `donsList(filtres)` et `syntheseDons(filtres)`. Le total et le
nombre de donateurs sont toujours recalculés, jamais stockés.

### remboursements (Suivi « qui a remboursé »)
```javascript
{
  id: string (PK, UUID),
  id_membre: string (FK → membres.id, le débiteur),
  id_paiement_concerne: string (FK → paiements.id),
  id_membre_rembourseur: string (FK → membres.id),   // ajouté v1.9.0
  nom_rembourseur: string,            // nom figé au moment du remboursement
  date_remboursement: string (ISO YYYY-MM-DD),
  montant: number,
  note: string
}
```

**Lecture du nom** — dans `dettesList()`, `js/db.js` :

```javascript
// Le nom fige est prioritaire. S'il manque (remboursement enregistre avant
// v1.9.0), on retombe sur le membre rembourseur, puis sur le debiteur.
const rembMember = r && r.id_membre_rembourseur
  ? memById[r.id_membre_rembourseur] : null;
const rembPar = r
  ? r.nom_rembourseur
    || (rembMember ? fullName(rembMember)
       : (memById[p.id_membre] ? fullName(memById[p.id_membre]) : "?"))
  : null;
```

`nom_rembourseur` est **figé volontairement** : il doit survivre à la
suppression du membre et à son renommage. La fiche membre, elle, affiche le
nom actuel. L'écran et l'historique ne racontent pas la même chose, par choix.

---

## 9. Migrations

### Règles de Migration
1. **Toujours additives** : Jamais supprimer de tables
2. **Idempotentes** : Vérifier si déjà migrée avant d'agir
3. **Sans perte de données** : Convertir, ne jamais effacer
4. **Documentées** : Expliquer le "pourquoi"

### Migration v6 (Exemple)
```javascript
db.version(6).upgrade(async (tx) => {
  const listes = await tx.listes.toArray();
  for (const liste of listes) {
    // Vérifier si déjà migrée
    const fraisExistants = await tx.liste_frais
      .where("id_liste").equals(liste.id).count();
    if (fraisExistants > 0) continue; // ✅ Idempotence
    
    // Ancien montant_demande → Nouveau frais "Participation"
    const idFrais = uid();
    await tx.liste_frais.add({
      id: idFrais,
      id_liste: liste.id,
      libelle: "Participation",
      montant: liste.montant_demande,
      ordre: 0
    });
    
    // Convertir ancien booléen paye en ligne d'historique
    // ...
  }
});
```

**⚠️ IMPORTANT** : Ne jamais supprimer une migration historique. Les utilisateurs peuvent migrer depuis n'importe quelle version.

---

## 10. Authentification

### Mécanisme
- **Mot de passe administrateur unique** (pas de comptes multiples)
- **Hash SHA-256 + salt unique** stocké dans `parametres`
- **Jamais en clair** dans IndexedDB
- **Verrouillage automatique** après 30 min d'inactivité

### Flux
```javascript
1. Utilisateur saisit mot de passe
2. verifyAdminPassword(pw) → hash(salt + pw) === stored_hash
3. setSessionAuthed(true) → sessionStorage
4. Visibilitychange → localStorage.setItem("m3d_hidden_at", Date.now())
5. Au retour : verrouillerSiExpire() → Si > 30 min, redemander mot de passe
```

### Limites Connues
- **Pas de récupération de mot de passe** (pure offline)
- **IndexedDB non chiffrée** (données lisibles si appareil compromis)
- **Protection anti-manipulation**, pas sécurité militaire

---

## 11. Gestion de l'État

### État Global (state.js)
```javascript
let currentTab = "accueil";
let activeSessionId = null;
```

### Persistance
- **sessionStorage** : `m3d_authed` (authentification)
- **localStorage** : `m3d_theme`, `m3d_hidden_at`, `derniere_sauvegarde`

### Thème Clair/Sombre
```javascript
document.documentElement.setAttribute("data-theme", "dark" | "light");
```

Variables CSS s'adaptent automatiquement via `[data-theme="dark"]`.

---

## 12. PWA / Service Worker

### Stratégie : Cache First + Stale While Revalidate

```javascript
// sw.js v39
const CACHE_NAME = "m3d-cache-v39";

// Tous les assets critiques
const ASSETS = [
  "./",
  "./index.html",
  "./css/*.css",
  "./js/*.js",
  "./js/modules/*.js",
  "./js/services/pdf/*.js",
  "./icons/*.png",
  "https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js",
  "https://fonts.googleapis.com/css2?family=Inter..."
];
```

### Incrémentation Version Cache
À chaque modification des assets, incrémenter `CACHE_NAME` dans `sw.js` :
```javascript
const CACHE_NAME = "m3d-cache-v39"; // ← Incrémenter ici
```

> ⚠️ Le cache sert la copie en cache et ne réactualise qu'en arrière-plan.
> Après une modification, un simple rechargement peut donc servir l'ancien
> fichier. En développement : `Ctrl+Shift+R`, ou désinstaller le service
> worker (DevTools → Application → Service Workers).

### Activation PWA
- **Android** : Menu → "Installer l'application"
- **iOS** : Bouton Partage → "Sur l'écran d'accueil"
- **Desktop** : Icône d'installation dans la barre d'adresse

---

## 13. Offline-First

### Principe
1. **Toutes les données vivent dans IndexedDB** (navigateur)
2. **Aucun serveur requis** pour fonctionner
3. **Service Worker met en cache tous les assets** au premier chargement
4. **L'application fonctionne sans Internet** après installation

### Backup/Restore
- **Export** : Dump JSON de toutes les tables
- **Import** : Validation schéma + écriture IndexedDB
- **Protection** : Demande mot de passe admin pour import total

---

## 14. Sécurité

### Protections Implémentées
✅ **XSS** : `esc(str)` systématique avant injection HTML — **y compris dans la
fenêtre d'impression**, y compris le `<title>` du document imprimé (corrigé en
v1.9.0 : `writePrintableDocument()` injectait le titre sans échappement)  
✅ **Mots de passe** : Hash SHA-256 + salt, jamais en clair  
✅ **Verrouillage** : Auto après 30 min d'inactivité  
✅ **Import JSON** : Validation structure avant écriture  
✅ **Version de base** : `ouvrirBase()` compare `db.verno` à `SCHEMA_VERSION`
avant tout affichage — pas d'écran à moitié chargé sur une base en retard  

> `safeColor()` a été supprimé du code avec les couleurs personnalisées des
> activités. Les couleurs des exports PDF proviennent de `PDF_COULEURS`, des
> valeurs en dur, jamais saisies par l'utilisateur.

### Limites Connues
❌ **IndexedDB non chiffrée** : Données en clair sur l'appareil  
❌ **Pas de multi-utilisateurs** : Un seul admin  
❌ **Pas de récupération MDP** : Pure offline  
❌ **localStorage accessible** : Thème, timestamps non sensibles  
❌ **Noms complets en clair** : L'anonymisation après N mois n'a pas été
implémentée (décision explicite). Les exports PDF contiennent les noms réels.  

### Recommandations
- Ne pas stocker de données ultra-sensibles (mots de passe tiers, IBAN)
- Utiliser sur appareil personnel protégé par code PIN/biométrie
- Sauvegardes JSON à stocker en lieu sûr (pas de cloud public)

---

## 15. Compatibilité Navigateurs

### Support Officiel
| Navigateur | Version Min | Statut |
|------------|-------------|--------|
| Chrome/Edge | 80+ | ✅ Pleinement supporté |
| Firefox | 78+ | ✅ Pleinement supporté |
| Safari macOS | 13.1+ | ✅ Pleinement supporté |
| Safari iOS/iPadOS | 13.4+ | ✅ Pleinement supporté (avec polyfills) |

### Polyfills Implémentés
```javascript
// Safari iOS 12.0 (iPad anciens)
if (typeof Object.fromEntries !== "function") {
  Object.fromEntries = function(entries) { /* ... */ };
}
```

### Non Supporté
- Internet Explorer (fin de vie)
- Navigateurs < 2020

---

## 16. Conventions de Code

### Nommage
- **Fonctions** : `camelCase` (`calculerTotalPaye`)
- **Constantes** : `SCREAMING_SNAKE_CASE` (`MOIS_NOMS`)
- **Variables** : `camelCase` (`montantAttendu`)
- **Fichiers** : `kebab-case` (`ui-components.js`)
- **Classes CSS** : `kebab-case` (`.stat-card`)

### Langue
- **Code** : Français (fonctions, variables, commentaires)
- **Termes techniques** : Anglais acceptable (render, fetch, async)
- **Documentation** : Français

### Formatage
- **Indentation** : 2 espaces
- **Quotes** : Double `"` pour strings
- **Semicolons** : Oui

---

## 17. Convention de Nommage

### Fonctions
- `render*()` : Rendu complet d'un onglet (ex: `renderMembres`)
- `open*()` : Ouverture modale/sheet (ex: `openMemberDetail`)
- `get*()` : Récupération donnée pure (ex: `getParam`)
- `calcul*()` : Calcul pur (ex: `calculerMontantAttendu`)
- `list*()` : Requête liste (ex: `listMembres`)

### Préfixes Booléens
- `is*` : État (ex: `isSessionAuthed`)
- `has*` : Possession (ex: `hasDebt`)
- `should*` : Condition (ex: `shouldLock`)

---

## 18. Organisation CSS

### Architecture : ITCSS (Inverted Triangle CSS)
```
variables.css  ← Design Tokens (couleurs, espacements)
    ↓
base.css       ← Reset, typographie, animations
    ↓
layout.css     ← Structure (grille, topbar, tabbar)
    ↓
components.css ← Composants réutilisables
    ↓
responsive.css ← Adaptations contextuelles
```

### Principe
- **Pas de `!important`** (sauf override navigateur)
- **Tokens centralisés** dans `variables.css`
- **Mobile-first** : Styles de base pour petit écran, `@media (min-width)` pour agrandir

---

## 19. Organisation JavaScript

### Principe de Séparation
1. **config.js** : Zéro logique, uniquement constantes
2. **utils.js** : Fonctions pures, pas d'accès global
3. **db.js** : Seul fichier à toucher IndexedDB directement
4. **state.js** : Seul fichier à modifier état global
5. **ui.js** : Composants UI génériques, réutilisables
6. **modules/** : Logique métier par domaine
7. **services/pdf/** : Production documentaire, sans accès à IndexedDB en
   dehors des rapports. Doit venir **après** `exports.js` (il appelle
   `openPrintableWindow()`)
8. **app.js** : Orchestration, pas de logique métier lourde

### Règle d'Or
> Si une fonction fait plus de 50 lignes, vérifier si elle peut être découpée.

---

## 20. Tests

### Tests automatisés
✅ **111 assertions** dans `tools/`, sans aucune dépendance npm (le projet
est « no-build » et le reste).

```bash
node tools/test-dettes.js       # 26 — dettes, remboursements, nom figé
node tools/test-donnees-test.js  # 29 — jeu de données de démonstration
node tools/test-logique.js       # 22 — logique métier
node tools/test-pdf.js           # 34 — échappement, tableaux, cas limites
node tools/verify-globals.js     # 118 identifiants globaux
```

**Comment ça marche** : les harnais lisent `index.html`, exécutent les
scripts dans l'ordre de chargement via le module `vm` de Node, avec un DOM
simulé et une base Dexie simulée (`tools/sandbox.js`). Aucun `package.json`,
aucun installateur.

`verify-globals.js` compare les identifiants de `tools/identifiants-attendus.txt`
à ce qui est réellement accessible. **Ajouter un identifiant global = l'ajouter
à ce fichier**, sinon l'omission passe inaperçue.

### Ce que les tests ne couvrent pas
- Le rendu visuel réel (mise en page A4, pagination) — à vérifier à l'impression
- La mise à jour IndexedDB v8 → v9 dans un vrai navigateur
- Le comportement du service worker (propagation du cache)
- Les tests tournent à la main : **pas de CI**

### Couverture restante
Non couvert à ce jour : migrations v1→v9 dans un vrai navigateur, rendu DOM
complet (jsdom), cohérence entre tables après import d'une sauvegarde.

---

## 21. Commandes Utiles

### Développement Local
```bash
# Méthode 1 : Python
python -m http.server 8080
# http://localhost:8080

# Méthode 2 : Node.js
npx serve .
# ou
npx http-server -p 8080

# Méthode 3 : VS Code
# Extension "Live Server" → Clic droit index.html
```

### Lancer les Tests
```bash
node tools/verify-globals.js && node tools/test-dettes.js && node tools/test-donnees-test.js && node tools/test-logique.js && node tools/test-pdf.js
# Attendu : 118 identifiants, puis 26 / 29 / 22 / 34 assertions
```

### Vérification Version Cache PWA
```bash
grep "CACHE_NAME" sw.js
# Doit correspondre à la version actuelle + 1 si assets modifiés
```

### Compter Lignes de Code
```bash
find . -name "*.js" -not -path "./node_modules/*" | xargs wc -l
```

### Vérifier Encodage
```bash
file VERSION
# Doit retourner : "UTF-8 Unicode text"
```

---

## 22. Version Actuelle

**Version :** 1.9.0  
**Date :** 2026-09-29  
**Schéma DB :** v9  
**Service Worker :** v39  

### Calcul Version
- **MAJOR** : Refonte complète, breaking changes schéma DB
- **MINOR** : Nouvelles fonctionnalités, migrations additives
- **PATCH** : Corrections bugs, optimisations sans changement API

### Trois nombres à tenir alignés
`VERSION`, `CACHE_NAME` dans `sw.js`, et `SCHEMA_VERSION` dans `db.js` sont
indépendants. Les incrémenter, c'est juger séparément « ce que le code sait
faire », « ce que le navigateur a en cache » et « ce que la base contient ».

---

## 23. Historique des Versions

### v1.9.0 (2026-09-29)
- Module Dons complet (`dons.js`), table `dons` (schéma v9)
- Suivi du remboursement : qui a remboursé, avec nom figé
- 5 rapports PDF sous `js/services/pdf/`, socle unique
- Correction XSS dans la fenêtre d'impression (3 chemins)
- `ouvrirBase()` : ouverture explicite + contrôle de version
- `app.js` : 3 657 → 1 092 lignes
- 111 assertions de test

Détail : [REFACTORING_REPORT.md](REFACTORING_REPORT.md)

### v1.8.2 (2026-09-27)
- Fix affichage noms "pret en attente"
- Modularisation logique accueil.js
- Modularisation logique membres.js
- Correction membres irréguliers (erreur itérable)

### v1.8.0 (2026-09-XX)
- Module activités v2 (heure, lieu, responsable, budget, type)
- Statuts activités calculés (à venir / en cours / terminée / annulée)

### v1.7.4 (2026-09-22)
- Fix affichage "Inconnu → Inconnu" dans prêts en attente
- Passage `memById` entre modules

### v1.0.0 (2026-XX-XX)
- Version initiale stable
- Membres, cotisations, caisse, activités

---

## 24. Fonctionnalités Terminées

✅ Gestion complète des membres (CRUD, photos, rôles)  
✅ Cotisations hebdomadaires avec historique  
✅ Anniversaires avec cadeaux collectifs  
✅ Caisse commune (entrées/sorties/solde)  
✅ Dettes et relances automatiques  
✅ Prêts entre membres  
✅ Activités multi-frais avec paiements échelonnés  
✅ Calendrier mois/semaine/jour  
✅ Sauvegarde/restauration JSON (les 15 tables, via `TABLES_APPLICATION`)  
✅ 7 exports PDF (5 rapports + dettes + prêts)  
✅ Thème clair/sombre  
✅ PWA installable offline  
✅ Authentification admin  
✅ Verrouillage automatique  
✅ Recherche globale  
✅ Graphiques Canvas (évolution caisse, anniversaires)  
✅ **Dons** : saisie, historique, synthèse par activité, export PDF  
✅ **Suivi des remboursements** : montant, date, personne ayant remboursé  
✅ **5 rapports PDF** (membre, activité, cotisation, dons, financier)  
✅ Tests automatisés (111 assertions)  

---

## 25. Fonctionnalités en Cours

*(rien en cours)*

Livré en v1.9.0 : découpage d'`app.js` (3 657 → 1 092 lignes), ajout des
tests, correction du fichier `VERSION`, exports PDF refondus.

---

## 26. Fonctionnalités à Venir

📋 Notifications push PWA  
📋 Synchronisation multi-appareils (optionnel)  
📋 Rapports statistiques avancés  
📋 Mode lecture seule (consultation sans admin)  

---

## 27. Décisions Techniques Importantes

### Pourquoi Vanilla JS ?
- **Pérennité** : Pas de dépendance à un framework qui peut mourir
- **Performance** : Pas de runtime lourd (React, Angular)
- **Simplicité** : Code directement lisible, pas de build
- **Offline** : Aucun serveur npm/yarn requis

### Pourquoi IndexedDB ?
- **Standard Web** : Supporté partout
- **Capacité** : Plusieurs Go de données (vs 5-10 Mo localStorage)
- **Transactions** : Garanties ACID
- **Requêtes complexes** : Index, tri, filtres

### Pourquoi Dexie.js ?
- **API simple** : Plus ergonomique que IndexedDB natif
- **Migrations automatiques** : Gestion versions facilitée
- **Promesses** : async/await natif
- **Petit** : ~20 Ko minifié

### Pourquoi Event Sourcing ?
- **Historique complet** : Audit trail inaltérable
- **Corrections rétroactives** : Recalcul depuis origine
- **Pas de désynchronisation** : Source de vérité unique

---

## 28. Points Sensibles à NE PAS Modifier

### ⚠️ Ordre de Chargement (index.html)
**NE JAMAIS** modifier l'ordre des `<script>` sans vérifier les dépendances.

### ⚠️ Migrations IndexedDB (db.js)
**NE JAMAIS** supprimer une migration historique.  
**NE JAMAIS** modifier une migration déjà déployée.  
**TOUJOURS** créer une nouvelle version pour changement schéma.

### ⚠️ Nom de la Base (db.js)
```javascript
const db = new Dexie("m3d_db"); // ← NE PAS CHANGER
```
Changer le nom = perte de toutes les données utilisateurs.

### ⚠️ Hash Mots de Passe (state.js, db.js)
**NE PAS** modifier l'algorithme SHA-256 + salt sans migration.  
Changement = tous les utilisateurs perdent accès admin.

### ⚠️ Fonction esc()
Protection XSS critique. **Partout**, y compris dans `pdfDocumentComplet()`
pour le `<title>` du document imprimé — c'était le trou oublié jusqu'en v1.9.0.
`safeColor()` n'existe plus : les activités n'ont plus de couleur
personnalisée, et les couleurs PDF viennent de `PDF_COULEURS` (valeurs en dur).

### ⚠️ TABLES_APPLICATION (systeme.js)
Liste blanche **figée** des tables incluses dans l'export JSON. **Toute table
ajoutée à `db.js` doit y être ajoutée aussi**, sinon elle est silencieusement
absente des sauvegardes — sans aucun message à l'utilisateur.

### ⚠️ nom_rembourseur
Volontairement figé. Il ne doit **pas** être remplacé par une lecture du membre
courant : l'historique perdrait les cas de suppression et de renommage. Voir
la note sous le schéma `remboursements` (§8).

### ⚠️ Service Worker CACHE_NAME
**TOUJOURS** incrémenter après modification assets.  
Oubli = utilisateurs gardent anciennes versions en cache.

---

## 29. Dette Technique

Le découpage d'`app.js` (3 657 lignes → 1 092) est **livré** en v1.9.0.
Reste ci-dessous.

| Niveau | Sujet | Détail | Suite possible |
|---|---|---|---|
| 🟠 | `js/db.js` — 2 170 lignes | Le plus gros fichier du dépôt. C'est la couche données : le découpage doit suivre les domaines (membres, finances, activités, dons), pas être fait au hasard. | Scission par domaine |
| 🟠 | `modules/activites.js` — 951 lignes | Un seul fichier pour le hub, les fiches, les frais et le calendrier. | Extraire `calendrier.js` |
| 🟡 | Aucune automatisation | Les tests tournent à la main, à chaque session. | Script `npm test` / hook git — sans dépendance externe |
| 🟡 | `TABS` dans `config.js` est du code mort | La constante annonce l'ancienne barre d'onglets (`dettes`, `plus`) alors que le HTML en définit cinq autres. Elle n'est référencée nulle part — mais `verify-globals.js` la vérifie, donc elle paraît vivante. | Supprimer, ou faire du HTML la source unique |
| 🟡 | `RAPPORT.md` obsolète | Décrit la refonte listes → activités, désormais livrée. | Archiver |
| 🟡 | Exports financiers | Chaque module appelle encore `rapportStats()` séparément, donc autant de requêtes que d'écrans. | Cache par session |
| 🟢 | Historique Git redondant | Commits « fix:Mise a jour » successifs. | Conventional Commits |

**Pas de `.gitignore`** : les sauvegardes JSON exportées par l'application
sont des données réelles et se retrouvent parfois à la racine du dépôt. À créer.

---

## 30. Changelog

Voir fichier dédié : [CHANGELOG.md](CHANGELOG.md)  
Voir aussi : [REFACTORING_REPORT.md](REFACTORING_REPORT.md)

---

## Notes de Maintenance

### Avant Toute Modification
1. ✅ Lire ce fichier CLAUDE.md entièrement
2. ✅ Vérifier les dépendances du module concerné
3. ✅ Lancer les tests : `node tools/verify-globals.js` puis les 4 harnais
4. ✅ Tester en local, avec `Ctrl+Shift+R` (voir §12)
5. ✅ Vérifier console navigateur (aucune erreur)
6. ✅ Tester offline (désactiver réseau)
7. ✅ Incrémenter version si nécessaire
8. ✅ Mettre à jour CHANGELOG.md
9. ✅ Mettre à jour CLAUDE.md si changement architectural

### Après Modification Assets
1. ✅ Incrémenter `CACHE_NAME` dans `sw.js`
2. ✅ Tester PWA (désinstaller/réinstaller)
3. ✅ Vérifier que nouveaux fichiers sont dans `ASSETS[]`

### Après Modification Schéma DB
1. ✅ Créer nouvelle version Dexie (`db.version(N+1)`)
2. ✅ Écrire migration idempotente
3. ✅ Tester migration depuis version N-1
4. ✅ Documenter dans CLAUDE.md section 9
5. ✅ Incrémenter version MINOR de l'app
6. ⚠️ Ajouter la table à `TABLES_APPLICATION` (`modules/systeme.js`) — sinon
   elle n'apparaît pas dans les sauvegardes JSON

### Après Ajout d'un Identifiant Global
1. ✅ L'ajouter à `tools/identifiants-attendus.txt`
2. ✅ Lancer `node tools/verify-globals.js`

### Après Ajout d'un Rapport PDF
1. ✅ L'ajouter à `rapports.js` et à `js/services/pdf/` dans `ASSETS[]`
2. ✅ L'enregistrer dans `tools/identifiants-attendus.txt`
3. ✅ Ajouter un cas dans `tools/test-pdf.js` (au minimum : cas « aucune
   donnée » et nom contenant `</title><script>`)

---

**Dernière mise à jour de ce document :** 2026-09-29  
**Responsable :** Développeur principal M3D  
**Contact technique :** [À compléter]
