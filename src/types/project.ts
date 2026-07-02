import type { Video, ComparisonVideo } from './database';
import type { ProjectOwner } from '../services/ownerEnrichmentService';

export type Project = {
  id: string;
  projectType: 'single' | 'dual';
  title: string;
  thumbnailUrl?: string;
  createdAt: string;
  owner?: ProjectOwner;
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
