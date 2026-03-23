-- Admin function: dismiss a moderation report
CREATE OR REPLACE FUNCTION admin_dismiss_report(p_flag_id UUID, p_reviewer_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE moderation_flags
  SET status = 'dismissed', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_flag_id;

  -- Restore the square status if it was flagged
  UPDATE squares s
  SET status = CASE
    WHEN p.is_paid THEN 'occupe_payant'
    ELSE 'occupe_gratuit'
  END, updated_at = NOW()
  FROM publications p, moderation_flags mf
  WHERE mf.id = p_flag_id
    AND p.id = mf.publication_id
    AND s.current_publication_id = p.id
    AND s.status IN ('signale', 'en_moderation');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin function: remove a publication (confirmed moderation)
CREATE OR REPLACE FUNCTION admin_remove_publication(p_flag_id UUID, p_reviewer_id UUID)
RETURNS void AS $$
DECLARE
  v_pub_id UUID;
  v_square_id UUID;
BEGIN
  SELECT publication_id INTO v_pub_id FROM moderation_flags WHERE id = p_flag_id;

  -- Update flag
  UPDATE moderation_flags
  SET status = 'reviewed', reviewed_by = p_reviewer_id, reviewed_at = NOW()
  WHERE id = p_flag_id;

  -- Get square
  SELECT square_id INTO v_square_id FROM publications WHERE id = v_pub_id;

  -- Mark publication deleted
  UPDATE publications SET status = 'deleted' WHERE id = v_pub_id;

  -- Free the square
  UPDATE squares
  SET status = 'libre', current_publication_id = NULL, updated_at = NOW()
  WHERE id = v_square_id;

  -- Record in history
  INSERT INTO publication_history (
    publication_id, user_id, square_id, image_url,
    started_at, ended_at, status, acquisition_mode, end_reason
  )
  SELECT id, user_id, square_id, image_url,
    started_at, NOW(), 'deleted', 'free', 'moderation_deleted'
  FROM publications WHERE id = v_pub_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin function: block a user
CREATE OR REPLACE FUNCTION admin_block_user(p_user_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE profiles SET is_blocked = TRUE, updated_at = NOW() WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS: blocked users cannot publish
CREATE POLICY profiles_block_check ON publications
  FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_blocked = TRUE
    )
  );
