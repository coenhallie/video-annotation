/**
 * Video display area calculation utilities
 * Handles object-fit: contain calculations to determine actual video rendering area
 */

export interface VideoDisplayArea {
  x: number; // Left offset of actual video content
  y: number; // Top offset of actual video content
  width: number; // Width of actual video content
  height: number; // Height of actual video content
  scaleX: number; // Scale factor for X coordinates
  scaleY: number; // Scale factor for Y coordinates
}

/**
 * Calculate the actual display area of a video element with object-fit: contain
 * This accounts for letterboxing/pillarboxing when video aspect ratio doesn't match container
 */
export function calculateVideoDisplayArea(
  videoElement: HTMLVideoElement,
  containerElement: HTMLElement
): VideoDisplayArea {
  // Get actual video dimensions
  const videoNaturalWidth = videoElement.videoWidth || 1280; // More reasonable default
  const videoNaturalHeight = videoElement.videoHeight || 720;

  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    console.warn(
      '⚠️ Video dimensions not available in calculateVideoDisplayArea'
    );
  }

  const videoAspectRatio = videoNaturalWidth / videoNaturalHeight;

  const containerRect = containerElement.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;
  const containerAspectRatio = containerWidth / containerHeight;

  let displayWidth: number;
  let displayHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAspectRatio > containerAspectRatio) {
    // Video is wider than container - letterboxing (black bars top/bottom)
    displayWidth = containerWidth;
    displayHeight = containerWidth / videoAspectRatio;
    offsetX = 0;
    offsetY = (containerHeight - displayHeight) / 2;
  } else {
    // Video is taller than container - pillarboxing (black bars left/right)
    displayWidth = containerHeight * videoAspectRatio;
    displayHeight = containerHeight;
    offsetX = (containerWidth - displayWidth) / 2;
    offsetY = 0;
  }

  return {
    x: offsetX,
    y: offsetY,
    width: displayWidth,
    height: displayHeight,
    scaleX: videoNaturalWidth / displayWidth,
    scaleY: videoNaturalHeight / displayHeight,
  };
}

/**
 * Convert mouse coordinates to video coordinates, accounting for object-fit: contain
 */
export function convertMouseToVideoCoordinates(
  mouseX: number,
  mouseY: number,
  displayArea: VideoDisplayArea
): { x: number; y: number } | null {
  // Check if mouse is within the actual video display area
  if (
    mouseX < displayArea.x ||
    mouseX > displayArea.x + displayArea.width ||
    mouseY < displayArea.y ||
    mouseY > displayArea.y + displayArea.height
  ) {
    return null; // Mouse is in black border area
  }

  // Convert to video coordinates
  const relativeX = mouseX - displayArea.x;
  const relativeY = mouseY - displayArea.y;

  return {
    x: relativeX * displayArea.scaleX,
    y: relativeY * displayArea.scaleY,
  };
}

/**
 * Convert video coordinates to display coordinates
 */
export function convertVideoToDisplayCoordinates(
  videoX: number,
  videoY: number,
  displayArea: VideoDisplayArea
): { x: number; y: number } {
  return {
    x: displayArea.x + videoX / displayArea.scaleX,
    y: displayArea.y + videoY / displayArea.scaleY,
  };
}

/**
 * Check if a point is within the actual video display area
 */
export function isPointInVideoArea(
  x: number,
  y: number,
  displayArea: VideoDisplayArea
): boolean {
  return (
    x >= displayArea.x &&
    x <= displayArea.x + displayArea.width &&
    y >= displayArea.y &&
    y <= displayArea.y + displayArea.height
  );
}
