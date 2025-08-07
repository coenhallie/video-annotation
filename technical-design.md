# Technical Design: Camera Angle Compensation

## 1. Introduction

This document outlines a technical solution to address the accuracy issues in the badminton player speed measurement application caused by varying camera positions. The current system's primary limitation is its lack of perspective correction, leading to significant measurement errors.

This design introduces a robust camera calibration and coordinate transformation pipeline that leverages classic computer vision techniques to solve for camera parameters and transform MediaPipe's landmark coordinates into a stable, real-world court reference system.

## 2. Camera Calibration Strategy

The goal of camera calibration is to determine the camera's intrinsic and extrinsic parameters. These parameters are essential for correcting perspective distortion and establishing a relationship between the 2D image plane and the 3D world.

### 2.1. Approach: Homography-Based Calibration

We will use a homography-based calibration method, which is well-suited for this application because it does not require a traditional calibration object (like a checkerboard). Instead, we will use the known geometry of the badminton court.

A **homography** is a 3x3 transformation matrix (**H**) that maps points from one plane to another. In our case, it will map points from the 2D image plane to the 2D plane of the badminton court.

### 2.2. Calibration Process

The calibration will be performed once per video, or whenever the camera position changes. The user will be required to identify four points on the badminton court in the video.

1.  **Point Selection**: The user will select four non-collinear points on the court in the video feed. The ideal points are the four corners of the singles court, as their real-world coordinates are known.
2.  **Coordinate Mapping**: We will establish a mapping between the user-selected 2D pixel coordinates (e.g., `(x1, y1)`) and their known 3D real-world coordinates on the court plane (e.g., `(X1, Y1, 0)`).
3.  **Homography Calculation**: Using these four pairs of corresponding points, we will solve for the homography matrix **H** using a Direct Linear Transformation (DLT) algorithm. Most computer vision libraries (like OpenCV) provide a `findHomography` function that can do this.
4.  **Parameter Decomposition**: Once we have the homography matrix **H**, we can decompose it to find the camera's rotation (**R**) and translation (**t**) vectors, which, along with the camera's intrinsic matrix K, define the camera's pose relative to the court.

### 2.3. Mathematical Formulation

The relationship between a 3D world point **P** = `[X, Y, Z, 1]` and its corresponding 2D image point **p** = `[x, y, 1]` is given by:

`s * p = K * [R|t] * P`

Where:

- `s` is a scale factor.
- **K** is the camera's intrinsic matrix (focal length, principal point).
- **R** is the rotation matrix (camera orientation).
- **t** is the translation vector (camera position).
- `[R|t]` is the extrinsic parameter matrix.

Since our world points lie on the Z=0 plane of the court, the equation simplifies, and we can derive the homography **H**.

## 3. Court Reference System

To ensure consistent measurements across different camera setups, we must define a single, unambiguous court reference system.

- **Origin**: The origin `(0, 0, 0)` will be the intersection of the center line and the net.
- **Axes**:
  - **X-axis**: Runs parallel to the net.
  - **Y-axis**: Runs parallel to the sidelines (from the net to the back of the court).
  - **Z-axis**: Points vertically upwards from the court surface.
- **Dimensions**: We will use standard badminton court dimensions (length: 13.4m, width: 6.1m).

This fixed reference system is crucial for interpreting the transformed coordinates correctly.

## 4. Coordinate Transformation Pipeline

This pipeline will convert the raw MediaPipe landmark coordinates into our defined court reference system for every frame.

### 4.1. Step 1: Undistort Landmarks (Optional but Recommended)

If significant lens distortion is present, we should first undistort the 2D landmark coordinates using the camera's distortion coefficients, which can be found during a more advanced calibration process. For this initial design, we'll assume distortion is minimal.

### 4.2. Step 2: From 2D Screen to 3D World (Initial Ray)

MediaPipe provides landmarks in normalized 2D screen coordinates (`x, y`) and a-relative depth `z`. The `worldLandmarks` are already in a camera-centric 3D space, but they aren't aligned with our court's world space.

We will use the inverse of the camera's intrinsic matrix **K⁻¹** to project the 2D landmark-`(x, y)` into a 3D ray originating from the camera's center.

### 4.3. Step 3: Homography Transformation for Foot Position

For the player's feet (which are on or very near the court surface), we can use the calculated homography matrix **H** to directly transform their 2D pixel coordinates to 3D world coordinates on the court plane (Z=0).

`P_foot_world = H * p_foot_image`

This will give us a very accurate position for the player's feet on the court.

### 4.4. Step 4: Full Body 3D Pose Reconstruction

For the other body landmarks, we will use the following approach:

