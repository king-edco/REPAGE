# REPAGE — Design System : paramètres à définir

> Ce fichier liste **uniquement les paramètres**. Aucune valeur n'est choisie.
> Tu remplis la colonne **Valeur** au fur et à mesure de tes recherches, et la
> colonne **Source** avec la page officielle consultée (ex. m3.material.io).
> Légende : `____` = à remplir.

## Règles de fonctionnement (pas des valeurs)

1. Aucune valeur en dur dans les écrans : tout passe par les tokens de ce fichier.
2. Chaque couleur existe en version claire et sombre.
3. Un écran n'est « fini » que dans tous ses états (voir §16).
4. Les valeurs de ce fichier sont la seule source de vérité pour Claude, GLM et Gemini.

---

## 1. Identité (marque)

| Paramètre | Valeur | Source |
|---|---|---|
| Nom de l'app | ____ | |
| Statut du logo (provisoire / final) | ____ | |
| Variante : logo complet | ____ | |
| Variante : icône seule | ____ | |
| Variante : monochrome | ____ | |
| Variante : fond clair / fond sombre | ____ | |
| Zone de dégagement autour du logo | ____ | |
| Taille minimale du logo | ____ | |
| Interdits d'usage du logo | ____ | |
| Icône adaptative : taille du canevas | ____ | |
| Icône adaptative : zone sûre | ____ | |
| Icône adaptative : couche de premier plan | ____ | |
| Icône adaptative : couche de fond | ____ | |
| Icône adaptative : couche monochrome | ____ | |
| Écran de démarrage (splash) : contenu | ____ | |
| Écran de démarrage : fond | ____ | |
| Style d'illustration | ____ | |
| Style de photo (si utilisé) | ____ | |
| Ratio des couvertures de livres | ____ | |

## 2. Couleurs

### 2.1 Couleur de départ

| Paramètre | Valeur | Source |
|---|---|---|
| Ambiance de l'app | ____ | |
| Couleur source (seed) | ____ | |
| Outil de génération de la palette | ____ | |

### 2.2 Rôles de couleur (clair **et** sombre)

| Paramètre | Clair | Sombre | Source |
|---|---|---|---|
| primary | ____ | ____ | |
| onPrimary | ____ | ____ | |
| primaryContainer | ____ | ____ | |
| onPrimaryContainer | ____ | ____ | |
| secondary | ____ | ____ | |
| onSecondary | ____ | ____ | |
| secondaryContainer | ____ | ____ | |
| onSecondaryContainer | ____ | ____ | |
| tertiary (si utilisée) | ____ | ____ | |
| onTertiary | ____ | ____ | |
| tertiaryContainer | ____ | ____ | |
| onTertiaryContainer | ____ | ____ | |
| background | ____ | ____ | |
| onBackground | ____ | ____ | |
| surface | ____ | ____ | |
| onSurface | ____ | ____ | |
| surfaceVariant | ____ | ____ | |
| onSurfaceVariant | ____ | ____ | |
| surfaceContainerLowest | ____ | ____ | |
| surfaceContainerLow | ____ | ____ | |
| surfaceContainer | ____ | ____ | |
| surfaceContainerHigh | ____ | ____ | |
| surfaceContainerHighest | ____ | ____ | |
| outline | ____ | ____ | |
| outlineVariant | ____ | ____ | |
| error | ____ | ____ | |
| onError | ____ | ____ | |
| errorContainer | ____ | ____ | |
| onErrorContainer | ____ | ____ | |
| inverseSurface | ____ | ____ | |
| inverseOnSurface | ____ | ____ | |
| inversePrimary | ____ | ____ | |
| scrim (voile) | ____ | ____ | |

### 2.3 Couleurs sémantiques supplémentaires

| Paramètre | Clair | Sombre | Source |
|---|---|---|---|
| success / onSuccess / successContainer | ____ | ____ | |
| warning / onWarning / warningContainer | ____ | ____ | |
| info / onInfo / infoContainer | ____ | ____ | |
| Couleur du cœur (like), actif | ____ | ____ | |
| Couleur de l'étoile, active | ____ | ____ | |
| Couleur de surlignage | ____ | ____ | |

### 2.4 Thèmes de lecture

