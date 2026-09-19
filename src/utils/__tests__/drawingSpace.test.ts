import { describe, it, expect } from 'vitest';
import { pictureRectIn, toPictureSpace } from '@/utils/drawingSpace';

describe('pictureRectIn', () => {
  it('letterboxes a wide video top and bottom', () => {
    // 1920x660 clip in a 1000x800 box: full width, 1000/ (1920/660) tall, centred.
    const r = pictureRectIn({ width: 1000, height: 800 }, { width: 1920, height: 660 });
    expect(r.width).toBeCloseTo(1000);
    expect(r.height).toBeCloseTo(343.75);
    expect(r.left).toBeCloseTo(0);
    expect(r.top).toBeCloseTo(228.125);
  });

  it('pillarboxes a tall video left and right', () => {
    const r = pictureRectIn({ width: 1000, height: 500 }, { width: 500, height: 1000 });
    expect(r).toMatchObject({ width: 250, height: 500, left: 375, top: 0 });
  });

  // The player never upscales: max-width/max-height with auto sizing.
  it('does not enlarge a video smaller than the box', () => {
    const r = pictureRectIn({ width: 1000, height: 800 }, { width: 320, height: 240 });
    expect(r).toMatchObject({ width: 320, height: 240, left: 340, top: 280 });
  });
});

describe('toPictureSpace', () => {
  const video = { width: 1920, height: 660 };

  // A legacy drawing was normalised to the whole player box, letterbox bands
  // included. The point below was drawn on the exact centre of the picture.
  it('re-expresses a legacy point relative to the picture', () => {
    const legacy = { canvasWidth: 1000, canvasHeight: 800 };
    expect(toPictureSpace({ x: 0.5, y: 0.5 }, legacy, video)).toEqual({ x: 0.5, y: 0.5 });
    // The picture's top-left corner sat at y = 228.125px of 800.
    const corner = toPictureSpace({ x: 0, y: 228.125 / 800 }, legacy, video);
    expect(corner.x).toBeCloseTo(0);
    expect(corner.y).toBeCloseTo(0);
  });

  it('is the same picture point whatever box the drawing was made in', () => {
    // The picture's bottom-right corner, recorded in two differently shaped boxes.
    const inTall = toPictureSpace({ x: 1, y: (228.125 + 343.75) / 800 }, { canvasWidth: 1000, canvasHeight: 800 }, video);
    const inWide = toPictureSpace({ x: (1454.5454 + 0) / 1454.5454, y: 1 }, { canvasWidth: 1454.5454, canvasHeight: 500 }, video);
    expect(inTall.x).toBeCloseTo(inWide.x, 3);
    expect(inTall.y).toBeCloseTo(inWide.y, 3);
  });

  // New drawings are made on a canvas that covers exactly the picture, so the
  // recorded size has the video's shape and no flag is needed to tell them apart.
  it('leaves a drawing made on a picture-sized canvas unchanged', () => {
    const current = { canvasWidth: 960, canvasHeight: 330 };
    const p = toPictureSpace({ x: 0.1, y: 0.9 }, current, video);
    expect(p.x).toBeCloseTo(0.1);
    expect(p.y).toBeCloseTo(0.9);
  });

  it('leaves points alone when the video size is not known', () => {
    const legacy = { canvasWidth: 1000, canvasHeight: 800 };
    expect(toPictureSpace({ x: 0.1, y: 0.9 }, legacy, null)).toEqual({ x: 0.1, y: 0.9 });
  });
});
