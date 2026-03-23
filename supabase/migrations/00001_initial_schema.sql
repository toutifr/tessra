-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA cron;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SQUARES
-- ============================================================
CREATE TYPE square_status AS ENUM (
  'libre',
  'occupe_gratuit',
  'occupe_payant',
  'en_expiration',
  'remplacable',
  'signale',
  'en_moderation',
  'bloque'
);

CREATE TABLE squares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat FLOAT8 NOT NULL,
  lng FLOAT8 NOT NULL,
  geohash TEXT NOT NULL UNIQUE,
  status square_status NOT NULL DEFAULT 'libre',
  current_publication_id UUID, -- FK added after publications table
  demand_score INT NOT NULL DEFAULT 0,
  base_price DECIMAL(10, 2) NOT NULL DEFAULT 0.99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_squares_geohash ON squares(geohash);
CREATE INDEX idx_squares_status ON squares(status);
-- Functional index on geography for spatial queries
CREATE INDEX idx_squares_location ON squares USING GIST (
  (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography)
);

-- ============================================================
-- PUBLICATIONS
-- ============================================================
CREATE TABLE publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  price_paid DECIMAL(10, 2),
  replaced_by UUID REFERENCES publications(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publications_user_id ON publications(user_id);
CREATE INDEX idx_publications_square_id ON publications(square_id);
CREATE INDEX idx_publications_expires_at ON publications(expires_at);
CREATE INDEX idx_publications_status ON publications(status);

-- Add FK from squares to publications now that the table exists
ALTER TABLE squares
  ADD CONSTRAINT fk_squares_current_publication
  FOREIGN KEY (current_publication_id) REFERENCES publications(id) ON DELETE SET NULL;

-- ============================================================
-- PUBLICATION HISTORY
-- ============================================================
CREATE TABLE publication_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  acquisition_mode TEXT NOT NULL,
  end_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_publication_history_user_id ON publication_history(user_id);
CREATE INDEX idx_publication_history_square_id ON publication_history(square_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  platform TEXT NOT NULL,
  store_transaction_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_publication_id ON payments(publication_id);

-- ============================================================
-- MODERATION FLAGS
-- ============================================================
CREATE TABLE moderation_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_moderation_flags_status ON moderation_flags(status);
CREATE INDEX idx_moderation_flags_publication_id ON moderation_flags(publication_id);

-- ============================================================
-- SQUARE DEMAND
-- ============================================================
CREATE TABLE square_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_id UUID NOT NULL REFERENCES squares(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  user_id UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_square_demand_square_id_created_at ON square_demand(square_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Profiles: users can read any profile, update only their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (true);

CREATE POLICY profiles_insert ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_update ON profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Squares: anyone can read, only authenticated users can insert (lazy creation)
ALTER TABLE squares ENABLE ROW LEVEL SECURITY;

CREATE POLICY squares_select ON squares
  FOR SELECT USING (true);

CREATE POLICY squares_insert ON squares
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY squares_update ON squares
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Publications: anyone can read active, users can insert their own
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY publications_select ON publications
  FOR SELECT USING (true);

CREATE POLICY publications_insert ON publications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY publications_update ON publications
  FOR UPDATE USING (auth.uid() = user_id);

-- Publication History: users can only see their own history
ALTER TABLE publication_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY publication_history_select ON publication_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY publication_history_insert ON publication_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Payments: users can only see their own payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Moderation Flags: users can create flags, only admins can read all
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY moderation_flags_insert ON moderation_flags
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY moderation_flags_select_own ON moderation_flags
  FOR SELECT USING (auth.uid() = reporter_id);

-- Square Demand: authenticated users can insert, service role can read
ALTER TABLE square_demand ENABLE ROW LEVEL SECURITY;

CREATE POLICY square_demand_insert ON square_demand
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY square_demand_select ON square_demand
  FOR SELECT USING (true);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'publications',
  'publications',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png']::text[]
);

-- Storage policies: authenticated users can upload, anyone can read
CREATE POLICY storage_publications_select ON storage.objects
  FOR SELECT USING (bucket_id = 'publications');

CREATE POLICY storage_publications_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'publications'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY storage_publications_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'publications'
    AND auth.uid() IS NOT NULL
  );

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGN-UP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      'user_' || LEFT(NEW.id::text, 8)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
