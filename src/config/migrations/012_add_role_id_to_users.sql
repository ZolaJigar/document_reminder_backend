-- Migration: 012_add_role_id_to_users

ALTER TABLE users
  ADD COLUMN role_id BIGINT DEFAULT NULL,
  ADD CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;
