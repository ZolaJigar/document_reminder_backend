-- Add Email Logs parent permission
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
VALUES ('Email Logs', 'email_logs', 11, NULL);

-- Add view_email_logs as a child of the Email Logs parent
INSERT IGNORE INTO permissions (name, slug, order_index, parent_id)
SELECT 'View Email Logs', 'view_email_logs', 1, id FROM permissions WHERE slug = 'email_logs';
