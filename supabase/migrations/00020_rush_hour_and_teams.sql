-- ============================================================
-- Migration 00020: RUSH HOUR automatisé + TEAMS + défi hebdo
-- Rush Hour : samedi 17h-18h UTC (19h-20h Paris été), -50% sur les prises.
--   Zéro admin : la fenêtre est calculée par l'horloge, les pushes par cron.
-- Teams : 1 team par joueur, défi hebdo rotatif (publications / votes / prises),
--   récompenses distribuées automatiquement le lundi 00:05 UTC.
-- ============================================================

CREATE OR REPLACE FUNCTION is_rush_hour()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(DOW FROM NOW() AT TIME ZONE 'utc') = 6
     AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'utc') = 17;
$$;

CREATE OR REPLACE FUNCTION effective_min_price(p_last_price INTEGER)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN is_rush_hour()
    THEN GREATEST(100, (CEIL(min_take_price(p_last_price) * 0.5 / 10.0) * 10)::INTEGER)
    ELSE min_take_price(p_last_price)
  END;
$$;

CREATE OR REPLACE FUNCTION get_game_state()
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_active BOOLEAN := is_rush_hour();
  v_next TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
BEGIN
  v_next := date_trunc('week', v_now AT TIME ZONE 'utc') + INTERVAL '5 days 17 hours';
  IF v_next <= v_now THEN v_next := v_next + INTERVAL '7 days'; END IF;
  v_ends := date_trunc('hour', v_now) + INTERVAL '1 hour';
  RETURN jsonb_build_object(
    'rush_active', v_active,
    'rush_ends_at', CASE WHEN v_active THEN v_ends ELSE NULL END,
    'next_rush_at', v_next
  );
END;
$$;

-- take_square V3 : prix effectif (rush)
CREATE OR REPLACE FUNCTION take_square(
  p_square_id UUID,
  p_user_id UUID,
  p_image_url TEXT,
  p_bid INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_old_pub publications%ROWTYPE;
  v_pub_id UUID;
  v_min INTEGER; v_price INTEGER; v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Square not found'; END IF;
  IF v_square.status <> 'occupe' THEN
    RAISE EXCEPTION 'Square is not occupied (status: %)', v_square.status;
  END IF;

  IF EXISTS (SELECT 1 FROM shields WHERE square_id = p_square_id AND expires_at > NOW()) THEN
    RAISE EXCEPTION 'Square is protected by a shield';
  END IF;

  IF v_square.current_publication_id IS NOT NULL THEN
    SELECT * INTO v_old_pub FROM publications WHERE id = v_square.current_publication_id;
    IF FOUND AND v_old_pub.user_id = p_user_id THEN
      RAISE EXCEPTION 'You already own this square';
    END IF;
  END IF;

  v_min := effective_min_price(COALESCE(v_square.last_price, 0));
  v_price := COALESCE(p_bid, v_min);
  IF v_price < v_min THEN
    RAISE EXCEPTION 'Price too low: minimum is % tessels', v_min;
  END IF;

  SELECT credits INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_price THEN
    RAISE EXCEPTION 'INSUFFICIENT_TESSELS: need %, have %', v_price, COALESCE(v_balance,0);
  END IF;

  UPDATE profiles SET credits = credits - v_price WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, -v_price, 'take_square', p_square_id);

  IF v_old_pub.id IS NOT NULL THEN
    v_refund := FLOOR(v_price * 0.5);
    UPDATE profiles SET credits = credits + v_refund, total_credits_earned = total_credits_earned + v_refund
    WHERE user_id = v_old_pub.user_id;
    INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
    VALUES (v_old_pub.user_id, v_refund, 'square_income', p_square_id);

    INSERT INTO publication_history (
      publication_id, user_id, square_id, image_url,
      started_at, ended_at, status, acquisition_mode, end_reason
    ) VALUES (
      v_old_pub.id, v_old_pub.user_id, v_old_pub.square_id, v_old_pub.image_url,
      v_old_pub.started_at, NOW(), 'replaced',
      CASE WHEN v_old_pub.is_paid THEN 'paid' ELSE 'free' END, 'replaced_by_user'
    );
  END IF;

  INSERT INTO publications (user_id, square_id, image_url, status, is_paid, price_paid)
  VALUES (p_user_id, p_square_id, p_image_url, 'active', TRUE, v_price)
  RETURNING id INTO v_pub_id;

  IF v_old_pub.id IS NOT NULL THEN
    UPDATE publications SET status = 'replaced', replaced_by = v_pub_id WHERE id = v_old_pub.id;
  END IF;

  UPDATE squares
  SET status = 'occupe', current_publication_id = v_pub_id,
      replacement_count = COALESCE(replacement_count,0) + 1,
      last_price = v_price, last_decay_at = NULL,
      last_activity_at = NOW(), updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_feed : prix effectif (affiche le tarif rush pendant l'event)
CREATE OR REPLACE FUNCTION get_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  publication_id UUID, image_url TEXT, created_at TIMESTAMPTZ, vote_count INTEGER,
  owner_id UUID, username TEXT, avatar_url TEXT,
  square_id UUID, cell_id TEXT, last_price INTEGER, min_price INTEGER,
  has_voted BOOLEAN, is_shielded BOOLEAN
) AS $$
  SELECT
    pub.id, pub.image_url, pub.created_at, COALESCE(pub.vote_count,0),
    pub.user_id, pr.username, pr.avatar_url,
    s.id, s.cell_id, s.last_price, effective_min_price(s.last_price),
    EXISTS (SELECT 1 FROM votes v WHERE v.publication_id = pub.id AND v.user_id = p_user_id),
    EXISTS (SELECT 1 FROM shields sh WHERE sh.square_id = s.id AND sh.expires_at > NOW())
  FROM publications pub
  JOIN squares s ON s.current_publication_id = pub.id
  JOIN profiles pr ON pr.user_id = pub.user_id
  WHERE pub.status = 'active'
    AND (p_before IS NULL OR pub.created_at < p_before)
  ORDER BY pub.created_at DESC
  LIMIT LEAST(GREATEST(p_limit,1), 50);
