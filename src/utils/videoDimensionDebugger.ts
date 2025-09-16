/**
 * Debug utility to log and compare video dimensions
 * Helps understand the difference between native video resolution and rendered size
 */

export function debugVideoDimensions(videoElement: HTMLVideoElement | null) {
  if (!videoElement) {
    console.log('🔍 [Video Dimensions Debug] No video element provided');
    return;
  }

  // Native video dimensions (actual file resolution)
  const nativeWidth = videoElement.videoWidth;
  const nativeHeight = videoElement.videoHeight;

  // Rendered dimensions (size on screen)
  const renderedWidth = videoElement.offsetWidth;
  const renderedHeight = videoElement.offsetHeight;

  // Client dimensions (visible area)
  const clientWidth = videoElement.clientWidth;
  const clientHeight = videoElement.clientHeight;

  // Computed style dimensions
  const computedStyle = window.getComputedStyle(videoElement);
  const styleWidth = computedStyle.width;
  const styleHeight = computedStyle.height;

  console.log('📹 ========== VIDEO DIMENSIONS DEBUG ==========');
  console.log('📹 Native Video Resolution (from file):');
  console.log(`   Width: ${nativeWidth}px`);
  console.log(`   Height: ${nativeHeight}px`);
  console.log(`   Aspect Ratio: ${(nativeWidth / nativeHeight).toFixed(3)}`);

  console.log('📹 Rendered Size (on screen):');
  console.log(`   Offset Width: ${renderedWidth}px`);
  console.log(`   Offset Height: ${renderedHeight}px`);
  console.log(`   Client Width: ${clientWidth}px`);
  console.log(`   Client Height: ${clientHeight}px`);

  console.log('📹 CSS Style:');
  console.log(`   Style Width: ${styleWidth}`);
  console.log(`   Style Height: ${styleHeight}`);

  console.log('📹 Scaling Factor:');
  console.log(
    `   Horizontal Scale: ${(renderedWidth / nativeWidth).toFixed(3)}x`
  );
  console.log(
    `   Vertical Scale: ${(renderedHeight / nativeHeight).toFixed(3)}x`
  );

  console.log('📹 Video Element Properties:');
  console.log(`   Ready State: ${videoElement.readyState}`);
  console.log(`   Network State: ${videoElement.networkState}`);
  console.log(`   Current Src: ${videoElement.currentSrc}`);

  console.log('📹 ============================================');

  // Return structured data
  return {
    native: {
      width: nativeWidth,
      height: nativeHeight,
      aspectRatio: nativeWidth / nativeHeight,
    },
    rendered: {
      offsetWidth: renderedWidth,
      offsetHeight: renderedHeight,
      clientWidth: clientWidth,
      clientHeight: clientHeight,
    },
    style: {
      width: styleWidth,
      height: styleHeight,
    },
    scaling: {
      horizontal: renderedWidth / nativeWidth,
      vertical: renderedHeight / nativeHeight,
    },
  };
}

// Export for browser console usage
if (typeof window !== 'undefined') {
  (window as any).debugVideoDimensions = debugVideoDimensions;
  console.log(
    '💡 Debug video dimensions with: debugVideoDimensions(videoElement)'
  );
}
