## Why

Le modèle éphémère 24h crée une friction inutile : les utilisateurs doivent repayer régulièrement juste pour maintenir leur présence, et les cases vides après expiration donnent une impression de map morte. En passant à un modèle **permanent + enchères incrémentales**, chaque photo reste visible indéfiniment — la map ne fait que se remplir. La compétition se fait par le prix : chaque remplacement coûte plus cher que le précédent, créant une valeur croissante naturelle sur les cases les plus convoitées.

Ce changement simplifie aussi le modèle mental : "ta photo reste tant que personne ne paie plus pour la remplacer". Plus de timer, plus d'expiration, plus de confusion.

## What Changes

### Supprimé : Logique d'expiration temporelle
- **BREAKING** : Suppression du timer 24h et des statuts `en_expiration` / `remplacable`
- Suppression du cron job d'expiration (`pg_cron`)
- Suppression des notifications "ta publication expire bientôt"
- Les publications n'ont plus de `expires_at`

### Modifié : Modèle de prix
- **BREAKING** : Remplacement du prix dynamique basé sur la demande par un système d'enchères incrémentales
- Première publication sur une case : **gratuite**
- Deuxième publication : **1€**
- Troisième : **2€**, quatrième : **3€**, etc. (incrément de 1€ par remplacement)
- OU : prix libre, tant qu'il est **strictement supérieur** au dernier prix payé pour cette case
- Le prix minimum est toujours `nombre_de_remplacements × 1€` (floor), mais l'utilisateur peut payer plus

### Modifié : Statuts des cases
- Simplification : `libre` → `occupe` (plus de distinction gratuit/payant comme statut visuel principal)
- Conservation de `signale`, `en_moderation`, `bloque` pour la modération
- Nouveau champ `replacement_count` et `last_price` sur chaque case

### Modifié : UX de publication
- Case libre : "Publier gratuitement" (inchangé)
- Case occupée : "Prendre cette place — X€ minimum" avec input de prix libre
- Plus de bouton "Prolonger" (la publication est permanente par défaut)

### Modifié : Notifications
- Suppression : notification d'expiration imminente
- Conservation : notification quand ta publication est remplacée ("Quelqu'un a pris ta place sur [case] pour X€")

## Capabilities

### New Capabilities

- `incremental-pricing`: Moteur de prix incrémental par case — calcul du prix minimum basé sur l'historique de remplacements, validation du prix libre, enregistrement du prix payé

### Modified Capabilities

- `square-lifecycle`: Suppression de toute logique temporelle (timer 24h, expiration, cron). Une case est soit libre, soit occupée, soit en modération. Le remplacement se fait uniquement par paiement.
- `map-view`: Simplification des statuts visuels (plus de couleur "en expiration" / "remplaçable"). Affichage du prix minimum pour remplacer sur les cases occupées.
- `image-upload`: Le flow d'upload intègre désormais le paiement si la case est occupée (prix minimum affiché, input prix libre)
- `payments`: Adaptation au nouveau modèle — paiement uniquement pour remplacement (plus de prolongation). Validation serveur que le prix payé ≥ prix minimum de la case.
- `dynamic-pricing`: **Supprimée** — remplacée par `incremental-pricing`. Plus de demand_score ni de multiplicateur.

## Impact

- **Base de données** : suppression des colonnes `expires_at`, `demand_score`, table `square_demand`. Ajout de `replacement_count`, `last_price` sur `squares`. Modification de l'enum de statuts.
- **Edge Functions** : suppression du cron d'expiration, modification de la function de publication pour intégrer la validation de prix incrémental
- **Client** : suppression du timer/countdown, simplification du detail screen, ajout d'un input prix sur le flow de remplacement
- **Notifications** : suppression des notifications d'expiration
- **Monétisation** : revenu uniquement via les remplacements (pas de prolongation). Le revenu par case augmente naturellement avec le nombre de remplacements.

## Non-goals (V2+)

- Enchères temps réel entre plusieurs utilisateurs sur la même case
- Système de "protection" payante pour empêcher le remplacement
- Remboursement partiel de l'ancien occupant quand sa photo est remplacée
- Historique public des prix d'une case
- Plafond de prix maximum par case
- Décroissance du prix avec le temps (le prix minimum ne baisse jamais)
