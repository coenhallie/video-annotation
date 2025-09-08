/**
 * Coordinate system validation utilities
 * Provides validation and conversion between different coordinate systems
 */

import { imageToWorld, worldToImage } from './calibrationTransforms';
import type { Point2D, Point3D } from '../composables/useCameraCalibration';
import type { VideoDimensions } from './videoDimensions';

export interface ValidationResult {
  isValid: boolean;
  error: number;
  confidence: number;
  details: string;
}

export interface CoordinateSystemValidation {
  roundTripAccuracy: ValidationResult;
  boundaryValidation: ValidationResult;
  scaleConsistency: ValidationResult;
  overallScore: number;
}

/**
 * Validate coordinate transformation accuracy using round-trip testing
 */
export function validateRoundTripAccuracy(
  testPoints: Point2D[],
  homography: number[][],
  tolerancePixels: number = 2.0
): ValidationResult {
  let totalError = 0;
  let validTransforms = 0;
  const errors: number[] = [];

  for (const imagePoint of testPoints) {
    // Image -> World -> Image
    const worldPoint = imageToWorld(imagePoint, homography);
    if (!worldPoint) continue;

    const backToImage = worldToImage(worldPoint, homography);
    if (!backToImage) continue;

    // Calculate round-trip error
    const error = Math.sqrt(
      Math.pow(imagePoint.x - backToImage.x, 2) +
        Math.pow(imagePoint.y - backToImage.y, 2)
    );

    errors.push(error);
    totalError += error;
    validTransforms++;
  }

  if (validTransforms === 0) {
    return {
      isValid: false,
      error: Infinity,
      confidence: 0,
      details: 'No valid transformations found',
    };
  }

  const avgError = totalError / validTransforms;
  const maxError = Math.max(...errors);
  const isValid =
    avgError <= tolerancePixels && maxError <= tolerancePixels * 2;

  // Calculate confidence based on error distribution
  const confidence = Math.max(0, 1 - avgError / tolerancePixels);

  return {
    isValid,
    error: avgError,
    confidence,
    details: `Average error: ${avgError.toFixed(
      2
    )}px, Max error: ${maxError.toFixed(
      2
    )}px, Valid transforms: ${validTransforms}/${testPoints.length}`,
  };
}

/**
 * Validate that transformed coordinates stay within reasonable bounds
 */
export function validateCoordinateBounds(
  imagePoints: Point2D[],
  videoDimensions: VideoDimensions,
  homography: number[][],
  courtDimensions: { width: number; length: number }
): ValidationResult {
  let validPoints = 0;
  let outOfBoundsCount = 0;
  const worldPoints: Point3D[] = [];

  for (const imagePoint of imagePoints) {
    // Check if image point is within video bounds
    if (
      imagePoint.x < 0 ||
      imagePoint.x > videoDimensions.width ||
      imagePoint.y < 0 ||
      imagePoint.y > videoDimensions.height
    ) {
      continue; // Skip points outside video bounds
    }

    const worldPoint = imageToWorld(imagePoint, homography);
    if (!worldPoint) continue;

    worldPoints.push(worldPoint);
    validPoints++;

    // Check if world coordinates are reasonable for a badminton court
    const maxCourtX = courtDimensions.width * 2; // Allow some margin
    const maxCourtY = courtDimensions.length * 2;

    if (
      Math.abs(worldPoint.x) > maxCourtX ||
      Math.abs(worldPoint.y) > maxCourtY
    ) {
      outOfBoundsCount++;
    }
  }

  if (validPoints === 0) {
    return {
      isValid: false,
      error: 1.0,
      confidence: 0,
      details: 'No valid coordinate transformations',
    };
  }

  const outOfBoundsRatio = outOfBoundsCount / validPoints;
  const isValid = outOfBoundsRatio < 0.1; // Allow up to 10% out of bounds
  const confidence = Math.max(0, 1 - outOfBoundsRatio);

  return {
    isValid,
    error: outOfBoundsRatio,
    confidence,
    details: `${outOfBoundsCount}/${validPoints} points out of court bounds (${(
      outOfBoundsRatio * 100
    ).toFixed(1)}%)`,
  };
}

/**
 * Validate scale consistency across different regions of the image
 */
