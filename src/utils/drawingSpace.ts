/**
 * Drawing coordinates are 0..1 fractions of the canvas they were drawn on, and
 * every drawing records that canvas's size (canvasWidth/canvasHeight).
 *
 * The canvas used to cover the whole player box, letterbox bands included, so
 * the same numbers landed on a different part of the picture whenever the box
 * had a different shape (another window size, the sidebar open or closed,
 * single vs comparison layout). The canvas now covers exactly the rendered
 * picture, and points are re-expressed relative to the picture when drawn.
 *
 * No stored drawing is rewritten and none needs a version flag: the recorded
 * canvas size says which kind it is. For an old drawing it is the player box,
 * and with the video's intrinsic size that is enough to work out where the
 * picture sat inside it. For a new drawing it IS the picture, so the same
 * computation finds the picture filling the canvas and changes nothing.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

/**
 * Where the player puts a video's picture inside a box: aspect-preserving,
 * centred, and never enlarged (max-width/max-height with auto sizing).
 */
export function pictureRectIn(box: Size, video: Size): Rect {
  const scale = Math.min(box.width / video.width, box.height / video.height, 1);
  const width = video.width * scale;
  const height = video.height * scale;
  return {
    width,
    height,
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
  };
}

/** A point relative to the picture, whatever space the drawing was stored in. */
export function toPictureSpace(
  point: { x: number; y: number },
  drawing: { canvasWidth: number; canvasHeight: number },
  video: Size | null
): { x: number; y: number } {
  if (
    !video ||
    !(video.width > 0) ||
    !(video.height > 0) ||
    !(drawing.canvasWidth > 0) ||
    !(drawing.canvasHeight > 0)
  ) {
    return point;
  }
  const rect = pictureRectIn(
    { width: drawing.canvasWidth, height: drawing.canvasHeight },
    video
  );
  return {
    x: (point.x * drawing.canvasWidth - rect.left) / rect.width,
    y: (point.y * drawing.canvasHeight - rect.top) / rect.height,
  };
}
