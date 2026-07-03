-- Index de perf pour feed / leaderboards / decay à volume élevé
CREATE INDEX IF NOT EXISTS idx_pub_active_created ON publications (created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pub_active_user ON publications (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_squares_decay ON squares (last_activity_at) WHERE status = 'occupe';
CREATE INDEX IF NOT EXISTS idx_votes_user_day ON votes (user_id, created_at);
