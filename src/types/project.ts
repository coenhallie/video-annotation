import type { Video, ComparisonVideo } from './database';

export type Project = {
  id: string;
  project_type: 'single' | 'dual';
  title: string;
  thumbnail_url?: string;
  created_at: string;
} & (
  | {
      project_type: 'single';
      video: Video;
    }
  | {
      project_type: 'dual';
      video_a: Video;
      video_b: Video;
      comparison_video: ComparisonVideo;
    }
);
