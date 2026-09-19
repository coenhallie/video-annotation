import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storage = {
  createSignedUploadUrl: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
};
vi.mock('@/composables/useSupabase', () => ({
  supabase: { storage: { from: () => storage } },
}));

const createVideo = vi.fn();
vi.mock('@/services/videoService', () => ({ VideoService: { createVideo } }));

const generateThumbnailFromFile = vi.fn();
vi.mock('@/utils/thumbnailGenerator', () => ({
  ThumbnailGenerator: { generateThumbnailFromFile },
}));

/**
 * Stand-in for the browser's XMLHttpRequest. Records the request it was sent
 * and completes it on the next microtask with `status`, after one progress
 * event at 5/10 bytes.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static status = 200;
  /** When true the request stays in flight until abort() or finish(). */
  static hold = false;
  method = '';
  url = '';
  body: unknown = null;
  headers: Record<string, string> = {};
  status = 0;
  private listeners: Record<string, () => void> = {};
  private uploadListeners: Record<string, (e: ProgressEvent) => void> = {};
  upload = {
    addEventListener: (ev: string, cb: (e: ProgressEvent) => void) => {
      this.uploadListeners[ev] = cb;
    },
  };
  addEventListener(ev: string, cb: () => void) {
    this.listeners[ev] = cb;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  abort() {
    this.listeners.abort?.();
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.instances.push(this);
    if (FakeXhr.hold) return;
    queueMicrotask(() => {
      this.uploadListeners.progress?.({
        lengthComputable: true,
        loaded: 5,
        total: 10,
      } as ProgressEvent);
      this.status = FakeXhr.status;
      this.listeners.load?.();
    });
  }
}

const metadata = { duration: 12, fps: 25, totalFrames: 300, width: 1280, height: 720 };
const readMetadata = vi.fn(async () => metadata);

function mp4(name = 'clip.mp4', bytes: number[] = [0, 0, 0, 24]) {
  return new File([new Uint8Array(bytes)], name, { type: 'video/mp4' });
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeXhr.instances = [];
  FakeXhr.status = 200;
  FakeXhr.hold = false;
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  storage.createSignedUploadUrl.mockResolvedValue({
    data: { signedUrl: 'https://supa.test/upload?token=t' },
    error: null,
  });
  storage.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://supa.test/public/videos/${path}` },
  }));
  storage.remove.mockResolvedValue({ error: null });
  generateThumbnailFromFile.mockResolvedValue('data:image/jpeg;base64,thumb');
  createVideo.mockImplementation(async (row: Record<string, unknown>) => ({ id: 'v-new', ...row }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('VideoUploadService.validateVideoFile', () => {
  it('rejects a file that is not a supported video type', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const r = VideoUploadService.validateVideoFile(
      new File(['x'], 'notes.txt', { type: 'text/plain' })
    );
    expect(r).toEqual({
      valid: false,
      error: 'Unsupported file type. Upload an MP4, WebM, OGG or MOV file.',
    });
  });

  it('rejects a file over 1000MB', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const file = mp4();
    Object.defineProperty(file, 'size', { value: 1000 * 1024 * 1024 + 1 });
    expect(VideoUploadService.validateVideoFile(file)).toEqual({
      valid: false,
      error: 'File is too large. The maximum size is 1000MB.',
    });
  });

  it('accepts an mp4 under the size limit', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    expect(VideoUploadService.validateVideoFile(mp4())).toEqual({ valid: true });
  });
});

describe('VideoUploadService.validateVideoCompatibility', () => {
  it('rejects a file whose header carries an HEVC codec tag', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const hvc1 = [...'....ftypmp42....hvc1'].map((c) => c.charCodeAt(0));
    const r = await VideoUploadService.validateVideoCompatibility(mp4('h265.mp4', hvc1));
    expect(r).toEqual({
      valid: false,
      error:
        'HEVC (H.265) video does not play in every browser. Convert it to H.264 before uploading.',
    });
  });

  it('accepts a file with no HEVC tag', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const avc1 = [...'....ftypmp42....avc1'].map((c) => c.charCodeAt(0));
    expect(
      await VideoUploadService.validateVideoCompatibility(mp4('h264.mp4', avc1))
    ).toEqual({ valid: true });
  });
});

