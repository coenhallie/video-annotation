# Technical Specification: Improved Speed and Center of Gravity Calculation

This document outlines the technical plan to fix the existing speed calculation, introduce a center of gravity (CoG) calculation, and implement new speed-related features.

## 1. Analysis Summary and Identified Flaws

Our investigation revealed a critical flaw in the current speed calculation methodology, which causes the computed speed to vary with video playback speed. This issue stems from an incorrect attempt to compensate for `playbackRate` in both `useSpeedCalculator.js` and `useEnhancedPoseLandmarker.js`.

The core problem is the use of `performance.now()` for timestamping, which is tied to the browser's rendering loop, not the video's intrinsic timeline. The expression `timeDelta / playbackRate` is an improper correction that introduces distortions. The correct approach is to use `video.currentTime`, which provides accurate, playback-rate-independent timestamps.

The original design document, `SPEED_CALCULATION_DESIGN.md`, confirms that the intended implementation was sound and did not include this flawed compensation, indicating a deviation during development.

## 2. Proposed Technical Enhancements

To address these issues and meet the new feature requirements, we propose the following technical enhancements:

### 2.1. Fix Speed Calculation

The speed calculation will be revised to rely exclusively on the video's presentation timestamps (`video.currentTime`), making it independent of playback speed.

- **Action**: Remove the `playbackRate` parameter and all related compensation logic from `updateSpeedCalculator` and `updateROIHistory`.
- **Data Source**: The `detectPose` function will pass the `video.currentTime` timestamp (in seconds) directly to the speed calculator.
- **Formula**: The time delta will be calculated as `currentTime - lastTime`, where both timestamps are from `video.currentTime`.

This will ensure that the calculated velocity and speed are accurate and reflect the true motion in the video, regardless of playback rate.

### 2.2. Calculate Center of Gravity Height

We will introduce a new function to calculate the height of the body's center of gravity (CoG) from the ground plane.

- **Methodology**: The CoG height will be determined by calculating the weighted average of the y-coordinates of key lower-body and torso landmarks.
- **Landmarks to Use**:
  - `left_hip`, `right_hip`
  - `left_knee`, `right_knee`
  - `left_ankle`, `right_ankle`
- **Formula**:
  `    CoG_y = (w_hip *
(y_lhip + y_rhip) / 2) + (w_knee * (y_lknee + y_rknee) / 2) + (w_ankle * (y_lankle + y_rankle) / 2)
   `
  Where `w` represents the biomechanical weight of each body segment.

This calculation will provide a stable, vertically-oriented metric for analyzing the body's overall height and movement.

### 2.3. Calculate Right Foot Speed

A new function will be added to specifically track the velocity of the right foot.

- **Methodology**: The speed of the `right_foot_index` landmark will be calculated between consecutive frames.
- **Data Source**: The `worldLandmarks` for the `right_foot_index` will be used.
- **Process**:
  1.  Store the position of the `right_foot_index` from the previous frame.
  2.  Calculate the displacement vector: `(current_pos - last_pos)`.
  3.  Divide the displacement by the `timeDelta` to get the velocity.
  4.  Compute the magnitude of the velocity vector to get the speed.

This will enable detailed analysis of foot-specific movements, such as kicking or stepping motions.

### 2.4. Calculate General Moving Speed

We will implement a "general moving speed" calculation based on the horizontal velocity of the calculated center of gravity.

- **Methodology**: This metric will represent the body's overall translational speed across the ground plane, excluding vertical movements.
- **Data Source**: The `x` and `z` components of the CoG's velocity vector.
- **Formula**:
  ```
  GeneralSpeed = sqrt(velocity_CoG.x^2 + velocity_CoG.z^2)
  ```

This will provide a more intuitive measure of "how fast" a subject is moving horizontally, which is useful for analyzing activities like running or walking.

## 3. Revised `useSpeedCalculator.js` API

The `useSpeedCalculator.js` composable will be updated to reflect these new features:

```javascript
// src/composables/useSpeedCalculator.js

export function useSpeedCalculator() {
  const speedMetrics = reactive({
    centerOfMass: { x: 0, y: 0, z: 0 },
    centerOfGravityHeight: 0,
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0, // Overall speed in m/s
    generalMovingSpeed: 0, // Horizontal speed in m/s
    rightFootSpeed: 0, // Speed of the right foot in m/s
    isValid: false,
  });

  // ... (history and other internal state)

  const calculateCoGHeight = (landmarks) => {
    // ... implementation
  };

  const calculateLandmarkSpeed = (
    landmarkName,
    currentLandmarks,
    lastLandmarks,
    timeDelta
  ) => {
    // ... implementation
  };

  const update = (landmarks, worldLandmarks, timestamp) => {
    // ... main update logic to calculate all metrics
  };

  // ... (reset and other functions)

  return {
    speedMetrics,
    update,
    reset,
  };
}
```

## 4. Implementation Plan

The implementation will proceed as follows:

1.  **Modify `useSpeedCalculator.js`**: Implement the revised API, including the new calculation functions and the fix for the time delta calculation.
2.  **Update `useEnhancedPoseLandmarker.js`**: Modify the `detectPose` function to pass the correct `video.currentTime` timestamp and call the updated `update` function in the speed calculator.
3.  **Update UI Components**: Modify `SpeedVisualization.vue` and any other relevant components to display the new metrics (`centerOfGravityHeight`, `generalMovingSpeed`, `rightFootSpeed`).

This plan ensures a robust, accurate, and feature-rich speed calculation system that meets all current and future requirements.
