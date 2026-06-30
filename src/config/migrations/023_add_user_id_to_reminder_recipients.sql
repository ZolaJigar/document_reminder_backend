-- Migration: 023_add_user_id_to_reminder_recipients
-- Created: 2026-06-30
-- Allows a reminder recipient to be linked to an existing system user
-- instead of requiring manual email/phone entry.

ALTER TABLE reminder_recipients
  ADD COLUMN user_id INT DEFAULT NULL AFTER reminder_id,
  ADD CONSTRAINT fk_rr_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
