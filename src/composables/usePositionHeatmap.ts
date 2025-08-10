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
  minConfidence: 0.7, // Minimum 70% confidence
  sampleInterval: 100, // Sample every 100ms (10 Hz)
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

export function usePositionHeatmap(
  courtDimensions: Ref<CourtDimensions>
): UsePositionHeatmap {
  // State
  const isTracking = ref(false);
  const heatmapData = ref<HeatmapData | null>(null);
  const positionHistory = ref<PositionSample[]>([]);
  const currentPosition = ref<Point3D | null>(null);
  const settings = ref<HeatmapSettings>({ ...DEFAULT_SETTINGS });

  // Statistics
  const totalDistance = ref(0);
  const averageSpeed = ref(0);
  const timeInZones = ref(new Map<string, number>());
  const mostVisitedZone = ref<string | null>(null);

  // Private state
  const lastSampleTime = ref(0);
  const lastPosition = ref<Point3D | null>(null);

  /**
   * Initialize zone tracking
   */
  function initializeZones() {
    timeInZones.value.clear();
    Object.keys(COURT_ZONES).forEach((zone) => {
      timeInZones.value.set(zone, 0);
    });
  }

  /**
   * Get zone name for a position
   */
  function getZoneName(x: number, y: number): string {
    const normalizedX = x / courtDimensions.value.width;
    const normalizedY = y / courtDimensions.value.length;

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
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
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
    if (confidence < settings.value.minConfidence) return;

    const now = Date.now();

    // Check sample interval
    if (now - lastSampleTime.value < settings.value.sampleInterval) return;

    // Create sample
    const sample: PositionSample = {
      worldPosition: worldPos,
      imagePosition: imagePos,
      timestamp: now,
      frameNumber,
      confidence,
    };

    // Add to history
    positionHistory.value.push(sample);

    // Trim history if needed
    if (positionHistory.value.length > settings.value.maxHistorySize) {
      positionHistory.value.shift();
    }

    // Update current position
    currentPosition.value = worldPos;

    // Update statistics
    if (lastPosition.value) {
      const distance = calculateDistance(lastPosition.value, worldPos);
      totalDistance.value += distance;

      const timeDelta = (now - lastSampleTime.value) / 1000; // Convert to seconds
      if (timeDelta > 0) {
        const speed = distance / timeDelta;
        // Update average speed with exponential moving average
        averageSpeed.value = averageSpeed.value * 0.9 + speed * 0.1;
      }
    }

    // Update zone tracking
    const zone = getZoneName(worldPos.x, worldPos.y);
    const currentTime = timeInZones.value.get(zone) || 0;
    timeInZones.value.set(zone, currentTime + 1);

    // Update most visited zone
    let maxTime = 0;
    let maxZone = null;
    timeInZones.value.forEach((time, zone) => {
      if (time > maxTime) {
        maxTime = time;
        maxZone = zone;
      }
    });
    mostVisitedZone.value = maxZone;

    // Update tracking state
    lastPosition.value = worldPos;
    lastSampleTime.value = now;
  }

  /**
   * Apply Gaussian smoothing to heatmap
   */
  function applyGaussianSmoothing(
    grid: number[][],
    radius: number
  ): number[][] {
    const height = grid.length;
    const width = grid[0]?.length || 0;
    const smoothed: number[][] = Array(height)
      .fill(0)
      .map(() => Array(width).fill(0));

    // Create Gaussian kernel
    const kernelSize = radius * 2 + 1;
    const kernel: number[][] = [];
    let kernelSum = 0;

    for (let i = 0; i < kernelSize; i++) {
      kernel[i] = [];
      for (let j = 0; j < kernelSize; j++) {
        const x = i - radius;
        const y = j - radius;
        const value = Math.exp(-(x * x + y * y) / (2 * radius * radius));
        kernel[i]![j] = value;
        kernelSum += value;
      }
    }

    // Normalize kernel
    for (let i = 0; i < kernelSize; i++) {
      for (let j = 0; j < kernelSize; j++) {
        kernel[i]![j]! /= kernelSum;
      }
    }

    // Apply convolution
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;

        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const gridY = y + ky - radius;
            const gridX = x + kx - radius;

            if (gridY >= 0 && gridY < height && gridX >= 0 && gridX < width) {
              const gridValue = grid[gridY]?.[gridX] ?? 0;
              const kernelValue = kernel[ky]?.[kx] ?? 0;
              sum += gridValue * kernelValue;
            }
          }
        }

        smoothed[y]![x] = sum;
      }
    }

    return smoothed;
  }

  /**
   * Generate heatmap from position history
   */
  function generateHeatmap(): HeatmapData {
    const gridWidth = Math.ceil(
      courtDimensions.value.width * settings.value.gridResolution
    );
    const gridHeight = Math.ceil(
      courtDimensions.value.length * settings.value.gridResolution
    );

    // Initialize grid
    const grid: number[][] = Array(gridHeight)
      .fill(0)
      .map(() => Array(gridWidth).fill(0));

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
      const gridX = Math.floor(
        sample.worldPosition.x * settings.value.gridResolution
      );
      const gridY = Math.floor(
        sample.worldPosition.y * settings.value.gridResolution
      );

      // Check bounds
      if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
        if (grid[gridY]) {
          grid[gridY]![gridX] = (grid[gridY]![gridX] ?? 0) + weight;
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
    const cells: HeatmapCell[][] = [];

    for (let y = 0; y < gridHeight; y++) {
      cells[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        const count = smoothedGrid[y]?.[x] ?? 0;
        maxCount = Math.max(maxCount, count);

        cells[y]![x] = {
          x,
          y,
          count,
          intensity: 0, // Will be normalized after
        };
      }
    }

    // Normalize intensities
    if (maxCount > 0) {
      for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
          if (cells[y]?.[x]) {
            cells[y]![x]!.intensity = cells[y]![x]!.count / maxCount;
          }
        }
      }
    }

    const data: HeatmapData = {
      cells,
      maxCount,
      totalSamples: positionHistory.value.length,
      gridWidth,
      gridHeight,
      courtDimensions: { ...courtDimensions.value },
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
    settings.value = { ...settings.value, ...newSettings };
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
        settings.value = data.settings;
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
