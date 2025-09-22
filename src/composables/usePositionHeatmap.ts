/**
 * usePositionHeatmap.ts
 * Composable for tracking player positions and generating heatmap data
 * Integrates with camera calibration to transform positions to court coordinates
 */

import { ref, watch, type Ref } from 'vue';
import type { Point2D, Point3D, CourtDimensions } from './useCameraCalibration';

// Re-export Point3D for use in other components
export type { Point3D } from './useCameraCalibration';

export interface HeatmapCell {
  x: number; // Grid x coordinate
  y: number; // Grid y coordinate
  count: number; // Number of times player was in this cell
  intensity: number; // Normalized intensity (0-1)
}

export interface HeatmapData {
  cells: HeatmapCell[][];
  maxCount: number;
  totalSamples: number;
  gridWidth: number;
  gridHeight: number;
  courtDimensions: CourtDimensions;
}

export interface PositionSample {
  worldPosition: Point3D;
  imagePosition: Point2D;
  timestamp: number;
  frameNumber: number;
  confidence: number;
}

export interface HeatmapSettings {
  gridResolution: number; // Number of cells per meter
  smoothingRadius: number; // Radius for gaussian smoothing (in cells)
  minConfidence: number; // Minimum pose confidence to track
  sampleInterval: number; // Minimum ms between samples
  maxHistorySize: number; // Maximum number of position samples to keep
  decayFactor: number; // Factor for time-based decay (0-1, 1 = no decay)
}

export interface UsePositionHeatmap {
  // State
  isTracking: Ref<boolean>;
  heatmapData: Ref<HeatmapData | null>;
  positionHistory: Ref<PositionSample[]>;
  currentPosition: Ref<Point3D | null>;
  settings: Ref<HeatmapSettings>;

  // Statistics
  totalDistance: Ref<number>;
  averageSpeed: Ref<number>;
  timeInZones: Ref<Map<string, number>>;
  mostVisitedZone: Ref<string | null>;

  // Methods
  startTracking: () => void;
  stopTracking: () => void;
  clearHistory: () => void;
  addPositionSample: (
    worldPos: Point3D,
    imagePos: Point2D,
    confidence: number,
    frameNumber: number
  ) => void;
  generateHeatmap: () => HeatmapData;
  updateSettings: (newSettings: Partial<HeatmapSettings>) => void;
  exportData: () => string;
  importData: (data: string) => boolean;
  getZoneName: (x: number, y: number) => string;
}

// Default settings
const DEFAULT_SETTINGS: HeatmapSettings = {
  gridResolution: 4, // 4 cells per meter (25cm resolution)
  smoothingRadius: 1, // Smooth over adjacent cells
  minConfidence: 0.5, // Minimum 50% confidence (more permissive)
  sampleInterval: 50, // Sample every 50ms (20 Hz) for more responsive tracking
  maxHistorySize: 10000, // Keep last 10000 samples
  decayFactor: 1.0, // No decay by default
};

// Court zones for badminton (can be customized for other sports)
const COURT_ZONES = {
  'front-left': { x: [0, 0.33], y: [0, 0.5] },
  'front-center': { x: [0.33, 0.67], y: [0, 0.5] },
  'front-right': { x: [0.67, 1], y: [0, 0.5] },
  'mid-left': { x: [0, 0.33], y: [0.5, 0.7] },
  'mid-center': { x: [0.33, 0.67], y: [0.5, 0.7] },
  'mid-right': { x: [0.67, 1], y: [0.5, 0.7] },
  'back-left': { x: [0, 0.33], y: [0.7, 1] },
  'back-center': { x: [0.33, 0.67], y: [0.7, 1] },
  'back-right': { x: [0.67, 1], y: [0.7, 1] },
};

const DEFAULT_COURT_WIDTH = 6.1;
const DEFAULT_COURT_LENGTH = 13.4;

const gaussianKernelCache = new Map<number, Float32Array>();

function getGaussianKernel(radius: number): {
  radius: number;
  kernel: Float32Array;
} {
  const kernelRadius = Math.max(1, Math.round(radius));
  if (!gaussianKernelCache.has(kernelRadius)) {
    const size = kernelRadius * 2 + 1;
    const sigma = Math.max(kernelRadius, 1e-3);
    const denom = 2 * sigma * sigma;
    const kernel = new Float32Array(size);
    let sum = 0;

    for (let i = 0; i < size; i++) {
      const offset = i - kernelRadius;
      const value = Math.exp(-(offset * offset) / denom);
      kernel[i] = value;
      sum += value;
    }

    const invSum = sum > 0 ? 1 / sum : 0;
    for (let i = 0; i < size; i++) {
      const current = kernel[i] ?? 0;
      kernel[i] = current * invSum;
    }

    gaussianKernelCache.set(kernelRadius, kernel);
  }

  return {
    radius: kernelRadius,
    kernel: gaussianKernelCache.get(kernelRadius)!,
  };
}

