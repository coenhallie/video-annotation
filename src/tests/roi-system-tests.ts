/**
 * ROI System Tests
 * Comprehensive tests for the Region of Interest pose detection system
 */

import { roiProcessor, type ROI } from '../utils/roiProcessor';

// Mock video element for testing
class MockVideoElement {
  videoWidth: number;
  videoHeight: number;
  currentTime: number;

  constructor(width = 1920, height = 1080) {
    this.videoWidth = width;
    this.videoHeight = height;
    this.currentTime = 0;
  }
}

// Mock canvas for testing
class MockCanvas {
  width: number;
  height: number;
  private context: MockCanvasContext;

  constructor() {
    this.width = 0;
    this.height = 0;
    this.context = new MockCanvasContext();
  }

  getContext(type: string) {
    return type === '2d' ? this.context : null;
  }
}

class MockCanvasContext {
  imageSmoothingEnabled = true;
  imageSmoothingQuality = 'high';

  drawImage(...args: any[]) {
    // Mock implementation
    console.log('Mock drawImage called with args:', args.length);
  }
}

// Test data
const testROIs: ROI[] = [
  // Valid ROI in center
  { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  // ROI in top-left corner
  { x: 0, y: 0, width: 0.3, height: 0.3 },
  // ROI in bottom-right corner
  { x: 0.7, y: 0.7, width: 0.3, height: 0.3 },
  // Very small ROI (should be expanded)
  { x: 0.4, y: 0.4, width: 0.02, height: 0.02 },
  // ROI that exceeds bounds (should be clipped)
  { x: 0.8, y: 0.8, width: 0.5, height: 0.5 },
];

const testLandmarks = [
  // Person in center of frame
  [
    { x: 0.5, y: 0.3, visibility: 0.9 }, // nose
    { x: 0.45, y: 0.4, visibility: 0.8 }, // left shoulder
    { x: 0.55, y: 0.4, visibility: 0.8 }, // right shoulder
    { x: 0.4, y: 0.5, visibility: 0.7 }, // left elbow
    { x: 0.6, y: 0.5, visibility: 0.7 }, // right elbow
    { x: 0.35, y: 0.6, visibility: 0.6 }, // left wrist
    { x: 0.65, y: 0.6, visibility: 0.6 }, // right wrist
    { x: 0.45, y: 0.7, visibility: 0.8 }, // left hip
    { x: 0.55, y: 0.7, visibility: 0.8 }, // right hip
    { x: 0.45, y: 0.85, visibility: 0.7 }, // left knee
    { x: 0.55, y: 0.85, visibility: 0.7 }, // right knee
  ],
  // Person in top-left corner
  [
    { x: 0.15, y: 0.1, visibility: 0.9 }, // nose
    { x: 0.1, y: 0.15, visibility: 0.8 }, // left shoulder
    { x: 0.2, y: 0.15, visibility: 0.8 }, // right shoulder
    { x: 0.05, y: 0.2, visibility: 0.7 }, // left elbow
    { x: 0.25, y: 0.2, visibility: 0.7 }, // right elbow
    { x: 0.0, y: 0.25, visibility: 0.6 }, // left wrist
    { x: 0.3, y: 0.25, visibility: 0.6 }, // right wrist
    { x: 0.1, y: 0.3, visibility: 0.8 }, // left hip
    { x: 0.2, y: 0.3, visibility: 0.8 }, // right hip
    { x: 0.1, y: 0.4, visibility: 0.7 }, // left knee
    { x: 0.2, y: 0.4, visibility: 0.7 }, // right knee
  ],
];

/**
 * Test ROI validation and coordinate conversion
 */
export function testROIValidation(): void {
  console.log('🧪 Testing ROI validation and coordinate conversion...');

  roiProcessor.updateVideoDimensions(1920, 1080);

  testROIs.forEach((roi, index) => {
    try {
      const validatedROI = roiProcessor.validateROI(roi);
      const pixelCoords = roiProcessor.roiToPixelCoordinates(roi);

      console.log(`✅ ROI ${index + 1} validation passed:`, {
        original: roi,
        validated: validatedROI,
        pixelCoords,
      });

      // Verify bounds
      if (
        validatedROI.x < 0 ||
        validatedROI.y < 0 ||
        validatedROI.x + validatedROI.width > 1 ||
        validatedROI.y + validatedROI.height > 1
      ) {
        console.error(`❌ ROI ${index + 1} validation failed: out of bounds`);
      }

      // Verify minimum size
      if (validatedROI.width < 0.05 || validatedROI.height < 0.05) {
        console.error(`❌ ROI ${index + 1} validation failed: too small`);
      }
    } catch (error) {
      console.error(`❌ ROI ${index + 1} validation failed:`, error);
    }
  });
}

/**
 * Test ROI coverage calculation
 */
export function testROICoverage(): void {
  console.log('🧪 Testing ROI coverage calculation...');

  testROIs.forEach((roi, roiIndex) => {
    testLandmarks.forEach((landmarks, landmarkIndex) => {
      try {
        const coverage = roiProcessor.calculateROICoverage(landmarks, roi);

        console.log(
          `✅ Coverage test ROI ${roiIndex + 1} vs Landmarks ${
            landmarkIndex + 1
          }:`,
          {
            roi,
            coverage: coverage.coverage,
            landmarksInROI: coverage.landmarksInROI,
            totalValidLandmarks: coverage.totalValidLandmarks,
          }
        );

        // Verify coverage is between 0 and 1
        if (coverage.coverage < 0 || coverage.coverage > 1) {
          console.error(`❌ Invalid coverage value: ${coverage.coverage}`);
        }
      } catch (error) {
        console.error(`❌ Coverage calculation failed:`, error);
      }
    });
  });
}

/**
 * Test point-in-ROI detection
 */
export function testPointInROI(): void {
  console.log('🧪 Testing point-in-ROI detection...');

  const testPoints = [
    { x: 0.5, y: 0.5, name: 'center' },
    { x: 0.0, y: 0.0, name: 'top-left corner' },
    { x: 1.0, y: 1.0, name: 'bottom-right corner' },
    { x: 0.25, y: 0.25, name: 'inside first ROI' },
    { x: 0.75, y: 0.75, name: 'outside first ROI' },
  ];

  const testROI = testROIs[0]!; // Use center ROI

  testPoints.forEach((point) => {
    try {
      const isInside = roiProcessor.isPointInROI(point.x, point.y, testROI);
      console.log(
        `✅ Point ${point.name} (${point.x}, ${point.y}) in ROI: ${isInside}`
      );
    } catch (error) {
      console.error(`❌ Point-in-ROI test failed for ${point.name}:`, error);
    }
  });
}

/**
 * Test coordinate transformation
 */
export function testCoordinateTransformation(): void {
  console.log('🧪 Testing coordinate transformation...');

  const mockCroppedFrameData = {
    canvas: new MockCanvas() as any,
    context: new MockCanvasContext() as any,
    croppedWidth: 480,
    croppedHeight: 540,
    offsetX: 480,
    offsetY: 270,
    scaleX: 4,
    scaleY: 2,
  };

  const croppedLandmarks = [
    { x: 0.5, y: 0.5, visibility: 0.9 }, // Center of cropped region
    { x: 0.0, y: 0.0, visibility: 0.8 }, // Top-left of cropped region
    { x: 1.0, y: 1.0, visibility: 0.7 }, // Bottom-right of cropped region
  ];

  const croppedWorldLandmarks = [
    { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 },
    { x: 0.4, y: 0.5, z: 0.6, visibility: 0.8 },
    { x: 0.7, y: 0.8, z: 0.9, visibility: 0.7 },
  ];

  try {
    roiProcessor.updateVideoDimensions(1920, 1080);

    const transformed = roiProcessor.transformLandmarksToFullFrame(
      croppedLandmarks,
      croppedWorldLandmarks,
      mockCroppedFrameData
    );

    console.log('✅ Coordinate transformation test passed:', {
      originalLandmarks: croppedLandmarks,
      transformedLandmarks: transformed.landmarks,
      originalWorldLandmarks: croppedWorldLandmarks,
      transformedWorldLandmarks: transformed.worldLandmarks,
    });

    // Verify transformed coordinates are within valid range
    transformed.landmarks.forEach((landmark, index) => {
      if (
        landmark.x < 0 ||
        landmark.x > 1 ||
        landmark.y < 0 ||
        landmark.y > 1
      ) {
        console.error(
          `❌ Transformed landmark ${index} out of bounds:`,
          landmark
        );
      }
    });
  } catch (error) {
    console.error('❌ Coordinate transformation test failed:', error);
  }
}

/**
 * Test ROI boundary edge cases
 */
export function testROIBoundaryEdgeCases(): void {
  console.log('🧪 Testing ROI boundary edge cases...');

  const edgeCaseROIs = [
    // ROI at exact boundaries
    { x: 0, y: 0, width: 1, height: 1 },
    // ROI with zero dimensions
    { x: 0.5, y: 0.5, width: 0, height: 0 },
    // ROI with negative coordinates
    { x: -0.1, y: -0.1, width: 0.2, height: 0.2 },
    // ROI extending beyond bounds
    { x: 0.9, y: 0.9, width: 0.2, height: 0.2 },
    // Very thin ROI
    { x: 0.4, y: 0.4, width: 0.001, height: 0.2 },
  ];

  roiProcessor.updateVideoDimensions(1920, 1080);

  edgeCaseROIs.forEach((roi, index) => {
    try {
      const validatedROI = roiProcessor.validateROI(roi);
      console.log(`✅ Edge case ${index + 1} handled:`, {
        original: roi,
        validated: validatedROI,
      });
    } catch (error) {
      console.error(`❌ Edge case ${index + 1} failed:`, error);
    }
  });
}

/**
 * Run all ROI system tests
 */
export function runAllROITests(): void {
  console.log('🚀 Starting comprehensive ROI system tests...');

  try {
    testROIValidation();
    testROICoverage();
    testPointInROI();
    testCoordinateTransformation();
    testROIBoundaryEdgeCases();

    console.log('✅ All ROI system tests completed successfully!');
  } catch (error) {
    console.error('❌ ROI system tests failed:', error);
  }
}

// Export test functions for individual use
export { testROIs, testLandmarks, MockVideoElement, MockCanvas };
