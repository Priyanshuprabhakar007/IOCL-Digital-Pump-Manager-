-- Migration 0011: Phase 2C Completion - Permissions and Hardening

-- Add Permissions
INSERT INTO permissions (id, name, description) VALUES
('product_prices.read', 'Read product prices', 'Can view outlet product prices'),
('product_prices.write', 'Write product prices', 'Can manage outlet product prices'),
('credit_parties.read', 'Read credit parties', 'Can view outlet credit parties'),
('credit_parties.write', 'Write credit parties', 'Can manage outlet credit parties'),
('collections.read', 'Read collections', 'Can view shift collections'),
('collections.write', 'Write collections', 'Can manage shift collections'),
('cash_handover.read', 'Read cash handover', 'Can view cash handover logs'),
('cash_handover.write', 'Write cash handover', 'Can manage cash handover logs'),
('cash_handover.acknowledge', 'Acknowledge cash handover', 'Can acknowledge cash handover logs'),
('bank_deposits.read', 'Read bank deposits', 'Can view bank deposit logs'),
('bank_deposits.write', 'Write bank deposits', 'Can manage bank deposit logs'),
('bank_deposits.verify', 'Verify bank deposits', 'Can verify bank deposit logs'),
('financial_reconciliation.read', 'Read financial reconciliation', 'Can view financial reconciliation reports');

-- Map to existing roles (e.g., ADMIN gets all)
INSERT INTO role_permissions (role_id, permission_id)
SELECT id, 'product_prices.read' FROM roles
UNION ALL SELECT id, 'product_prices.write' FROM roles
UNION ALL SELECT id, 'credit_parties.read' FROM roles
UNION ALL SELECT id, 'credit_parties.write' FROM roles
UNION ALL SELECT id, 'collections.read' FROM roles
UNION ALL SELECT id, 'collections.write' FROM roles
UNION ALL SELECT id, 'cash_handover.read' FROM roles
UNION ALL SELECT id, 'cash_handover.write' FROM roles
UNION ALL SELECT id, 'cash_handover.acknowledge' FROM roles
UNION ALL SELECT id, 'bank_deposits.read' FROM roles
UNION ALL SELECT id, 'bank_deposits.write' FROM roles
UNION ALL SELECT id, 'bank_deposits.verify' FROM roles
UNION ALL SELECT id, 'financial_reconciliation.read' FROM roles;
