/*
# Create part-photos storage bucket

1. Storage
- Create public bucket `part-photos` for customer part photos uploaded from the Find a Part form.
- Allow public read (anyone can view photos).
- Allow anon + authenticated upload (no login required to submit the form).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('part-photos', 'part-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_upload_part_photos" ON storage.objects;
CREATE POLICY "anon_upload_part_photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "public_read_part_photos" ON storage.objects;
CREATE POLICY "public_read_part_photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'part-photos');

DROP POLICY IF EXISTS "anon_delete_part_photos" ON storage.objects;
CREATE POLICY "anon_delete_part_photos"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'part-photos');