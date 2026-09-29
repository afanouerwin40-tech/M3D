# M3D Gestion — Mémoire Technique

**Version actuelle :** 1.8.2  
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
│ 1. Dexie.js (CDN)     → Wrapper IndexedDB                    │
│ 2. config.js          → Constantes métier                    │
│ 3. utils.js           → Fonctions utilitaires                │
│ 4. db.js              → Couche données                       │
│ 5. state.js           → État global (thème, session)         │
│ 6. ui.js              → Composants UI (modales, toasts)      │
│ 7. modules/accueil.js → Logique tableau de bord              │
│ 8. modules/membres.js → Logique gestion membres              │
│ 9. modules/cotisations.js → Logique cotisations              │
│ 10. app.js            → Orchestrateur principal              │
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
app.js (tous les modules)
```

**RÈGLE ABSOLUE** : Respecter cet ordre dans `index.html` pour éviter les références non définies.

---

## 5. Structure des Dossiers

```text
M3D/
├── index.html                    # Point d'entrée unique (SPA)
├── manifest.webmanifest          # Configuration PWA
├── sw.js                         # Service Worker v33
├── VERSION                       # Version actuelle (UTF-8)
├── README.md                     # Documentation utilisateur
├── CHANGELOG.md                  # Historique des versions
├── RAPPORT.md                    # Rapport refonte activités
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
│   ├── config.js                 # Constantes immuables
│   ├── utils.js                  # Fonctions utilitaires pures
│   ├── db.js                     # IndexedDB/Dexie (1919 lignes)
│   ├── state.js                  # Gestion état global
│   ├── ui.js                     # Primitives UI
│   ├── app.js                    # Orchestrateur (3657 lignes) ⚠️
│   │
│   └── modules/
│       ├── accueil.js            # Tableau de bord
│       ├── membres.js            # Gestion membres
│       └── cotisations.js        # Gestion cotisations
│
├── icons/
│   ├── icon-192.png              # PWA standard
│   └── icon-512.png              # PWA haute résolution
│
└── docs/
    ├── ARCHITECTURE.md           # Documentation architecture
    ├── DEVELOPMENT.md            # Guide développeur
    ├── CHANGELOG.md              # Historique détaillé
    ├── AUDIT-COMPTABILITE.md     # Audit comptable
    ├── UI-UX-AUDIT.md            # Audit UI/UX
    └── UI-UX-REFACTOR-REPORT.md  # Rapport refonte UI
```

---

## 6. Modules JavaScript

### 6.1 config.js (209 lignes)
**Responsabilité** : Constantes métier immuables

```javascript
const MOIS_NOMS = ["Janvier", "Fevrier", ...];
const FONCTIONS = ["Membre", "President", ...];
const CATEGORIES_DEPENSE = ["Transport", "Nourriture", ...];
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

### 6.2 utils.js (415 lignes)
**Responsabilité** : Fonctions utilitaires pures sans effet de bord

- `fmt(n)` : Formatage monétaire (12000 → "12 000 F")
- `fmtDate(iso)` : Formatage date (2026-09-29 → 29/09/2026)
- `esc(str)` : Protection XSS (échappement HTML)
- `uid()` : Génération UUID v4
- `compressImage()` : Compression JPEG via Canvas
- `telechargerFichier()` : Téléchargement côté client

### 6.3 db.js (1919 lignes)
**Responsabilité** : Couche d'accès aux données

#### Tables IndexedDB (Schéma v8)
```javascript
{
  membres: "id, nom, prenom, statut, mois_anniversaire",
  sessions: "id, nom",
  dimanches: "id, id_session, date, statut",
  anniversaires_du_jour: "id, id_dimanche, id_membre_fete",
  paiements: "id, id_dimanche, id_membre",
  remboursements: "id, id_membre, id_paiement_concerne",
  caisse_mouvements: "id, date, type, categorie",
  parametres: "cle",
  activity_log: "++seq, date, entite, action",
  listes: "id, nom, date, archivee, type",
  liste_membres: "id, id_liste, id_membre",
  prets_membres: "id, id_dimanche, id_debiteur, id_preteur, id_paiement",
  liste_frais: "id, id_liste",
  liste_paiements: "id, id_liste, id_membre"
}
```

