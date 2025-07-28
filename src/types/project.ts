import type { Video, ComparisonVideo } from './database';

export type Project = {
  id: string;
  projectType: 'single' | 'dual';
  title: string;
  thumbnailUrl?: string;
  createdAt: string;
} & (
  | {
      projectType: 'single';
      video: Video;
    }
  | {
      projectType: 'dual';
      videoA: Video;
      videoB: Video;
      comparisonVideo: ComparisonVideo;
    }
);
