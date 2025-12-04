-- Create Storage Bucket for Complaint Images
-- Run this in Supabase SQL Editor

-- Check if bucket exists, if not create it
INSERT INTO storage.buckets (id, name, public)
VALUES ('complaint-images', 'complaint-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies (run these after creating the bucket)

-- Allow public to view images
CREATE POLICY IF NOT EXISTS "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'complaint-images');

-- Allow anyone to upload images (since we're using mock auth)
CREATE POLICY IF NOT EXISTS "Users upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaint-images');

-- Allow users to update images
CREATE POLICY IF NOT EXISTS "Users update images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'complaint-images');

-- Allow users to delete images
CREATE POLICY IF NOT EXISTS "Users delete images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'complaint-images');

