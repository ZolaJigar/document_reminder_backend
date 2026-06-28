-- Migration: 009_create_roles_table

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  is_editable TINYINT(1) NOT NULL DEFAULT 1,
  is_deletable TINYINT(1) NOT NULL DEFAULT 1,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed Super Admin role (non-editable, non-deletable)
INSERT INTO roles (name, slug, is_editable, is_deletable, is_deleted)
VALUES ('Super Admin', 'super_admin', 0, 0, 0);
