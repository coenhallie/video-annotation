import { ref, reactive, computed, type Ref } from 'vue';
import { Matrix, SingularValueDecomposition } from 'ml-matrix';
import {
  imageToWorld,
  transformPoseLandmarks,
  isValidHomography,
  clearTransformCache,
  type PoseLandmark,
  type WorldLandmark,
} from '../utils/calibrationTransforms';
import { type VideoDimensions } from '../utils/videoDimensions';
import { type CalibrationQualityMetrics } from '../utils/calibrationQuality';

// Data structures based on architecture document
export interface SelectedLine {
  id: string;
  type: 'service-long-doubles' | 'center-line' | 'service-short';
  courtPoints: Point2D[]; // Points defining the line in court coordinates
  isParallel: boolean;
  color: string;
}

// Unified calibration configuration
export interface UnifiedCalibrationConfig {
  courtSide: 'near' | 'far';
  cameraPosition: 'corner-left' | 'corner-right' | 'side-left' | 'side-right';
  referenceLines: {
    doubleService: Point2D[];
    center: Point2D[];
    shortService: Point2D[];
  };
}

// Camera position configuration from EdgeBasedCameraSelector
export interface CameraPositionConfig {
  edge: 'top' | 'bottom' | 'left' | 'right' | null;
  distance: number;
  height: number;
  position3D: Point3D;
}

// Sport-specific calibration configuration
export interface SportConfig {
  type: 'badminton' | 'tennis';
  courtDimensions: CourtDimensions;
  typicalPlayerHeight: number; // meters
  optimalCameraDistance: number; // meters
  lineImportance: {
    baseline: number;
    serviceLine: number;
    centerLine: number;
    sideline: number;
  };
  validationThresholds: {
    excellentError: number; // pixels
    acceptableError: number; // pixels
    maxError: number; // pixels
  };
  perspectiveFactors: {
    baseline: number;
    sideline: number;
    heightSensitivity: number;
  };
}

// Calibration mode configuration
export interface CalibrationModeConfig {
  mode:
    | 'unified-3-line'
    | 'full-court'
    | 'half-court'
    | 'service-courts'
    | 'minimal';
  requiredLines: number;
  homographyStrategy: 'standard' | 'weighted' | 'robust' | 'minimal';
  iterativeRefinement: boolean;
  outlierDetection: boolean;
}

// Position-specific calibration weights
export interface PositionWeights {
  horizontalLines: number; // Weight for horizontal court lines
  verticalLines: number; // Weight for vertical court lines
  perspectiveCorrection: number; // Perspective distortion factor
  heightAccuracy: number; // Height estimation reliability
  sportMultiplier: number; // Sport-specific accuracy multiplier
}

export interface DrawnLine {
  id: string;
  points: Point2D[]; // Points in video pixel coordinates
  timestamp: number;
  confidence: number;
}

export interface LineCorrespondence {
  courtLineId: string;
  videoLineId: string;
  matchConfidence: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Euler {
  x: number;
  y: number;
  z: number;
}

export interface CourtDimensions {
  length: number;
  width: number;
  serviceLineDistance?: number;
  centerLineLength?: number;
  netHeight?: number;
}

export interface CameraParams {
  position: Point3D;
  rotation: Euler;
  fov: number;
  aspectRatio: number;
  near: number;
  far: number;
}

export interface ValidationMetrics {
  reprojectionError: number;
  lineAlignmentScore: number;
  perspectiveAccuracy: number;
  overallConfidence: number;
}

export enum CalibrationStep {
  SETUP = 0,
  SELECT_LINES = 1,
  MARK_VIDEO = 2,
  CALCULATE = 3,
  VALIDATE = 4,
  CONFIRM = 5,
}

export interface CameraCalibrationState {
  // Workflow state
  calibrationStep: Ref<CalibrationStep>;
  workflowProgress: Ref<number>;

  // Line selection state
  selectedCourtLines: Ref<SelectedLine[]>;
  drawnVideoLines: Ref<DrawnLine[]>;
  lineCorrespondences: Ref<LineCorrespondence[]>;

  // Unified calibration config
  unifiedConfig: Ref<UnifiedCalibrationConfig | null>;

  // Camera parameters
  cameraPosition: Ref<Point3D | null>;
  cameraRotation: Ref<Euler | null>;
  cameraFOV: Ref<number | null>;

  // Calculation state
  homographyMatrix: Ref<number[][] | null>;
  projectionMatrix: Ref<number[][] | null>;
  calibrationError: Ref<number>;

  // Validation state
  validationMetrics: Ref<ValidationMetrics | null>;
  calibrationConfidence: Ref<number>;

