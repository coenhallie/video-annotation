/**
 * Shared formatting utilities for time and frame display.
 */

export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatFrame(frameNumber: number): string {
  if (!frameNumber || isNaN(frameNumber)) return 'Frame 0';
  return `Frame ${frameNumber.toLocaleString()}`;
}

export function formatFrameWithFPS(frameNumber: number, fps: number): string {
  if (!frameNumber || isNaN(frameNumber)) return 'Frame 0 @ 30fps';
  return `Frame ${frameNumber.toLocaleString()} @ ${fps}fps`;
}

export function timeToFrame(timeInSeconds: number, fps: number): number {
  const validFps = fps > 0 ? fps : 30;
  const calculatedFrame = Math.round(timeInSeconds * validFps);
  return Math.max(0, calculatedFrame);
}

export function frameToTime(frameNumber: number, fps: number): number {
  const validFps = fps > 0 ? fps : 30;
  return frameNumber / validFps;
}

/**
 * Compact frame token for dense lists, e.g. `F05503`. Zero-padded so a column
 * of them stays aligned. Unlike formatFrame, frame 0 is a real frame here and
 * renders as `F00000`.
 */
export function formatFrameCompact(frameNumber: number): string {
  if (!Number.isFinite(frameNumber)) return 'F00000';
  const frame = Math.max(0, Math.round(frameNumber));
  return `F${String(frame).padStart(5, '0')}`;
}
