-- Document Reminder Database Schema
-- Run this file to set up the database

CREATE DATABASE IF NOT EXISTS document_reminder CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE document_reminder;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  file_name VARCHAR(255),
  file_path VARCHAR(500),
  file_type VARCHAR(100),
  file_size BIGINT,
  expiry_date DATE,
  notes TEXT,
  status ENUM('active', 'expiring_soon', 'expired') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reminders table
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

-- Reminder recipients (multiple emails/phones per reminder)
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

-- Notification logs
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

-- Indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_reminders_document_id ON reminders(document_id);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_date ON reminders(reminder_date, reminder_time);
