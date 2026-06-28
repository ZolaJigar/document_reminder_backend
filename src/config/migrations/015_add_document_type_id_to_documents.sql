-- Migration: 015_add_document_type_id_to_documents
-- Links documents to document_types table

ALTER TABLE documents
  ADD COLUMN document_type_id INT NULL AFTER user_id,
  ADD CONSTRAINT fk_documents_document_type
    FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE SET NULL;
