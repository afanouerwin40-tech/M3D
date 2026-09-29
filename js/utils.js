/**
 * @file utils.js - Fonctions utilitaires transversales pures de l'application M3D.
 *
 * ROLE DE CE FICHIER
 * ------------------
 * Ce fichier regroupe des petites fonctions réutilisées partout dans
 * l'application : formatage de montants, formatage de dates, sécurisation
 * anti-XSS, génération d'identifiants uniques, export de fichiers, compression
 * d'images, fabrication de sélecteurs HTML et primitives de dessin Canvas.
 *
 * SES DÉPENDANCES
 * ---------------
 * - config.js : pour les constantes MOIS_NOMS, FONCTIONS, SESSION_TIMEOUT_MS...
 *   (voir la documentation de config.js pour le détail).
 * - Aucun import d'un autre module métier : c'est le deuxième fichier chargé,
 *   juste après config.js, car les autres modules en dépendent.
 *
 * NOTION CLÉ : LA FONCTION PURE
 * ------------------------------
 * Une fonction "pure" est une fonction qui, pour les mêmes entrées, produit
 * toujours la même sortie — et ce, SANS AUCUN EFFET DE BORD.
 *
 * Un "effet de bord" (side effect), c'est quand la fonction modifie quelque
 * chose en dehors de son propre corps :
 *   - écrire dans une variable globale
 *   - écrire dans la base de données
 *   - modifier le DOM (la page affichée)
 *   - envoyer une requête réseau
 *   - écrire dans le localStorage / sessionStorage
 *
 * Exemples :
 *   - PURE    : function double(x) { return x * 2; }
 *   - IMPURE  : function impure(x) { window.compteur = x; return x * 2; }
 *
 * Pourquoi cette distinction est-elle si importante ?
 *   1. Testabilité : une fonction pure se teste sans navigateur, sans base,
 *      sans environnement particulier.
 *   2. Fiabilité : pas d'effet de bord = pas d'effet secondaire inattendu.
 *   3. Compréhension : l'appel d'une fonction pure ne change rien ailleurs
 *      dans le programme, donc on peut le lire et le comprendre isolément.
 *
 * La plupart des fonctions de ce fichier sont "pures" au sens strict
 * (fmt, fmtDate, fullName, initials, esc, uid, dayOptionsHTML...). Quelques-unes
 * sont volontairement "impures" car elles doivent interagir avec le navigateur :
 * c'est le cas de compresserPhoto (lit un fichier), telechargerFichier
 * (déclenche un téléchargement) et roundRectTop (dessine sur un canvas).
 */

// ============================================================================
// FORMATAGE MONÉTAIRE & DE DONNÉES
// ============================================================================

/**
 * Formate un montant numérique en francs CFA avec séparateur de milliers français.
 * Exemple : 12000 devient "12 000 F".
 *
 * DÉTAIL DE L'IMPLÉMENTATION (à lire pour comprendre) :
 *   Math.round(Number(n) || 0) : convertit n en nombre, puis arrondit.
 *     - Number("abc") vaut NaN (Not a Number).
 *     - NaN || 0 vaut 0 car NaN est "falsy" (trompeur). On obtient donc 0
 *       au lieu de "NaN F", ce qui évite un affichage cassé.
 *     - Math.round supprime les centimes : l'application ne gère que des
 *       montants entiers (pas de subdivision du franc CFA).
 *   .toLocaleString("fr-FR") : formate le nombre avec les conventions
 *     françaises (espace comme séparateur de milliers, virgule décimale).
 *
 * @param {number|string} n - Montant à formater (accepte un nombre ou une
 *                            chaîne issue d'un champ de formulaire).
 * @returns {string} Montant formaté suivi de l'abréviation "F".
 */
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " F";

