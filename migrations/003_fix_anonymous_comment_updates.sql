-- Migration: Fix anonymous comment updates
-- Description: Creates a function to handle anonymous comment updates with proper session context
-- Date: 2025-01-25

-- Create a function to update comments with session context
CREATE OR REPLACE FUNCTION update_comment_with_session(
  comment_id UUID,
  new_content TEXT,
  session_id TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  annotation_id UUID,
  user_id UUID,
  session_id TEXT,
  content TEXT,
  user_display_name TEXT,
  is_anonymous BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  -- Set session context if provided
  IF session_id IS NOT NULL THEN
    PERFORM set_config('app.session_id', session_id, true);
  END IF;

  -- Update and return the comment
  RETURN QUERY
  UPDATE annotation_comments 
  SET 
    content = new_content,
    updated_at = NOW()
  WHERE annotation_comments.id = comment_id
  RETURNING 
    annotation_comments.id,
    annotation_comments.annotation_id,
    annotation_comments.user_id,
    annotation_comments.session_id,
    annotation_comments.content,
    annotation_comments.user_display_name,
    annotation_comments.is_anonymous,
    annotation_comments.created_at,
    annotation_comments.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION update_comment_with_session(UUID, TEXT, TEXT) TO anon, authenticated;