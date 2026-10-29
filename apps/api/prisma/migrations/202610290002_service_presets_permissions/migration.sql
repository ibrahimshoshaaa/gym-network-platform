-- Match the existing restricted Vercel runtime role. CI installs its own role
-- after migrations; installations without this role require no extra grant.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gym_api_service') THEN
    GRANT SELECT, INSERT, UPDATE ON "ServicePreset" TO gym_api_service;
  END IF;
END $$;
