-- Migration: Add Comment System
-- Description: Creates tables and policies for the annotation comment system
-- Date: 2025-01-25

-- Create annotation_comments table
CREATE TABLE annotation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT, -- For anonymous users
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
  user_display_name TEXT, -- For anonymous users or custom display names
  is_anonymous BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_user_identification
    CHECK (
      (user_id IS NOT NULL AND session_id IS NULL) OR
      (user_id IS NULL AND session_id IS NOT NULL)
    ),
  CONSTRAINT valid_display_name_for_anonymous
    CHECK (
      (is_anonymous = FALSE) OR
      (is_anonymous = TRUE AND user_display_name IS NOT NULL)
    )
);

-- Create anonymous_sessions table for tracking anonymous user sessions
CREATE TABLE anonymous_sessions (
  session_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_annotation_comments_annotation_id ON annotation_comments(annotation_id);
CREATE INDEX idx_annotation_comments_created_at ON annotation_comments(created_at);
CREATE INDEX idx_annotation_comments_user_id ON annotation_comments(user_id);
CREATE INDEX idx_annotation_comments_session_id ON annotation_comments(session_id);
CREATE INDEX idx_anonymous_sessions_video_id ON anonymous_sessions(video_id);
CREATE INDEX idx_anonymous_sessions_last_active ON anonymous_sessions(last_active);

-- Enable Row Level Security
ALTER TABLE annotation_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for annotation_comments

-- Allow reading comments for public videos or owned videos
CREATE POLICY "Users can read comments on accessible annotations" ON annotation_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM annotations a
      JOIN videos v ON a.video_id = v.id
      WHERE a.id = annotation_comments.annotation_id
      AND (
        v.is_public = TRUE OR
        v.owner_id = auth.uid() OR
        a.user_id = auth.uid()
      )
    )
  );

-- Allow authenticated users to create comments
CREATE POLICY "Authenticated users can create comments" ON annotation_comments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid() AND
    is_anonymous = FALSE AND
    EXISTS (
      SELECT 1 FROM annotations a
      JOIN videos v ON a.video_id = v.id
      WHERE a.id = annotation_id
      AND (v.is_public = TRUE OR v.owner_id = auth.uid() OR a.user_id = auth.uid())
    )
  );

-- Allow anonymous users to create comments on public videos
CREATE POLICY "Anonymous users can comment on public videos" ON annotation_comments
  FOR INSERT WITH CHECK (
    user_id IS NULL AND
    session_id IS NOT NULL AND
    is_anonymous = TRUE AND
    user_display_name IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM annotations a
      JOIN videos v ON a.video_id = v.id
      WHERE a.id = annotation_id AND v.is_public = TRUE
    )
  );

-- Allow users to update their own comments
CREATE POLICY "Users can update own comments" ON annotation_comments
  FOR UPDATE USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (auth.uid() IS NULL AND session_id = current_setting('app.session_id', true))
  );

-- Allow comment deletion by comment author or annotation owner
CREATE POLICY "Users can delete own comments or comments on their annotations" ON annotation_comments
  FOR DELETE USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) OR
    (auth.uid() IS NULL AND session_id = current_setting('app.session_id', true)) OR
    EXISTS (
      SELECT 1 FROM annotations a
      WHERE a.id = annotation_id AND a.user_id = auth.uid()
    )
  );

-- RLS Policies for anonymous_sessions

-- Allow reading anonymous sessions for public videos
CREATE POLICY "Users can read anonymous sessions for public videos" ON anonymous_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM videos v
      WHERE v.id = video_id AND v.is_public = TRUE
    )
  );

-- Allow creating anonymous sessions for public videos
CREATE POLICY "Users can create anonymous sessions for public videos" ON anonymous_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM videos v
      WHERE v.id = video_id AND v.is_public = TRUE
    )
  );

-- Allow updating anonymous sessions (for last_active timestamp)
CREATE POLICY "Users can update anonymous sessions" ON anonymous_sessions
  FOR UPDATE USING (
    session_id = current_setting('app.session_id', true)
  );

-- Database functions

-- Function to set session context for RLS
CREATE OR REPLACE FUNCTION set_session_context(session_id TEXT)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.session_id', session_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old anonymous sessions (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_anonymous_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM anonymous_sessions
  WHERE last_active < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp on annotation_comments
CREATE OR REPLACE FUNCTION update_annotation_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_annotation_comments_updated_at
  BEFORE UPDATE ON annotation_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_annotation_comments_updated_at();

-- Trigger to update last_active timestamp on anonymous_sessions
CREATE OR REPLACE FUNCTION update_anonymous_sessions_last_active()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_anonymous_sessions_last_active
  BEFORE UPDATE ON anonymous_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_anonymous_sessions_last_active();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON annotation_comments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_sessions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION set_session_context(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_anonymous_sessions() TO authenticated;