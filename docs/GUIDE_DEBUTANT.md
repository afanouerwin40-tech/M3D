# Guide du Débutant — M3D Gestion

Version : 1.9.0  
Pour qui : un étudiant ou nouveau développeur qui ouvre le projet pour la première fois.  
Langue : français, avec explications des termes techniques au moment où ils apparaissent.

---

## 1. Qu'est-ce que M3D Gestion ?

Une application de gestion d'association, entièrement dans le navigateur, sans serveur. Elle gère :

- un annuaire de membres (photos, rôles, anniversaires) ;
- des cotisations hebdomadaires (500 FCFA par dimanche) ;
- une caisse commune (entrées, sorties, solde) ;
- des dettes entre membres et des prêts ;
- des activités (sorties, réunions, voyages) avec frais modulaires et paiements échelonnés ;
- des dons par activité ;
- des rapports PDF.

Le nom « M3D » est le nom de l'association. Le logiciel est pensé pour être installé sur téléphone ou tablette, et fonctionner sans internet après la première ouverture.

## 2. Technologies utilisées

| Technologie | À quoi elle sert | Pourquoi elle est là |
|---|---|---|
| HTML5 | La structure de la page | Une seule page (`index.html`), pas de plusieurs fichiers à lier |
| CSS3 (variables, media queries) | Les couleurs, le responsive | Un design unique qui s'adapte au téléphone, au desktop, et à l'impression PDF |
| Vanilla JavaScript (ES6+) | Toute la logique | Pas de React, pas de Vue : le code est directement lisible, pas de transpilation |
| Dexie.js 3.2.4 | Accès à la base de données locale | Un « wrapper » qui rend plus simple d'utiliser IndexedDB (la base du navigateur) |
| IndexedDB | Stockage des données | Plus grand que le `localStorage`, avec des requêtes par index et des transactions |
| Service Worker | Mise en cache offline | Copie les fichiers dans le navigateur pour travailler sans connexion |
| Canvas API | Graphiques et compression photos | Dessiner les courbes de caisse et réduire la taille des portraits |

Le mot **Vanilla** signifie « sans ajout » : pas de framework. C'est volontaire, pour que le code survive aux modes et aux mises à jour de version d'un framework.

Le terme **PWA** (Progressive Web App) désigne une application web qui peut s'installer comme une application native (bientôt sur Android, via le menu du navigateur, et sur iOS via le partage « Sur l'écran d'accueil »).

## 3. Lancer le projet

```bash
# Depuis le dossier racine du projet (F:\projet\M3D)
python -m http.server 8080
# Ou, avec Node :
npx serve .
```

Puis ouvrir `http://localhost:8080` dans un navigateur.

Pour voir la base de données sur le navigateur : dans DevTools (F12) → onglet Application → IndexedDB → `m3d_db`. C'est utile pour comprendre où vivent les données.

Pour tester en mode développement : `Ctrl+Shift+R` (rechargement dur) pour contourner le cache du Service Worker après chaque modification de CSS ou de JS.

Pour tester hors ligne : désactiver la connexion Wi-Fi, recharger la page : elle doit fonctionner de la même manière.

## 4. Structure des dossiers

```text
M3D/
├── index.html      ← Point d'entrée unique : charge tous les scripts dans l'ordre
├── css/            ← Style (variables, base, composants, responsive)
├── js/             ← Tout le code
│   ├── config.js   ← Constantes (mois, fonctions, catégories de dépense)
│   ├── utils.js    ← Fonctions utilitaires (formatage, dates, échappement XSS)
│   ├── db.js       ← La base de données (IndexedDB via Dexie)
│   ├── state.js    ← L'état global (onglet actif, thème, session)
│   ├── ui.js       ← Les composants réutilisables (modales, toasts, confirmations)
│   ├── app.js      ← L'orchestrateur : route entre les onglets
│   └── modules/    ← Logique métier par domaine
│       ├── accueil.js      ← Tableau de bord
│       ├── membres.js      ← Annuaire
│       ├── cotisations.js  ← Collectes hebdomadaires
│       ├── finances.js     ← Caisse, dettes, prêts
│       ├── activites.js    ← Activités, frais, calendrier
│       ├── dons.js         ← Dons
│       ├── recherche.js    ← Recherche globale
│       ├── graphiques.js   ← Graphiques Canvas
│       ├── exports.js      ← Points d'entrée des exports (PDF, JSON)
│       └── systeme.js      ← Sauvegarde, paramètre, thème, auth
└── docs/           ← La documentation technique (ce guide, ARCHITECTURE.md, ...)
```