#### Principe : Event Sourcing
- **JAMAIS** de totaux stockés
- Tous les montants sont recalculés depuis l'historique
- `montant_paye` = `Σ historique_paiements`
- Garantit cohérence et traçabilité

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

### 6.9 app.js (3657 lignes) ⚠️ PROBLÈME
**Responsabilité ACTUELLE** : Trop de responsabilités

**Contient actuellement :**
- 69 fonctions
- 19 fonctions `render*` (Accueil, Membres, Dimanches, Finances, Activités, Calendrier)
- 22 fonctions `open*` (Modales, sheets, formulaires)
- Logique métier finances
- Logique métier activités
- Logique métier calendrier
- Export PDF/Excel
- Système de sauvegarde
- Recherche globale
- Graphiques Canvas

**À REFACTORISER** : Voir section 29 Dette Technique

---

## 7. Base de Données IndexedDB

### Nom de la Base
```javascript
const db = new Dexie("m3d_db");
```

### Schéma Actuel : Version 8

#### Évolution du Schéma
- **v1** : Membres, sessions, dimanches, paiements
- **v2** : Cotisation personnalisée Eric (1000F)
- **v3** : Module listes personnalisées
- **v4** : Prêts entre membres
- **v5** : Index `id_paiement` manquant (fix crash)
- **v6** : Activités multi-frais + historique paiements
- **v7** : Métadonnées événements (lieu, heure, responsable)
- **v8** : Dépenses avec catégories

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
  annulee: boolean,
  couleur: string (#RRGGBB),
  icone: string ("star" | "calendar" | ...)
}
```

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
// sw.js v33
const CACHE_NAME = "m3d-cache-v33";

// Tous les assets critiques
const ASSETS = [
  "./",
  "./index.html",
  "./css/*.css",
  "./js/*.js",
  "./js/modules/*.js",
  "./icons/*.png",
  "https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js",
  "https://fonts.googleapis.com/css2?family=Inter..."
];
```

### Incrémentation Version Cache
À chaque modification des assets, incrémenter `CACHE_NAME` dans `sw.js` :
```javascript
const CACHE_NAME = "m3d-cache-v34"; // ← Incrémenter ici
```

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
✅ **XSS** : `esc(str)` systématique avant injection HTML  
✅ **Couleurs** : `safeColor(c)` valide format #RRGGBB  
✅ **Mots de passe** : Hash SHA-256 + salt, jamais en clair  
✅ **Verrouillage** : Auto après 30 min d'inactivité  
✅ **Import JSON** : Validation structure avant écriture  

### Limites Connues
❌ **IndexedDB non chiffrée** : Données en clair sur l'appareil  
❌ **Pas de multi-utilisateurs** : Un seul admin  
❌ **Pas de récupération MDP** : Pure offline  
❌ **localStorage accessible** : Thème, timestamps non sensibles  

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
7. **app.js** : Orchestration, pas de logique métier lourde

### Règle d'Or
> Si une fonction fait plus de 50 lignes, vérifier si elle peut être découpée.

---

## 20. Tests

### État Actuel
⚠️ **Pas de tests automatisés dans le dépôt**

### Tests Mentionnés (RAPPORT.md)
- `test_activites.mjs` : Tests logique métier pure (Dexie + fake-indexeddb)
- `test_ui.mjs` : Tests DOM complet (jsdom)

**ACTION REQUISE** : Intégrer les tests dans le dépôt.

### Plan de Tests Futur
```text
tests/
├── db/
│   ├── migrations.test.js      # Migrations v1→v8
│   └── integrity.test.js       # Cohérence données
├── modules/
│   ├── membres.test.js
│   ├── cotisations.test.js
│   ├── finances.test.js
│   └── activites.test.js
└── utils/
    ├── formatage.test.js       # fmt, fmtDate
    └── securite.test.js        # esc, safeColor
```

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

