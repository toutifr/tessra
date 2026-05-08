## Context

Tessra utilise actuellement un modèle éphémère 24h : chaque publication expire automatiquement, les cases redeviennent libres, et un système de prix dynamique basé sur la demande (demand_score × multiplicateur) détermine le coût de prise d'une case. Ce modèle génère une map souvent vide et une complexité de statuts importante (8 statuts).

Le nouveau modèle est radicalement plus simple : les photos sont permanentes, et la seule façon de remplacer une photo est de payer un prix supérieur au précédent. Le prix minimum augmente de 1€ à chaque remplacement.

### État actuel de la base de données

```
squares
├── status: enum (libre, occupe_gratuit, occupe_payant, en_expiration, remplacable, signale, en_moderation, bloque)
├── demand_score: float
├── base_price: float
└── current_publication_id: FK

publications
├── expires_at: timestamp
├── is_paid: boolean
└── price_paid: numeric

square_demand (table entière)
├── square_id, event_type, created_at
```

## Goals / Non-Goals

**Goals:**
- Simplifier le modèle de données : 3 statuts de base (libre, occupe, modération)
- Implémenter un prix incrémental prévisible et transparent
- Supprimer toute logique temporelle (cron, timer, expiration)
- Permettre un prix libre au-dessus du minimum

**Non-Goals:**
- Enchères en temps réel entre plusieurs acheteurs
- Décroissance du prix avec le temps
- Remboursement de l'ancien occupant
- Plafond de prix

## Decisions

### 1. Simplification des statuts de case

**Choix** : Réduire à 4 statuts : `libre`, `occupe`, `signale`, `bloque`

**Rationale** : Sans expiration temporelle, les distinctions `occupe_gratuit` / `occupe_payant` / `en_expiration` / `remplacable` n'ont plus de sens. Une case est soit libre (jamais occupée ou libérée par modération), soit occupée (avec une photo permanente). Les statuts de modération (`signale`, `bloque`) restent nécessaires. `en_moderation` est fusionné dans `signale` pour simplifier.

**Alternative rejetée** : Garder `occupe_gratuit` et `occupe_payant` comme distinction visuelle → rejeté car le prix est toujours visible, pas besoin d'un statut dédié.

### 2. Modèle de prix incrémental

**Choix** : Stocker `replacement_count` et `last_price` sur la table `squares`

```
Prix minimum = replacement_count × 1.00 (€)
  - replacement_count = 0 → gratuit (première publication)
  - replacement_count = 1 → 1€
  - replacement_count = 2 → 2€
  - replacement_count = n → n€
Prix accepté = tout montant ≥ prix minimum
```

**Rationale** : Le calcul est trivial, déterministe, et ne dépend d'aucun état externe. `last_price` permet de supporter le prix libre (si quelqu'un paie 10€ au 3e remplacement, le suivant doit payer > 10€, pas juste 4€).

**Règle de prix minimum** : `max(replacement_count, last_price + 1)` — le prix minimum est le plus élevé entre le palier normal et le dernier prix payé + 1€. Cela évite qu'un prix libre élevé soit "gaspillé".

**Alternative rejetée** : Prix minimum = toujours `last_price + 1` → rejeté car si quelqu'un paie 100€ sur une case random, elle serait bloquée à 101€ minimum pour toujours. Le palier incrémental (`replacement_count`) sert de floor prévisible.

**Correction** : En fait le prix libre signifie que l'utilisateur peut payer CE QU'IL VEUT tant que c'est ≥ au prix minimum du palier. Le `last_price` n'influence pas le minimum du suivant — seul `replacement_count` le fait.

**Règle finale simplifiée** :
```
prix_minimum = replacement_count × 1.00€
  (si replacement_count = 0 → gratuit)
prix_accepté = montant_payé ≥ prix_minimum
last_price = montant effectivement payé (pour affichage/historique)
```

### 3. Migration de la base de données

**Choix** : Une seule migration SQL qui :
1. Ajoute `replacement_count` (int, default 0) et `last_price` (numeric, default 0) à `squares`
2. Modifie l'enum de statuts : `libre`, `occupe`, `signale`, `bloque`
3. Migre les données existantes :
   - `occupe_gratuit` / `occupe_payant` → `occupe`
   - `en_expiration` / `remplacable` → `occupe` (les photos restent maintenant)
   - `libre` → `libre`
   - `signale` / `en_moderation` → `signale`
   - `bloque` → `bloque`
4. Supprime les colonnes : `demand_score`, `base_price`, `expires_at` (sur publications)
5. Supprime la table `square_demand`
6. Supprime le cron job d'expiration

**Rationale** : Migration en une étape car l'app n'est pas encore en production (MVP). Pas besoin de rétro-compatibilité.

### 4. Validation du paiement côté serveur

**Choix** : RPC Supabase `replace_square(square_id, price_paid)` avec row-level locking

```sql
-- Pseudo-code
BEGIN;
SELECT * FROM squares WHERE id = square_id FOR UPDATE;
-- Vérifier : status = 'occupe' ou 'libre'
-- Vérifier : price_paid >= replacement_count (si replacement_count > 0)
-- Créer publication
-- Mettre à jour square : replacement_count++, last_price = price_paid, current_publication_id
COMMIT;
```

**Rationale** : Le locking empêche les race conditions (deux personnes tentent de remplacer en même temps). La validation serveur empêche la triche sur le prix.

### 5. Flow client pour le remplacement

**Choix** :
- Case libre → upload direct (gratuit, même flow qu'avant)
- Case occupée → écran de prix avec : prix minimum affiché, input numérique pour prix libre (pré-rempli au minimum), bouton "Prendre cette place pour X€"
- Après paiement IAP validé → appel RPC `replace_square`

### 6. Suppression du countdown timer

**Choix** : Supprimer le composant CountdownTimer et toute référence à `expires_at` côté client.

**Rationale** : Plus d'expiration = plus de timer. Simplification importante de l'UI.

## Risks / Trade-offs

**[Prix qui ne descend jamais]** → Les cases très contestées peuvent devenir très chères. C'est voulu — c'est le mécanisme de rareté. Si problème en V2, on pourra ajouter une décroissance temporelle.

**[Cases "mortes" jamais remplacées]** → Une photo sur une case peu intéressante peut rester pour toujours. C'est acceptable — la map se remplit plutôt que de se vider.

**[Migration destructive]** → La suppression de `expires_at` et `square_demand` est irréversible. Mitigation : MVP pas en production, et backup avant migration.

**[Prix libre → abus]** → Un utilisateur pourrait payer 1000€ pour "verrouiller" une case. C'est un non-goal V1 de plafonner, mais si besoin on peut ajouter un cap en V2.

## Migration Plan

1. Créer la migration SQL (une seule, destructive OK car pré-production)
2. Mettre à jour les types TypeScript (`SquareStatus`, `Square`, `Publication`)
3. Modifier/créer les RPC Supabase (`publish_to_square`, `replace_square`)
4. Mettre à jour le client : supprimer timer, adapter statuts, ajouter écran de prix
5. Supprimer le cron job et les edge functions d'expiration
6. Mettre à jour les notifications (supprimer expiration, garder remplacement)

Pas de rollback strategy nécessaire (pré-production).

## Open Questions

- Faut-il afficher le `last_price` sur la case (pour info) ou seulement le `prix_minimum` ?
- Faut-il notifier l'ancien occupant du prix payé par le remplaçant ?
- Le prix libre a-t-il un montant maximum côté App Store / Google Play ?
