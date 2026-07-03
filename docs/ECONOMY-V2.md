# Tessra — Économie & Gameplay V2 (juillet 2026)

## Décisions clés (et pourquoi)

**1. Monnaie unique : le Tessel (⬡).** Fini les prix en euros par action. Tout le jeu se paie en Tessels : prises de cases, boucliers. L'IAP ne vend que des packs de Tessels.
- Règle l'impasse App Store : plus de payout à valeur réelle, plus de 50 SKUs par palier de prix, plus de math cassée avec la commission Apple (30% pris AVANT le split).
- La prise de case devient instantanée (solde ≥ prix → tap → done). L'achat IAP n'arrive qu'au moment où le solde est vide = friction déplacée hors de la boucle de jeu.
- Les joueurs gratuits gagnent des Tessels en jouant → ils goûtent à la conquête → conversion par impatience (modèle F2P standard).

**2. Présence GPS obligatoire pour publier (gratuit), prise à distance autorisée (payant).**
- "Être là" = revendication gratuite (le cœur du concept, désormais vérifié serveur, non contournable).
- Payer = combattre depuis n'importe où. Indispensable : la boucle de vengeance ("on a pris ta case" → reprendre depuis son canapé) ne fonctionne que si la reprise est possible à distance.

**3. Escalade multiplicative + décroissance.** +1€ linéaire était trop lent pour créer des cases mythiques.
- Prix mini de prise : `max(100, arrondi10(last_price × 1,5))`, plafond 10 000 ⬡.
- Progression : 100 → 150 → 230 → 350 → 530 → 800 → 1200… drama rapide sur les cases chaudes.
- Surenchère autorisée (payer plus que le mini pour blinder sa case).
- Décroissance : −20 %/7 j sans prise (plancher 100). Après 60 j d'inactivité : la case redevient libre (push à J−7 = réengagement).

**4. Split 50/50.** 50 % du prix payé → ancien occupant (en ⬡), 50 % brûlés (marge = vente de packs). La cagnotte 20 % est supprimée (complexité sans bénéfice joueur perceptible).

## Chiffres

### Packs IAP (consommables)
| SKU | Tessels | Prix | ⬡/€ |
|---|---|---|---|
| tessra_tessels_s | 300 | 2,99 € | 100 |
| tessra_tessels_m | 1 200 | 9,99 € | 120 |
| tessra_tessels_l | 2 800 | 19,99 € | 140 |
| tessra_tessels_xl | 8 000 | 49,99 € | 160 |
| tessra_tessels_xxl | 18 000 | 99,99 € | 180 |

### Gains (jeu gratuit)
Inscription +100 (permet une 1re prise immédiate = onboarding dans la boucle). Publication +10 (max 5/j). Nouvelle cellule explorée +5. Vote reçu +2. Streak : 3 j +20, 7 j +50, 30 j +200. Quêtes quotidiennes : publier 1 photo +20, voter 5 photos +15, prendre 1 case +50.

### Dépenses (sinks)
Prise de case (100 → 10 000). Boucliers : Bronze 1 h gratuit (1/j), Argent 6 h 150 ⬡, Or 24 h 500 ⬡.

## Boucles

**Boucle terrain (gratuite)** : se déplacer → publier (GPS vérifié) → gagner ⬡ + streak → explorer plus.
**Boucle canapé (rétention)** : feed Découvrir (swipe/vote) → quêtes quotidiennes → surveiller ses cases → shield/surenchère.
**Boucle vengeance (monétisation)** : push "X a pris ta case (tu récupères N ⬡)" → ouvrir → reprendre à distance → l'autre reçoit le push → escalade.
**Statut (whales)** : classements (cases détenues, votes, exploration) + badges.

## Backend (migration economy_v2)
- Enum simplifié : libre / occupe / signale / bloque. Suppression demand_score, base_price, cagnotte, square_demand, takeover_square, extend_publication.
- `squares.last_price` en ⬡ (INTEGER), `replacement_count`.
- RPC : `publish_new_square` (GPS requis), `take_square` (solde ⬡, split, surenchère), `grant_tessels` (idempotent, appelé par validate-receipt), `get_feed`, `get_leaderboard`, `get_daily_quests` / `claim_quest`, `decay_squares` (cron quotidien 03:00 UTC).
- Push (déjà en place via pg_net) : remplacement, vote, follow + nouveau : avertissement expiration J−7.
- Analytics : table `events` (insert client, fire-and-forget).