1.  **Estimate Player Height in Pixels**: Use the 2D landmarks to estimate the player's height in pixels for the current frame.
2.  **Calculate Scaling Factor**: Compare the player's height in pixels to their known real-world height (provided during calibration). This gives us a dynamic scaling factor for this specific frame and player position. `scale = real_height_meters / pixel_height`
3.  **Transform all Landmarks**: Apply this scaling factor to all the camera-centric `worldLandmarks` provided by MediaPipe. This will give us an initial estimate of the player's 3D pose in meters.
4.  **Align with World Reference**: Use the camera's extrinsic parameters (rotation **R** and translation **t**) to transform the scaled 3D landmarks from the camera's coordinate system to our court's world coordinate system.
5.  **Anchor to the Ground**: Use the accurately determined foot position (from Step 4.3) to provide a ground-truth anchor for the rest of the body, adjusting the full-body pose to be correctly positioned on the court.

This hybrid approach leverages the strengths of both homography (for ground-plane accuracy) and the 3D information from MediaPipe.

## 5. Implementation Architecture

The proposed solution will be integrated into the existing Vue.js architecture, primarily affecting the following components:

### 5.1. New Composable: `useCameraCalibration.ts`

This new composable will encapsulate all calibration logic:

- **State**: `homographyMatrix`, `cameraIntrinsics`, `cameraExtrinsics`, `isCalibrated`.
- **Methods**:
  - `calibrate(points: PointMapping)`: Takes 2D and 3D point pairs and computes the homography and camera parameters.
  - `transformToWorld(point: Point2D)`: Transforms a single 2D point to a 3D world coordinate.
  - `saveCalibration()`, `loadCalibration()`: For persisting calibration data.

### 5.2. Modifications to `useSpeedCalculator.ts`

- This composable will now consume `useCameraCalibration`.
- The `normalizedToRealWorld` function will be replaced with calls to the new transformation pipeline.
- It will no longer manage its own `pixelsPerMeter` but will rely on the transformation results from the calibration composable.

### 5.3. Modifications to `CalibrationControls.vue`

- This component will be updated to support the new interactive calibration process. See the UI/UX flow below.

### 5.4. Third-Party Libraries

We will need a robust JavaScript library for the matrix operations. `opencv.js` or a more lightweight library like `math.js` could be suitable. `opencv.js` is preferred as it has a built-in `findHomography` function.

## 6. Calibration UI/UX Flow

A user-friendly calibration process is critical for the success of this solution.

1.  **Initiate Calibration**: A "Calibrate Camera" button will be added. Clicking it will pause the video and enter "Calibration Mode".
2.  **Instructional Overlay**: An overlay will appear, instructing the user to click on the four corners of the singles court in a specific order (e.g., top-left, top-right, bottom-right, bottom-left).
3.  **Point-and-Click Interface**:
    - As the user clicks, markers will be placed on the video frame.
    - The UI will show which corner is currently being selected.
    - Users can drag and adjust points after placing them.
4.  **Visual Feedback**:
    - Once four points are selected, the system will draw the detected court outline on the video frame, providing immediate visual feedback on the accuracy of the calibration.
    - A "re-calibration" button will be available if the outline is incorrect.
5.  **Confirmation**: A "Save Calibration" button will finalize the process, calculate and store the homography matrix, and exit calibration mode.

This process is more intuitive than manually inputting numbers and leverages visual confirmation to ensure accuracy.

## 7. Validation Method

To validate the improved accuracy, we need a reliable ground truth to compare against.

### 7.1. Data Collection

1.  **Multiple Camera Angles**: Record a player performing various movements (sprints, lunges, jumps) from several different camera positions (e.g., side-view, corner-view, high-angle).
2.  **Control Object**: Place an object of a known size (e.g., a 1-meter stick) on the court to validate the scaling at different locations.
3.  **Defined Movements**: Have the player perform movements between two clearly marked points on the court (e.g., sprint from the net to the backline).

### 7.2. Accuracy Metrics

1.  **Static Measurement Consistency**:
    - Measure the apparent length of the control object at various positions on the court. In a calibrated system, the measured length should remain consistent regardless of its position.
    - Measure the distance between two static points on the court.
2.  **Dynamic Measurement Consistency**:
    - Calculate the total distance traveled for the defined movements. This distance should be the same regardless of the camera angle it was recorded from.
    - Compare the peak and average speeds calculated from different camera angles for the same movement. The variance between them should be significantly lower with the new system.
3.  **Error Calculation**:
    - **Before**: Calculate the percentage error for distance and speed measurements across different camera angles using the current system.
    - **After**: Calculate the same percentage error using the new calibrated system.
    - The reduction in this error will quantify the improvement.

This structured validation process will provide quantitative evidence of the solution's effectiveness.