  // UI state
  isModalOpen: Ref<boolean>;
  isCalculating: Ref<boolean>;
  hasUnsavedChanges: Ref<boolean>;
}

export function useCameraCalibration() {
  // Workflow state
  const calibrationStep = ref<CalibrationStep>(CalibrationStep.SETUP);
  const workflowProgress = computed(
    () =>
      (calibrationStep.value / (Object.keys(CalibrationStep).length / 2 - 1)) *
      100
  );

  // Line selection state
  const selectedCourtLines = ref<SelectedLine[]>([]);
  const drawnVideoLines = ref<DrawnLine[]>([]);
  const lineCorrespondences = ref<LineCorrespondence[]>([]);

  // Unified calibration configuration
  const unifiedConfig = ref<UnifiedCalibrationConfig | null>(null);

  // Camera position configuration from EdgeBasedCameraSelector
  const cameraPositionConfig = ref<CameraPositionConfig | null>(null);

  // Sport configuration
  const sportConfig = ref<SportConfig>({
    type: 'badminton',
    courtDimensions: {
      length: 13.4,
      width: 6.1,
      serviceLineDistance: 1.98,
      centerLineLength: 4.72,
      netHeight: 1.55,
    },
    typicalPlayerHeight: 1.7, // meters
    optimalCameraDistance: 3.0, // meters
    lineImportance: {
      baseline: 1.2,
      serviceLine: 1.1,
      centerLine: 1.0,
      sideline: 1.0,
    },
    validationThresholds: {
      excellentError: 50,
      acceptableError: 100,
      maxError: 200,
    },
    perspectiveFactors: {
      baseline: 1.0, // Standard correction for badminton baseline
      sideline: 1.1, // Slightly better perspective from sideline
      heightSensitivity: 1.0, // Standard height sensitivity
    },
  });

  // Calibration mode configuration
  const calibrationModeConfig = ref<CalibrationModeConfig>({
    mode: 'unified-3-line',
    requiredLines: 3,
    homographyStrategy: 'weighted',
    iterativeRefinement: true,
    outlierDetection: true,
  });

  // Camera parameters - initially null until calculated
  const cameraParameters = reactive<{
    position: Point3D | null;
    rotation: Euler | null;
    fov: number | null;
    aspectRatio: number;
    near: number;
    far: number;
  }>({
    position: null,
    rotation: null,
    fov: null,
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 1000,
  });

  // Calculation state
  const homographyMatrix = ref<number[][] | null>(null);
  const projectionMatrix = ref<number[][] | null>(null);
  const calibrationError = ref<number>(0);

  // Validation state
  const validationMetrics = ref<ValidationMetrics | null>(null);
  const calibrationConfidence = ref<number>(0);

  // Video dimension tracking
  const calibrationVideoDimensions = ref<VideoDimensions | null>(null);
  const runtimeVideoDimensions = ref<VideoDimensions | null>(null);
  const dimensionValidation = ref<any>(null);

  // Enhanced quality metrics
  const qualityMetrics = ref<CalibrationQualityMetrics | null>(null);

  // Court dimensions state - updated for unified system
  const courtDimensions = ref<CourtDimensions>({
    length: 13.4, // Default badminton court length
    width: 6.1, // Default badminton doubles width (for unified system)
    serviceLineDistance: 1.98, // Short service line distance from net
    centerLineLength: 4.72,
    netHeight: 1.55,
  });

  // Define the 3 reference lines for unified calibration
  const getReferenceLines = (courtSide: 'near' | 'far') => {
    const width = courtDimensions.value.width;
    const length = courtDimensions.value.length;
    const doubleServiceDistance = 0.76; // from baseline
    const shortServiceDistance = 1.98; // from net

    // Adjust coordinates based on court side
    const sideMultiplier = courtSide === 'far' ? 1 : -1;

    return {
      serviceLongDoubles: [
        {
          x: -width / 2,
          y: (length / 2 - doubleServiceDistance) * sideMultiplier,
        },
        {
          x: width / 2,
          y: (length / 2 - doubleServiceDistance) * sideMultiplier,
        },
      ],
      centerLine: [
        { x: 0, y: -shortServiceDistance },
        { x: 0, y: length / 2 - doubleServiceDistance },
      ],
      serviceShort: [
        { x: -width / 2, y: shortServiceDistance * sideMultiplier },
        { x: width / 2, y: shortServiceDistance * sideMultiplier },
      ],
    };
  };

  // UI state
  const isModalOpen = ref<boolean>(false);
  const isCalculating = ref<boolean>(false);
  const hasUnsavedChanges = ref<boolean>(false);
  const showCalibrationSuccess = ref<boolean>(false);
  const calibrationSuccessMessage = ref<string>('');

  // Workflow control methods
  const startCalibration = () => {
    calibrationStep.value = CalibrationStep.SETUP;
    isModalOpen.value = true;
    hasUnsavedChanges.value = false;
  };

  const goToNextStep = async () => {
    if (calibrationStep.value < CalibrationStep.CONFIRM) {
      // If we're moving from MARK_VIDEO to CALCULATE, trigger the calculation
      if (calibrationStep.value === CalibrationStep.MARK_VIDEO) {
        calibrationStep.value = CalibrationStep.CALCULATE;
        hasUnsavedChanges.value = true;

        // Automatically calculate camera parameters
        const result = await calculateCameraParameters();
        if (result) {
          // If calculation was successful, automatically move to validation step
          calibrationStep.value = CalibrationStep.VALIDATE;
          validateCalibration();
        } else {
          // If calculation failed, stay on calculate step to show error
          console.error('Camera calibration failed, staying on calculate step');
        }
      } else {
        // For other steps, just move to the next step normally
        calibrationStep.value++;
        hasUnsavedChanges.value = true;
      }
    }
  };

  const goToPreviousStep = () => {
    if (calibrationStep.value > CalibrationStep.SETUP) {
      calibrationStep.value--;
    }
  };

  const reset = () => {
    calibrationStep.value = CalibrationStep.SETUP;
    selectedCourtLines.value = [];
    drawnVideoLines.value = [];
    lineCorrespondences.value = [];
    cameraParameters.position = null;
    cameraParameters.rotation = null;
    cameraParameters.fov = null;
    homographyMatrix.value = null;
    projectionMatrix.value = null;
    calibrationError.value = 0;
    validationMetrics.value = null;
    calibrationConfidence.value = 0;
    isCalculating.value = false;
    hasUnsavedChanges.value = false;
  };

  // Line management methods
  const selectDiagramLine = (lineId: string) => {
    // Check if line is already selected
    const existingIndex = selectedCourtLines.value.findIndex(
      (line) => line.id === lineId
    );
    if (existingIndex !== -1) {
      return; // Already selected
    }

    // Check if we've reached the maximum of 3 lines
    if (selectedCourtLines.value.length >= 3) {
      console.warn('Maximum of 3 lines can be selected');
      return;
    }

    // Determine line type based on lineId
    let lineType: SelectedLine['type'];
    if (lineId === 'service-long-doubles') {
      lineType = 'service-long-doubles';
    } else if (lineId === 'center-line') {
      lineType = 'center-line';
    } else if (lineId === 'service-short') {
      lineType = 'service-short';
    } else {
      console.warn(`Unknown line ID: ${lineId}`);
      return;
    }

    // Create a new selected line with proper court coordinates
    const newLine: SelectedLine = {
      id: lineId,
      type: lineType,
      courtPoints: getCourtPointsForLine(lineType),
      isParallel: lineType !== 'center-line', // Center line is perpendicular, others are parallel
      color: getLineColor(selectedCourtLines.value.length),
    };

    selectedCourtLines.value.push(newLine);
    hasUnsavedChanges.value = true;
  };

  const deselectCourtLine = (lineId: string) => {
    const index = selectedCourtLines.value.findIndex(
      (line) => line.id === lineId
    );
    if (index !== -1) {
      selectedCourtLines.value.splice(index, 1);
      // Also remove any corresponding drawn lines and correspondences
      removeCorrespondencesForCourtLine(lineId);
      hasUnsavedChanges.value = true;
    }
  };

  const addDrawnVideoLine = (lineId: string, coordinates: Point2D[]) => {
    const newDrawnLine: DrawnLine = {
      id: lineId,
      points: coordinates,
      timestamp: Date.now(),
      confidence: 1.0,
    };

    // Remove existing drawn line with same ID if it exists
    const existingIndex = drawnVideoLines.value.findIndex(
      (line) => line.id === lineId
    );
    if (existingIndex !== -1) {
      drawnVideoLines.value.splice(existingIndex, 1);
    }

    drawnVideoLines.value.push(newDrawnLine);
    hasUnsavedChanges.value = true;
  };

  const removeVideoLineDrawing = (lineId: string) => {
    const index = drawnVideoLines.value.findIndex((line) => line.id === lineId);
    if (index !== -1) {
      drawnVideoLines.value.splice(index, 1);
      // Also remove any correspondences
      removeCorrespondencesForVideoLine(lineId);
      hasUnsavedChanges.value = true;
    }
  };

  const createLineCorrespondence = (
    courtLineId: string,
    videoLineId: string
  ) => {
    // Remove existing correspondence for these lines
    lineCorrespondences.value = lineCorrespondences.value.filter(
      (corr) =>
        corr.courtLineId !== courtLineId && corr.videoLineId !== videoLineId
    );

    const newCorrespondence: LineCorrespondence = {
      courtLineId,
      videoLineId,
      matchConfidence: 1.0, // This would be calculated based on line similarity
    };

    lineCorrespondences.value.push(newCorrespondence);
    hasUnsavedChanges.value = true;
  };

  // Helper methods
  const getLineColor = (index: number): string => {
    const colors = ['#ff0000', '#00ff00', '#0000ff']; // Red, Green, Blue
    return colors[index] || '#000000';
  };

  // Get court points for a specific line type
  const getCourtPointsForLine = (lineType: SelectedLine['type']): Point2D[] => {
    const width = courtDimensions.value.width;
    const length = courtDimensions.value.length;
    const doubleServiceDistance = 0.76; // from baseline
    const shortServiceDistance = 1.98; // from net

    // Court coordinate system: origin at center, X = width (-3.05 to 3.05), Y = length (-6.7 to 6.7)
    // For side view camera perspective (most common setup)

    switch (lineType) {
      case 'service-long-doubles':
        // Long service line for doubles - HORIZONTAL line in side view (back boundary)
        // Runs across the width of the court
        return [
          { x: -width / 2, y: length / 2 - doubleServiceDistance },
          { x: width / 2, y: length / 2 - doubleServiceDistance },
        ];
      case 'center-line':
        // Center line - VERTICAL line in side view (dividing left/right courts)
        // Runs along the length of the court
        return [
          { x: 0, y: -shortServiceDistance },
          { x: 0, y: length / 2 - doubleServiceDistance },
        ];
      case 'service-short':
        // Short service line - HORIZONTAL line in side view (front service boundary)
        // Runs across the width of the court
        return [
          { x: -width / 2, y: shortServiceDistance },
          { x: width / 2, y: shortServiceDistance },
        ];
      default:
        return [];
    }
  };

  const removeCorrespondencesForCourtLine = (courtLineId: string) => {
    lineCorrespondences.value = lineCorrespondences.value.filter(
      (corr) => corr.courtLineId !== courtLineId
    );
  };

  const removeCorrespondencesForVideoLine = (videoLineId: string) => {
    lineCorrespondences.value = lineCorrespondences.value.filter(
      (corr) => corr.videoLineId !== videoLineId
    );
  };

  // Get sport-specific calibration multiplier
  const getSportSpecificMultiplier = (): number => {
    switch (sportConfig.value.type) {
      case 'tennis':
        // Tennis courts are larger, need different calibration approach
        return 1.1; // Slightly more forgiving due to larger court
      case 'badminton':
        // Badminton courts are smaller, more precise calibration possible
        return 1.0; // Standard precision
      default:
        return 1.0;
    }
  };

  // Get position-specific weights based on camera position and sport
  const getPositionWeights = (): PositionWeights => {
    // Calculate sport-specific multiplier
    const sportMultiplier = getSportSpecificMultiplier();

    if (!cameraPositionConfig.value?.edge) {
      // Default weights when no position is set
      return {
        horizontalLines: 1.0,
        verticalLines: 1.0,
        perspectiveCorrection: 1.0,
        heightAccuracy: 1.0,
        sportMultiplier,
      };
    }

    const { edge, distance } = cameraPositionConfig.value;

    // Calculate perspective correction based on distance and sport
    const optimalDistance = sportConfig.value.optimalCameraDistance;
    const perspectiveCorrection = Math.max(
      0.5,
      Math.min(1.5, 1.0 + (distance - optimalDistance) * 0.1)
    );

    // Apply sport-specific line importance
    const lineImportance = sportConfig.value.lineImportance;

    switch (edge) {
      case 'top':
      case 'bottom':
        // Camera at baseline - better view of vertical lines (center line runs toward camera)
        return {
          horizontalLines: 0.8 * lineImportance.baseline, // Reduced view of horizontal service lines
          verticalLines: 1.2 * lineImportance.sideline, // Better view of vertical center line
          perspectiveCorrection,
          heightAccuracy: 0.9, // Slightly reduced height accuracy from baseline
          sportMultiplier,
        };

      case 'left':
      case 'right':
        // Camera at sideline - better view of horizontal lines (service lines are perpendicular to view)
        return {
          horizontalLines: 1.2 * lineImportance.baseline, // Better view of horizontal service lines
          verticalLines: 0.8 * lineImportance.sideline, // Reduced view of vertical center line
          perspectiveCorrection,
          heightAccuracy: 1.1, // Better height accuracy from side view
          sportMultiplier,
        };

      default:
        return {
          horizontalLines: 1.0,
          verticalLines: 1.0,
          perspectiveCorrection: 1.0,
          heightAccuracy: 1.0,
          sportMultiplier,
        };
    }
  };

  // Helper function to extract point correspondences from line correspondences with position weighting
  const extractPointCorrespondences = () => {
    const correspondences: {
      world: Point3D;
      image: Point2D;
      weight: number;
    }[] = [];
    const weights = getPositionWeights();

    for (const lineCorr of lineCorrespondences.value) {
      const courtLine = selectedCourtLines.value.find(
        (l) => l.id === lineCorr.courtLineId
      );
      const videoLine = drawnVideoLines.value.find(
        (l) => l.id === lineCorr.videoLineId
      );

      if (
        !courtLine ||
        !videoLine ||
        courtLine.courtPoints.length < 2 ||
        videoLine.points.length < 2
      ) {
        continue;
      }

      // Determine line weight based on orientation and camera position
      let lineWeight = 1.0;
      if (
        courtLine.type === 'service-long-doubles' ||
        courtLine.type === 'service-short'
      ) {
        // Service lines are horizontal (run across court width)
        lineWeight = weights.horizontalLines;
      } else if (courtLine.type === 'center-line') {
        // Center line is vertical (runs along court length)
        lineWeight = weights.verticalLines;
      }

      // For each line, use the endpoints as point correspondences
      // Convert 2D court points to 3D (assuming court is on z=0 plane)
      const startPoint = courtLine.courtPoints[0];
      const endPoint = courtLine.courtPoints[1];
      const videoStartPoint = videoLine.points[0];
      const videoEndPoint = videoLine.points[videoLine.points.length - 1];

      if (startPoint && endPoint && videoStartPoint && videoEndPoint) {
        const worldStart: Point3D = {
          x: startPoint.x,
          y: startPoint.y,
          z: 0,
        };
        const worldEnd: Point3D = {
          x: endPoint.x,
          y: endPoint.y,
          z: 0,
        };

        correspondences.push(
          { world: worldStart, image: videoStartPoint, weight: lineWeight },
          { world: worldEnd, image: videoEndPoint, weight: lineWeight }
        );
      }
    }

    return correspondences;
  };

  // Calculate homography matrix using weighted Direct Linear Transform (DLT)
  const calculateHomography = (
    correspondences: { world: Point3D; image: Point2D; weight: number }[]
  ) => {
    if (correspondences.length < 4) {
      throw new Error(
        'Need at least 4 point correspondences for homography calculation'
      );
    }

    console.log(
      '🔧 [calculateHomography] Input correspondences with weights:',
      correspondences
    );

    const weights = getPositionWeights();
    console.log('🔧 [calculateHomography] Position weights:', weights);

    // Build the A matrix for the weighted DLT algorithm
    // We want to find H such that: image_point = H * world_point
    const A: number[][] = [];

    for (const corr of correspondences) {
      const { world, image, weight } = corr;
      const X = world.x;
      const Y = world.y;
      let x = image.x;
      let y = image.y;

      // Apply perspective correction based on camera position
      if (cameraPositionConfig.value) {
        const { distance, edge } = cameraPositionConfig.value;

        // Apply perspective correction factor
        const correctionFactor = weights.perspectiveCorrection;

        // Adjust coordinates based on camera position and distance
        if (edge === 'top' || edge === 'bottom') {
          // For baseline cameras, correct horizontal perspective
          const centerX = getCurrentVideoDimensions().width / 2;
          x = centerX + (x - centerX) * correctionFactor;
        } else if (edge === 'left' || edge === 'right') {
          // For sideline cameras, correct vertical perspective
          const centerY = getCurrentVideoDimensions().height / 2;
          y = centerY + (y - centerY) * correctionFactor;
        }
      }

      console.log(
        `🔧 [calculateHomography] World: (${X}, ${Y}) -> Image: (${x}, ${y}) [weight: ${weight}]`
      );

      // Each correspondence gives us 2 equations for world-to-image transformation
      // Apply weighting to the equations
      const sqrtWeight = Math.sqrt(weight);

      // x = (h11*X + h12*Y + h13) / (h31*X + h32*Y + h33)
      // y = (h21*X + h22*Y + h23) / (h31*X + h32*Y + h33)
      // Rearranged: x*(h31*X + h32*Y + h33) = h11*X + h12*Y + h13
      //            y*(h31*X + h32*Y + h33) = h21*X + h22*Y + h23
      A.push([
        X * sqrtWeight,
        Y * sqrtWeight,
        1 * sqrtWeight,
        0,
        0,
        0,
        -x * X * sqrtWeight,
        -x * Y * sqrtWeight,
        -x * sqrtWeight,
      ]);
      A.push([
        0,
        0,
        0,
        X * sqrtWeight,
        Y * sqrtWeight,
        1 * sqrtWeight,
        -y * X * sqrtWeight,
        -y * Y * sqrtWeight,
        -y * sqrtWeight,
      ]);
    }

    const matrixA = new Matrix(A);

    // Solve using SVD to find the null space
    const svd = new SingularValueDecomposition(matrixA);
    const V = svd.rightSingularVectors;
    const h = V.getColumn(8); // Last column of V (null space)

    // Reshape h into 3x3 homography matrix
    const H = new Matrix([
      [h[0] || 0, h[1] || 0, h[2] || 0],
      [h[3] || 0, h[4] || 0, h[5] || 0],
      [h[6] || 0, h[7] || 0, h[8] || 0],
    ]);

    return H;
  };

  // Decompose homography to extract camera parameters
  const decomposeHomography = (H: any) => {
    // Normalize the homography matrix
    const h = H.div(H.get(2, 2));

    // Extract the columns
    const h1 = [h.get(0, 0), h.get(1, 0), h.get(2, 0)];
    const h2 = [h.get(0, 1), h.get(1, 1), h.get(2, 1)];
    const h3 = [h.get(0, 2), h.get(1, 2), h.get(2, 2)];

    // Estimate camera intrinsics (simplified approach)
    // Get actual video dimensions
    const videoDims = getCurrentVideoDimensions();
    const imageWidth = videoDims.width;
    const imageHeight = videoDims.height;
    const cx = imageWidth / 2;
    const cy = imageHeight / 2;

    console.log('📐 [calculateCameraParameters] Using video dimensions:', {
      width: imageWidth,
      height: imageHeight,
      principalPoint: { cx, cy },
    });

    // Estimate focal length from homography
    const lambda1 = Math.sqrt(h1[0] * h1[0] + h1[1] * h1[1]);
    const lambda2 = Math.sqrt(h2[0] * h2[0] + h2[1] * h2[1]);
    const f = (lambda1 + lambda2) / 2;

    // Build camera intrinsic matrix K
    const K = new Matrix([
      [f, 0, cx],
      [0, f, cy],
      [0, 0, 1],
    ]);

    // Calculate rotation matrix columns
    const r1 = [h1[0] / lambda1, h1[1] / lambda1, h1[2] / lambda1];
    const r2 = [h2[0] / lambda2, h2[1] / lambda2, h2[2] / lambda2];

    // Third column of rotation matrix (cross product of r1 and r2)
    const r3 = [
      (r1[1] || 0) * (r2[2] || 0) - (r1[2] || 0) * (r2[1] || 0),
      (r1[2] || 0) * (r2[0] || 0) - (r1[0] || 0) * (r2[2] || 0),
      (r1[0] || 0) * (r2[1] || 0) - (r1[1] || 0) * (r2[0] || 0),
    ];

    // Build rotation matrix
    const R = new Matrix([
      [r1[0] || 0, r2[0] || 0, r3[0] || 0],
      [r1[1] || 0, r2[1] || 0, r3[1] || 0],
      [r1[2] || 0, r2[2] || 0, r3[2] || 0],
    ]);

    // Calculate translation vector
    const t = [
      (h3[0] ?? 0) / lambda1,
      (h3[1] ?? 0) / lambda1,
      (h3[2] ?? 0) / lambda1,
    ];

    // Convert rotation matrix to Euler angles
    const rotation = matrixToEuler(R);

    // Calculate camera position (inverse transformation)
    const Rt = R.transpose();
    const position = Rt.mmul(
      new Matrix([[-(t[0] || 0)], [-(t[1] || 0)], [-(t[2] || 0)]])
    );

    // Calculate field of view
    const fov = 2 * Math.atan(imageHeight / (2 * f)) * (180 / Math.PI);

    return {
      position: {
        x: position.get(0, 0),
        y: position.get(1, 0),
        z: position.get(2, 0),
      },
      rotation,
      fov,
      intrinsics: K,
    };
  };

  // Convert rotation matrix to Euler angles (XYZ order)
  const matrixToEuler = (R: any): Euler => {
    const r11 = R.get(0, 0);
    const r12 = R.get(0, 1);
    const r13 = R.get(0, 2);
    const r21 = R.get(1, 0);
    const r22 = R.get(1, 1);
    const r23 = R.get(1, 2);
    const r31 = R.get(2, 0);
    const r32 = R.get(2, 1);
    const r33 = R.get(2, 2);

    let x, y, z;

    // Check for gimbal lock
    if (Math.abs(r31) >= 1) {
      z = 0; // Set z to 0 in gimbal lock
      if (r31 < 0) {
        y = Math.PI / 2;
        x = Math.atan2(r12, r13);
      } else {
        y = -Math.PI / 2;
        x = Math.atan2(-r12, -r13);
      }
    } else {
      y = -Math.asin(r31);
      x = Math.atan2(r32 / Math.cos(y), r33 / Math.cos(y));
      z = Math.atan2(r21 / Math.cos(y), r11 / Math.cos(y));
    }

    return { x, y, z };
  };

  // Calculate weighted reprojection error for validation
  const calculateReprojectionError = (
    correspondences: { world: Point3D; image: Point2D; weight?: number }[],
    H: any
  ): number => {
    let totalError = 0;
    let totalWeight = 0;

    for (const corr of correspondences) {
      const worldHomogeneous = new Matrix([
        [corr.world.x],
        [corr.world.y],
        [1],
      ]);
      const projectedHomogeneous = H.mmul(worldHomogeneous);

      // Convert from homogeneous coordinates
      const projectedX =
        projectedHomogeneous.get(0, 0) / projectedHomogeneous.get(2, 0);
      const projectedY =
        projectedHomogeneous.get(1, 0) / projectedHomogeneous.get(2, 0);

      // Calculate Euclidean distance
      const error = Math.sqrt(
        Math.pow(projectedX - corr.image.x, 2) +
          Math.pow(projectedY - corr.image.y, 2)
      );

      // Weight the error by correspondence importance (default weight = 1)
      const weight = corr.weight || 1.0;
      totalError += error * weight;
      totalWeight += weight;
    }

    return totalWeight > 0
      ? totalError / totalWeight
      : totalError / correspondences.length;
  };

  // Main calculation method with homography-based approach
  const calculateCameraParameters = async (): Promise<CameraParams | null> => {
    if (
      selectedCourtLines.value.length < 3 ||
      drawnVideoLines.value.length < 3 ||
      lineCorrespondences.value.length < 3
    ) {
      console.error('Need at least 3 line correspondences for calibration');
      return null;
    }

    isCalculating.value = true;

    try {
      // Extract point correspondences from line correspondences
      const correspondences = extractPointCorrespondences();

      if (correspondences.length < 4) {
        throw new Error(
          'Need at least 4 point correspondences. Check that court lines have valid coordinates.'
        );
      }

      // Calculate homography matrix
      const H = calculateHomography(correspondences);
      homographyMatrix.value = H.to2DArray();

      // Decompose homography to get camera parameters
      const { position, rotation, fov, intrinsics } = decomposeHomography(H);

      // Store projection matrix for later use
      projectionMatrix.value = intrinsics.to2DArray();

      // Calculate validation metrics
      const reprojError = calculateReprojectionError(correspondences, H);
      calibrationError.value = reprojError;

      // Calculate confidence based on sport-specific reprojection error thresholds
      const thresholds = sportConfig.value.validationThresholds;
      const weights = getPositionWeights();

      // Apply sport multiplier to error calculation
      const adjustedError = reprojError / weights.sportMultiplier;

      let confidence: number;
      if (adjustedError <= thresholds.excellentError) {
        confidence = 1.0; // Excellent calibration
      } else if (adjustedError <= thresholds.acceptableError) {
        // Linear interpolation between excellent and acceptable
        confidence =
          1.0 -
          ((adjustedError - thresholds.excellentError) /
            (thresholds.acceptableError - thresholds.excellentError)) *
            0.5;
      } else if (adjustedError <= thresholds.maxError) {
        // Poor but usable calibration
        confidence = Math.max(
          0.1,
          0.5 -
            ((adjustedError - thresholds.acceptableError) /
              (thresholds.maxError - thresholds.acceptableError)) *
              0.4
        );
      } else {
        // Very poor calibration
        confidence = 0.1;
      }

      console.log('🏟️ [Sport-Specific Validation]:', {
        sport: sportConfig.value.type,
        originalError: reprojError,
        adjustedError,
        thresholds,
        sportMultiplier: weights.sportMultiplier,
        finalConfidence: confidence,
      });

      calibrationConfidence.value = confidence;

      console.log(
        `🔧 [calculateHomography] Reprojection error: ${reprojError.toFixed(
          2
        )}px`
      );
      console.log(
        `🔧 [calculateHomography] Calculated confidence: ${confidence.toFixed(
          3
        )} (${(confidence * 100).toFixed(1)}%)`
      );

      const calculatedParams: CameraParams = {
        position,
        rotation,
        fov,
        aspectRatio: 16 / 9, // Default aspect ratio
        near: 0.1,
        far: 1000,
      };

      // Update reactive camera parameters
      cameraParameters.position = calculatedParams.position;
      cameraParameters.rotation = calculatedParams.rotation;
      cameraParameters.fov = calculatedParams.fov;

      // Update validation metrics
      validationMetrics.value = {
        reprojectionError: reprojError,
        lineAlignmentScore: confidence,
        perspectiveAccuracy: confidence,
        overallConfidence: confidence,
      };

      console.log('Camera calibration completed:', calculatedParams);
      console.log('Reprojection error:', reprojError);
      console.log('Confidence:', confidence);

      return calculatedParams;
    } catch (error) {
      console.error('Camera calibration failed:', error);
      calibrationError.value = Infinity;
      calibrationConfidence.value = 0;
      return null;
    } finally {
      isCalculating.value = false;
    }
  };

  const setCourtDimensions = (dimensions: CourtDimensions) => {
    courtDimensions.value = { ...dimensions };
    hasUnsavedChanges.value = true;
  };

  // Set camera position configuration from EdgeBasedCameraSelector
  const setCameraPositionConfig = (config: CameraPositionConfig) => {
    cameraPositionConfig.value = { ...config };
    hasUnsavedChanges.value = true;

    console.log('📍 [Camera Calibration] Camera position updated:', {
      edge: config.edge,
      distance: config.distance,
      height: config.height,
      position3D: config.position3D,
    });
  };

  // Set sport configuration
  const setSportConfig = (type: 'badminton' | 'tennis') => {
    if (type === 'tennis') {
      sportConfig.value = {
        type: 'tennis',
        courtDimensions: {
          length: 23.77,
          width: 10.97,
          serviceLineDistance: 6.4, // Distance from baseline to service line
          centerLineLength: 10.97,
          netHeight: 0.914,
        },
        typicalPlayerHeight: 1.8, // meters - tennis players typically taller
        optimalCameraDistance: 5.0, // meters - larger court needs more distance
        lineImportance: {
          baseline: 1.3, // More important in tennis due to court size
          serviceLine: 1.2,
          centerLine: 0.9, // Less important in tennis
          sideline: 1.1,
        },
        validationThresholds: {
          excellentError: 75, // Higher tolerance due to larger court
          acceptableError: 150,
          maxError: 300,
        },
        perspectiveFactors: {
          baseline: 1.1, // Tennis baseline cameras need more correction
          sideline: 1.2, // Tennis sideline cameras have better perspective
          heightSensitivity: 1.1, // Tennis players are taller, better height detection
        },
      };
    } else {
      sportConfig.value = {
        type: 'badminton',
        courtDimensions: {
          length: 13.4,
          width: 6.1,
          serviceLineDistance: 1.98,
          centerLineLength: 4.72,
          netHeight: 1.55,
        },
        typicalPlayerHeight: 1.7, // meters
        optimalCameraDistance: 3.0, // meters
        lineImportance: {
          baseline: 1.2,
          serviceLine: 1.1,
          centerLine: 1.0,
          sideline: 1.0,
        },
        validationThresholds: {
          excellentError: 50,
          acceptableError: 100,
          maxError: 200,
        },
        perspectiveFactors: {
          baseline: 1.0, // Standard correction for badminton baseline
          sideline: 1.1, // Slightly better perspective from sideline
          heightSensitivity: 1.0, // Standard height sensitivity
        },
      };
    }

    // Update court dimensions to match sport
    courtDimensions.value = { ...sportConfig.value.courtDimensions };
    hasUnsavedChanges.value = true;

    console.log('🏟️ [Camera Calibration] Sport configuration updated:', {
      type: sportConfig.value.type,
      courtDimensions: sportConfig.value.courtDimensions,
      optimalDistance: sportConfig.value.optimalCameraDistance,
      thresholds: sportConfig.value.validationThresholds,
    });
  };

  const validateCalibration = () => {
    if (!homographyMatrix.value || !cameraPositionConfig.value) {
      const metrics: ValidationMetrics = {
        reprojectionError: Infinity,
        lineAlignmentScore: 0,
        perspectiveAccuracy: 0,
        overallConfidence: 0,
      };
      validationMetrics.value = metrics;
      return metrics;
    }

    // Calculate position-aware validation metrics
    const weights = getPositionWeights();
    const baseError = calibrationError.value;

    // Adjust validation based on camera position
    let positionAccuracyFactor = 1.0;
    let perspectiveAccuracy = 0.85; // Base accuracy

    if (cameraPositionConfig.value.edge) {
      const { edge, distance } = cameraPositionConfig.value;

      // Distance-based accuracy adjustment
      const optimalDistance = 3.0; // meters
      const distanceDeviation = Math.abs(distance - optimalDistance);
      const distanceFactor = Math.max(0.7, 1.0 - distanceDeviation * 0.1);

      // Position-specific accuracy factors
      switch (edge) {
        case 'left':
        case 'right':
          // Sideline cameras generally provide better accuracy for movement tracking
          positionAccuracyFactor = 1.1 * distanceFactor;
          perspectiveAccuracy = Math.min(
            0.95,
            0.85 + (weights.heightAccuracy - 1.0) * 0.1
          );
          break;

        case 'top':
        case 'bottom':
          // Baseline cameras provide good horizontal line accuracy but limited height
          positionAccuracyFactor = 1.0 * distanceFactor;
          perspectiveAccuracy = Math.min(
            0.9,
            0.85 + (weights.horizontalLines - 1.0) * 0.05
          );
          break;
      }
    }

    // Calculate line alignment score based on position weights
    const horizontalLineAccuracy = weights.horizontalLines > 1.0 ? 0.95 : 0.85;
    const verticalLineAccuracy = weights.verticalLines > 1.0 ? 0.95 : 0.85;
    const lineAlignmentScore =
      (horizontalLineAccuracy + verticalLineAccuracy) / 2;

    // Adjust reprojection error based on position
    const adjustedError = baseError / positionAccuracyFactor;

    // Calculate overall confidence considering camera position
    const errorConfidence = Math.max(0.1, 1.0 - adjustedError / 100); // Normalize to 0-1
    const positionConfidence = positionAccuracyFactor;
    const overallConfidence =
      (errorConfidence * 0.6 +
        lineAlignmentScore * 0.2 +
        perspectiveAccuracy * 0.2) *
      positionConfidence;

    const metrics: ValidationMetrics = {
      reprojectionError: adjustedError,
      lineAlignmentScore,
      perspectiveAccuracy,
      overallConfidence: Math.min(1.0, overallConfidence),
    };

    validationMetrics.value = metrics;

    console.log('📊 [Camera Calibration] Position-aware validation metrics:', {
      cameraPosition: cameraPositionConfig.value.edge,
      distance: cameraPositionConfig.value.distance,
      positionAccuracyFactor,
      adjustedError,
      overallConfidence: metrics.overallConfidence,
    });

    return metrics;
  };

  // Computed properties
  const canProceedToNextStep = computed(() => {
    switch (calibrationStep.value) {
      case CalibrationStep.SETUP:
        return true;
      case CalibrationStep.SELECT_LINES:
        return selectedCourtLines.value.length === 3;
      case CalibrationStep.MARK_VIDEO:
        return (
          drawnVideoLines.value.length === 3 &&
          lineCorrespondences.value.length === 3
        );
      case CalibrationStep.CALCULATE:
        return cameraParameters.position !== null;
      case CalibrationStep.VALIDATE:
        return validationMetrics.value !== null;
      case CalibrationStep.CONFIRM:
        return true;
      default:
        return false;
    }
  });

  const currentStepName = computed(() => {
    const stepNames = {
      [CalibrationStep.SETUP]: 'Setup',
      [CalibrationStep.SELECT_LINES]: 'Select Lines',
      [CalibrationStep.MARK_VIDEO]: 'Mark Video',
      [CalibrationStep.CALCULATE]: 'Calculate',
      [CalibrationStep.VALIDATE]: 'Validate',
      [CalibrationStep.CONFIRM]: 'Confirm',
    };
    return stepNames[calibrationStep.value] || 'Unknown';
  });

  /**
   * Transform a 2D point from image coordinates to 3D world coordinates
   * @param point2D - Point in image coordinates (pixels)
   * @param z - Z-coordinate in world space (default 0 for court plane)
   * @returns 3D point in world coordinates or null if transformation fails
   */
  const transformToWorld = (
    point2D: Point2D,
    z: number = 0
  ): Point3D | null => {
    if (!homographyMatrix.value || !isValidHomography(homographyMatrix.value)) {
      console.warn(
        'Cannot transform point: Invalid or missing homography matrix'
      );
      return null;
    }

    try {
      const worldPoint = imageToWorld(point2D, homographyMatrix.value, z);
      return worldPoint;
    } catch (error) {
      console.error('Error transforming point to world coordinates:', error);
      return null;
    }
  };

  /**
   * Transform pose landmarks from image to world coordinates
   * @param landmarks - Array of pose landmarks in image coordinates
   * @param worldZ - Base Z-coordinate in world space (default 0)
   * @returns Array of transformed landmarks in world coordinates
   */
  const transformLandmarksToWorld = (
    landmarks: PoseLandmark[],
    worldZ: number = 0
  ): WorldLandmark[] => {
    if (!homographyMatrix.value || !isValidHomography(homographyMatrix.value)) {
      console.warn(
        'Cannot transform landmarks: Invalid or missing homography matrix'
      );
      return [];
    }

    try {
      return transformPoseLandmarks(landmarks, homographyMatrix.value, worldZ);
    } catch (error) {
      console.error(
        'Error transforming landmarks to world coordinates:',
        error
      );
      return [];
    }
  };

  /**
   * Computed property to check if the camera is calibrated
   */
  const isCalibrated = computed(() => {
    return (
      homographyMatrix.value !== null &&
      isValidHomography(homographyMatrix.value) &&
      cameraParameters.position !== null &&
      cameraParameters.rotation !== null &&
      cameraParameters.fov !== null &&
      calibrationConfidence.value > 0.5 // Minimum confidence threshold
    );
  });

  /**
   * Reset calibration data and clear all cached transformations
   */
  const resetCalibration = () => {
    // Reset all calibration state
    calibrationStep.value = CalibrationStep.SETUP;
    selectedCourtLines.value = [];
    drawnVideoLines.value = [];
    lineCorrespondences.value = [];
    unifiedConfig.value = null;

    // Reset camera parameters
    cameraParameters.position = null;
    cameraParameters.rotation = null;
    cameraParameters.fov = null;

    // Reset matrices
    homographyMatrix.value = null;
    projectionMatrix.value = null;

    // Reset validation metrics
    calibrationError.value = 0;
    validationMetrics.value = null;
    calibrationConfidence.value = 0;

    // Reset UI state
    isCalculating.value = false;
    hasUnsavedChanges.value = false;
    showCalibrationSuccess.value = false;
    calibrationSuccessMessage.value = '';

    // Clear the transformation cache
    clearTransformCache();

    console.log('Camera calibration has been reset');
  };

  /**
   * Complete calibration and show success overlay
   */
  const completeCalibration = () => {
    if (!isCalibrated.value) {
      console.error('Cannot complete calibration: calibration is not valid');
      return;
    }

    // Close the modal
    isModalOpen.value = false;
    hasUnsavedChanges.value = false;

    // Prepare success message with calibration details
    const accuracy = Math.round(calibrationConfidence.value * 100);
    const error = calibrationError.value.toFixed(2);

    calibrationSuccessMessage.value = `
      Calibration Complete!
      • Accuracy: ${accuracy}%
      • Reprojection Error: ${error}px
      • Speed calculations now use real-world coordinates
    `;

    // Show success overlay
    showCalibrationSuccess.value = true;

    // Hide overlay after 5 seconds
    setTimeout(() => {
      showCalibrationSuccess.value = false;
      calibrationSuccessMessage.value = '';
    }, 5000);

    console.log('Calibration completed successfully');
  };

  /**
   * Set the video dimensions for calibration
   */
  const setVideoDimensions = (width: number, height: number) => {
    if (width > 0 && height > 0) {
      const dimensions: VideoDimensions = {
        width,
        height,
        aspectRatio: width / height,
      };

      // Update runtime dimensions
      runtimeVideoDimensions.value = dimensions;

      // If calibrating, also update calibration dimensions
      if (
        isModalOpen.value ||
        calibrationStep.value !== CalibrationStep.SETUP
      ) {
        calibrationVideoDimensions.value = dimensions;
      }

      console.log('📐 [Camera Calibration] Video dimensions updated:', {
        width,
        height,
        aspectRatio: dimensions.aspectRatio,
        isCalibrating: isModalOpen.value,
      });
    }
  };

  /**
   * Get the current video dimensions (runtime or calibration)
   */
  const getCurrentVideoDimensions = (): VideoDimensions => {
    // Use runtime dimensions if available, otherwise calibration dimensions
    const dims =
      runtimeVideoDimensions.value || calibrationVideoDimensions.value;

    // If no dimensions set yet, return default (but log warning)
    if (!dims) {
      console.warn(
        '⚠️ [Camera Calibration] No video dimensions set, using defaults'
      );
      return {
        width: 1920,
        height: 1080,
        aspectRatio: 16 / 9,
      };
    }

    return dims;
  };

  /**
   * Get transformation data to show calibration results
   */
  const getTransformationData = computed(() => {
    if (!homographyMatrix.value || !isValidHomography(homographyMatrix.value)) {
      console.log(
        '🔧 [getTransformationData] No valid homography matrix available'
      );
      return null;
    }

    // Get actual video dimensions
    const videoDims = getCurrentVideoDimensions();

    // Calculate actual center of the video
    const imageCenter = {
      x: videoDims.width / 2,
      y: videoDims.height / 2,
    };

    console.log('📐 [getTransformationData] Using video dimensions:', {
      width: videoDims.width,
      height: videoDims.height,
      center: imageCenter,
    });

    const worldPoint = transformToWorld(imageCenter, 0);

    if (!worldPoint) {
      console.log(
        '🔧 [getTransformationData] Transform failed for center point'
      );
      return null;
    }

    console.log(
      '🔧 [getTransformationData] Successfully transformed center point:',
      worldPoint
    );

    return {
      imagePoint: imageCenter,
      worldPoint: {
        x: worldPoint.x.toFixed(2),
        y: worldPoint.y.toFixed(2),
        z: worldPoint.z.toFixed(2),
      },
      // Calculate speed conversion factor based on actual video width and court width
      pixelsPerMeter: Math.abs(
        videoDims.width / (courtDimensions.value.width * 2)
      ),
    };
  });

  // Return all reactive state and methods
  return {
    // State
    calibrationStep,
    workflowProgress,
    selectedCourtLines,
    drawnVideoLines,
    lineCorrespondences,
    cameraParameters,
    cameraPositionConfig,
    sportConfig,
    homographyMatrix,
    projectionMatrix,
    calibrationError,
    validationMetrics,
    calibrationConfidence,
    courtDimensions,
    isModalOpen,
    isCalculating,
    hasUnsavedChanges,
    showCalibrationSuccess,
    calibrationSuccessMessage,

    // Computed
    canProceedToNextStep,
    currentStepName,
    isCalibrated,
    getTransformationData,

    // Methods
    startCalibration,
    goToNextStep,
    goToPreviousStep,
    reset,
    resetCalibration,
    completeCalibration,
    selectDiagramLine,
    deselectCourtLine,
    addDrawnVideoLine,
    removeVideoLineDrawing,
    createLineCorrespondence,
    calculateCameraParameters,
    setCourtDimensions,
    setCameraPositionConfig,
    setSportConfig,
    validateCalibration,
    transformToWorld,
    transformLandmarksToWorld,
    setVideoDimensions,
    getCurrentVideoDimensions,
  };
}
