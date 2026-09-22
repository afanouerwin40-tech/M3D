# Changelog - M3D Gestion

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

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