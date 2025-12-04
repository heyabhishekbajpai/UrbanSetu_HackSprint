-- Fix Foreign Key Constraint Issue
-- Run this in Supabase SQL Editor

-- Drop the foreign key constraint
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_user_id_fkey;

-- Change user_id column to TEXT (since we're using mock auth with UUID strings)
-- This allows any UUID string without requiring it to exist in auth.users
ALTER TABLE complaints ALTER COLUMN user_id TYPE TEXT;

-- Also update assigned_to if it has the same issue
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_assigned_to_fkey;
ALTER TABLE complaints ALTER COLUMN assigned_to TYPE TEXT;

-- Recreate indexes
DROP INDEX IF EXISTS idx_complaints_user_id;
CREATE INDEX idx_complaints_user_id ON complaints(user_id);