/**
 * Formate une date ISO (YYYY-MM-DD) au format usuel français (JJ/MM/AAAA).
 * L'heure est figée à T00:00:00 afin de neutraliser tout décalage de fuseau horaire.
 *
 * POURQUOI ce soin pour les dates ?
 * Le fuseau horaire est un piège classique en JavaScript. Si on écrit
 * new Date("2026-08-15") (sans heure), certains navigateurs interprètent
 * cette chaîne comme UTC, d'autres comme heure locale. Un utilisateur à
 * Douala (UTC+1) pourrait voir la date affichée comme le 14 août.
 * En découpant nous-mêmes la chaîne en trois morceaux (année/mois/jour)
 * avec .split("-") puis en les réassociant dans l'ordre JJ/MM/AAAA, on évite
 * complètement ce problème : on ne crée jamais d'objet Date à partir de la
 * chaîne brute.
 *
 * Deux stratégies de découpage :
 *   - Cas nominal (3 morceaux) : simple découpage de chaîne, rapide et sûr.
 *   - Cas de secours (autre chose) : on passe par new Date(...) uniquement
 *     si la chaîne n'a pas la forme attendue (ex: avec une heure).
 *
 * @param {string} iso - Date au format ISO (ex: "2026-08-15").
 * @returns {string} Date au format "15/08/2026" (chaîne vide si invalide).
 */
