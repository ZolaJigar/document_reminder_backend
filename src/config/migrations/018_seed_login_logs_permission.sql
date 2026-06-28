-- Add Login Logs parent permission
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
VALUES ('Login Logs', 'login_logs', 10, NULL);

-- Add view_login_logs as a child of the Login Logs parent
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
SELECT 'View Login Logs', 'view_login_logs', 1, id FROM permissions WHERE slug = 'login_logs';
