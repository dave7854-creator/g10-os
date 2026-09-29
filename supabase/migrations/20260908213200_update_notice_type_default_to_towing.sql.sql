-- Update notice_type to include 'towing' as a valid value and set it as default
-- Existing 'lien' records remain unchanged; new templates default to 'towing'

ALTER TABLE towing_notice_templates ALTER COLUMN notice_type SET DEFAULT 'towing';

-- Update any existing default templates that are still 'lien' to 'towing'
UPDATE towing_notice_templates SET notice_type = 'towing' WHERE notice_type = 'lien' AND is_default = true;
