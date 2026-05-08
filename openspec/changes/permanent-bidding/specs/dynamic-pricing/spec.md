## REMOVED Requirements

### Requirement: Demand-based price calculation
**Reason**: Replaced entirely by incremental pricing model (see `incremental-pricing` capability). Price is now deterministic based on replacement count, not demand signals.
**Migration**: Remove `demand_score` and `base_price` columns from `squares` table. Drop `square_demand` table. Remove demand tracking edge function. Remove demand decay cron job.

### Requirement: Demand multiplier
**Reason**: No longer applicable. The new pricing model uses `replacement_count × 1€` instead of `base_price × (1 + demand_multiplier)`.
**Migration**: Remove all demand multiplier calculation logic from edge functions and client.

### Requirement: Price locking window
**Reason**: Replaced by atomic transaction with row locking in the new `replace_square` RPC. No 30-second lock window needed.
**Migration**: Remove price locking mechanism. The new model uses database-level row locking within the replacement transaction.

### Requirement: Demand decay
**Reason**: No demand tracking exists in the new model. Price only increases via replacements.
**Migration**: Remove demand decay cron job and related logic.
