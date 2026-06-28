-- Migration: 014_seed_missing_permissions
-- Adds Documents, Document Types, Reminders, Notifications modules

-- ── Level 1: Parent modules ──────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id) VALUES
  ('Documents',       'documents',       4, NULL),
  ('Document Types',  'document_types',  5, NULL),
  ('Reminders',       'reminders',       6, NULL),
  ('Notifications',   'notifications',   7, NULL);

-- ── Documents children ───────────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Documents List',   'documents_list',   1, id FROM permissions WHERE slug = 'documents';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Documents Create', 'documents_create', 2, id FROM permissions WHERE slug = 'documents';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Documents Edit',   'documents_edit',   3, id FROM permissions WHERE slug = 'documents';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Documents Delete', 'documents_delete', 4, id FROM permissions WHERE slug = 'documents';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Documents Detail', 'documents_detail', 5, id FROM permissions WHERE slug = 'documents';

-- ── Document Types children ──────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Document Types List',   'document_types_list',   1, id FROM permissions WHERE slug = 'document_types';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Document Types Create', 'document_types_create', 2, id FROM permissions WHERE slug = 'document_types';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Document Types Edit',   'document_types_edit',   3, id FROM permissions WHERE slug = 'document_types';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Document Types Delete', 'document_types_delete', 4, id FROM permissions WHERE slug = 'document_types';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Document Types Detail', 'document_types_detail', 5, id FROM permissions WHERE slug = 'document_types';

-- ── Reminders children ───────────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Reminders List',   'reminders_list',   1, id FROM permissions WHERE slug = 'reminders';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Reminders Create', 'reminders_create', 2, id FROM permissions WHERE slug = 'reminders';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Reminders Edit',   'reminders_edit',   3, id FROM permissions WHERE slug = 'reminders';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Reminders Delete', 'reminders_delete', 4, id FROM permissions WHERE slug = 'reminders';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Reminders Detail', 'reminders_detail', 5, id FROM permissions WHERE slug = 'reminders';

-- ── Notifications children ───────────────────────────────────────────────────
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Notifications List',   'notifications_list',   1, id FROM permissions WHERE slug = 'notifications';
INSERT INTO permissions (name, slug, order_index, parent_id)
SELECT 'Notifications Detail', 'notifications_detail', 2, id FROM permissions WHERE slug = 'notifications';
