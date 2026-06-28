-- Migration: 006_create_indexes
-- Created: 2026-06-23

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_reminders_document_id ON reminders(document_id);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_date ON reminders(reminder_date, reminder_time);
