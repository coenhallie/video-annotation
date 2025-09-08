/**
 * Enhanced calibration quality assessment utilities
 * Provides comprehensive metrics for evaluating calibration accuracy
 */

import {
  calculateDeterminant3x3,
  isValidHomography,
} from './calibrationTransforms';
import { validateCoordinateSystem } from './coordinateValidation';
import type { VideoDimensions } from './videoDimensions';
import type { Point2D, Point3D } from '../composables/useCameraCalibration';

export interface CalibrationQualityMetrics {
  reprojectionError: number;
  conditionNumber: number;
  perspectiveDistortion: number;
  lineAlignmentScores: number[];
  coordinateSystemValidation: any;
  overallConfidence: number;
  qualityGrade: 'excellent' | 'good' | 'fair' | 'poor';
  recommendations: string[];
}

export interface LineCorrespondence {
  courtLine: Point2D[];
  videoLine: Point2D[];
  confidence: number;
}

/**
 * Assess overall calibration quality with comprehensive metrics
 */
export function assessCalibrationQuality(
  homography: number[][],
  correspondences: { world: Point3D; image: Point2D }[],
  lineCorrespondences: LineCorrespondence[],
  videoDimensions: VideoDimensions,
  courtDimensions: { width: number; length: number }
): CalibrationQualityMetrics {
  const metrics: Partial<CalibrationQualityMetrics> = {};
  const recommendations: string[] = [];

  // 1. Reprojection Error
  metrics.reprojectionError = calculateReprojectionError(
    correspondences,
    homography
  );

  // 2. Condition Number (matrix stability)
  metrics.conditionNumber = calculateConditionNumber(homography);

  // 3. Perspective Distortion Analysis
  metrics.perspectiveDistortion = analyzePerspectiveDistortion(
    homography,
    videoDimensions
  );

  // 4. Line Alignment Scores
  metrics.lineAlignmentScores = calculateLineAlignmentScores(
    lineCorrespondences,
    homography
  );

  // 5. Coordinate System Validation
  metrics.coordinateSystemValidation = validateCoordinateSystem(
    homography,
    videoDimensions,
    courtDimensions
  );

  // 6. Calculate Overall Confidence
  metrics.overallConfidence = calculateOverallConfidence(
    metrics as CalibrationQualityMetrics
  );

  // 7. Determine Quality Grade
  metrics.qualityGrade = determineQualityGrade(metrics.overallConfidence);

  // 8. Generate Recommendations
  metrics.recommendations = generateRecommendations(
    metrics as CalibrationQualityMetrics
  );

  return metrics as CalibrationQualityMetrics;
}

/**
 * Calculate reprojection error for point correspondences
 */
function calculateReprojectionError(
  correspondences: { world: Point3D; image: Point2D }[],
  homography: number[][]
): number {
  if (correspondences.length === 0) return Infinity;

  let totalError = 0;
  let validPoints = 0;

  for (const corr of correspondences) {
    try {
      // Project world point to image using homography
      const worldHomogeneous = [corr.world.x, corr.world.y, 1];

      // Safe matrix multiplication
      const h = homography;
      if (!h || h.length !== 3 || !h[0] || !h[1] || !h[2]) continue;

      const imageHomogeneous = [
        (h[0][0] ?? 0) * worldHomogeneous[0] +
          (h[0][1] ?? 0) * worldHomogeneous[1] +
          (h[0][2] ?? 0),
        (h[1][0] ?? 0) * worldHomogeneous[0] +
          (h[1][1] ?? 0) * worldHomogeneous[1] +
          (h[1][2] ?? 0),
        (h[2][0] ?? 0) * worldHomogeneous[0] +
          (h[2][1] ?? 0) * worldHomogeneous[1] +
          (h[2][2] ?? 0),
      ];

      if (Math.abs(imageHomogeneous[2]) < 1e-10) continue;

      const projectedX = imageHomogeneous[0] / imageHomogeneous[2];
      const projectedY = imageHomogeneous[1] / imageHomogeneous[2];

      // Calculate Euclidean distance
      const error = Math.sqrt(
        Math.pow(projectedX - corr.image.x, 2) +
          Math.pow(projectedY - corr.image.y, 2)
      );

      totalError += error;
      validPoints++;
    } catch (error) {
      continue;
    }
  }

  return validPoints > 0 ? totalError / validPoints : Infinity;
}

/**
 * Calculate condition number for matrix stability assessment
 */
