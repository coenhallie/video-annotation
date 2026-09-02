// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThumbnailGenerator } from '@/utils/thumbnailGenerator';

/**
 * jsdom has no media pipeline and no 2D context, so the element the generator
 * drives is faked. The fake models the two media behaviours the generator has
 * to survive, both taken from the HTML spec's seek algorithm:
 *
 *   - a seek to a non-finite position never completes, so no `seeked` fires;
 *   - a seek to the position the element is already at is a no-op, so no
 *     `seeked` fires there either.
 *
 * Both leave the generator waiting on an event that will never arrive, which is
 * exactly the hang these tests exist to pin.
 */
class FakeVideo {
  crossOrigin = '';
  muted = false;
  playsInline = false;
  duration = 10;
  videoWidth = 640;
  videoHeight = 360;
  readyState = 0;

  onloadedmetadata: (() => void) | null = null;
  onloadeddata: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  onerror: (() => void) | null = null;

  /** Every value assigned to currentTime, completed or not. */
  seeks: number[] = [];
  removed = false;

  private position = 0;

  get currentTime() {
    return this.position;
  }

  set currentTime(value: number) {
    this.seeks.push(value);
    if (!Number.isFinite(value)) return;
    if (value === this.position) return;
    this.position = value;
    queueMicrotask(() => this.onseeked?.());
  }

  set src(_value: string) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onloadedmetadata?.();
      queueMicrotask(() => {
        this.readyState = 2;
        this.onloadeddata?.();
      });
    });
  }

  load() {}

  remove() {
    this.removed = true;
  }
}

class FakeCanvas {
  width = 0;
  height = 0;
  brightness = 200;
  drawn = 0;

  getContext(kind: string) {
    if (kind !== '2d') return null;
    return {
      drawImage: () => {
        this.drawn++;
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(w * h * 4, 4)).fill(this.brightness),
      }),
    };
  }

  toDataURL() {
    return 'data:image/jpeg;base64,captured';
  }

  remove() {}
}

let video: FakeVideo;
let canvas: FakeCanvas;

/**
 * Resolves to 'HUNG' rather than waiting forever, so a generator that never
 * settles fails the assertion instead of the whole suite timing out.
 */
async function generateOrHang(seekTime?: number) {
  return Promise.race([
    ThumbnailGenerator.generateSmallThumbnail(
      'https://s3.example.com/generated.mp4',
      320,
      seekTime
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('HUNG'), 50)),
  ]);
}

beforeEach(() => {
  video = new FakeVideo();
  canvas = new FakeCanvas();
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'video') return video;
    if (tag === 'canvas') return canvas;
    throw new Error(`unexpected createElement(${tag})`);
  }) as typeof document.createElement);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateSmallThumbnail', () => {
  it('seeks into a video with a finite duration and captures the frame', async () => {
    video.duration = 10;

    await expect(generateOrHang()).resolves.toBe('data:image/jpeg;base64,captured');
    expect(video.seeks).toEqual([3]);
  });

  it('captures without seeking when the duration is not finite', async () => {
    // A realtime pipeline mp4 reports duration Infinity until it is fully
    // buffered. duration * 0.3 is Infinity, and that seek never completes.
    video.duration = Infinity;

    await expect(generateOrHang()).resolves.toBe('data:image/jpeg;base64,captured');
    expect(video.seeks.filter((t) => !Number.isFinite(t))).toEqual([]);
  });

  it('captures without seeking when the requested time is the current position', async () => {
    // A no-op seek fires no `seeked` event, so waiting for one hangs.
    video.duration = 10;

    await expect(generateOrHang(0)).resolves.toBe('data:image/jpeg;base64,captured');
  });

  it('does not retry black frames when the duration is not finite', async () => {
    video.duration = Infinity;
    canvas.brightness = 0;

    await expect(generateOrHang()).resolves.toBe('data:image/jpeg;base64,captured');
    expect(video.seeks.filter((t) => !Number.isFinite(t))).toEqual([]);
  });

  it('retries a black frame at the next position when the duration is finite', async () => {
    video.duration = 10;
    canvas.brightness = 0;

    await expect(generateOrHang()).resolves.toBe('data:image/jpeg;base64,captured');
    expect(video.seeks).toEqual([3, 5, 7, 1, 9]);
  });

  it('resolves null when the video fails to load', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') {
        const failing = new FakeVideo();
        Object.defineProperty(failing, 'src', {
          set() {
            queueMicrotask(() => failing.onerror?.());
          },
        });
        return failing;
      }
      if (tag === 'canvas') return canvas;
      throw new Error(`unexpected createElement(${tag})`);
    }) as typeof document.createElement);

    await expect(generateOrHang()).resolves.toBeNull();
  });
});

describe('generateThumbnail', () => {
  it('captures without seeking when the duration is not finite', async () => {
    video.duration = Infinity;

    const result = await Promise.race([
      ThumbnailGenerator.generateThumbnail('https://s3.example.com/generated.mp4'),
      new Promise<string>((resolve) => setTimeout(() => resolve('HUNG'), 50)),
    ]);

    expect(result).toBe('data:image/jpeg;base64,captured');
    expect(video.seeks.filter((t) => !Number.isFinite(t))).toEqual([]);
  });
});
