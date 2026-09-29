-- Update vehicle_status CHECK to include 'title_obtained'
ALTER TABLE towing_impounds DROP CONSTRAINT IF EXISTS towing_impounds_vehicle_status_check;

ALTER TABLE towing_impounds ADD CONSTRAINT towing_impounds_vehicle_status_check
  CHECK (vehicle_status IN ('active_impound', 'released', 'title_obtained', 'junkyard', 'for_sale'));