function calculateConditionNumber(homography: number[][]): number {
  if (!isValidHomography(homography)) return Infinity;

  try {
    // Simplified condition number estimation using determinant and norm
    const det = Math.abs(calculateDeterminant3x3(homography));
    if (det < 1e-12) return Infinity;

    // Calculate Frobenius norm
    let normSquared = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const val = homography[i]?.[j] ?? 0;
        normSquared += val * val;
      }
    }
    const norm = Math.sqrt(normSquared);

    // Rough condition number estimate
    // For a proper implementation, we'd use SVD
    const conditionNumber = norm / det;

    return Math.min(conditionNumber, 1e6); // Cap at reasonable value
  } catch (error) {
    return Infinity;
  }
}

/**
 * Analyze perspective distortion in the transformation
 */
function analyzePerspectiveDistortion(
  homography: number[][],
  videoDimensions: VideoDimensions
): number {
  if (!isValidHomography(homography)) return 1.0;

  try {
    // Test perspective distortion by comparing scale at different image regions
    const testPoints = [
      { x: videoDimensions.width * 0.2, y: videoDimensions.height * 0.2 },
      { x: videoDimensions.width * 0.8, y: videoDimensions.height * 0.2 },
      { x: videoDimensions.width * 0.2, y: videoDimensions.height * 0.8 },
      { x: videoDimensions.width * 0.8, y: videoDimensions.height * 0.8 },
    ];

    const scales: number[] = [];
    const testDistance = 50; // pixels

    for (const point of testPoints) {
      // Test horizontal scale
      const p1 = { x: point.x - testDistance, y: point.y };
      const p2 = { x: point.x + testDistance, y: point.y };

      const w1 = transformImageToWorld(p1, homography);
      const w2 = transformImageToWorld(p2, homography);

      if (w1 && w2) {
        const worldDist = Math.sqrt(
          Math.pow(w2.x - w1.x, 2) + Math.pow(w2.y - w1.y, 2)
        );
        const scale = worldDist / (testDistance * 2);
        scales.push(scale);
      }
    }

    if (scales.length < 2) return 1.0;

    // Calculate coefficient of variation
    const mean = scales.reduce((sum, s) => sum + s, 0) / scales.length;
    const variance =
      scales.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scales.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? stdDev / mean : 1.0; // Coefficient of variation
  } catch (error) {
    return 1.0;
  }
}

/**
 * Calculate line alignment scores for each line correspondence
 */
function calculateLineAlignmentScores(
  lineCorrespondences: LineCorrespondence[],
  homography: number[][]
): number[] {
  const scores: number[] = [];

  for (const correspondence of lineCorrespondences) {
    try {
      const { courtLine, videoLine } = correspondence;

      if (courtLine.length < 2 || videoLine.length < 2) {
        scores.push(0);
        continue;
      }

      // Transform court line to image coordinates
      const projectedStart = transformWorldToImage(
        { x: courtLine[0].x, y: courtLine[0].y, z: 0 },
        homography
      );
      const projectedEnd = transformWorldToImage(
        { x: courtLine[1].x, y: courtLine[1].y, z: 0 },
        homography
      );

      if (!projectedStart || !projectedEnd) {
        scores.push(0);
        continue;
      }

      // Calculate alignment error
      const videoStart = videoLine[0];
      const videoEnd = videoLine[videoLine.length - 1];

      const startError = Math.sqrt(
        Math.pow(projectedStart.x - videoStart.x, 2) +
          Math.pow(projectedStart.y - videoStart.y, 2)
      );
      const endError = Math.sqrt(
        Math.pow(projectedEnd.x - videoEnd.x, 2) +
          Math.pow(projectedEnd.y - videoEnd.y, 2)
      );

      const avgError = (startError + endError) / 2;
      const score = Math.max(0, 1 - avgError / 50); // Normalize to 0-1
      scores.push(score);
    } catch (error) {
      scores.push(0);
    }
  }

  return scores;
}

/**
 * Calculate overall confidence score
 */
