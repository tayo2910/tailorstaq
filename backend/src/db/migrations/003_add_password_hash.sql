ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
