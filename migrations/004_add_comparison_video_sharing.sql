-- Migration: 004_add_comparison_video_sharing.sql
ALTER TABLE comparison_videos
ADD COLUMN is_public BOOLEAN DEFAULT FALSE;

-- Add index for performance
CREATE INDEX idx_comparison_videos_is_public
ON comparison_videos(is_public)
WHERE is_public = TRUE;

-- Add updated_at trigger if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to comparison_videos if not exists
DROP TRIGGER IF EXISTS update_comparison_videos_updated_at ON comparison_videos;
CREATE TRIGGER update_comparison_videos_updated_at
    BEFORE UPDATE ON comparison_videos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Also need to extend anonymous_sessions to support comparison videos
ALTER TABLE anonymous_sessions
ADD COLUMN comparison_video_id UUID REFERENCES comparison_videos(id) ON DELETE CASCADE;

-- Add index for comparison video sessions
CREATE INDEX idx_anonymous_sessions_comparison_video
ON anonymous_sessions(comparison_video_id)
WHERE comparison_video_id IS NOT NULL;