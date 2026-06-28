-- Document Types master table
CREATE TABLE IF NOT EXISTS document_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed default document types
INSERT IGNORE INTO document_types (name, description) VALUES
  ('Passport', 'International travel document'),
  ('National ID', 'Government-issued national identity card'),
  ('Driving License', 'Motor vehicle driving licence'),
  ('Vehicle Registration', 'Motor vehicle registration certificate'),
  ('Insurance Policy', 'Insurance policy document'),
  ('Visa', 'Travel visa issued by a foreign country'),
  ('PAN Card', 'Permanent Account Number card'),
  ('Aadhaar Card', 'Unique Identification card (India)'),
  ('Birth Certificate', 'Official birth registration certificate'),
  ('Marriage Certificate', 'Official marriage registration certificate'),
  ('Property Document', 'Property ownership or lease deed'),
  ('Bank Statement', 'Bank account statement'),
  ('Tax Return', 'Income tax return filing'),
  ('Medical Certificate', 'Medical or health certificate'),
  ('Educational Certificate', 'Academic degree or diploma'),
  ('Other', 'Other document type');
