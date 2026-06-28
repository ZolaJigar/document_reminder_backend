-- Migration: 013_add_is_active_to_roles
ALTER TABLE roles
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;
