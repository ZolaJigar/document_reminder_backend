-- Migration: 003_create_reminders_table
-- Created: 2026-06-23

CREATE TABLE IF NOT EXISTS reminders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  user_id INT NOT NULL,
  reminder_date DATE NOT NULL,
  reminder_time TIME NOT NULL,
  message TEXT,
  notify_email BOOLEAN DEFAULT TRUE,
  notify_whatsapp BOOLEAN DEFAULT FALSE,
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
