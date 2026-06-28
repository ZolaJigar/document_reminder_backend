-- Migration: 002_create_documents_table
-- Created: 2026-06-23

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