| Paramètre | Fond | Texte | Source |
|---|---|---|---|
| Thème clair | ____ | ____ | |
| Thème sombre | ____ | ____ | |
| Thème papier (sépia), si retenu | ____ | ____ | |
| Thème noir OLED, si retenu | ____ | ____ | |

### 2.5 Règles de couleur

| Paramètre | Valeur | Source |
|---|---|---|
| Contraste minimal texte normal | ____ | |
| Contraste minimal grand texte / icônes | ____ | |
| Répartition des couleurs (neutre / secondaire / accent) | ____ | |

## 3. Typographie

### 3.1 Polices

| Paramètre | Valeur | Source |
|---|---|---|
| Police de l'interface | ____ | |
| Police de lecture | ____ | |
| Police de secours | ____ | |
| Graisses autorisées | ____ | |

### 3.2 Échelle de l'interface (taille / interligne / graisse / espacement des lettres)

| Style | Taille | Interligne | Graisse | Espacement lettres | Source |
|---|---|---|---|---|---|
| displayLarge | ____ | ____ | ____ | ____ | |
| displayMedium | ____ | ____ | ____ | ____ | |
| headlineLarge | ____ | ____ | ____ | ____ | |
| headlineMedium | ____ | ____ | ____ | ____ | |
| titleLarge | ____ | ____ | ____ | ____ | |
| titleMedium | ____ | ____ | ____ | ____ | |
| titleSmall | ____ | ____ | ____ | ____ | |
| bodyLarge | ____ | ____ | ____ | ____ | |
| bodyMedium | ____ | ____ | ____ | ____ | |
| bodySmall | ____ | ____ | ____ | ____ | |
| labelLarge | ____ | ____ | ____ | ____ | |
| labelMedium | ____ | ____ | ____ | ____ | |
| labelSmall | ____ | ____ | ____ | ____ | |

### 3.3 Texte de lecture

| Paramètre | Valeur | Source |
|---|---|---|
| Taille par défaut | ____ | |
| Plage de taille réglable par l'utilisateur | ____ | |
| Interligne par défaut | ____ | |
| Plage d'interligne réglable | ____ | |
| Espacement entre paragraphes | ____ | |
| Alignement (début / justifié) | ____ | |
| Césure | ____ | |
| Longueur de ligne (caractères) | ____ | |
| Style du texte « Plain terms » | ____ | |
| Mise à l'échelle maximale du texte système | ____ | |

## 4. Espacements

| Paramètre | Valeur | Source |
|---|---|---|
| Unité de base | ____ | |
| Échelle : xs | ____ | |
| Échelle : sm | ____ | |
| Échelle : md | ____ | |
| Échelle : lg | ____ | |
| Échelle : xl | ____ | |
| Échelle : xxl | ____ | |
| Échelle : xxxl | ____ | |
| Marge d'écran (compact) | ____ | |
| Marge d'écran (moyen / étendu) | ____ | |
| Espace entre éléments liés | ____ | |
| Espace entre groupes | ____ | |

## 5. Formes (rayons d'arrondi)

| Paramètre | Valeur | Source |
|---|---|---|
| xs | ____ | |
| sm | ____ | |
| md | ____ | |
| lg | ____ | |
| xl | ____ | |
| full (pilule) | ____ | |
| Rayon : boutons | ____ | |
| Rayon : champs de texte | ____ | |
| Rayon : cartes | ____ | |
| Rayon : boîtes de dialogue | ____ | |
| Rayon : panneaux du bas | ____ | |
| Rayon : couvertures de livres | ____ | |
| Rayon : icône d'app | ____ | |

## 6. Élévation et bordures

| Paramètre | Valeur | Source |
|---|---|---|
| Niveau 0 | ____ | |
| Niveau 1 | ____ | |
| Niveau 2 | ____ | |
| Niveau 3 | ____ | |
| Gestion de l'élévation en mode sombre | ____ | |
| Épaisseur des séparateurs | ____ | |
| Couleur des séparateurs | ____ | |
| Épaisseur des bordures de cartes | ____ | |
| Règle : ombre ou bordure | ____ | |

## 7. Icônes