**Version :** 1.8.2  
**Date :** 2026-09-27  
**Schéma DB :** v8  
**Service Worker :** v33  

### Calcul Version
- **MAJOR** : Refonte complète, breaking changes schéma DB
- **MINOR** : Nouvelles fonctionnalités, migrations additives
- **PATCH** : Corrections bugs, optimisations sans changement API

---

## 23. Historique des Versions

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
✅ Export/Import JSON complet  
✅ Export PDF imprimable  
✅ Thème clair/sombre  
✅ PWA installable offline  
✅ Authentification admin  
✅ Verrouillage automatique  
✅ Recherche globale  
✅ Graphiques Canvas (évolution caisse, anniversaires)  

---

## 25. Fonctionnalités en Cours

🔄 Refactorisation `app.js` (3657 lignes → modules)  
🔄 Ajout tests automatisés  
🔄 Correction fichier VERSION  

---

## 26. Fonctionnalités à Venir

📋 Export Excel/CSV  
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

### ⚠️ Fonctions esc() et safeColor()
Protections XSS critiques. Toute modification doit être auditée.

### ⚠️ Service Worker CACHE_NAME
**TOUJOURS** incrémenter après modification assets.  
Oubli = utilisateurs gardent anciennes versions en cache.

---

## 29. Dette Technique

### 🔴 Critique : app.js Trop Volumineux
**Problème** : 3657 lignes, 69 fonctions, responsabilités multiples  
**Impact** : Maintenabilité difficile, risque de régression  
**Solution** : Découper en modules par domaine

#### Plan de Refactorisation
```text
app.js (3657 lignes)
    ↓
modules/
├── finances.js         ← renderCaisse, renderDettes, renderPrets, openMouvement, openAjuster
├── activites.js        ← renderActivites, renderListes, openListeDetail, openFraisForm
├── calendrier.js       ← renderCalendrier, renderMois, renderSemaine, renderJour
├── exports.js          ← exportPDF, exportExcel, openPrintableWindow
├── recherche.js        ← wireGlobalSearch, runGlobalSearch
├── graphiques.js       ← drawCaisseChart, drawMonthBarChart, drawDonutChart
└── systeme.js          ← renderSysteme, backup, restore, reinitialiser
```

**Estimation** : app.js devrait tomber à ~500-800 lignes (orchestration pure).

### 🟡 Moyen : Fichier VERSION Corrompu
**Problème** : UTF-16 LE avec BOM, contient instructions Git  
**Impact** : Pollution dépôt, confusion version  
**Solution** : Convertir UTF-8, contenu = version seule

### 🟡 Moyen : Absence .gitignore
**Problème** : Risque commit accidentel données sensibles  
**Impact** : Sauvegardes JSON peuvent fuiter dans dépôt  
**Solution** : Créer `.gitignore` complet

### 🟡 Moyen : Tests Absents
**Problème** : Tests mentionnés dans RAPPORT.md mais pas dans dépôt  
**Impact** : Régressions non détectées  
**Solution** : Intégrer test_activites.mjs, test_ui.mjs

### 🟢 Faible : Historique Git Redondant
**Problème** : Commits "fix:Mise a jour" successifs  
**Impact** : Lisibilité historique  
**Solution** : Conventional Commits à l'avenir

---

## 30. Changelog

Voir fichier dédié : [CHANGELOG.md](CHANGELOG.md)

---

## Notes de Maintenance

### Avant Toute Modification
1. ✅ Lire ce fichier CLAUDE.md entièrement
2. ✅ Vérifier les dépendances du module concerné
3. ✅ Tester en local (avec et sans Service Worker)
4. ✅ Vérifier console navigateur (aucune erreur)
5. ✅ Tester offline (désactiver réseau)
6. ✅ Incrémenter version si nécessaire
7. ✅ Mettre à jour CHANGELOG.md
8. ✅ Mettre à jour CLAUDE.md si changement architectural

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

---

**Dernière mise à jour de ce document :** 2026-09-29  
**Responsable :** Développeur principal M3D  
**Contact technique :** [À compléter]
