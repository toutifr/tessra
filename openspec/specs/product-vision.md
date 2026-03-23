# Tessra — Product Vision & Spec

## 1. Contexte produit

App mobile basée sur une map sociale éphémère.

- La carte du monde est divisée en carrés géographiques
- Chaque carré peut contenir une image / un souvenir / un moment
- Une image est visible 24h par défaut
- Après 24h, la publication devient remplaçable gratuitement
- Un utilisateur peut payer pour imposer sa propre image pendant 24h
- Si un carré est déjà occupé ou très demandé, son prix augmente
- Quand les 24h sont écoulées, le carré redevient gratuit

Le produit n'est pas une vente de propriété réelle, mais un droit d'affichage temporaire sur un carré de la map.

## 2. Vision du produit

Réseau social géographique :

- On poste un moment, un souvenir ou une image dans un lieu du monde
- La map devient un mur vivant de contenu éphémère
- Les carrés les plus demandés prennent naturellement de la valeur
- Mélange d'expression sociale, rareté, visibilité et compétition légère

### Objectifs de validation MVP

1. Les utilisateurs comprennent le concept immédiatement
2. Ils publient une image
3. Ils reviennent voir la map
4. Ils acceptent de payer pour garder une présence plus longtemps
5. Ils comprennent la logique de remplacement / expiration

## 3. Stack technique

- Mobile: Expo + React Native (iOS/Android, codebase unique)
- Build/release: EAS
- Backend: Supabase
- Carte: Mapbox
- Auth: email + Apple + Google
- Paiements: achats in-app
- Repo: GitHub
- IA: Claude AI
- Spec-driven: OpenSpec

## 4. Scope MVP

### Inclus

- Login email / Apple / Google
- Onboarding minimal
- Carte du monde avec carrés
- Clic sur un carré
- Upload d'une image
- Affichage de l'image sur le carré
- Timer de 24h
- Remplacement gratuit après expiration
- Paiement pour prolonger la visibilité
- Historique privé des publications
- Profil simple
- Modération basique
- Notifications simples si nécessaire

### Exclu du MVP (V2+)

- Messagerie
- Followers / likes complexes
- Feed social classique
- 3D globe
- Enchères temps réel complexes
- Recommandations avancées
- Gamification lourde
- Multi-langue
- Version web
- Analytics poussées
- IA de modération avancée

## 5. Règles métier

### Règle principale

Une publication dans un carré dure 24h.

### Après 24h

- Le carré redevient gratuit
- Un autre utilisateur peut remplacer la publication
- Si personne ne prend le carré, il reste libre

### Paiement

Un utilisateur peut payer pour :

- Garder son image visible plus longtemps
- Imposer sa publication pendant 24h supplémentaires
- Prendre la place d'une image déjà en place

### Prix dynamique

- Si un carré est déjà occupé ou très demandé, le prix augmente
- Plus il y a de demandes, plus le prix grimpe
- Logique simple et lisible

### Historique privé

Chaque utilisateur a un historique privé (non public, visible uniquement par le propriétaire et admins).

Données conservées :

- Identifiant du carré
- Image publiée
- Date de début / fin
- Statut de la publication
- Mode d'obtention (gratuit / payant)
- Événements de remplacement / expiration / modération

## 6. Statuts d'un carré

| Statut | Utilisateur voit | Utilisateur peut | Déclencheur |
|--------|------------------|------------------|-------------|
| Libre | Carré vide | Publier gratuitement | Expiration ou jamais occupé |
| Occupé gratuit | Image + timer | Voir, signaler | Publication gratuite |
| Occupé payant | Image + timer + badge payant | Voir, signaler, proposer un prix | Publication payante |
| En expiration | Timer terminé | Remplacer gratuitement | 24h écoulées |
| Remplaçable | Indication "disponible" | Publier gratuitement | Post-expiration |
| Signalé | Contenu flouté | Attendre modération | Signalement utilisateur |
| En modération | Contenu masqué | Rien | Review en cours |
| Bloqué | Carré indisponible | Rien | Décision admin |

## 7. Flows utilisateur

### Flow 1 — Première publication

1. Ouvre la carte → 2. Clic carré libre → 3. Ajoute image → 4. Publication 24h → 5. Carré occupé

### Flow 2 — Remplacement gratuit

1. 24h écoulées → 2. Carré remplaçable → 3. Autre utilisateur publie → 4. Nouvelle publication

### Flow 3 — Prolongation payante

1. Veut garder l'image → 2. Choisit palier de prix → 3. Paie → 4. Durée prolongée

### Flow 4 — Carré déjà occupé

1. Veut prendre un carré pris → 2. Voit le prix → 3. Paie → 4. Remplace la publication → 5. Cycle 24h repart

### Flow 5 — Historique privé

1. Ouvre "Mes publications" → 2. Voit anciennes publications → 3. Consulte statut → 4. Retrouve image (non publique)

## 8. UX

### Principes

- Compris en 1 seconde
- Une seule action principale par écran
- Pas de jargon juridique
- Pas de confusion propriété vs visibilité
- Compteur de temps très visible
- Interface extrêmement lisible sur mobile

### Microcopy exemples

- "Gratuit pendant 24h"
- "Visible jusqu'au …"
- "Remplaçable maintenant"
- "Prendre cette place"
- "Prolonger la visibilité"
- "Ce carré est très demandé"

## 9. Monétisation

- Prolongation payante
- Prise d'un carré occupé
- Prix dynamique sur zones convoitées
- Gratuit pour tester, payant pour prolonger/doubler

## 10. Anti-abus / anti-spam

- Limite publications par compte
- Cooldown entre publications sur même carré
- Signalement manuel
- Modération basique
- Blocage comptes abusifs

## 11. Modération

MVP : signalement utilisateur → revue manuelle → blocage/suppression

Contenu géré : images interdites, NSFW, haineux, faux, frauduleux, signalements.

## 12. Modèle de données attendu

Tables Supabase : users, profiles, squares, publications, publication_history, payments, moderation_flags, square_demand/pricing signals.

## 13. Architecture fonctionnelle

Structurer en : écrans, composants, logique métier, stockage, auth, paiement, modération, historique privé, règles de renouvellement/remplacement.

## 14. Livrables

1. Vision produit
2. User stories
3. Flows
4. Règles métier
5. Statuts
6. Modèle de données
7. Structure d'écrans
8. Critères d'acceptation
9. Roadmap MVP
10. Exclusions
11. Risques
12. Liste des tâches techniques
