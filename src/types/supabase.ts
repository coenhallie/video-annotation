import type { Database as Generated } from './generated/supabase';
import type {
  AnnotationSurface,
  DrawingData,
  QaStatus,
  VideoContext,
} from './database';

/**
 * The schema types the Supabase client is built with: the generated ones, with
 * the few columns the generator cannot describe narrowed by hand.
 *
 * `supabase gen types` reads column types, and two kinds of column lose
 * information that way:
 *  - text columns held to a fixed set by a CHECK constraint come out as
 *    `string` (videoType, qaStatus, surface);
 *  - jsonb columns come out as `Json`, which a structured value such as
 *    DrawingData is not assignable to (no index signature). `Json` is also
 *    recursive, and a recursive type inside a Vue ref exceeds the compiler's
 *    instantiation depth, so it is kept out of the app's own types.
 *
 * Narrowing them here, once, is what keeps casts out of every query. The
 * generated file itself is never edited: regenerate it with `npm run gen:types`
 * after a migration, and add a line below only when a new column is one of the
 * two kinds above. Each override must restate a constraint that really exists
 * in the database.
 */
type ColumnOverrides = {
  videos: {
    videoType: 'url' | 'upload'; // check_video_type
    qaStatus: QaStatus; // videos_qa_status_check
    metadata: Record<string, unknown> | null; // jsonb
  };
  annotations: {
    surface: AnnotationSurface; // annotations_surface_check
    videoContext: VideoContext | null; // annotations_video_context_check
    drawingData: DrawingData | null; // jsonb
    metadata: Record<string, unknown> | null; // jsonb
    // TEMPORARY - the one line here that runs ahead of the database. Delete it
    // once migrations/20260920_annotations_frame_not_null.sql is applied and
    // the types are regenerated; the generated type is then `number` itself.
    frame: number;
  };
};

type PublicTables = Generated['public']['Tables'];

/** Replaces the listed columns of a Row/Insert/Update shape, keeping optionality. */
type Narrow<Shape, Columns> = {
  [K in keyof Shape]: K extends keyof Columns
    ? undefined extends Shape[K]
      ? Columns[K] | undefined
      : Columns[K]
    : Shape[K];
};

type NarrowTable<Table, Columns> = {
  [Part in keyof Table]: Part extends 'Row' | 'Insert' | 'Update'
    ? Narrow<Table[Part], Columns>
    : Table[Part];
};

export type Database = Omit<Generated, 'public'> & {
  public: Omit<Generated['public'], 'Tables'> & {
    Tables: {
      [T in keyof PublicTables]: T extends keyof ColumnOverrides
        ? NarrowTable<PublicTables[T], ColumnOverrides[T]>
        : PublicTables[T];
    };
  };
};

export type TableName = keyof PublicTables;
export type Row<T extends TableName> = Database['public']['Tables'][T]['Row'];
