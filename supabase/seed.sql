-- Seed data: test squares around Paris (geohash precision 6)
-- These are real geohash-6 cells covering central Paris

INSERT INTO squares (geohash, lat, lng, status, demand_score, base_price) VALUES
  -- Around Tour Eiffel / Champ de Mars
  ('u09tun', 48.8583, 2.2945, 'libre', 0, 0),
  ('u09tum', 48.8583, 2.2890, 'libre', 0, 0),
  ('u09tuq', 48.8583, 2.3000, 'libre', 0, 0),

  -- Around Louvre / Châtelet
  ('u09tvn', 48.8606, 2.3376, 'libre', 0, 0),
  ('u09tvp', 48.8606, 2.3431, 'libre', 0, 0),
  ('u09tvr', 48.8606, 2.3486, 'libre', 0, 0),

  -- Around Notre-Dame
  ('u09tvk', 48.8530, 2.3499, 'libre', 0, 0),
  ('u09tvs', 48.8530, 2.3554, 'libre', 0, 0),

  -- Around Montmartre / Sacré-Cœur
  ('u09wj2', 48.8867, 2.3431, 'libre', 0, 0),
  ('u09wj8', 48.8867, 2.3486, 'libre', 0, 0),

  -- Around Bastille / République
  ('u09ty5', 48.8534, 2.3693, 'libre', 0, 0),
  ('u09ty4', 48.8534, 2.3638, 'libre', 0, 0),

  -- Around Arc de Triomphe / Champs-Élysées
  ('u09tgx', 48.8738, 2.2950, 'libre', 0, 0),
  ('u09tgz', 48.8738, 2.3005, 'libre', 0, 0),

  -- Some occupied squares for visual variety
  ('u09tvj', 48.8566, 2.3522, 'occupe_gratuit', 2, 0),
  ('u09tvc', 48.8520, 2.3350, 'occupe_payant', 5, 1.99),
  ('u09twn', 48.8650, 2.3400, 'en_expiration', 3, 0.99)

ON CONFLICT (geohash) DO NOTHING;
