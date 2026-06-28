-- Migration: 010_create_permissions_table

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  order_index INT DEFAULT NULL,
  parent_id BIGINT DEFAULT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permissions_slug (slug),
  INDEX idx_permissions_parent_id (parent_id),
  INDEX idx_permissions_is_deleted (is_deleted),
  CONSTRAINT fk_permissions_parent FOREIGN KEY (parent_id) REFERENCES permissions(id) ON DELETE SET NULL
);

-- Seed hierarchical permissions

-- ── Level 1: Parent modules ──────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id) VALUES
  ('Users',       'users',       1, NULL),
  ('Roles',       'roles',       2, NULL),
  ('Permissions', 'permissions', 3, NULL);

-- ── Level 2: Users children ──────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Users List',   'users_list',   1, id FROM permissions WHERE slug = 'users';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Users Create', 'users_create', 2, id FROM permissions WHERE slug = 'users';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Users Edit',   'users_edit',   3, id FROM permissions WHERE slug = 'users';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Users Delete', 'users_delete', 4, id FROM permissions WHERE slug = 'users';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Users Detail', 'users_detail', 5, id FROM permissions WHERE slug = 'users';

-- ── Level 2: Roles children ──────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Roles List',   'roles_list',   1, id FROM permissions WHERE slug = 'roles';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Roles Create', 'roles_create', 2, id FROM permissions WHERE slug = 'roles';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Roles Edit',   'roles_edit',   3, id FROM permissions WHERE slug = 'roles';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Roles Delete', 'roles_delete', 4, id FROM permissions WHERE slug = 'roles';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Roles Detail', 'roles_detail', 5, id FROM permissions WHERE slug = 'roles';

-- ── Level 2: Permissions children ────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Permissions List',   'permissions_list',   1, id FROM permissions WHERE slug = 'permissions';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Permissions Create', 'permissions_create', 2, id FROM permissions WHERE slug = 'permissions';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Permissions Edit',   'permissions_edit',   3, id FROM permissions WHERE slug = 'permissions';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Permissions Delete', 'permissions_delete', 4, id FROM permissions WHERE slug = 'permissions';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Permissions Detail', 'permissions_detail', 5, id FROM permissions WHERE slug = 'permissions';
