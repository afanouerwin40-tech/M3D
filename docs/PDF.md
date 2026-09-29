# Le Système d'Impression PDF — M3D Gestion

M3D Gestion permet de générer des rapports professionnels au format PDF sans aucun serveur. Ce document explique comment fonctionne cette "chaîne de production".

---

## 1. Architecture du système PDF

Pour éviter de réécrire le code de mise en page dans chaque module, nous avons divisé le système en trois couches dans `js/services/pdf/` :

1. **Le Socle (`socle.js`)** : Les fondations. Définit les couleurs, la taille de la page (A4), l'en-tête, le pied de page et le style CSS (tableaux, polices).
2. **Les Composants (`composants.js`)** : Les briques de construction. Des fonctions simples pour créer un tableau, une liste ou un résumé financier.
3. **Les Rapports (`rapports.js`)** : Les recettes. Utilise le socle et les composants pour assembler les données réelles et produire le rapport final.

---

## 2. La Chaîne de Production : de la Donnée au PDF

Le flux est toujours le même :

1. **Collecte** : Le module appelant (ex: `membres.js`) récupère les données depuis IndexedDB.
2. **Préparation** : Le module appelle une fonction de `rapports.js` (ex: `rapportMembrePDF(id)`).
3. **Mise en page** : `rapports.js` utilise les briques de `composants.js` pour transformer les données en HTML propre.
4. **Injection** : `socle.js` enveloppe ce HTML dans une structure de document complète (avec style CSS et en-tête).
5. **Impression** : `socle.js` ouvre une fenêtre (`openPrintableWindow`), y injecte le document et lance la commande `window.print()`.

---

## 3. Identité Visuelle (Palette Terracotta)

Le design des PDF est aligné sur l'application. Il utilise la palette `PDF_COULEURS` définie dans le socle :
- **Primaire (Terracotta)** : `#B45309` (titres, lignes de total).
- **Texte** : `#1C1917` (noir chaud).
- **Muted** : `#78716C` (gris pour les détails).
- **Fond de ligne** : `#FAFAF9` (alternance dans les tableaux).

---

## 4. Les 5 Rapports Standards

| Fonction | Usage |
|---|---|
| `rapportMembrePDF(id)` | Fiche individuelle complète (Résumé, Collecte, Dettes, Prêts). |
| `rapportActivitePDF(id)` | Bilan d'un événement (Frais, Participants, Dons reçus). |
| `rapportCotisationPDF(id)` | Feuille de présence pour un dimanche donné. |
| `rapportDonsPDF(filtres)` | Synthèse et détail des dons, avec ventilation par activité. |
| `rapportFinancierPDF()` | Bilan global de la caisse, des dettes et des mouvements. |

---

## 5. Sécurité : Protection XSS

C'est un point critique. Puisque nous générons du HTML pour l'imprimer, nous devons nous assurer qu'un utilisateur malveillant ne peut pas injecter du code (ex: mettre un script dans son nom).

**Règle absolue** : Toute donnée utilisateur affichée dans un PDF **DOIT** passer par la fonction `esc()`.
- Cela transforme les `<` en `&lt;`, empêchant le navigateur d'interpréter du texte comme du code.
- Le titre de la fenêtre d'impression est également protégé.

---

## 6. Maintenance : Ajouter un rapport

Si vous devez créer un nouveau type d'export :

1. Créez votre fonction dans `js/services/pdf/rapports.js`.
2. Utilisez `pdfTableau()` de `composants.js` pour vos listes (elle gère automatiquement le cas "Aucune donnée").
3. Terminez votre fonction par un appel à `pdfOuvrirEtImprimer(titre, html)`.
4. Enregistrez votre nouvelle fonction dans `tools/identifiants-attendus.txt` pour les tests de cohérence globale.
