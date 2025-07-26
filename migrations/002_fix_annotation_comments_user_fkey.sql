-- Migration: Fix annotation_comments user foreign key relationship
-- Description: Updates the foreign key constraint to point to public.users instead of auth.users
-- Date: 2025-01-25

-- Fix foreign key relationship for annotation_comments.user_id
-- Drop the existing foreign key constraint that points to auth.users
ALTER TABLE annotation_comments DROP CONSTRAINT IF EXISTS annotation_comments_user_id_fkey;

-- Add new foreign key constraint that points to public.users
ALTER TABLE annotation_comments ADD CONSTRAINT annotation_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;