$$ LANGUAGE sql SECURITY DEFINER;

-- Push broadcast (beta scale — à batcher via l'API Expo au-delà de ~10k users)
CREATE OR REPLACE FUNCTION notify_all(p_title TEXT, p_body TEXT, p_data JSONB DEFAULT '{}'::JSONB)
RETURNS INTEGER AS $$
DECLARE r RECORD; v_count INTEGER := 0;
BEGIN
  FOR r IN SELECT push_token FROM profiles
           WHERE push_token IS NOT NULL AND notifications_enabled = true
  LOOP
    PERFORM send_push_notification(r.push_token, p_title, p_body, p_data);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN PERFORM cron.unschedule('rush-warn'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('rush-start'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('rush-warn', '50 16 * * 6',
  $$SELECT notify_all('Rush Hour dans 10 minutes', '−50 % sur toutes les prises pendant 1 h. Prépare tes Tessels !', '{"type":"rush_soon"}'::jsonb)$$);
SELECT cron.schedule('rush-start', '0 17 * * 6',
  $$SELECT notify_all('🔥 Rush Hour !', 'Toutes les cases à −50 % pendant 1 heure. Fonce !', '{"type":"rush_start"}'::jsonb)$$);

-- ────────────── TEAMS ──────────────
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (char_length(name) BETWEEN 3 AND 24),
  emoji TEXT NOT NULL DEFAULT '⬡',
  color TEXT NOT NULL DEFAULT '#FFD700',
  created_by UUID NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS team_id UUID;

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_read ON teams;
CREATE POLICY teams_read ON teams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS team_members_read ON team_members;
CREATE POLICY team_members_read ON team_members FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION create_team(p_user_id UUID, p_name TEXT, p_emoji TEXT DEFAULT '⬡', p_color TEXT DEFAULT '#FFD700')
RETURNS UUID AS $$
DECLARE v_team_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM team_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Already in a team — leave it first';
  END IF;
  INSERT INTO teams (name, emoji, color, created_by, member_count)
  VALUES (trim(p_name), COALESCE(p_emoji,'⬡'), COALESCE(p_color,'#FFD700'), p_user_id, 1)
  RETURNING id INTO v_team_id;
  INSERT INTO team_members (team_id, user_id, role) VALUES (v_team_id, p_user_id, 'captain');
  UPDATE profiles SET team_id = v_team_id WHERE user_id = p_user_id;
  RETURN v_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION join_team(p_user_id UUID, p_team_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM team_members WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Already in a team — leave it first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'Team not found';
  END IF;
  INSERT INTO team_members (team_id, user_id) VALUES (p_team_id, p_user_id);
  UPDATE teams SET member_count = member_count + 1 WHERE id = p_team_id;
  UPDATE profiles SET team_id = p_team_id WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION leave_team(p_user_id UUID)
RETURNS VOID AS $$
DECLARE v_team_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT team_id INTO v_team_id FROM team_members WHERE user_id = p_user_id;
  IF v_team_id IS NULL THEN RETURN; END IF;
  DELETE FROM team_members WHERE user_id = p_user_id;
  UPDATE teams SET member_count = GREATEST(0, member_count - 1) WHERE id = v_team_id;
  UPDATE profiles SET team_id = NULL WHERE user_id = p_user_id;
  DELETE FROM teams WHERE id = v_team_id AND member_count <= 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────── DÉFI HEBDO (rotation automatique) ──────────────
CREATE OR REPLACE FUNCTION current_challenge_kind(p_when TIMESTAMPTZ DEFAULT NOW())
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT (EXTRACT(WEEK FROM p_when)::INTEGER % 3);
$$;

CREATE OR REPLACE FUNCTION team_challenge_scores(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_kind INTEGER)
RETURNS TABLE (team_id UUID, score BIGINT) AS $$
  SELECT tm.team_id,
    CASE p_kind
      WHEN 0 THEN COUNT(*) FILTER (WHERE pub.is_paid = false)
      WHEN 1 THEN COALESCE(SUM(sub.votes), 0)
      WHEN 2 THEN COUNT(*) FILTER (WHERE pub.is_paid = true)
    END AS score
  FROM publications pub
  JOIN team_members tm ON tm.user_id = pub.user_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS votes FROM votes v
    WHERE v.publication_id = pub.id AND v.created_at >= p_from AND v.created_at < p_to
  ) sub ON p_kind = 1
  WHERE pub.created_at >= p_from AND pub.created_at < p_to
     OR (p_kind = 1 AND sub.votes > 0)
  GROUP BY tm.team_id
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_team_challenge(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_from TIMESTAMPTZ := date_trunc('week', NOW());
  v_to TIMESTAMPTZ := date_trunc('week', NOW()) + INTERVAL '7 days';
  v_kind INTEGER := current_challenge_kind();
  v_label TEXT;
  v_top JSONB;
  v_my JSONB := NULL;
  v_my_team UUID;
BEGIN
  v_label := CASE v_kind
    WHEN 0 THEN 'Publier le plus de photos'
    WHEN 1 THEN 'Recevoir le plus de votes'
    ELSE 'Conquérir le plus de cases' END;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY rn), '[]'::jsonb) INTO v_top
  FROM (
    SELECT ROW_NUMBER() OVER (ORDER BY s.score DESC) AS rn,
           jsonb_build_object('rank', ROW_NUMBER() OVER (ORDER BY s.score DESC),
                              'team_id', t.id, 'name', t.name, 'emoji', t.emoji,
                              'member_count', t.member_count, 'score', s.score) AS row_data
    FROM team_challenge_scores(v_from, v_to, v_kind) s
    JOIN teams t ON t.id = s.team_id
    ORDER BY s.score DESC LIMIT 10
  ) top;

  SELECT team_id INTO v_my_team FROM team_members WHERE user_id = p_user_id;
  IF v_my_team IS NOT NULL THEN
    SELECT jsonb_build_object('team_id', t.id, 'name', t.name, 'emoji', t.emoji,
                              'member_count', t.member_count,
                              'score', COALESCE(s.score, 0),
                              'rank', COALESCE(r.rank, NULL))
    INTO v_my
    FROM teams t
    LEFT JOIN team_challenge_scores(v_from, v_to, v_kind) s ON s.team_id = t.id
    LEFT JOIN (
      SELECT team_id, ROW_NUMBER() OVER (ORDER BY score DESC) AS rank
      FROM team_challenge_scores(v_from, v_to, v_kind)
    ) r ON r.team_id = t.id
    WHERE t.id = v_my_team;
  END IF;

  RETURN jsonb_build_object(
    'kind', v_kind, 'label', v_label,
    'week_start', v_from, 'ends_at', v_to,
    'top', v_top, 'my_team', v_my
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS team_challenge_results (
  week_start DATE PRIMARY KEY,
  kind INTEGER NOT NULL,
  first_team UUID, second_team UUID, third_team UUID,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION award_weekly_team_challenge()
RETURNS VOID AS $$
DECLARE
  v_from TIMESTAMPTZ := date_trunc('week', NOW() - INTERVAL '7 days');
  v_to TIMESTAMPTZ := date_trunc('week', NOW());
  v_kind INTEGER := current_challenge_kind(v_from);
  v_teams UUID[];
  v_rewards INTEGER[] := ARRAY[200, 100, 50];
  i INTEGER; r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM team_challenge_results WHERE week_start = v_from::date) THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT s.team_id FROM team_challenge_scores(v_from, v_to, v_kind) s
    WHERE s.score > 0 ORDER BY s.score DESC LIMIT 3
  ) INTO v_teams;

  IF COALESCE(array_length(v_teams, 1), 0) = 0 THEN
    INSERT INTO team_challenge_results (week_start, kind) VALUES (v_from::date, v_kind);
    RETURN;
  END IF;

  FOR i IN 1..array_length(v_teams, 1) LOOP
    FOR r IN SELECT tm.user_id, pr.push_token, pr.notifications_enabled
             FROM team_members tm JOIN profiles pr ON pr.user_id = tm.user_id
             WHERE tm.team_id = v_teams[i]
             ORDER BY tm.joined_at LIMIT 100
    LOOP
      UPDATE profiles SET credits = credits + v_rewards[i],
                          total_credits_earned = total_credits_earned + v_rewards[i]
      WHERE user_id = r.user_id;
      INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
      VALUES (r.user_id, v_rewards[i], 'team_challenge_' || i, v_teams[i]);
      IF r.push_token IS NOT NULL AND r.notifications_enabled THEN
        PERFORM send_push_notification(
          r.push_token,
          CASE i WHEN 1 THEN '🏆 Ta team a gagné le défi !' ELSE '🎖 Ta team est sur le podium !' END,
          '+' || v_rewards[i] || ' Tessels pour toi. Nouveau défi cette semaine !',
          jsonb_build_object('type', 'team_reward', 'rank', i)
        );
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO team_challenge_results (week_start, kind, first_team, second_team, third_team)
  VALUES (v_from::date, v_kind, v_teams[1], v_teams[2], v_teams[3]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN PERFORM cron.unschedule('team-challenge-award'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('team-challenge-award', '5 0 * * 1', 'SELECT award_weekly_team_challenge()');

CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members (user_id);
