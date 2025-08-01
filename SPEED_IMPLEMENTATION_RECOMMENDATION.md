# Recommendation: Speed Calculation Implementation

Based on the detailed technical investigation, this document provides the final recommendations, performance assessments, and an implementation roadmap for adding speed calculation to the video annotation system.

## 1. Recommended Approach

The most robust and scalable approach is to **create a new, dedicated composable (`useSpeedCalculator.js`)** for all speed calculations and integrate it into `useEnhancedPoseLandmarker.js`.

**Justification:**

- **Separation of Concerns:** This approach cleanly separates the complex logic of pose detection from speed analysis, making the codebase easier to maintain, test, and extend.
- **Reusability:** The `useSpeedCalculator.js` composable can be independently tested and potentially reused in other parts of the application.
- **Performance:** By processing speed calculations asynchronously within the existing detection loop, we minimize the impact on UI performance and ensure a non-blocking user experience.

## 2. Performance Impact Assessment

- **CPU Overhead:** The proposed calculations (center of mass, velocity) are primarily floating-point arithmetic. Given that MediaPipe already provides 3D world coordinates, the computational cost is minimal and should not noticeably impact the 30fps target on modern hardware.
- **Memory Consumption:** The primary memory usage will come from storing pose data for each frame. The `poseData` map in `useEnhancedPoseLandmarker.js` already handles this. The `useSpeedCalculator.js` will only store the last frame's data, adding negligible memory overhead.
- **Real-time Feasibility:** The proposed design is well-suited for real-time analysis. The calculation for each frame is fast, and the integration with the existing pose detection workflow ensures that speed metrics are available with the same latency as the pose data itself.

## 3. Implementation Roadmap

The implementation will follow the four phases outlined in the todo list.

**Phase 1: Core Engine** (No UI Impact)

- **Goal:** Build the foundational calculation logic.
- **Outcome:** A testable `useSpeedCalculator.js` composable.

**Phase 2: Integration** (Data available, no UI)

- **Goal:** Connect the calculator to the pose detection pipeline.
- **Outcome:** Speed data is calculated and stored alongside pose data.

**Phase 3: Visualization** (UI Implementation)

- **Goal:** Display the calculated speed metrics to the user.
- **Outcome:** A `SpeedVisualization.vue` component provides real-time visual feedback.

**Phase 4: Advanced Features** (Refinement & Polish)

- **Goal:** Improve accuracy and add user-facing features.
- **Outcome:** Smoothed data, configurable displays, and data export capabilities.

This phased approach allows for incremental development and testing, ensuring that each part of the system is working correctly before moving to the next.
