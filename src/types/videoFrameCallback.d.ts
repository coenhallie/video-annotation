/**
 * `HTMLVideoElement.requestVideoFrameCallback` is a real browser API (Chrome,
 * Edge, Firefox, Safari 15.4+) that is not in the DOM lib for this TypeScript
 * target.
 *
 * Declared optional, which is the honest shape: it is genuinely absent on older
 * engines, so callers must check before calling. That check then narrows
 * normally. Testing for it with `'requestVideoFrameCallback' in video` instead
 * narrowed the *else* branch to `never`, because the property is not on the
 * declared type at all - which is why the fallback path could not read
 * `video.duration`.
 */
interface VideoFrameCallbackMetadata {
  presentationTime: number;
  expectedDisplayTime: number;
  width: number;
  height: number;
  mediaTime: number;
  presentedFrames: number;
  processingDuration?: number;
}

interface HTMLVideoElement {
  requestVideoFrameCallback?(
    callback: (now: number, metadata: VideoFrameCallbackMetadata) => void
  ): number;
  cancelVideoFrameCallback?(handle: number): void;
}