export function usePositionHeatmap(
  courtDimensions: Ref<CourtDimensions>
): UsePositionHeatmap {
  // State
  const isTracking = ref(false);
  const heatmapData = ref<HeatmapData | null>(null);
  const positionHistory = ref<PositionSample[]>([]);
  const currentPosition = ref<Point3D | null>(null);

  const clamp = (value: number, min: number, max: number) => {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  };

  const ensureFinite = (value: number, fallback: number) =>
    Number.isFinite(value) ? value : fallback;

  const normalizeSettings = (raw: HeatmapSettings): HeatmapSettings => {
    const base = {
      ...DEFAULT_SETTINGS,
      ...raw,
    };

    return {
      gridResolution: Math.max(
        0.5,
        ensureFinite(base.gridResolution, DEFAULT_SETTINGS.gridResolution)
      ),
      smoothingRadius: Math.max(
        0,
        ensureFinite(base.smoothingRadius, DEFAULT_SETTINGS.smoothingRadius)
      ),
      minConfidence: clamp(
        ensureFinite(base.minConfidence, DEFAULT_SETTINGS.minConfidence),
        0,
        1
      ),
      sampleInterval: Math.max(
        0,
        ensureFinite(base.sampleInterval, DEFAULT_SETTINGS.sampleInterval)
      ),
      maxHistorySize: Math.max(
        1,
        Math.floor(
          ensureFinite(base.maxHistorySize, DEFAULT_SETTINGS.maxHistorySize)
        )
      ),
      decayFactor: clamp(
        ensureFinite(base.decayFactor, DEFAULT_SETTINGS.decayFactor),
        0,
        1
      ),
    };
  };

  const settings = ref<HeatmapSettings>(normalizeSettings(DEFAULT_SETTINGS));

  // Statistics
  const totalDistance = ref(0);
  const averageSpeed = ref(0);
  const timeInZones = ref(new Map<string, number>());
  const mostVisitedZone = ref<string | null>(null);

  // Private state
  const lastSampleTime = ref(0);
  const lastPosition = ref<Point3D | null>(null);

  const toCourtSpace = (point: Point3D) => {
    const width = courtDimensions.value.width || DEFAULT_COURT_WIDTH;
    const length = courtDimensions.value.length || DEFAULT_COURT_LENGTH;
    return {
      x: clamp(point.x + width / 2, 0, width),
      y: clamp(point.y + length / 2, 0, length),
      z: point.z ?? 0,
    };
  };

  const toNormalizedCourtSpace = (point: Point3D) => {
    const width = courtDimensions.value.width || DEFAULT_COURT_WIDTH;
    const length = courtDimensions.value.length || DEFAULT_COURT_LENGTH;
    const courtSpace = toCourtSpace(point);
    return {
      x: clamp(courtSpace.x / width, 0, 1),
      y: clamp(courtSpace.y / length, 0, 1),
    };
  };

  /**
   * Initialize zone tracking
   */
  function initializeZones() {
    timeInZones.value.clear();
    Object.keys(COURT_ZONES).forEach((zone) => {
      timeInZones.value.set(zone, 0);
    });
  }

  initializeZones();

  /**
   * Get zone name for a position
   */
  function getZoneName(x: number, y: number): string {
    const normalized = toNormalizedCourtSpace({ x, y, z: 0 });
    const normalizedX = normalized.x;
    const normalizedY = normalized.y;

    for (const [zoneName, bounds] of Object.entries(COURT_ZONES)) {
      const xBounds = bounds.x;
      const yBounds = bounds.y;
      if (
        xBounds &&
        yBounds &&
        xBounds[0] !== undefined &&
        xBounds[1] !== undefined &&
        yBounds[0] !== undefined &&
        yBounds[1] !== undefined &&
        normalizedX >= xBounds[0] &&
        normalizedX <= xBounds[1] &&
        normalizedY >= yBounds[0] &&
        normalizedY <= yBounds[1]
      ) {
        return zoneName;
      }
    }

    return 'out-of-bounds';
  }

  /**
   * Calculate distance between two 3D points
   */
  function calculateDistance(p1: Point3D, p2: Point3D): number {
    const dx = (p2.x ?? 0) - (p1.x ?? 0);
    const dy = (p2.y ?? 0) - (p1.y ?? 0);
    const dz = (p2.z ?? 0) - (p1.z ?? 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Add a position sample
   */
  function addPositionSample(
    worldPos: Point3D,
    imagePos: Point2D,
    confidence: number,
    frameNumber: number
  ) {
    if (!isTracking.value) return;

    // Check confidence threshold
    if (
      !Number.isFinite(confidence) ||
      confidence < settings.value.minConfidence
    )
      return;

    const now = Date.now();
    const minInterval = Math.max(0, settings.value.sampleInterval);

    const width = courtDimensions.value.width || DEFAULT_COURT_WIDTH;
    const length = courtDimensions.value.length || DEFAULT_COURT_LENGTH;
    const normalizedFallback = {
      x: imagePos.x * width - width / 2,
      y: imagePos.y * length - length / 2,
      z: 0,
    };

    let centeredWorld = {
      x: worldPos.x ?? normalizedFallback.x,
      y: worldPos.y ?? normalizedFallback.y,
      z: worldPos.z ?? 0,
    };

    const outOfBounds =
      !Number.isFinite(centeredWorld.x) ||
      !Number.isFinite(centeredWorld.y) ||
      Math.abs(centeredWorld.x) > width * 2 ||
      Math.abs(centeredWorld.y) > length * 2;

    if (outOfBounds) {
      console.info(
        'ℹ️ [PositionHeatmap] Falling back to normalized coordinates',
        {
          worldPos,
          centeredWorld,
          normalizedFallback,
          width,
          length,
        }
      );
      centeredWorld = normalizedFallback;
    }

    const bounded = toCourtSpace(centeredWorld);
    centeredWorld = {
      x: bounded.x - width / 2,
      y: bounded.y - length / 2,
      z: centeredWorld.z,
    };

    if (
      !Number.isFinite(centeredWorld.x) ||
      !Number.isFinite(centeredWorld.y) ||
      !Number.isFinite(centeredWorld.z)
    ) {
      console.warn(
        '⚠️ [PositionHeatmap] Skipping sample with invalid position',
        {
          worldPos,
          bounded,
          centeredWorld,
          width,
          length,
          confidence,
          reason: 'non-finite centeredWorld',
        }
      );
      return;
    }

    // Always expose the most recent position so the minimap stays responsive
    currentPosition.value = centeredWorld;

    const elapsedSinceLastSample = lastSampleTime.value
      ? now - lastSampleTime.value
      : 0;

    const previousPosition = lastPosition.value;
    const deltaSeconds =
      elapsedSinceLastSample > 0
        ? elapsedSinceLastSample / 1000
        : minInterval / 1000;

    let distance = 0;
    let speed = 0;

    // Always calculate distance and speed for real-time updates
    if (previousPosition) {
      distance = calculateDistance(previousPosition, centeredWorld);
      if (Number.isFinite(distance)) {
        totalDistance.value += distance;

        if (deltaSeconds > 0) {
          speed = distance / deltaSeconds;
          if (Number.isFinite(speed)) {
            // Update average speed with exponential moving average
            averageSpeed.value = averageSpeed.value * 0.9 + speed * 0.1;
          }
        }
      }
    }

    // Always update last position for continuous tracking
    lastPosition.value = centeredWorld;

    // Check if we should add to history based on sample interval
    if (
      minInterval > 0 &&
      lastSampleTime.value !== 0 &&
      elapsedSinceLastSample < minInterval
    ) {
      return;
    }

    if (!Number.isFinite(distance) || !Number.isFinite(speed)) {
      console.warn('⚠️ [PositionHeatmap] Non-finite metrics', {
        distance,
        speed,
        deltaSeconds,
        lastPosition: previousPosition,
        currentPosition: centeredWorld,
      });
    }

    const zoneTimeContribution = deltaSeconds > 0 ? deltaSeconds : 0;
    const zone = getZoneName(centeredWorld.x, centeredWorld.y);
    const accumulated = timeInZones.value.get(zone) ?? 0;
    timeInZones.value.set(zone, accumulated + zoneTimeContribution);

    let maxTime = 0;
    let maxZone: string | null = null;
    timeInZones.value.forEach((time, zoneName) => {
      if (time > maxTime) {
        maxTime = time;
        maxZone = zoneName;
      }
    });
    mostVisitedZone.value = maxZone;

    const sample: PositionSample = {
      worldPosition: centeredWorld,
      imagePosition: imagePos,
      timestamp: now,
      frameNumber,
      confidence,
    };

    positionHistory.value.push(sample);

    const maxHistory = Math.max(1, Math.floor(settings.value.maxHistorySize));
    const overflow = positionHistory.value.length - maxHistory;
    if (overflow > 0) {
      positionHistory.value.splice(0, overflow);
    }

    if (positionHistory.value.length % 30 === 0) {
      console.debug('🗺️ [PositionHeatmap] Sample added', {
        samples: positionHistory.value.length,
        position: centeredWorld,
        distance,
        deltaSeconds,
        speed,
        averageSpeed: averageSpeed.value,
        totalDistance: totalDistance.value,
        zone,
      });
    }

    // Log every position update for debugging (can be removed later)
    if (frameNumber % 60 === 0) {
      console.debug('🗺️ [PositionHeatmap] Position update', {
        frame: frameNumber,
        position: centeredWorld,
        distance,
        speed,
        totalDistance: totalDistance.value,
        averageSpeed: averageSpeed.value,
        isTracking: isTracking.value,
        confidence,
      });
    }

    // Only update lastSampleTime when we actually add to history
    lastSampleTime.value = now;
  }

  /**
   * Apply Gaussian smoothing to heatmap
   */
  function applyGaussianSmoothing(
    grid: Float32Array[],
    radius: number
  ): Float32Array[] {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;

    if (height === 0 || width === 0) {
      return grid.map((row) => new Float32Array(row));
    }

    if (!Number.isFinite(radius) || radius <= 0) {
      return grid.map((row) => new Float32Array(row));
    }

    const { radius: kernelRadius, kernel } = getGaussianKernel(radius);
    const temp = new Array<Float32Array>(height);

    for (let y = 0; y < height; y++) {
      const row = grid[y]!;
      const convolvedRow = new Float32Array(width);

      for (let x = 0; x < width; x++) {
        let sum = 0;

        for (let offset = -kernelRadius; offset <= kernelRadius; offset++) {
          const columnIndex = x + offset;
          if (columnIndex >= 0 && columnIndex < width) {
            const sample = row[columnIndex] ?? 0;
            const kernelWeight = kernel[offset + kernelRadius] ?? 0;
            sum += sample * kernelWeight;
          }
        }

        convolvedRow[x] = sum;
      }

      temp[y] = convolvedRow;
    }

    const output = new Array<Float32Array>(height);

    for (let y = 0; y < height; y++) {
      const smoothedRow = new Float32Array(width);

      for (let x = 0; x < width; x++) {
        let sum = 0;

        for (let offset = -kernelRadius; offset <= kernelRadius; offset++) {
          const rowIndex = y + offset;
          if (rowIndex >= 0 && rowIndex < height) {
            const tempRow = temp[rowIndex];
            if (!tempRow) continue;
            const sample = tempRow[x] ?? 0;
            const kernelWeight = kernel[offset + kernelRadius] ?? 0;
            sum += sample * kernelWeight;
          }
        }

        smoothedRow[x] = sum;
      }

      output[y] = smoothedRow;
    }

    return output;
  }

  /**
   * Generate heatmap from position history
   */
  function generateHeatmap(): HeatmapData {
    const width = courtDimensions.value.width || DEFAULT_COURT_WIDTH;
    const length = courtDimensions.value.length || DEFAULT_COURT_LENGTH;
    const gridWidth = Math.max(
      1,
      Math.ceil(width * settings.value.gridResolution)
    );
    const gridHeight = Math.max(
      1,
      Math.ceil(length * settings.value.gridResolution)
    );

    // Initialize grid
    const grid: Float32Array[] = Array.from(
      { length: gridHeight },
      () => new Float32Array(gridWidth)
    );

    // Accumulate positions
    const now = Date.now();
    for (const sample of positionHistory.value) {
      // Apply time decay if enabled
      let weight = 1.0;
      if (settings.value.decayFactor < 1.0) {
        const age = (now - sample.timestamp) / 1000; // Age in seconds
        weight = Math.pow(settings.value.decayFactor, age / 60); // Decay per minute
      }

      // Convert world position to grid coordinates
      const courtSpace = toCourtSpace(sample.worldPosition);
      const gridX = Math.floor(courtSpace.x * settings.value.gridResolution);
      const gridY = Math.floor(courtSpace.y * settings.value.gridResolution);

      // Check bounds
      if (
        Number.isFinite(weight) &&
        gridX >= 0 &&
        gridX < gridWidth &&
        gridY >= 0 &&
        gridY < gridHeight
      ) {
        const row = grid[gridY];
        if (row) {
          const current = row[gridX] ?? 0;
          row[gridX] = current + weight;
        }
      }
    }

    // Apply smoothing if enabled
    const smoothedGrid =
      settings.value.smoothingRadius > 0
        ? applyGaussianSmoothing(grid, settings.value.smoothingRadius)
        : grid;

    // Find max count and create cell objects
    let maxCount = 0;
    const cells: HeatmapCell[][] = new Array(gridHeight);

    for (let y = 0; y < gridHeight; y++) {
      const row: HeatmapCell[] = new Array(gridWidth);
      const smoothedRow = smoothedGrid[y];

      if (!smoothedRow) {
        cells[y] = row;
        continue;
      }

      for (let x = 0; x < gridWidth; x++) {
        const value = smoothedRow[x] ?? 0;
        const count = Number.isFinite(value) ? value : 0;
        if (count > maxCount) {
          maxCount = count;
        }

        row[x] = {
          x,
          y,
          count,
          intensity: 0, // Will be normalized after
        };
      }

      cells[y] = row;
    }

    // Normalize intensities
    if (maxCount > 0) {
      const inverseMax = 1 / maxCount;
      for (const row of cells) {
        if (!row) continue;
        for (const cell of row) {
          if (!cell) continue;
          cell.intensity = cell.count * inverseMax;
        }
      }
    }

    const data: HeatmapData = {
      cells,
      maxCount,
      totalSamples: positionHistory.value.length,
      gridWidth,
      gridHeight,
      courtDimensions: { width, length },
    };

    heatmapData.value = data;
    return data;
  }

  /**
   * Start tracking positions
   */
  function startTracking() {
    isTracking.value = true;
    initializeZones();
    lastPosition.value = null;
    lastSampleTime.value = 0;
    console.log('Position tracking started');
  }

  /**
   * Stop tracking positions
   */
  function stopTracking() {
    isTracking.value = false;
    console.log('Position tracking stopped');
  }

  /**
   * Clear position history
   */
  function clearHistory() {
    positionHistory.value = [];
    currentPosition.value = null;
    lastPosition.value = null;
    lastSampleTime.value = 0;
    totalDistance.value = 0;
    averageSpeed.value = 0;
    initializeZones();
    heatmapData.value = null;
    console.log('Position history cleared');
  }

  /**
   * Update settings
   */
  function updateSettings(newSettings: Partial<HeatmapSettings>) {
    settings.value = normalizeSettings({
      ...settings.value,
      ...newSettings,
    });
  }

  /**
   * Export tracking data to JSON
   */
  function exportData(): string {
    return JSON.stringify({
      settings: settings.value,
      positionHistory: positionHistory.value,
      statistics: {
        totalDistance: totalDistance.value,
        averageSpeed: averageSpeed.value,
        timeInZones: Array.from(timeInZones.value.entries()),
        mostVisitedZone: mostVisitedZone.value,
      },
      heatmapData: heatmapData.value,
    });
  }

  /**
   * Import tracking data from JSON
   */
  function importData(dataString: string): boolean {
    try {
      const data = JSON.parse(dataString);

      if (data.settings) {
        settings.value = normalizeSettings({
          ...settings.value,
          ...data.settings,
        });
      }

      if (data.positionHistory) {
        positionHistory.value = data.positionHistory;
      }

      if (data.statistics) {
        totalDistance.value = data.statistics.totalDistance || 0;
        averageSpeed.value = data.statistics.averageSpeed || 0;

        if (data.statistics.timeInZones) {
          timeInZones.value = new Map(data.statistics.timeInZones);
        }

        mostVisitedZone.value = data.statistics.mostVisitedZone || null;
      }

      if (data.heatmapData) {
        heatmapData.value = data.heatmapData;
      }

      return true;
    } catch (error) {
      console.error('Failed to import position tracking data:', error);
      return false;
    }
  }

  // Auto-generate heatmap when history changes significantly
  watch(
    () => positionHistory.value.length,
    (newLength, oldLength) => {
      // Generate heatmap every 50 samples
      if (newLength > 0 && newLength % 50 === 0 && newLength !== oldLength) {
        generateHeatmap();
      }
    }
  );

  return {
    // State
    isTracking,
    heatmapData,
    positionHistory,
    currentPosition,
    settings,

    // Statistics
    totalDistance,
    averageSpeed,
    timeInZones,
    mostVisitedZone,

    // Methods
    startTracking,
    stopTracking,
    clearHistory,
    addPositionSample,
    generateHeatmap,
    updateSettings,
    exportData,
    importData,
    getZoneName,
  };
}
