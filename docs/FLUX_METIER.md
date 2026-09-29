# Flux Métier — M3D Gestion

Ce document détaille les principaux flux de travail (workflows) de l'application, étape par étape, du point de vue de l'utilisateur et du code.

---

## 1. Ajouter un Don

C'est le flux le plus simple pour comprendre la circulation des données.

1.  **Interface** : L'utilisateur ouvre l'onglet **Dons** et clique sur "Nouveau don" (`openDonForm`).
2.  **Préparation** : Le module `dons.js` ouvre une "bottom sheet" (modale) avec un formulaire vide ou pré-rempli.
3.  **Saisie** : L'utilisateur sélectionne un membre, saisit le montant, la date, une note et choisit éventuellement une activité liée.
4.  **Validation** : Au clic sur "Enregistrer", la fonction `enregistrerDon` est appelée.
5.  **Sécurité** : Les textes (note) sont récupérés. Ils seront échappés plus tard lors de l'affichage.
6.  **Stockage** : Une ligne est ajoutée à la table `dons` dans IndexedDB via `db.dons.add()`. Un identifiant unique (`uid()`) est généré.
7.  **Recalcul** : La fonction `syntheseDons` parcourt toute la table pour recalculer le total global et la ventilation par activité.
8.  **Rafraîchissement** : L'interface est reconstruite (`renderDonsListe`).
9.  **Notification** : Un message de confirmation (toast) apparaît en bas de l'écran.

---

## 2. Enregistrer une Cotisation Hebdomadaire

Un flux central qui implique plusieurs tables.

1.  **Sélection** : L'utilisateur choisit un dimanche dans l'onglet **Cotisations** (`renderDimancheList`).
2.  **Affichage** : `openNewSunday` (ou `openSundayDetail`) affiche la liste des membres.
3.  **Logique de calcul** : Pour chaque membre, l'application cherche sa `cotisation_personnalisee`. Si elle n'existe pas, elle utilise la constante de base (500 F).
4.  **Action** : L'utilisateur coche la case "Payé" pour un membre (`togglePaiement`).
5.  **Événement** : La fonction met à jour la table `paiements`. Elle ne change pas seulement un booléen, elle enregistre le `montant_paye`.
6.  **Caisse** : Automatiquement, un mouvement est créé (ou mis à jour) dans `caisse_mouvements` pour refléter l'entrée d'argent.
7.  **Répercussion** : Le solde global de la caisse affiché dans l'onglet **Finances** est recalculé au prochain affichage.
8.  **Anniversaires** : Si le dimanche prévoit des fêtés, le montant attendu peut inclure la cotisation spéciale "Anniversaire".

---

## 3. Créer une Activité et Gérer les Frais

Ce flux utilise les "frais modulaires" introduits en v1.9.0.

1.  **Création** : Dans l'onglet **Activités**, l'utilisateur clique sur "+" (`openListeForm`).
2.  **Paramètres** : Il saisit le nom, le type (reunion, sortie, voyage), le lieu et le responsable.
3.  **Frais** : Il ajoute un ou plusieurs frais (ex: "Participation" : 1000F, "Transport" : 500F). Ces frais sont stockés dans la table `liste_frais`.
4.  **Participants** : Il ajoute des membres à l'activité (`ajouterMembreListe`).
5.  **Paiement échelonné** : Un participant peut payer une partie de ses frais. Chaque versement est enregistré dans `liste_paiements` avec date et heure.
6.  **Statut** : Le montant dû par le membre est : `Σ liste_frais` - `Σ liste_paiements` (pour cette activité).
7.  **Clôture** : Une fois l'activité terminée, l'utilisateur peut la "clôturer" pour figer les comptes.

---

## 4. Gérer un Prêt entre Membres

Un flux délicat qui gère la solidarité entre membres.

1.  **Besoin** : Un membre A n'a pas d'argent pour sa cotisation. Un membre B paie pour lui.
2.  **Enregistrement** : L'utilisateur clique sur le bouton de prêt dans la fiche de cotisation du dimanche (`openPretPicker`).
3.  **Lien** : L'application crée une entrée dans `prets_membres` liant le débiteur (A), le prêteur (B) et le paiement concerné.
4.  **Dette** : Le membre A a maintenant une dette envers le membre B. Elle apparaît dans l'onglet **Finances** et sur sa fiche membre.
5.  **Remboursement** : Quand A rembourse B, l'utilisateur enregistre l'action (`openRembourser`).
6.  **Historique** : Une ligne est créée dans `remboursements`. **Important** : Le nom du remboursant est figé à ce moment pour l'historique.
7.  **Solde** : Le prêt passe au statut "Remboursé" et disparaît des dettes actives.

---

## 5. Sauvegarde et Restauration (Le flux de sécurité)

Le seul moyen de ne pas perdre ses données.

1.  **Export** : L'utilisateur va dans **Système** → **Sauvegarde** (`exportBackup`).
2.  **Collecte** : L'application boucle sur la liste blanche `TABLES_APPLICATION`.
3.  **Formatage** : Toutes les données sont transformées en un seul fichier JSON (Version 2).
4.  **Téléchargement** : Le navigateur propose de télécharger le fichier `m3d_backup_DATE.json`.
5.  **Import** : Pour restaurer, l'utilisateur sélectionne son fichier (`importBackup`).
6.  **Guardrails (Sécurité)** :
    - Demande du mot de passe admin avant de lire le fichier.
    - Vérification de la structure du JSON.
    - Nettoyage des tables actuelles avant injection.
7.  **Transaction** : L'écriture se fait dans une transaction unique : si un seul fichier échoue, rien n'est modifié (Atomicité).

---

## 6. Guide de Maintenance (12 étapes pour un développeur)

Pour toute nouvelle fonctionnalité, suivez ce flux de développement :

1.  **Analyse** : Lire `CLAUDE.md` pour comprendre les contraintes.
2.  **Données** : Vérifier si une nouvelle table IndexedDB est nécessaire (`db.js`).
3.  **Sécurité** : Ajouter la table à `TABLES_APPLICATION` dans `systeme.js`.
4.  **Documentation** : Rédiger le JSDoc (Dense, en français, expliquant le "Pourquoi").
5.  **Interface** : Créer les fonctions de rendu dans le module approprié.
6.  **XSS** : Utiliser `esc()` sur chaque donnée saisie par l'utilisateur.
7.  **Offline** : Ajouter les nouveaux fichiers JS au cache (`sw.js`) et incrémenter `CACHE_NAME`.
8.  **Tests de syntaxe** : Vérifier avec `node --check` sur tous les fichiers modifiés.
9.  **Vérification comportement** : Lancer `node tools/strip.js` pour s'assurer qu'aucune logique n'a changé.
10. **Tests fonctionnels** : Lancer `node tools/test-*.js`.
11. **Globals** : Vérifier avec `node tools/verify-globals.js`.
12. **Commit** : Enregistrer les modifications avec un message clair.