| Paramètre | Valeur | Source |
|---|---|---|
| Jeu d'icônes | ____ | |
| Style (contour / plein) | ____ | |
| Graisse / grade | ____ | |
| Tailles disponibles | ____ | |
| Taille par défaut | ____ | |
| Zone tactile minimale | ____ | |
| Couleur au repos | ____ | |
| Couleur à l'état actif | ____ | |
| Usage de la variante pleine | ____ | |
| Icône de notification (style) | ____ | |

## 8. États d'interaction

| Paramètre | Valeur | Source |
|---|---|---|
| État : normal | ____ | |
| État : survol | ____ | |
| État : focus | ____ | |
| État : appuyé | ____ | |
| État : glissé | ____ | |
| État : désactivé (contenu) | ____ | |
| État : désactivé (conteneur) | ____ | |
| État : chargement | ____ | |
| État : erreur | ____ | |
| État : sélectionné | ____ | |

## 9. Mise en page

| Paramètre | Valeur | Source |
|---|---|---|
| Classe compacte : largeur | ____ | |
| Classe moyenne : largeur | ____ | |
| Classe étendue : largeur | ____ | |
| Classes de hauteur | ____ | |
| Nombre de colonnes par classe | ____ | |
| Largeur maximale du contenu | ____ | |
| Largeur maximale du texte de lecture | ____ | |
| Comportement en paysage | ____ | |
| Mode immersif : comportement des barres système | ____ | |
| Mode immersif : barre révélée au tap | ____ | |
| Mode immersif : délai de disparition automatique | ____ | |
| Gestion des zones sûres (encoches, barres système, clavier) | ____ | |

## 10. Mouvement

| Paramètre | Valeur | Source |
|---|---|---|
| Durée : instantanée | ____ | |
| Durée : courte | ____ | |
| Durée : moyenne | ____ | |
| Durée : longue | ____ | |
| Courbe : standard | ____ | |
| Courbe : entrée | ____ | |
| Courbe : sortie | ____ | |
| Transition de la slide de lecture | ____ | |
| Transitions entre écrans | ____ | |
| Comportement si « réduire les animations » est actif | ____ | |
| Retour haptique : où et quelle intensité | ____ | |

## 11. Composants

Pour chaque composant, renseigner : hauteur, largeur, padding, rayon, couleurs, style de texte, états.

### 11.1 Actions

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| Bouton primaire (plein) | hauteur, padding, rayon, couleurs, texte | ____ |
| Bouton tonal | idem | ____ |
| Bouton secondaire (contour) | idem + bordure | ____ |
| Bouton tertiaire (texte) | idem | ____ |
| Bouton-icône | taille, zone tactile | ____ |
| Bouton flottant (si utilisé) | taille, rayon, couleurs | ____ |

### 11.2 Saisie

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| Champ de texte | hauteur, rayon, libellé, aide, erreur | ____ |
| Interrupteur | taille, couleurs | ____ |
| Case à cocher / bouton radio | taille, zone tactile | ____ |
| Curseur | piste, poignée | ____ |
| Étiquette (chip) | hauteur, rayon, texte | ____ |

### 11.3 Conteneurs

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| Carte | rayon, padding, surface, bordure | ____ |
| Élément de liste | hauteurs (1, 2, 3 lignes), padding | ____ |
| Boîte de dialogue | rayon, padding, largeur, surface | ____ |
| Panneau du bas | rayon, poignée, surface | ____ |
| Message temporaire (snackbar) | rayon, marge, durée, actions | ____ |
| Séparateur | épaisseur, couleur | ____ |

### 11.4 Navigation

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| Barre du haut | hauteur, titre, icônes | ____ |
| Barre de navigation du bas | hauteur, nombre d'entrées, indicateur | ____ |
| Onglets | hauteur, indicateur | ____ |
| Indicateur de pages (onboarding) | taille des points, couleurs, espacement | ____ |

### 11.5 Retour d'état

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| Progression linéaire | épaisseur, couleurs | ____ |
| Progression circulaire | tailles | ____ |
| Squelette de chargement | forme, couleur, animation | ____ |
| Pastille (badge) | taille, couleur | ____ |

### 11.6 Composants propres à REPAGE

