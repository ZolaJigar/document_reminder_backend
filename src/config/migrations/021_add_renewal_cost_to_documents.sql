-- Migration: 021_add_renewal_cost_to_documents
-- Created: 2026-06-30

ALTER TABLE documents
  ADD COLUMN renewal_cost DECIMAL(10, 2) DEFAULT NULL COMMENT 'Cost to renew this document' AFTER expiry_date;
