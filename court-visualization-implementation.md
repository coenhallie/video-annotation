# Dynamic Court Visualization Implementation

## Overview

Successfully implemented a dynamic court visualization system that automatically adjusts to match the selected calibration type, providing users with an accurate, context-specific representation of the exact court area they need to interact with.

## Components Modified

### 1. **CourtVisualization.vue** (New Component)

- **Location**: `src/components/CourtVisualization.vue`
- **Purpose**: Reusable Vue component for dynamic court rendering
- **Features**:
  - Adaptive viewBox based on calibration mode
  - Support for multiple calibration modes (Enhanced Full, Half Court, Service Courts, Minimal)
  - Visual indicators for calibration points (required vs optional)
  - Court type support (Badminton/Tennis)
  - Camera position visualization (optional)
  - Dynamic scaling and focusing on relevant court areas

### 2. **EnhancedCalibrationOverlay.vue** (Updated)

- **Location**: `src/components/EnhancedCalibrationOverlay.vue`
- **Changes**:
  - Replaced static SVG court diagram with dynamic CourtVisualization component
  - Added court type state management
  - Added court dimensions computation
  - Added collected point IDs tracking
  - Imported and integrated CourtVisualization component

### 3. **CameraCalibrationOverlay.vue** (Updated)

- **Location**: `src/components/CameraCalibrationOverlay.vue`
- **Changes**:
  - Added CourtVisualization component integration
  - Added mapping between calibration modes
  - Added collected point IDs computation
  - Enhanced court dimensions with service line distances

### 4. **CalibrationControls.vue** (Updated)

- **Location**: `src/components/CalibrationControls.vue`
- **Changes**:
  - Added CourtVisualization component for preview
  - Added court type state management
  - Added calibration mode tracking
  - Added collected points visualization

## Key Features Implemented

### Dynamic View Adaptation

Each calibration mode shows only the relevant court area:

1. **Enhanced Full Court**

   - Shows complete court with all boundaries
   - All corners and reference points visible
   - 9+ calibration points

2. **Half Court**

   - Focuses on one half of the court
   - Faded indication of the other half
   - 7 calibration points

3. **Service Courts Focus**

   - Zoomed view of service boxes area
   - Most critical playing area highlighted
   - 7 calibration points

4. **Minimal Calibration**
   - Service court area with minimal references
   - Basic tracking capability
   - 5 calibration points

### Visual Feedback System

- **Green circles**: Collected calibration points
- **Red circles**: Required points not yet collected
- **Gray circles**: Optional points
- **Dashed borders**: Optional calibration points
- **Solid borders**: Required calibration points

### Court Type Support

- **Badminton**: 13.4m × 5.18m (singles)
  - Service line: 1.98m from net
  - Net height: 1.55m
- **Tennis**: 23.77m × 8.23m (singles)
  - Service line: 6.4m from net
  - Net height: 0.914m

## Benefits Achieved

1. **Eliminates Ambiguity**

   - Users know exactly which court boundaries are relevant
   - Clear indication of required vs optional points

2. **Ensures Precise Click Placement**

   - Visual guides show exact calibration point locations
   - Real-time feedback on collected points

3. **Context-Specific Representation**

   - Each calibration mode shows only what's needed
   - Reduces visual clutter and confusion

4. **Automatic Adaptation**

   - Seamlessly switches between calibration modes
   - Adjusts view to focus on relevant areas

5. **Progress Tracking**
   - Clear visual indication of calibration progress
   - Shows which points have been collected

## Testing

Created `test-court-visualization.html` demonstrating all calibration modes with interactive visualizations.

## Integration Points

The CourtVisualization component is now integrated in three key locations:

1. **EnhancedCalibrationOverlay**: Main calibration interface with dynamic court guide
2. **CameraCalibrationOverlay**: Alternative calibration interface with court visualization
3. **CalibrationControls**: Speed calibration panel with court preview

## Usage Example

```vue
<CourtVisualization
  :calibration-mode="currentMode?.id || 'enhanced-full'"
  :court-type="courtType"
  :court-dimensions="courtDimensions"
  :show-calibration-points="true"
  :collected-points="collectedPointIds"
  :show-camera-position="false"
  :width="280"
  :height="180"
/>
```

## Props

- `calibration-mode`: Current calibration mode (enhanced-full, half-court, service-courts, minimal)
- `court-type`: Type of court (badminton, tennis)
- `court-dimensions`: Object with court measurements
- `show-calibration-points`: Whether to display calibration point indicators
- `collected-points`: Array of collected point IDs
- `show-camera-position`: Whether to show camera position indicator
- `camera-settings`: Camera position and angle settings
- `width`: Component width
- `height`: Component height

## Future Enhancements

1. Add animation for point collection
2. Support for custom court dimensions
3. 3D perspective view option
4. Export/import calibration profiles
5. Multi-camera support visualization