| Composant | Paramètres à définir | Valeur / Source |
|---|---|---|
| SlideCard | rayon, padding, surface, en-tête, texte | ____ |
| Couche dépliable (« Plain terms ») | état initial, indicateur, animation | ____ |
| Rangée d'icônes de lecture (cœur, étoile, partage) | tailles, espacement, états actif / inactif | ____ |
| Barre du haut de lecture | contenu, fondu, délai | ____ |
| Indicateur d'auto-swipe | forme, position, couleur | ____ |
| Couverture de livre | ratio, rayon, placeholder | ____ |
| Élément de liste de livre | taille de la couverture, textes | ____ |
| Ligne de statut (« Not started », « Chapter 3 · Section 2 of 5 », « Finished ») | style de texte, couleur | ____ |
| Slide système (hors ligne / paywall) | taille d'illustration, textes, action | ____ |

### 11.7 États d'écran réutilisables

| État | Contenu à définir | Valeur / Source |
|---|---|---|
| Vide | illustration, titre, texte, action | ____ |
| Chargement | squelette ou indicateur | ____ |
| Erreur | icône, message, action de réessai | ____ |
| Hors ligne | message, contenu en cache visible ou non | ____ |

## 12. Accessibilité

| Paramètre | Valeur | Source |
|---|---|---|
| Taille minimale des zones tactiles | ____ | |
| Espace minimal entre zones tactiles | ____ | |
| Contraste minimal | ____ | |
| Descriptions pour lecteur d'écran (règle) | ____ | |
| Ordre de focus (règle) | ____ | |
| Mise à l'échelle du texte supportée | ____ | |
| Règle : information jamais portée par la couleur seule | ____ | |
| Réglages système à respecter (animations, contraste, thème) | ____ | |

## 13. Ton et textes

| Paramètre | Valeur | Source |
|---|---|---|
| Langues supportées | ____ | |
| Français : tutoiement ou vouvoiement | ____ | |
| Style des boutons | ____ | |
| Style des messages d'erreur | ____ | |
| Majuscules (règle) | ____ | |
| Formats de date et de nombre | ____ | |
| Longueur maximale des titres | ____ | |
| Marge réservée aux traductions | ____ | |
| Emplacement des textes (fichiers de ressources) | ____ | |

## 14. Notifications et surfaces hors de l'app

| Paramètre | Valeur | Source |
|---|---|---|
| Petite icône de notification | ____ | |
| Couleur d'accent de notification | ____ | |
| Canaux de notification (noms, importance) | ____ | |
| Contenu de la carte de notification | ____ | |
| Boutons de la carte de notification | ____ | |
| Style de l'activité sur l'écran de verrouillage | ____ | |
| Style de l'alerte en haut d'écran (heads-up) | ____ | |

## 15. Organisation du code

| Paramètre | Valeur | Source |
|---|---|---|
| Dossier du thème | ____ | |
| Fichiers du thème (Color, Type, Spacing, Shape, Motion, Theme) | ____ | |
| Dossier des composants | ____ | |
| Préfixe des composants | ____ | |
| Convention de nommage des écrans | ____ | |
| Écran « catalogue » de tous les composants | ____ | |
| Prévisualisations obligatoires par composant | ____ | |

## 16. Checklist « écran terminé »

| Critère | Valeur / règle | Source |
|---|---|---|
| Tokens uniquement, aucune valeur en dur | ____ | |
| États à construire (défaut, vide, chargement, erreur, hors ligne) | ____ | |
| Modes à vérifier (clair, sombre) | ____ | |
| Tailles d'écran à vérifier | ____ | |
| Orientation à vérifier | ____ | |
| Taille de texte à vérifier | ____ | |
| Accessibilité à vérifier | ____ | |
| Test sur téléphone réel | ____ | |

## 17. Contrat entre l'UI et la logique

| Paramètre | Valeur | Source |
|---|---|---|
| Nom de l'objet d'état par écran (`XxxUiState`) | ____ | |
| Nom de l'objet d'actions par écran (`XxxActions`) | ____ | |
| Note « À brancher » livrée avec chaque écran | ____ | |
| Fichiers que la logique ne doit pas modifier | ____ | |

## 18. Références consultées

| Sujet | Lien consulté | Date |
|---|---|---|
| Couleurs | ____ | |
| Typographie | ____ | |
| Formes | ____ | |
| Élévation | ____ | |
| Mouvement | ____ | |
| Mise en page | ____ | |
| Composants | ____ | |
| Accessibilité | ____ | |
| Icône adaptative et notifications | ____ | |
