-- Renforcement : le propriétaire paie des Tessels pour augmenter le prix
-- plancher de SA case (défense dans la durée, sans lock permanent).
-- 100% brûlé (aucune redistribution) + remet le compteur de decay à zéro.
CREATE OR REPLACE FUNCTION fortify_square(
  p_user_id UUID,
  p_square_id UUID,
  p_amount INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_square squares%ROWTYPE;
  v_owner UUID;
  v_balance INTEGER;
  v_new_price INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_amount IS NULL OR p_amount < 50 THEN
    RAISE EXCEPTION 'Minimum fortification: 50 tessels';
  END IF;

  SELECT * INTO v_square FROM squares WHERE id = p_square_id FOR UPDATE;
  IF NOT FOUND OR v_square.status <> 'occupe' OR v_square.current_publication_id IS NULL THEN
    RAISE EXCEPTION 'Square not occupied';
  END IF;
  SELECT user_id INTO v_owner FROM publications WHERE id = v_square.current_publication_id;
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'You do not own this square';
  END IF;
  IF v_square.last_price >= 10000 THEN
    RAISE EXCEPTION 'Square already at maximum price';
  END IF;

  SELECT credits INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_TESSELS: need %, have %', p_amount, COALESCE(v_balance,0);
  END IF;

  UPDATE profiles SET credits = credits - p_amount WHERE user_id = p_user_id;
  INSERT INTO credit_transactions (user_id, amount, reason, reference_id)
  VALUES (p_user_id, -p_amount, 'fortify', p_square_id);

  v_new_price := LEAST(10000, v_square.last_price + p_amount);
  UPDATE squares
  SET last_price = v_new_price,
      last_activity_at = NOW(),
      last_decay_at = NULL,
      updated_at = NOW()
  WHERE id = p_square_id;

  RETURN v_new_price;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