function calculateOverallConfidence(
  metrics: CalibrationQualityMetrics
): number {
  const weights = {
    reprojectionError: 0.3,
    conditionNumber: 0.2,
    perspectiveDistortion: 0.2,
    lineAlignment: 0.2,
    coordinateValidation: 0.1,
  };

  // Normalize reprojection error (lower is better)
  const reprojectionScore = Math.max(0, 1 - metrics.reprojectionError / 100);

  // Normalize condition number (lower is better)
  const conditionScore = Math.max(
    0,
    1 - Math.log10(Math.max(1, metrics.conditionNumber)) / 6
  );

  // Normalize perspective distortion (lower is better)
  const perspectiveScore = Math.max(0, 1 - metrics.perspectiveDistortion);

  // Average line alignment scores
  const lineScore =
    metrics.lineAlignmentScores.length > 0
      ? metrics.lineAlignmentScores.reduce((sum, score) => sum + score, 0) /
        metrics.lineAlignmentScores.length
      : 0;

  // Coordinate validation score
  const coordScore = metrics.coordinateSystemValidation?.overallScore ?? 0;

  const overallScore =
    reprojectionScore * weights.reprojectionError +
    conditionScore * weights.conditionNumber +
    perspectiveScore * weights.perspectiveDistortion +
    lineScore * weights.lineAlignment +
    coordScore * weights.coordinateValidation;

  return Math.max(0, Math.min(1, overallScore));
}

/**
 * Determine quality grade based on confidence score
 */
function determineQualityGrade(
  confidence: number
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (confidence >= 0.9) return 'excellent';
  if (confidence >= 0.7) return 'good';
  if (confidence >= 0.5) return 'fair';
  return 'poor';
}

/**
 * Generate specific recommendations for improving calibration
 */
function generateRecommendations(metrics: CalibrationQualityMetrics): string[] {
  const recommendations: string[] = [];

  if (metrics.reprojectionError > 50) {
    recommendations.push(
      'High reprojection error detected. Check line drawing accuracy and ensure lines are drawn precisely on court boundaries.'
    );
  }

  if (metrics.conditionNumber > 1000) {
    recommendations.push(
      'Matrix instability detected. Try drawing lines with better geometric distribution across the image.'
    );
  }

  if (metrics.perspectiveDistortion > 0.3) {
    recommendations.push(
      'High perspective distortion. Consider recalibrating with lines that are more evenly distributed across the court.'
    );
  }

  const avgLineScore =
    metrics.lineAlignmentScores.reduce((sum, score) => sum + score, 0) /
    metrics.lineAlignmentScores.length;
  if (avgLineScore < 0.7) {
    recommendations.push(
      'Poor line alignment detected. Redraw lines more carefully, ensuring they follow the actual court lines in the video.'
    );
  }

  if (metrics.coordinateSystemValidation?.overallScore < 0.6) {
    recommendations.push(
      'Coordinate system validation failed. Check that the camera position is set correctly and lines correspond to the right court features.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Calibration quality is good. No specific improvements needed.'
    );
  }

  return recommendations;
}

/**
 * Helper function to transform image point to world coordinates
 */
function transformImageToWorld(
  point: Point2D,
  homography: number[][]
): Point3D | null {
  try {
    if (!isValidHomography(homography)) return null;

    // This would use the imageToWorld function from calibrationTransforms
    // For now, implementing a simplified version
    const h = homography;
    const imageHomogeneous = [point.x, point.y, 1];

    // Calculate inverse transformation (simplified)
    const det = calculateDeterminant3x3(h);
    if (Math.abs(det) < 1e-10) return null;

    // This is a simplified implementation
    // In practice, we'd use the proper inverse matrix calculation
    return { x: 0, y: 0, z: 0 }; // Placeholder
  } catch (error) {
    return null;
  }
}

/**
 * Helper function to transform world point to image coordinates
 */
function transformWorldToImage(
  point: Point3D,
  homography: number[][]
): Point2D | null {
  try {
    if (!isValidHomography(homography)) return null;

    const h = homography;
    const worldHomogeneous = [point.x, point.y, 1];

    const imageHomogeneous = [
      (h[0]?.[0] ?? 0) * worldHomogeneous[0] +
        (h[0]?.[1] ?? 0) * worldHomogeneous[1] +
        (h[0]?.[2] ?? 0),
      (h[1]?.[0] ?? 0) * worldHomogeneous[0] +
        (h[1]?.[1] ?? 0) * worldHomogeneous[1] +
        (h[1]?.[2] ?? 0),
      (h[2]?.[0] ?? 0) * worldHomogeneous[0] +
        (h[2]?.[1] ?? 0) * worldHomogeneous[1] +
        (h[2]?.[2] ?? 0),
    ];

    if (Math.abs(imageHomogeneous[2]) < 1e-10) return null;

    return {
      x: imageHomogeneous[0] / imageHomogeneous[2],
      y: imageHomogeneous[1] / imageHomogeneous[2],
    };
  } catch (error) {
    return null;
  }
}
