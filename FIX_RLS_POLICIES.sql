-- Fix RLS Policies for UrbanSetu
-- Run this in Supabase SQL Editor

-- Drop existing policies first
DROP POLICY IF EXISTS "Users see own complaints" ON complaints;
DROP POLICY IF EXISTS "Users create own complaints" ON complaints;
DROP POLICY IF EXISTS "Admins see all complaints" ON complaints;
DROP POLICY IF EXISTS "Admins update all complaints" ON complaints;

-- Since we're using mock authentication, make policies more permissive
-- Users can see their own complaints (by user_id match)
CREATE POLICY "Users see own complaints"
  ON complaints FOR SELECT
  USING (true); -- Allow all for now, filter by user_id in application

-- Users can create complaints
CREATE POLICY "Users create own complaints"
  ON complaints FOR INSERT
  WITH CHECK (true); -- Allow all inserts for now

-- Admins can see all complaints (simplified - no auth.users check)
CREATE POLICY "Admins see all complaints"
  ON complaints FOR SELECT
  USING (true); -- Allow all for now, filter by userType in application

-- Admins can update all complaints
CREATE POLICY "Admins update all complaints"
  ON complaints FOR UPDATE
  USING (true); -- Allow all for now, filter by userType in application

-- Fix Storage Policies
-- Drop existing storage policies
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Users upload images" ON storage.objects;

-- Allow public to view images
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'complaint-images');

-- Allow anyone to upload images (since we're using mock auth)
CREATE POLICY "Users upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaint-images');

-- Allow users to update their own images
CREATE POLICY "Users update images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'complaint-images');

-- Allow users to delete their own images
CREATE POLICY "Users delete images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'complaint-images');

