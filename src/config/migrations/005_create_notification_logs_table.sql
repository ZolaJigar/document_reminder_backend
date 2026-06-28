-- Migration: 005_create_notification_logs_table
-- Created: 2026-06-23

CREATE TABLE IF NOT EXISTS notification_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reminder_id INT NOT NULL,
  recipient_email VARCHAR(150),
  recipient_phone VARCHAR(20),
  channel ENUM('email', 'whatsapp') NOT NULL,
  status ENUM('sent', 'failed') NOT NULL,
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
);