Le fichier `CLAUDE.md` (à la racine) est la mémoire technique du projet : versions, schéma de base, règles de migration, points sensibles. Il est destiné aux développeurs qui maintiennent le code.

## 5. Comment l'application démarre

Dans `index.html`, les scripts sont chargés **dans un ordre précis** :

1. Dexie.js (la bibliothèque de base de données) ;
2. `config.js` (les constantes) ;
3. `utils.js` (les fonctions utilitaires) ;
4. `db.js` (la base de données — ouvre `m3d_db`) ;
5. `state.js` (l'état global) ;
6. `ui.js` (les composants visuels) ;
7. Les modules (`accueil.js`, `membres.js`, ...) ;
8. `app.js` (l'orchestrateur, qui appelle `start()`) ;
9. Le Service Worker (`sw.js`) ;

Dans `app.js`, la fonction `start()` fait ceci, dans cet ordre :

- ouvre la base (`ouvrirBase()` — compare aussi la version du schéma) ;
- initialise la base si elle est vide (`seedIfEmpty()` — crée des données de démo) ;
- active le Service Worker (cache des fichiers pour le hors-ligne) ;
- vérifie si un mot de passe administrateur est configuré ;
- vérifie si la session est déjà authentifiée (`sessionStorage`) ;
- verrouille si le temps d'inactivité dépasse 30 minutes ;
- affiche l'onglet actif (`showTab()`).

Si la base est en version ancienne, `ouvrirBase()` affiche un message explicite et s'arrête — l'application ne démarre pas avec une base incohérente.

## 6. Comprendre JavaScript (pour ce projet)

Le code utilise des concepts, expliqués ici au moment où ils apparaissent dans les fichiers.

- `const` et `let` : pour déclarer des variables. `const` signifie que la variable ne peut pas être réassignée (elle reste la même tout au long du fichier). `let` peut être réassigné.
- `function nom() { ... }` : définit une fonction. Dans ce projet, toutes les fonctions sont en français (`calculerMontant`, `rendreMembres`).
- `async function nom() { ... }` : définit une fonction qui peut attendre des opérations qui prennent du temps (lecture de base, chargement de fichier) sans bloquer le reste de la page. L'utilisateur continue d'interagir pendant ce temps.
- `await expression` : attend que `expression` se termine (par exemple `await db.membres.get(id)` attend la lecture du membre dans la base). Il ne bloque pas le reste du navigateur, mais il fait attendre la suite de la fonction jusqu'à ce que le résultat arrive.
- `Promise` : un objet qui représente une valeur qui n'est pas encore là, mais qui le sera. `await` attend cette promesse. `Promise.all([...])` attend plusieurs promesses en parallèle.
- `map()` : transforme chaque élément d'un tableau en un nouveau tableau (par exemple, `membres.map(m => m.nom)` donne tous les noms).
- `filter()` : conserve seulement les éléments qui satisfont une condition (par exemple, `membres.filter(m => m.statut === "Actif")`).
- `reduce()` : combine tous les éléments d'un tableau en un seul résultat (par exemple, `montants.reduce((s, m) => s + m, 0)` fait la somme).
- `try { ... } catch (e) { ... }` : essaie un bloc ; si une erreur survient (base corrompue, fichier invalide), le bloc `catch` la gère sans faire planter tout le reste.
- `document.querySelector("#id")` : trouve le premier élément HTML qui correspond au sélecteur CSS.
- `innerHTML` : remplace tout le contenu HTML d'un élément. C'est rapide, mais il faut faire attention à ne pas y mettre du contenu non échappé (risque XSS). C'est pourquoi le projet utilise `esc()` avant de mettre des noms dans l'HTML.
- `addEventListener("click", f)` : attache une fonction `f` au clic sur un élément. Quand l'utilisateur clique, `f` est appelée.
- `setTimeout(f, ms)` : appelle `f` après `ms` millisecondes.

Le terme **dépendance** signifie : « ce fichier a besoin que l'autre soit chargé avant ». L'ordre dans `index.html` n'est pas un hasard.

Le terme **injection de dépendances** signifie : au lieu d'appeler directement `openARelancerSheet()`, la fonction la reçoit en paramètre (`openARelancerSheet` est passé). Cela permet de tester la fonction avec de fausses fonctions, sans avoir besoin du navigateur.

## 7. Les modules (par domaine)

### 7.1 `accueil.js` — Le tableau de bord

Trois fonctions : une qui construit la liste des alertes, une qui produit le HTML, une qui attache les clics. Le HTML complet de l'onglet Accueil est dans `app.js` (`renderAccueil`), pas ici.

Le module n'accède pas au DOM directement (sauf pour attacher les écouteurs) : il reçoit tout en paramètres (`irreguliersIds`, `aRelancer`, `pretsEnAttenteArray`). C'est la raison pour laquelle les tests automatisés (`tools/test-*.js`) peuvent l'utiliser sans navigateur.

### 7.2 `membres.js` — L'annuaire

Affiche la liste des membres avec des filtres (fonction, mois d'anniversaire, statut) et un tri (alphabétique, par date d'anniversaire). Chaque membre a une fiche détaillée (`openMemberDetail` dans `app.js`) qui montre ses dettes, ses paiements, et permet d'éditer ou de supprimer.

Le nom du membre est toujours échappé (`esc()`) avant d'être mis dans le HTML, même dans le titre de la fenêtre d'impression PDF.

### 7.3 `cotisations.js` — Les collectes

Gère la liste des dimanches (les dates de collecte), et le détail de chaque dimanche : qui a payé, qui n'a pas payé, le montant attendu, le montant réel. Utilise `data-auj-id` pour lier le HTML au comportement, plutôt que l'index dans la liste.

### 7.4 `finances.js` — Caisse, dettes, prêts

Affiche la caisse, la liste des dettes impayées (avec le nom de celui qui a remboursé, qui est volontairement conservé même si le membre est supprimé), et les prêts entre membres.

Le suivis du remboursement (`remboursements`) conserve le nom du remboursant (`nom_rembourseur`) de manière volontaire : il doit survivre à la suppression du membre et à son renommage. La fiche membre, elle, affiche le nom actuel.

### 7.5 `activites.js` — Activités et calendrier

Le module le plus gros (951 lignes). Il contient le calendrier (trois vues : mois, semaine, jour), le formulaire d'activité, la fiche de l'activité avec ses frais et ses paiements échelonnés, et le calendrier de la semaine.

Le calcul `jSem = (getDay() + 6) % 7` convertit le numéro de jour JavaScript (0 = dimanche, 1 = lundi) en position dans une semaine qui commence le lundi.

### 7.6 `dons.js` — Les dons

Enregistre un don (montant, membre, activité optionnelle, date, note), affiche une synthèse par activité, et permet l'export PDF des dons filtrés. Les dons généraux (sans activité liée) sont autorisés.

### 7.7 `recherche.js` — La recherche globale

Effectue une recherche transversale sur les membres, les activités, les cotisations et les dons, en fonction des caractères tapés dans la barre de recherche.

### 7.8 `graphiques.js` — Canvas

Dessine des courbes (évolution de la caisse, anniversaires par mois, répartition des dépenses) sur un `<canvas>`. Vérifie le rendu sur écran Retina (`devicePixelRatio`) et adapte le tracé aux variables CSS du thème (clair/sombre).

### 7.9 `exports.js` — Les exports

Définit `openPrintableWindow()` (le seul point d'ouverture d'une fenêtre d'impression) et délègue la mise en forme aux 5 rapports PDF sous `services/pdf/`. Ne contient plus de mise en forme directement.

## 8. IndexedDB et Dexie

IndexedDB est la base de données du navigateur, qui permet de stocker plusieurs Mo de données (le `localStorage` est limité à 5-10 Mo). Dexie est une bibliothèque qui rend l'utilisation plus simple : au lieu d'écrire du code bas niveau, on écrit `db.membres.get(id)`.

Dans `db.js`, le schéma est défini avec `db.version(9).stores({...})`. Quand la base évolue (nouvelle table, nouveau champ), on crée une nouvelle version (`db.version(10)`) et on écrit une migration idempotente (vérifie si déjà appliquée, sinon applique).

Le principe est le **Event Sourcing** : aucun total n'est stocké. Tout est recalculé depuis l'historique. Par exemple, le montant payé d'un membre est la somme de ses lignes dans `paiements`, pas un champ `montant_paye` stocké et potentiellement désynchronisé.

Pour lire un membre : `await db.membres.get("M-12345")`. Pour lire plusieurs : `await db.membres.toArray()`. Pour filtrer : `await db.membres.where("statut").equals("Actif").toArray()`.

## 9. `async / await`

Le projet fait un usage intensif d'`async` et `await` parce que presque toutes les opérations sont des lectures de base (qui prennent du temps, même si elles sont rapides en apparence).

Une fonction `async function nom() { ... await ... }` renvoie une `Promise`. Le code qui l'appelle doit aussi utiliser `await` (ou `.then()`). Dans `app.js`, `renderAccueil()` est `async` parce qu'elle attend 14 requêtes en parallèle via `Promise.all([...])`.

Le terme `await` signifie : « attends que cela se termine, mais n'empêche pas le reste du navigateur de fonctionner ». L'utilisateur peut continuer de scroller ou de cliquer pendant ce temps.

Le terme `try / catch` est utilisé autour des opérations qui peuvent échouer : lecture d'un fichier de sauvegarde (`importBackup`), ouverture de la base (`ouvrirBase()` avec un délai de 10 secondes en cas de blocage), et écriture dans la base.

Le terme `Promise` est le concept sous-jacent : un objet qui représente une valeur qui n'est pas encore là.

## 10. Authentification

Un seul mot de passe administrateur. Il est stocké sous forme de **hash SHA-256 avec un sel** (une chaîne aléatoire). Quand l'utilisateur tape son mot de passe, le logiciel calcule le hash du mot de passe combiné au sel, et compare au hash stocké. Le mot de passe lui-même n'est jamais enregistré en clair.

Le mot de passe est demandé au démarrage (si pas déjà authentifié dans `sessionStorage`), et toutes les 30 minutes d'inactivité (`visibilitychange`). Après 30 minutes, la session est verrouillée automatiquement.

Le terme **hash** signifie : une fonction qui transforme une chaîne en une autre chaîne, de manière irréversible. On ne peut pas retrouver le mot de passe original depuis le hash.

Le terme **sel** (ou *salt*) est une chaîne aléatoire ajoutée avant le hash : il empêche qu'un même mot de passe donne le même hash sur deux appareils, et rend plus difficile la recherche par force brute.

Le terme **sessionStorage** est une zone de stockage du navigateur, différente du `localStorage` : elle est vidée quand l'onglet est fermé. C'est pourquoi on utilise `sessionStorage` pour l'authentification (`m3d_authed`) : si l'utilisateur ferme l'onglet et le rouvre, il doit se reconnecter.

## 11. Le rendu HTML

Le projet ne construit pas le HTML d'une page unique à l'avance : il le reconstruit à chaque changement d'onglet (`showTab`) et parfois après chaque action (cocher un paiement, filtrer une liste). C'est rapide parce que le nombre d'éléments est petit (quelques dizaines de lignes au maximum).

Le terme **innerHTML** signifie : remplacer tout le contenu d'un élément HTML. C'est rapide, mais il faut faire attention : si on met directement `innerHTML = "<div>" + nom + "</div>"` sans échapper `nom`, un utilisateur malveillant pourrait injecter du code. C'est pourquoi `esc()` est utilisée systématiquement avant tout contenu utilisateur.

Le terme **XSS** (Cross-Site Scripting) désigne l'injection de code malveillant dans une page web. La protection consiste à remplacer `<` par `&lt;`, `>` par `&gt;`, `"` par `&quot;`, `&` par `&amp;`, dans tout texte qui vient de l'utilisateur.

Le terme **injecter** signifie : mettre du contenu dans un élément HTML. Le projet injecte du HTML généré (pas du HTML écrit à la main) pour chaque partie de l'interface.

## 12. Les activités

Une activité a un nom, une date, un lieu, une heure, un responsable, un type (`reunion`, `sortie`, `voyage`, ...). Elle a aussi un budget (facultatif), des frais modulaires, et une liste de participants avec leurs paiements échelonnés.

Le calendrier montre trois vues. En vue « mois », on voit toutes les activités du mois sur une grille de 42 cases (6 semaines fixes). En vue « semaine », on voit la semaine autour de la date de référence. En vue « jour », on voit le détail du jour sélectionné.

Le calcul du lundi de la semaine (`jSem`) est nécessaire parce que le calendrier s'affiche par semaine, pas par jour : on doit toujours savoir où commence la semaine pour reconstruire la grille.

Le terme **échelonné** signifie : réparti en plusieurs fois. Un membre peut payer 500 F sur une participation de 1500 F, en trois fois. L'historique conserve chaque paiement avec sa date, ce qui permet de relancer qui n'a pas fini.

## 13. Les cotisations

Une cotisation est un paiement hebdomadaire (par dimanche). Chaque dimanche a un statut (`Planifie`, `En cours`, `Termine`) et une liste de paiements (un par membre, avec `montant_attendu`, `a_paye` booléen, `montant_paye` numérique).

Le montant expected est calculé depuis la cotisation personnalisée du membre (`cotisation_personnalisee`, par défaut 500 FCFA), pas depuis un total stocké.

Le terme **event sourcing** (sourcing d'événements) signifie que tout est recalculé depuis l'historique, pas stocké dans un total. Par exemple, le solde de caisse est la somme des `caisse_mouvements` depuis le début, pas un champ `solde` qui pourrait être désynchronisé.

## 14. Les dons

Un don est enregistré avec : membre, montant, date, note optionnelle, activité optionnelle (si absent, c'est un don général). La synthèse par activité calcule le total, le nombre de donateurs, et la moyenne.

Le formulaire de création et de modification est le même : il n'y a pas d'écran « créer » et d'écran « modifier » distincts. Quand on ouvre un don existant, le formulaire est pré-rempli et le bouton est « Enregistrer » au lieu de « Créer ».

Le terme **synthèse** signifie un récapitulatif (totaux, compteurs, moyennes), pas la liste détaillée.

## 15. Les finances

Le module affiche trois choses : la caisse (entrées et sorties du mois, solde), les dettes (montant, date, et le nom de celui qui a remboursé), et les prêts entre membres.

Le suivi du remboursement conserve volontairement le nom du remboursant (`nom_rembourseur`). Il est volontairement figé : il doit survivre à la suppression du membre et à son renommage. L'écran et l'historique ne racontent pas la même chose par choix.

Le terme **figer** (un nom) signifie : conserver une copie du nom au moment du remboursement, indépendamment des modifications ultérieures du membre.

## 16. Le PDF

Le projet produit des documents PDF via un pipeline : `rapports.js` (logique) → `socle.js` (mise en page) → `composants.js` (briques de tableau) → fenêtre d'impression (`openPrintableWindow` dans `exports.js`).

Le format est HTML injecté dans une fenêtre d'impression, pas un document PDF natif. C'est un choix délibéré : le navigateur sait déjà imprimer du HTML, et cela évite d'intégrer une bibliothèque PDF lourde.

Tous les noms d'utilisateur sont échappés (`esc()`) avant d'être injectés, y compris dans le titre du document imprimé (`<title>`). C'était une faille corrigée en v1.9.0.

Le terme **palette terracotta** désigne les couleurs du design (un orange-brun profond, `#B45309` et dérivés), définies dans `variables.css` et utilisées dans `PDF_COULEURS`.

## 17. Les schémas (ASCII)

Voici deux schémas simples, pour comprendre les relations entre les données.

### Schéma membre

```text
MEMBRE (id, nom, prenom, fonction, statut)
  ├─ Cotisations ◄── dt dimanches (id, id_session, date)
  │                 └── paiements (id, id_dimanche, id_membre, montant_paye)
  ├─ Activités ◄────── listes (id, nom, date, lieu)
  │                 ├── liste_frais (id, id_liste, libelle, montant)
  │                 └── liste_paiements (id, id_liste, id_membre, montant, date)
  ├─ Dons ◄─────────── dons (id, id_membre, id_activite?, montant, date)
  ├─ Dettes / Prêts ◄─ paiements (pour dettes) / prets_membres (pour prêts)
  └─ Anniversaires ◄── anniversaires_du_jour (id, id_dimanche, id_membre_fete)
```

### Schéma activité

```text
ACTIVITÉ (id_liste)
  ├─ Participants ◄── liste_membres (id_liste, id_membre)
  ├─ Frais ◄──────── liste_frais (id_liste, libelle, montant)
  ├─ Paiements ◄──── liste_paiements (id_liste, id_membre, montant, date)
  ├─ Dons reçus ◄─── dons (id_activite, id_membre, montant, date)
  └─ Finances ◄───── caisse_mouvements (date, type, categorie, montant)
```

Le terme **relation** signifie ici une référence : une clé qui pointe vers une autre ligne d'une autre table (par exemple, `id_membre` dans `dons` pointe vers le membre).

## 18. Les flux métier (exemple : ajouter un don)

1. L'utilisateur ouvre l'onglet Dons (`showTab("dons")`).
2. Il clique sur « Nouveau don » (`openDonForm`).
3. Le formulaire s'affiche (le même que pour modifier). Il remplit le membre, le montant, la date, la note, et éventuellement l'activité.
4. Il valide (`enregistrerDon`).
5. Une nouvelle ligne est créée dans `db.dons`, avec un UUID (`uid()`).
6. La synthèse est recalculée (`syntheseDons`) : la somme des montants, le nombre de donateurs, et la moyenne sont recomptés depuis la base.
7. La liste est réaffichée (`renderDonsListe`).

Le terme **recalculé** signifie : le résultat n'est pas stocké, il est recalculé chaque fois qu'il est demandé. C'est le principe d'event sourcing : la source de vérité est l'historique, pas un total stocké.

## 19. Les `try / catch`

Chaque `try / catch` correspond à un cas où quelque chose peut échouer, et où l'application doit montrer un message à l'utilisateur au lieu de s'arrêter.

- `ouvrirBase()` : la base peut être bloquée (un autre onglet la tient ouverte sur une version ancienne). Un délai de 10 secondes est posé : au-delà, un message explicite s'affiche.
- `importBackup() : le fichier peut être corrompu, avoir une structure inconnue, ou être vide. L'erreur est affichée en toast.
- `openDonForm()` / `openListeForm()` : le formulaire est pré-rempli avec des données existantes. Si le membre ou l'activité a été supprimé entre-temps, la fonction retourne sans planter.
- `renderAccueil()` : si une requête échoue (base indisponible), les données manquantes sont ignorées et un message d'alerte est affiché.

Le terme **toast** désigne une notification éphémère qui disparaît après quelques secondes. Elle est utilisée pour les confirmations (« Sauvegarde restaurée ») et les erreurs (« Fichier invalide »).

## 20. Comment ajouter une fonctionnalité (12 étapes)

1. Lire `CLAUDE.md` (§6, le module concerné, et §28 pour les règles de sécurité).
2. Vérifier si la table de données existe (`CLAUDE.md` §7 et `db.js`). Si non, créer une nouvelle version Dexie avec migration idempotente.
3. Documenter la fonction (`@file` en haut du fichier, `@param`, `@returns`, `@sideEffect`, `@why`).
4. Écrire le code dans le bon module (ne pas mettre la logique métier dans `app.js`).
5. Utiliser `esc()` pour tout contenu utilisateur avant injection HTML.
6. Vérifier le comportement avec `node --check` et le tokenizer (`strip.js`).
7. Tester l'interface dans le navigateur (`localhost:8080`, `Ctrl+Shift+R`).
8. Tester hors ligne (désactiver le Wi-Fi, recharger).
9. Lancer les tests automatisés (`node tools/test-*.js`).
10. Vérifier que `verify-globals.js` passe (118 identifiants).
11. Si un nouvel identifiant global est ajouté, l'ajouter à `identifiants-attendus.txt`.
12. Créer le commit : `docs: documenter le code et l'architecture du projet` (ou le message adapté au travail réalisé).

Le terme **commit** est une sauvegarde du dépôt Git. Chaque modification doit être enregistrée avec un message explicite.

---

*Guide créé pour la documentation pédagogique du projet M3D — version 1.9.0, 2026-09-29.*

Le fichier `CLAUDE.md` est la mémoire technique de référence ; `docs/ARCHITECTURE.md` décrit l'architecture complète ; `docs/BASE_DE_DONNEES.md` documente chaque table ; `docs/PWA.md` décrit le fonctionnement hors ligne ; `docs/PDF.md` décrit la chaîne de production des rapports ; `docs/FLUX_METIER.md` décrit les flux (ajout d'un don, d'une activité, etc.).
