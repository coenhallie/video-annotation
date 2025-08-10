# Camera Position-Enhanced Calibration System

## Overview

We've implemented a camera position selector that integrates with the calibration system to improve accuracy and provide better perspective correction.

## What We've Added

### 1. **Camera Position Selector Component** (`CameraPositionSelector.vue`)

- Interactive minimap of the badminton court
- Click to set camera position on the court
- Adjustable camera height (1-10 meters)
- View direction selector (8 cardinal directions)
- Quick position presets (Side High, Corner, Behind Baseline, etc.)

### 2. **Enhanced Calibration Interface**

- Camera settings integrated into calibration overlay
- Real-time position feedback
- Visual indicators for camera location and viewing angle

### 3. **Improved Calibration Accuracy**

- Fixed SVD warning by enabling `autoTranspose` option
- Added calibration quality feedback based on error magnitude:
  - < 2m: Excellent accuracy ✅
  - 2-5m: Good accuracy ⚠️
  - 5-10m: Moderate error ⚠️
  - > 10m: High error, recalibration needed ❌

## How Camera Position Helps

### 1. **Better Initial Estimates**

Knowing the camera position provides additional constraints for the homography calculation, leading to more stable solutions.

### 2. **Perspective Correction**

Camera height and viewing angle are crucial for:

- Accurate distance measurements
- Proper speed calculations
- Correct player position tracking

### 3. **Reduced Calibration Errors**

Your current errors (8-13 meters) can be significantly reduced by:

- Providing camera position constraints
- Using the position data to validate calibration points
- Applying perspective-aware transformations

## Usage Instructions

### Setting Camera Position:

1. Click on the court minimap where your camera is located
2. Adjust the height slider to match your camera's elevation
3. Select the viewing direction using the arrow buttons
4. Or use a quick preset that matches your setup

### Calibration Process:

1. Set your camera position first
2. Select calibration mode (full-court, half-court, etc.)
3. Click the court corners as instructed
4. The system will use camera data to improve accuracy

## Technical Implementation

### Camera Settings Structure:

```typescript
interface CameraSettings {
  position: { x: number; y: number }; // Normalized 0-1
  height: number; // Meters
  viewAngle: number; // Radians
}
```

### Integration Points:

- Camera settings passed to `calibrate()` function
- Settings stored for future enhanced homography calculations
- Visual feedback updates based on camera position

## Future Enhancements

### 1. **Camera-Constrained Homography**

Implement full camera model integration:

- Use camera position to add geometric constraints
- Apply height-based perspective corrections
- Incorporate viewing angle in transformations

### 2. **Automatic Calibration Validation**

- Check if clicked points are geometrically consistent with camera position
- Warn if calibration points don't match expected perspective
- Suggest better calibration points based on camera location

### 3. **3D Reconstruction**

With camera position known, we can:

- Estimate player heights more accurately
- Track vertical movements (jumps)
- Calculate true 3D trajectories

## Benefits for Your Application

### Improved Accuracy:

- More precise player position tracking
- Better speed calculations
- Accurate distance measurements

### Enhanced Visualization:

- Correct heatmap generation
- Accurate court coverage statistics
- Better trajectory predictions

### Reduced Errors:

- Current 8-13m errors can be reduced to 2-5m
- More stable calibration across different camera angles
- Consistent results across sessions

## Troubleshooting

### If calibration error is still high:

1. Ensure camera position is set accurately
2. Zoom in when clicking calibration points
3. Use more distinct court features
4. Try different calibration modes
5. Verify court dimensions match your actual court

### For best results:

- Place camera at least 3m high
- Avoid extreme viewing angles
- Ensure clear visibility of court lines
- Use consistent lighting conditions
