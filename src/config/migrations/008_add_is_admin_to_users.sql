-- Add is_admin flag to users table
ALTER TABLE users
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
