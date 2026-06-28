-- Migration: 016_add_remind_before_days_to_reminders
-- Created: 2026-06-29
-- Adds remind_before_days: how many days before reminder_date the notifications start.
-- e.g. remind_before_days = 2 → sends on reminder_date-2, reminder_date-1, reminder_date

ALTER TABLE reminders
  ADD COLUMN remind_before_days INT NOT NULL DEFAULT 0
    COMMENT 'Days before reminder_date to start sending. 0 = only on the day itself.'
  AFTER message;