describe('VideoUploadService.uploadVideoComplete', () => {
  it('PUTs the file to a signed URL under the owner folder and reports progress', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const progress: number[] = [];
    await VideoUploadService.uploadVideoComplete(mp4('My Clip (1).mov'), 'user-1', {
      readMetadata,
      onProgress: (p) => progress.push(p.percentage),
    });

    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith(
      'user-1/1700000000000_My_Clip__1_.mov',
      { upsert: false }
    );
    expect(FakeXhr.instances).toHaveLength(1);
    const xhr = FakeXhr.instances[0]!;
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://supa.test/upload?token=t');
    expect(xhr.headers['Content-Type']).toBe('video/mp4');
    expect(xhr.body).toBeInstanceOf(File);
    expect(progress).toEqual([50, 100]);
  });

  it('creates an upload-type row from the file, its metadata and a thumbnail', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const file = mp4('My Clip (1).mov');
    const video = await VideoUploadService.uploadVideoComplete(file, 'user-1', {
      readMetadata,
    });

    expect(generateThumbnailFromFile).toHaveBeenCalledWith(file, 320);
    expect(createVideo).toHaveBeenCalledWith({
      ownerId: 'user-1',
      title: 'My Clip (1)',
      url: 'https://supa.test/public/videos/user-1/1700000000000_My_Clip__1_.mov',
      videoId: 'upload_1700000000000',
      fps: 25,
      duration: 12,
      totalFrames: 300,
      videoType: 'upload',
      filePath: 'user-1/1700000000000_My_Clip__1_.mov',
      fileSize: 4,
      originalFilename: 'My Clip (1).mov',
      isPublic: false,
      allowAnnotations: true,
      thumbnailUrl: 'data:image/jpeg;base64,thumb',
    });
    expect(video.id).toBe('v-new');
  });

  it('still creates the row when no thumbnail could be made', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    generateThumbnailFromFile.mockResolvedValue(null);
    await VideoUploadService.uploadVideoComplete(mp4(), 'user-1', { readMetadata });
    expect(createVideo).toHaveBeenCalledTimes(1);
    expect(createVideo.mock.calls[0]?.[0]).not.toHaveProperty('thumbnailUrl');
  });

  it('removes the stored object and rethrows when the row insert fails', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    createVideo.mockRejectedValue(new Error('row exploded'));
    await expect(
      VideoUploadService.uploadVideoComplete(mp4(), 'user-1', { readMetadata })
    ).rejects.toThrow('row exploded');
    expect(storage.remove).toHaveBeenCalledWith(['user-1/1700000000000_clip.mp4']);
  });

  it('fails without inserting a row when the PUT is not 2xx', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    FakeXhr.status = 403;
    await expect(
      VideoUploadService.uploadVideoComplete(mp4(), 'user-1', { readMetadata })
    ).rejects.toThrow('Upload failed with status 403');
    expect(createVideo).not.toHaveBeenCalled();
  });

  it('fails before uploading when the signed URL cannot be issued', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    storage.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });
    await expect(
      VideoUploadService.uploadVideoComplete(mp4(), 'user-1', { readMetadata })
    ).rejects.toThrow('new row violates row-level security policy');
    expect(FakeXhr.instances).toHaveLength(0);
    expect(createVideo).not.toHaveBeenCalled();
  });

  it('rejects an invalid file before touching storage', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    await expect(
      VideoUploadService.uploadVideoComplete(
        new File(['x'], 'notes.txt', { type: 'text/plain' }),
        'user-1',
        { readMetadata }
      )
    ).rejects.toThrow('Unsupported file type');
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe('VideoUploadService hardening', () => {
  const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
  /** A top-level MP4 box: 4-byte big-endian size, 4-byte type, payload. */
  const box = (type: string, payload: number[]) => {
    const size = 8 + payload.length;
    return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...ascii(type), ...payload];
  };

  // No browser decodes AVI, so an accepted AVI always died later in metadata
  // extraction with "the file may be corrupt".
  it('does not accept AVI', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const avi = new File(['x'], 'clip.avi', { type: 'video/x-msvideo' });
    expect(VideoUploadService.validateVideoFile(avi).valid).toBe(false);
  });

  // Phone recordings put `moov`, and with it the codec tag, at the END of the
  // file. Scanning only the first 64 KB let the commonest HEVC source through.
  it('finds an HEVC tag in a moov box at the end of the file', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const bytes = [
      ...box('ftyp', ascii('mp42....')),
      ...box('mdat', new Array(100 * 1024).fill(0)),
      ...box('moov', ascii('....trak....stsd....hvc1....')),
    ];
    const r = await VideoUploadService.validateVideoCompatibility(mp4('phone.mov', bytes));
    expect(r.valid).toBe(false);
  });

  it('does not mistake media bytes that happen to spell hvc1 for a codec tag', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const bytes = [
      ...box('ftyp', ascii('mp42....')),
      ...box('mdat', [...new Array(100 * 1024).fill(0), ...ascii('hvc1')]),
      ...box('moov', ascii('....trak....stsd....avc1....')),
    ];
    const r = await VideoUploadService.validateVideoCompatibility(mp4('h264.mp4', bytes));
    expect(r).toEqual({ valid: true });
  });

  // A MediaRecorder WebM reports Infinity. That serialises to null and the row
  // insert failed - after the whole file had been uploaded.
  it('rejects a video with no readable duration before touching storage', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    const noDuration = vi.fn(async () => ({ ...metadata, duration: Infinity, totalFrames: Infinity }));

    await expect(
      VideoUploadService.uploadVideoComplete(mp4(), 'u1', { readMetadata: noDuration })
    ).rejects.toThrow(/duration/i);
    expect(storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('stops the transfer and creates no row when the upload is cancelled', async () => {
    const { VideoUploadService } = await import('@/services/videoUploadService');
    FakeXhr.hold = true;
    const controller = new AbortController();
    const pending = VideoUploadService.uploadVideoComplete(mp4(), 'u1', {
      readMetadata,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    controller.abort();

    await expect(pending).rejects.toThrow(/cancelled/i);
    expect(createVideo).not.toHaveBeenCalled();
  });
});
