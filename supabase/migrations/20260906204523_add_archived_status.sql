ALTER TABLE vehicle_statuses ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

INSERT INTO vehicle_statuses (name, slug, color, sort_order, is_default, workflow, is_archived)
VALUES ('Archived', 'archived', 'slate', 999, false, null, true)
ON CONFLICT (slug) DO UPDATE SET is_archived = true;
