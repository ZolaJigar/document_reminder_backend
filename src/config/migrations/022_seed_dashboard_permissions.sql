-- Migration: 022_seed_dashboard_permissions
-- Created: 2026-06-30

-- ── Level 1: Dashboard parent module ─────────────────────────────────────────
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
VALUES ('Dashboard', 'dashboard', 12, NULL);

-- ── Level 2: Dashboard children ──────────────────────────────────────────────
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
SELECT 'Dashboard Summary',   'dashboard_summary',   1, id FROM permissions WHERE slug = 'dashboard';

INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
SELECT 'Dashboard Reminders', 'dashboard_reminders', 2, id FROM permissions WHERE slug = 'dashboard';