const fmtDate = (iso) => {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.slice(0, 10).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

/**
 * Retourne le nom complet d'un membre (Nom Prénom ou Prénom seul).
 *
 * Pourquoi un fallback sur "?" ? Les listes d'affichage ne doivent jamais
 * afficher "undefined" ou "null" si la fiche membre est absente — le "?"
 * signale visuellement qu'il y a un souci de référence sans casser la mise
 * en page.
 *
 * @param {{ nom?: string, prenom?: string }} m - Fiche membre.
 * @returns {string} Nom complet sans espaces superflus (trim()).
 */
const fullName = (m) => {
  if (!m) return "?";
  return m.nom ? `${m.nom} ${m.prenom}`.trim() : (m.prenom || "?").trim();
};

/**
 * Génère les initiales (2 lettres majuscules) à partir du nom et prénom d'un membre.
 *
 * UTILISÉE PAR : les avatars circulaires affichés quand un membre n'a pas
 * encore de photo. Affiche "AB" pour un membre nommé "Awa BAKAYOKO".
 * Gère les noms à une seule lettre et les fiches incomplètes.
 *
 * @param {{ nom?: string, prenom?: string }} m - Fiche membre.
 * @returns {string} Initiales sur 2 caractères (ou "??" si aucune fiche).
 */
const initials = (m) => {
  if (!m) return "??";
  const first = (m.nom || m.prenom || "?")[0] || "?";
  const second = (m.prenom || "")[0] || "";
  return (first + second).toUpperCase();
};

/**
 * Retourne la date courante locale au format ISO "YYYY-MM-DD".
 *
 * UTILISÉE PAR : pré-remplir les champs date des formulaires (date d'un
 * paiement, d'un don, d'une dépense...).
 *
 * DÉTAIL : getMonth() retourne 0 pour Janvier. On ajoute donc 1 pour obtenir
 * un numéro de mois "humain" (1 à 12). padStart(2, "0") complète avec un zéro
 * à gauche si le nombre n'a qu'un chiffre ("3" devient "03"), pour garantir
 * toujours 10 caractères au total.
 *
 * @returns {string} Chaîne de date sur 10 caractères.
 */
const todayISO = () => {
  const d = new Date();
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
};

/**
 * Convertit une chaîne ISO "YYYY-MM-DD" en objet Date local (sans décalage UTC).
 *
 * CONTRASTE avec fmtDate : ici on crée réellement un objet Date, mais en
 * passant les composantes (année, mois, jour) séparément au constructeur.
 * new Date(2026, 7, 15) crée une date à HEURE LOCALE, contrairement à
 * new Date("2026-08-15") qui peut être interprété en UTC selon le navigateur.
 *
 * Mois - 1 : le constructeur Date utilise une base 0 pour les mois
 * (0 = Janvier), alors que notre format ISO utilise une base 1 (1 = Janvier).
 *
 * @param {string} iso - Date au format ISO "YYYY-MM-DD".
 * @returns {Date} Instance de Date en heure locale.
 */
function isoToDate(iso) {
  const parts = String(iso).slice(0, 10).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/**
 * Convertit un objet Date en chaîne ISO "YYYY-MM-DD".
 *
 * Fonction inverse de isoToDate. Utilisée pour sérialiser une Date vers le
 * format de stockage dans IndexedDB ou pour comparer deux dates (une chaîne
 * ISO se compare lexicographiquement, donc "2026-01-15" < "2026-02-01" est vrai).
 *
 * @param {Date} d - Date valide.
 * @returns {string} Date ISO "YYYY-MM-DD".
 */
function dateToIso(d) {
  const annee = d.getFullYear();
  const mois = String(d.getMonth() + 1).padStart(2, "0");
  const jour = String(d.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

// ============================================================================
// SÉCURITÉ & ANTI-XSS
// ============================================================================

/**
 * Échappement HTML strict contre les failles XSS (Cross-Site Scripting).
 * Obligatoire pour toute variable provenant d'un formulaire ou d'un import JSON
 * avant injection dans des gabarits HTML ou des documents d'impression.
 *
 * QU'EST-CE QU'UNE FAILLE XSS ?
 * -----------------------------
 * XSS signifie "Cross-Site Scripting". Quand l'application affiche une donnée
 * saisie par un utilisateur en l'injectant directement dans le HTML
 * (via innerHTML ou un template literal), un attaquant pourrait glisser du code
 * malveillant dans la donnée pour qu'il soit exécuté par le navigateur.
 *
 * Exemple de risque :
 *   Un membre s'appelle :  <img src=x onerror="alert(document.cookie)">
 *   Si on injecte ce nom tel quel dans du HTML, le navigateur interprète
 *   <img ...> comme une vraie balise et exécute le onerror.
 *
 * COMMENT ON S'EN PROTÈGE ?
 * On "échappe" les caractères spéciaux AVANT de les mettre dans le HTML :
 *   & devient &amp;   → displayed comme "&"
 *   < devient &lt;    → displayed comme "<"
 *   > devient &gt;    → displayed comme ">"
 *   " devient &quot;  → displayed comme '"'
 *   ' devient &#39;   → displayed comme "'"
 * Le navigateur voit alors ces séquences comme du texte, pas comme du code.
 *
 * DÉTAIL DE L'IMPLÉMENTATION :
 *   .replace(/[&<>"']/g, ...) : expression régulière qui cherche
 *     - le motif [ & < > " ' ] : un caractère parmi cet ensemble
 *     - /g : "global", donc on remplace TOUTES les occurrences, pas seulement
 *       la première. Sans le /g, seule la première serait échappée — une
 *       faille de sécurité restante.
 *   Le second argument est une fonction (c) => ... : appelée pour chaque
 *   occurrence trouvée, elle reçoit le caractère et retourne son remplacement
 *   depuis un objet de correspondance.
 *
 * NULL / UNDEFINED : traités comme une chaîne vide pour ne jamais afficher
 * "null" ou "undefined" à l'utilisateur.
 *
 * @param {unknown} s - Valeur potentiellement non sécurisée.
 * @returns {string} Chaîne sécurisée avec entités HTML échappées.
 */
const esc = (s) =>
  String(s === null || s === undefined ? "" : s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

// ============================================================================
// IDENTIFIANTS UNIQUES
// ============================================================================

/**
 * Génère un identifiant unique (UUID v4) universellement compatible.
 *
 * POURQUOI un identifiant unique ?
 * Dans une base de données comme IndexedDB, chaque enregistrement doit avoir
 * une clé primaire unique. Utiliser un simple compteur croissant (1, 2, 3...)
 * poserait problème : si deux onglets ou deux appareils ajoutant des données
 * en même temps, ils pourraient générer le même numéro.
 * Un UUID (Universally Unique Identifier) est un identifiant aléatoire de 128
 * bits qui, statistiquement, ne se reproduit jamais — même généré sur des
 * millions d'appareils sans coordination.
 *
 * Un UUID v4 a la forme : 8-4-4-4-12 caractères hexadécimaux
 *   Exemple : "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
 *
 * STRATÉGIE DE REPLI (fallback) À TROIS NIVEAUX :
 * L'application doit fonctionner sur les navigateurs les plus anciens
 * possible (voir CLAUDE.md, section Compatibilité). On essaie donc
 * successivement trois méthodes, de la plus sûre à la moins sûre :
 *   1. crypto.randomUUID() : le plus simple et le plus sûr (navigateurs
 *      récents, 2021+). C'est la méthode préférée si disponible.
 *   2. crypto.getRandomValues() : remplit un tableau d'octets avec des
 *      données aléatoires cryptographiquement sûres. Utilisé par les
 *      navigateurs un peu plus anciens (Safari 6+).
 *   3. Math.random() : dernier recours. Math.random() n'est PAS
 *      cryptographiquement sûr (il est prévisible), mais acceptable ici car
 *      l'application est 100% locale (pas de serveur distant à attaquer).
 *
 * DÉTAIL DE LA CONSTRUCTION UUID v4 :
 *   - On crée 16 octets aléatoires (1 octet = 8 bits ; 16 × 8 = 128 bits,
 *     la taille d'un UUID).
 *   - L'octet 6 encode la "version" de l'UUID : on force les 4 bits de poids
 *     fort à "0100" (0x40 en binaire) pour indiquer UUID v4 (aléatoire).
 *     L'opération & 0x0f met à zéro les 4 bits de poids fort, puis | 0x40
 *     force le motif 0100.
 *   - L'octet 8 encode le "variant" selon la RFC 4122 : on force les 2 bits
 *     de poids fort à "10" via | 0x80, et & 0x3f met à zéro les 2 bits
 *     supérieurs. (Ces deux lignes sont des opérations "bitmask" —
 *     manipulation bit à bit — pour respecter la norme d'UUID v4.)
 *   - Chaque octet est converti en 2 caractères hexadécimaux (base 16) avec
 *     toString(16).padStart(2, "0").
 *   - Les 32 caractères hex sont découpés en groupes de 8-4-4-4-12 et
 *     assemblés avec des tirets.
 *
 * @returns {string} UUID v4 formaté (36 caractères avec les tirets).
 */
function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Génère un identifiant textuel court et lisible pour les membres (ex: "M-A1B2C3").
 * Garanti non-collision avec préfixe d'horodatage et entropie aléatoire.
 *
 * POURQUOI un format spécifique pour les membres (et pas un UUID) ?
 * Parce qu'un identifiant court, lisible et préfixé est plus pratique quand on
 * parle d'un membre à voix haute ("M-A1B2C3") ou qu'on cherche un membre
 * dans un support imprimé. Le préfixe "M-" identifie immédiatement le type
 * d'objet et le laisse distinguishable des autres types d'identifiants
 * (UUID bruts pour les autres entités).
 *
 * ANTI-COLLISION :
 *   - Date.now().toString(36) : convertit l'horodatage actuel (millisecondes)
 *     en base 36 (alphabet 0-9 puis a-z, soit 36 symboles). C'est une
 *     horloge monotone : deux membres créés à des instants différents
 *     obteniront des horodatages différents.
 *   - Math.floor(Math.random() * 36) : un caractère aléatoire supplémentaire
 *     pour les cas où deux membres seraient créés dans la même milliseconde.
 *
 * On ne prend que les 5 derniers caractères de l'horodatage (.slice(-5))
 * pour garder un identifiant lisible de longueur raisonnable.
 *
 * @returns {string} Identifiant membre sécurisé, ex: "M-A1B2C3".
 */
function genererIdMembre() {
  const stamp = Date.now().toString(36).toUpperCase();
  const alea = Math.floor(Math.random() * 36)
    .toString(36)
    .toUpperCase();
  return `M-${stamp.slice(-5)}${alea}`;
}

// ============================================================================
// EXPORT & TÉLÉCHARGEMENT DE FICHIERS
// ============================================================================

/**
 * Déclenche le téléchargement d'un Blob sous forme de fichier.
 * Intègre un repli `target="_blank"` pour les navigateurs n'implémentant pas l'attribut download.
 *
 * QU'EST-CE QU'UN BLOB ?
 * Un Blob (Binary Large Object) est un objet JavaScript représentant des
 * données binaires en mémoire (texte, image, PDF...). On ne peut pas créer
 * un lien de téléchargement direct à partir d'un Blob. L'astuce est de :
 *   1. Créer une URL temporaire pointant vers ce Blob (URL.createObjectURL)
 *   2. Créer un élément <a> (une ancre) invisible
 *   3. La "cliquer" programmatiquement (a.click())
 *   4. Supprimer l'élément <a> du DOM (a.remove())
 *
 * POURQUOI setTimeout pour libérer l'URL ?
 * URL.revokeObjectURL() invalide l'URL temporaire. Si on le faisait
 * immédiatement après le clic, le téléchargement pourrait échouer car le
 * navigateur n'a pas encore eu le temps de lire l'URL. On attend 60 secondes
 * — bien plus que nécessaire — par précaution.
 *
 * @param {Blob} blob - Contenu du fichier.
 * @param {string} nomFichier - Nom du fichier cible (ex: "sauvegarde.json").
 * @returns {void}
 */
function telechargerFichier(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  if (!("download" in a)) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Partage ou télécharge un fichier de manière résiliente.
 * En mode PWA standalone (écran d'accueil iOS/Android), la Web Share API
 * évite les ruptures de navigation et propose directement les options système.
 *
 * CONCEPT : async / await
 * ----------------------
 * Une fonction "async" peut utiliser "await" pour attendre qu'une opération
 * asynchrone se termine sans bloquer le programme. "async" transforme
 * automatiquement le retour en une Promise (promesse : une valeur qui sera
 * disponible plus tard).
 *
 *   - Le mot-clé "async" marque la fonction comme asynchrone.
 *   - "await" attend qu'une Promise se résolve et récupère sa valeur.
 *     Exemple : "const data = await chargerDonnees();"
 *   - Une fonction async retourne TOUJOURS une Promise.
 *
 * Exemple mental :
 *   // Imaginer une fonction qui prend 2 secondes :
 *   function attendre() { return new Promise(r => setTimeout(r, 2000)); }
 *   async function demo() {
 *     console.log("A");           // affiché immédiatement
 *     await attendre();          // attend 2 secondes (sans bloquer la page)
 *     console.log("B");           // affiché 2 secondes plus tard
 *   }
 *
 * POURQUOI le partage est prioritaire sur le téléchargement ?
 * Sur un téléphone en mode PWA (installée), un téléchargement direct peut
 * peut sembler bizarre (le fichier atterrit dans un dossier mais l'utilisateur
 * ne voit pas où). La Web Share API ouvre directement la feuille de partage
 * système (WhatsApp, email, Bluetooth...), ce qui est plus naturel.
 *
 * @param {Blob} blob - Contenu du fichier.
 * @param {string} nomFichier - Nom du fichier suggéré.
 * @param {string} [mimeType] - Type MIME (ex: "application/json").
 * @returns {Promise<"partage"|"telecharge"|"annule">} Résultat de l'action.
 */
async function partagerOuTelechargerFichier(blob, nomFichier, mimeType) {
  try {
    const file = new File([blob], nomFichier, {
      type: mimeType || blob.type || "application/octet-stream",
    });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: nomFichier });
      return "partage";
    }
  } catch (err) {
    if (err && err.name === "AbortError") return "annule";
  }
  telechargerFichier(blob, nomFichier);
  return "telecharge";
}

/**
 * Compresse et redimensionne une image côté client via un Canvas HTML5.
 *
 * PROBLÈME RÉSOLU :
 * Les photos brutes des téléphones pèsent souvent 3 à 5 Mo. Stocker 100 photos
 * de 4 Mo = 400 Mo, ce qui saturerait rapidement le quota IndexedDB (~1 Go
 * dans la plupart des navigateurs, parfois bien moins sur mobile).
 *
 * LA SOLUTION : le Canvas HTML5.
 * Le Canvas (Toile en français) est comme une page blanche virtuelle où on
 * peut dessiner. L'astuce ici :
 *   1. Lire le fichier image en base64 (FileReader)
 *   2. Le charger dans un objet Image
 *   3. Créer un canvas de la taille voulue (redimensionnée)
 *   4. Dessiner l'image dans le canvas (ctx.drawImage)
 *   5. Extraire le résultat avec canvas.toDataURL("image/jpeg", 0.72)
 *
 * La qualité 0.72 est un bon compromis : la photo est ~5x plus petite mais
 * reste tout à fait correcte à l'écran. Les données résultantes sont une
 * "data URL" : du texte base64 qui peut être stocké directement dans
 * IndexedDB sous forme de chaîne de caractères.
 *
 * NOTION : LES PROMISES ET CALLBACKS IMBRIQUÉS
 * ---------------------------------------------
 * Ce code utilise des callbacks imbriqués (une fonction à l'intérieur d'une
 * autre) au lieu de async/await. Pourquoi ? Les événements natifs du
 * navigateur (FileReader, Image) ne sont pas des Promises, ils utilisent
 * des callbacks (onload, onerror). On peut convertir ces événements en
 * Promises avec new Promise(...), puis utiliser async/await pour simplifier —
 * mais ici la forme originale est conservée car elle est plus directe
 * pour quelques appels.
 *
 * Le "new Promise(...)" retourne une Promise qu'on résout avec resolve(...)
 * quand le résultat est prêt, ou qu'on rejette avec reject(...) en cas
 * d'erreur. C'est le mechanismisme de base du JavaScript asynchrone.
 *
 * ÉCHELLE DE REDIMENSIONNEMENT :
 *   scale = Math.min(1, maxDim / Math.max(img.width, img.height))
 *   - Math.max(largeur, hauteur) : le plus grand côté de l'image.
 *   - maxDim / cePlusGrandCôté : le ratio de réduction nécessaire.
 *   - Math.min(1, ...) : ne JAMAIS agrandir une image. Si l'image est déjà
 *     plus petite que maxDim, le ratio est > 1, mais on le plafonne à 1
 *     (aucune réduction, échelle 100%).
 *
 * @param {File} file - Fichier image sélectionné par l'utilisateur.
 * @param {number} [maxDim=960] - Dimension maximale (côté le plus long, px).
 * @returns {Promise<string>} Promise résolue avec l'image encodée en
 *   data URL base64 JPEG.
 */
function compresserPhoto(file, maxDim = 960) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Format d'image non reconnu"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// COMPOSANTS DE FORMULAIRE & SÉLECTEURS PARTAGÉS
// ============================================================================

/**
 * Génère les balises <option> pour les jours du mois (1 à 31).
 *
 * POURQUOI 31 jours et pas 30 ?
 * Février n'a que 28 ou 29 jours, mais on ne peut pas le savoir ici
 * (on n'a pas le mois). On propose donc 1 à 31 pour tous les mois ; c'est
 * à l'utilisateur de choisir une date valide. Une validation plus fine
 * pourrait vérifier la cohérence jour/mois au moment de la sauvegarde,
 * mais le jour 31 pour février est un cas rare et la validation au
 * moment du submit est plus simple.
 *
 * La première option vide ("--") permet de ne pas renseigner le jour
 * (champ optionnel dans certains formulaires).
 *
 * @param {number|string|null} selected - Jour actuellement sélectionné.
 * @returns {string} Balises <option> concaténées.
 */
function dayOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  for (let d = 1; d <= 31; d++) {
    out += `<option value="${d}"${Number(selected) === d ? " selected" : ""}>${d}</option>`;
  }
  return out;
}

/**
 * Génère les balises <option> pour les 12 mois de l'année.
 *
 * Réutilise la constante MOIS_NOMS de config.js (principe DRY — ne pas
 * dupliquer la liste des mois).
 *
 * @param {number|string|null} selected - Mois sélectionné (1 à 12).
 * @returns {string} Balises <option> concaténées.
 */
function monthOptionsHTML(selected) {
  let out = `<option value="">--</option>`;
  MOIS_NOMS.forEach((nom, i) => {
    const v = i + 1;
    out += `<option value="${v}"${Number(selected) === v ? " selected" : ""}>${nom}</option>`;
  });
  return out;
}

/**
 * Génère les options du sélecteur de fonction associative avec repli "Autre".
 *
 * LOGIQUE DU REPLI "AUTRE" :
 * La liste FONCTIONS est figée, mais la réalité d'une association évolue :
 * un nouveau rôle peut être créé. Plutôt que de forcer l'utilisateur à
 * choisir dans la liste, on propose une option "Autre" qui débloque un
 * champ de saisie libre (voir wireFonctionAutre).
 *
 * L'option "Autre" est présélectionnée si la valeur actuelle n'est pas dans
 * la liste connue (membre créé avec un rôle qui n'existe plus dans la liste
 * actuelle — on ne perd pas sa valeur).
 *
 * @param {string} selected - Fonction actuellement attribuée.
 * @returns {string} Balises <option> concaténées.
 */
function fonctionOptionsHTML(selected) {
  const known = FONCTIONS.includes(selected);
  let out = FONCTIONS.map(
    (f) => `<option value="${f}"${f === selected ? " selected" : ""}>${f}</option>`,
  ).join("");
  out += `<option value="__autre__"${!known && selected ? " selected" : ""}>Autre</option>`;
  return out;
}

/**
 * Connecte le comportement d'affichage dynamique pour le champ libre "Autre" d'une fonction.
 *
 * QU'EST-CE QU'UN "WIRE" (câblage) ?
 * "Wire" signifie "brancher" : associer un élément HTML à un comportement
 * (ici : afficher/masquer un champ de saisie selon la valeur choisie dans
 * un menu déroulant). Cette fonction est appelée après l'insertion du
 * HTML dans la page (les ID existent seulement à ce moment-là).
 *
 * Le champ libre est masqué par défaut (style.display = "none") et visible
 * seulement quand l'utilisateur choisit "Autre" ou que la valeur initiale
 * n'est pas dans la liste connue.
 *
 * @param {string} selectId - ID du sélecteur.
 * @param {string} wrapId - ID du conteneur du champ libre.
 * @param {string} inputId - ID du champ de saisie libre.
 * @param {string} currentValue - Valeur initiale de la fonction.
 * @returns {void}
 */
function wireFonctionAutre(selectId, wrapId, inputId, currentValue) {
  const select = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  if (!select || !wrap || !input) return;
  const known = FONCTIONS.includes(currentValue);
  if (currentValue && !known) {
    wrap.style.display = "";
    input.value = currentValue;
  }
  select.addEventListener("change", () => {
    wrap.style.display = select.value === "__autre__" ? "" : "none";
  });
}

/**
 * Récupère la valeur finale de la fonction choisie (standard ou saisie libre).
 *
 * Appelée au moment de la validation du formulaire. Elle retourne :
 *   - la valeur du menu déroulant si une fonction standard est choisie,
 *   - le contenu du champ libre (nettoyé avec trim()) si "Autre" est choisi,
 *   - "Membre" (valeur par défaut sûre) si le sélecteur est introuvable.
 *
 * @param {string} selectId - ID du sélecteur.
 * @param {string} inputId - ID du champ texte libre.
 * @returns {string} Valeur de la fonction retenue.
 */
function fonctionValueFrom(selectId, inputId) {
  const select = document.getElementById(selectId);
  if (!select) return "Membre";
  if (select.value === "__autre__") {
    const input = document.getElementById(inputId);
    return input ? input.value.trim() || "Autre" : "Autre";
  }
  return select.value;
}

// ============================================================================
// CANVAS & GRAPHIQUES
// ============================================================================

/**
 * Lit la valeur calculée d'une variable CSS globale sur le document.
 *
 * UTILISÉE PAR : les graphiques (modules/graphiques.js) pour que leurs
 * couleurs correspondent exactement au thème actif de l'application. Au lieu
 * de coder en dur "#F5F4F1" en JavaScript, on lit la valeur de la variable
 * CSS qui a déjà été définie pour le thème courant. Si l'utilisateur bascule
 * en thème sombre, les graphiques suivent automatiquement.
 *
 * getComputedStyle(el) retourne l'objet de style "vivant" de l'élément,
 * c'est-à-dire toutes les valeurs finales après application des feuilles
 * de style, des media queries, etc. (pas seulement les règles explicites).
 * .getPropertyValue("--accent") lit une variable CSS personnalisée
 * (celles qui commencent par "--").
 *
 * Exemple d'une variable CSS personnalisée, telle que definie dans
 * variables.css :  :root { --accent: #B45309; }
 *
 * @param {string} name - Nom de la variable CSS (ex: "--accent").
 * @returns {string} Valeur évaluée (ex: "#B45309"), chaîne vide si absente.
 */
function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Trace un rectangle avec coins arrondis sur le partie supérieure dans un
 * contexte Canvas 2D.
 *
 * UTILISÉE PAR : les graphiques en barres (modules/graphiques.js) pour
 * dessiner les barres avec un sommet arrondi (effet visuel plus élégant
 * qu'un rectangle à angles vifs).
 *
 * NOTION : LE CANVAS ET LE CONTEXTE 2D
 * -------------------------------------
 * Un canvas HTML est une zone de dessin. Pour dessiner dessus, on obtient
 * un "contexte" via canvas.getContext("2d"). Ce contexte est l'outil de
 * dessin : il expose des méthodes (fillRect, arcTo, fill, stroke...).
 * Les opérations se font en coordonnées en pixels, avec (0,0) en haut
 * à gauche du canvas.
 *
 * DÉTAIL DE L'ALGORITHME arcTo :
 * La méthode ctx.arcTo(x1, y1, x2, y2, radius) dessine un arc entre deux
 * segments de droite, avec un rayon d'arrondi donné. Elle est utilisée
 * deux fois : une pour l'arrondi haut-gauche, une pour l'arrondi haut-droit.
 *
 * beginPath() : démarre un nouveau chemin de dessin (nécessaire après
 * chaque forme pour ne pas accumuler les tracés précédents).
 * closePath() : ferme le chemin courant.
 * fill() : remplit l'intérieur du chemin avec la couleur courante (fillStyle).
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas.
 * @param {number} x - Abscisse du coin gauche.
 * @param {number} y - Ordonnée du coin haut.
 * @param {number} w - Largeur du rectangle.
 * @param {number} h - Hauteur du rectangle.
 * @param {number} r - Rayon d'arrondi souhaité (borné par la taille).
 * @returns {void}
 */
function roundRectTop(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  const rad = Math.min(r, h, w / 2);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

/**
 * Affiche un message de substitution au centre d'un Canvas sans données.
 *
 * UTILISÉE PAR : les graphiques quand il n'y a rien à tracer (pas assez de
 * données sur la période sélectionnée, par exemple). Au lieu d'afficher un
 * canvas vide qui semble cassé, on affiche un message explicite au centre.
 *
 * fillStyle : couleur du texte (ici --text-3, une couleur de texte secondaire
 * définie dans variables.css).
 * font : police et taille du texte ("24px" = 24 pixels, taille unspecified).
 * textAlign = "center" : le texte sera centré horizontalement.
 *
 * @param {CanvasRenderingContext2D} ctx - Contexte 2D du canvas.
 * @param {number} W - Largeur du canvas.
 * @param {number} H - Hauteur du canvas.
 * @param {string} [msg="Donnees insuffisantes"] - Texte informatif.
 * @returns {void}
 */
function emptyCanvasMsg(ctx, W, H, msg = "Donnees insuffisantes") {
  ctx.fillStyle = cssVar("--text-3") || "#888";
  ctx.font = "24px -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg, W / 2, H / 2);
}

/**
 * Retourne le gabarit HTML standardisé pour un état vide ("aucun élément").
 *
 * UTILISÉE PAR : tous les modules de rendu quand une liste est vide
 * (aucun membre, aucune dette, aucune activité). Plutôt que d'afficher un
 * bloc vide qui donne l'impression d'un bug, on affiche un message
 * rassurant dans un conteneur stylé par la classe CSS "empty".
 *
 * L'appel à esc() est obligatoire : le message peut contenir des données
 * utilisateur (ex: "Aucun membre dont le nom contient « <script> »").
 *
 * @param {string} text - Message explicatif à afficher.
 * @returns {string} Balisage HTML de l'état vide.
 */
function emptyHTML(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
