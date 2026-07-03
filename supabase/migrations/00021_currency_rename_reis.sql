-- Monnaie renommée : Tessels → Reis (libellés uniquement).
-- Identifiants techniques inchangés (SKUs tessra_tessels_*, INSUFFICIENT_TESSELS, grant_tessels).

CREATE OR REPLACE FUNCTION notify_publication_replaced()
RETURNS TRIGGER AS $$
DECLARE
  v_token TEXT; v_taker TEXT; v_price INTEGER; v_refund INTEGER; v_cell TEXT;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'replaced' THEN
    SELECT p.push_token INTO v_token FROM profiles p
    WHERE p.user_id = OLD.user_id AND p.notifications_enabled = true;
    IF v_token IS NOT NULL THEN
      SELECT pr.username, COALESCE(pub.price_paid,0)::INTEGER, s.cell_id
      INTO v_taker, v_price, v_cell
      FROM publications pub
      JOIN profiles pr ON pr.user_id = pub.user_id
      JOIN squares s ON s.id = pub.square_id
      WHERE pub.id = NEW.replaced_by;
      v_refund := FLOOR(COALESCE(v_price,0) * 0.5);
      PERFORM send_push_notification(
        v_token,
        COALESCE(v_taker,'Quelqu''un') || ' a pris ta case !',
        'Tu récupères ' || v_refund || ' Reis. Reprends-la pour ' || min_take_price(v_price) || ' ⬡',
        jsonb_build_object('type','replaced','square_id', OLD.square_id, 'cell_id', v_cell, 'refund', v_refund)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN PERFORM cron.unschedule('rush-warn'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('rush-start'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('rush-warn', '50 16 * * 6',
  $$SELECT notify_all('Rush Hour dans 10 minutes', '−50 % sur toutes les prises pendant 1 h. Prépare tes Reis !', '{"type":"rush_soon"}'::jsonb)$$);
SELECT cron.schedule('rush-start', '0 17 * * 6',
  $$SELECT notify_all('🔥 Rush Hour !', 'Toutes les cases à −50 % pendant 1 heure. Fonce !', '{"type":"rush_start"}'::jsonb)$$);

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
          '+' || v_rewards[i] || ' Reis pour toi. Nouveau défi cette semaine !',
          jsonb_build_object('type', 'team_reward', 'rank', i)
        );
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO team_challenge_results (week_start, kind, first_team, second_team, third_team)
  VALUES (v_from::date, v_kind, v_teams[1], v_teams[2], v_teams[3]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
