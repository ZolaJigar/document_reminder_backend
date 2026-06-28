-- Migration: 004_create_reminder_recipients_table
-- Created: 2026-06-23

CREATE TABLE IF NOT EXISTS reminder_recipients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reminder_id INT NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(20),
  name VARCHAR(100),
  notify_email BOOLEAN DEFAULT TRUE,
  notify_whatsapp BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
);