export function validateScaleConsistency(
  homography: number[][],
  videoDimensions: VideoDimensions,
  courtDimensions: { width: number; length: number }
): ValidationResult {
  // Test scale consistency by measuring known distances at different image locations
  const testRegions = [
    // Center region
    { x: videoDimensions.width * 0.5, y: videoDimensions.height * 0.5 },
    // Corner regions
    { x: videoDimensions.width * 0.25, y: videoDimensions.height * 0.25 },
    { x: videoDimensions.width * 0.75, y: videoDimensions.height * 0.25 },
    { x: videoDimensions.width * 0.25, y: videoDimensions.height * 0.75 },
    { x: videoDimensions.width * 0.75, y: videoDimensions.height * 0.75 },
  ];

  const scales: number[] = [];
  const pixelOffset = 50; // 50 pixel test distance

  for (const region of testRegions) {
    // Test horizontal scale
    const point1 = { x: region.x - pixelOffset, y: region.y };
    const point2 = { x: region.x + pixelOffset, y: region.y };

    const world1 = imageToWorld(point1, homography);
    const world2 = imageToWorld(point2, homography);

    if (world1 && world2) {
      const worldDistance = Math.sqrt(
        Math.pow(world2.x - world1.x, 2) + Math.pow(world2.y - world1.y, 2)
      );
      const pixelDistance = pixelOffset * 2;
      const scale = worldDistance / pixelDistance; // meters per pixel
      scales.push(scale);
    }
  }

  if (scales.length < 2) {
    return {
      isValid: false,
      error: 1.0,
      confidence: 0,
      details: 'Insufficient scale measurements',
    };
  }

  // Calculate scale variation
  const avgScale =
    scales.reduce((sum, scale) => sum + scale, 0) / scales.length;
  const scaleVariations = scales.map(
    (scale) => Math.abs(scale - avgScale) / avgScale
  );
  const maxVariation = Math.max(...scaleVariations);
  const avgVariation =
    scaleVariations.reduce((sum, v) => sum + v, 0) / scaleVariations.length;

  // Good calibration should have consistent scale (< 20% variation)
  const isValid = maxVariation < 0.2 && avgVariation < 0.1;
  const confidence = Math.max(0, 1 - avgVariation * 5); // Scale confidence

  return {
    isValid,
    error: avgVariation,
    confidence,
    details: `Scale variation: avg ${(avgVariation * 100).toFixed(1)}%, max ${(
      maxVariation * 100
    ).toFixed(1)}%`,
  };
}

/**
 * Comprehensive coordinate system validation
 */
export function validateCoordinateSystem(
  homography: number[][],
  videoDimensions: VideoDimensions,
  courtDimensions: { width: number; length: number },
  testPoints?: Point2D[]
): CoordinateSystemValidation {
  // Generate test points if not provided
  if (!testPoints) {
    testPoints = generateTestPoints(videoDimensions);
  }

  // Run all validation tests
  const roundTripAccuracy = validateRoundTripAccuracy(testPoints, homography);
  const boundaryValidation = validateCoordinateBounds(
    testPoints,
    videoDimensions,
    homography,
    courtDimensions
  );
  const scaleConsistency = validateScaleConsistency(
    homography,
    videoDimensions,
    courtDimensions
  );

  // Calculate overall score (weighted average)
  const weights = {
    roundTrip: 0.4,
    boundary: 0.3,
    scale: 0.3,
  };

  const overallScore =
    roundTripAccuracy.confidence * weights.roundTrip +
    boundaryValidation.confidence * weights.boundary +
    scaleConsistency.confidence * weights.scale;

  return {
    roundTripAccuracy,
    boundaryValidation,
    scaleConsistency,
    overallScore,
  };
}

/**
 * Generate test points distributed across the video frame
 */
function generateTestPoints(videoDimensions: VideoDimensions): Point2D[] {
  const points: Point2D[] = [];
  const { width, height } = videoDimensions;

  // Grid of test points
  for (let x = 0.1; x <= 0.9; x += 0.2) {
    for (let y = 0.1; y <= 0.9; y += 0.2) {
      points.push({
        x: x * width,
        y: y * height,
      });
    }
  }

  // Add center point
  points.push({
    x: width / 2,
    y: height / 2,
  });

  // Add corner points (slightly inset)
  const margin = Math.min(width, height) * 0.05;
  points.push(
    { x: margin, y: margin },
    { x: width - margin, y: margin },
    { x: margin, y: height - margin },
    { x: width - margin, y: height - margin }
  );

  return points;
}

/**
 * Validate transformation between two coordinate systems
 */
export function validateTransformationBetweenSystems(
  sourcePoints: Point2D[],
  targetPoints: Point2D[],
  tolerance: number = 2.0
): ValidationResult {
  if (sourcePoints.length !== targetPoints.length) {
    return {
      isValid: false,
      error: Infinity,
      confidence: 0,
      details: 'Mismatched point count between coordinate systems',
    };
  }

  let totalError = 0;
  const errors: number[] = [];

  for (let i = 0; i < sourcePoints.length; i++) {
    const source = sourcePoints[i];
    const target = targetPoints[i];

    if (!source || !target) continue;

    const error = Math.sqrt(
      Math.pow(source.x - target.x, 2) + Math.pow(source.y - target.y, 2)
    );

    errors.push(error);
    totalError += error;
  }

  const avgError = totalError / sourcePoints.length;
  const maxError = Math.max(...errors);
  const isValid = avgError <= tolerance;
  const confidence = Math.max(0, 1 - avgError / tolerance);

  return {
    isValid,
    error: avgError,
    confidence,
    details: `Average error: ${avgError.toFixed(
      2
    )}px, Max error: ${maxError.toFixed(2)}px`,
  };
}
