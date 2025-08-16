<template>
  <div
    v-if="show"
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto p-6"
      @click.stop
    >
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-900">
          Comprehensive Speed Calculation Formulas & Methodology
        </h2>
        <button
          class="text-gray-400 hover:text-gray-600"
          @click="$emit('close')"
        >
          <svg
            class="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="space-y-6">
        <!-- 1. Pose Detection & Landmark Extraction -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            1. Pose Detection & Landmark Extraction (MediaPipe)
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>33 3D Landmarks Detection:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              L = {l₀, l₁, ..., l₃₂} where lᵢ = (xᵢ, yᵢ, zᵢ, vᵢ)
              <br />
              xᵢ, yᵢ ∈ [0, 1] (normalized image coordinates)
              <br />
              zᵢ ∈ ℝ (depth relative to hips)
              <br />
              vᵢ ∈ [0, 1] (visibility confidence)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Key Landmarks for Speed Calculation:</strong>
            </p>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="font-mono bg-white p-2 rounded border">
                Shoulders: l₁₁, l₁₂
                <br />
                Hips: l₂₃, l₂₄
                <br />
                Knees: l₂₅, l₂₆
              </div>
              <div class="font-mono bg-white p-2 rounded border">
                Ankles: l₂₇, l₂₈
                <br />
                Feet: l₃₁, l₃₂
                <br />
                Nose: l₀
              </div>
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Processing Pipeline:</strong></p>
            <ul class="list-decimal list-inside mt-2 space-y-1">
              <li>Frame extraction at fps (typically 30-60 fps)</li>
              <li>BlazePose neural network inference</li>
              <li>3D landmark estimation with depth prediction</li>
              <li>Visibility filtering (threshold: v > 0.5)</li>
            </ul>
          </div>
        </div>

        <!-- 2. Center of Mass Calculation -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            2. Biomechanical Center of Mass (CoM) Calculation
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Segmental Method Formula:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              CoM = Σᵢ(mᵢ × rᵢ) / Σᵢ(mᵢ)
              <br />
              <br />
              where:
              <br />
              mᵢ = segment mass (% of body mass)
              <br />
              rᵢ = segment position vector
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Implementation with Weighted Segments:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              CoM_x = Σ(wₛ × (Σlₛ_x / nₛ)) / Σwₛ
              <br />
              CoM_y = Σ(wₛ × (Σlₛ_y / nₛ)) / Σwₛ
              <br />
              CoM_z = Σ(wₛ × (Σlₛ_z / nₛ)) / Σwₛ
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Body Segment Parameters (Dempster's Data):</strong></p>
            <div class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p class="font-semibold mb-1">Segment Masses (% body mass):</p>
                <ul class="list-disc list-inside space-y-1 text-xs">
                  <li>Head & Neck: 8.26%</li>
                  <li>Trunk: 48.33%</li>
                  <li>Upper Arms (each): 2.71%</li>
                  <li>Forearms (each): 1.62%</li>
                  <li>Hands (each): 0.61%</li>
                  <li>Thighs (each): 10.50%</li>
                  <li>Shanks (each): 4.75%</li>
                  <li>Feet (each): 1.43%</li>
                </ul>
              </div>
              <div>
                <p class="font-semibold mb-1">
                  Segment CoM Location (% from proximal):
                </p>
                <ul class="list-disc list-inside space-y-1 text-xs">
                  <li>Head: 46.4% from vertex</li>
                  <li>Trunk: 43.0% from C7</li>
                  <li>Upper Arm: 43.6% from shoulder</li>
                  <li>Forearm: 43.0% from elbow</li>
                  <li>Hand: 50.6% from wrist</li>
                  <li>Thigh: 43.3% from hip</li>
                  <li>Shank: 43.4% from knee</li>
                  <li>Foot: 42.9% from heel</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Coordinate Transformation -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            3. Coordinate System Transformations
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Normalized → Pixel Coordinates:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              x_pixel = x_normalized × video_width
              <br />
              y_pixel = y_normalized × video_height
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Pixel → World Coordinates (via Homography):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              [x_w] [h₁₁ h₁₂ h₁₃]⁻¹ [x_p]
              <br />
              [y_w] = [h₂₁ h₂₂ h₂₃] × [y_p]
              <br />
              [w ] [h₃₁ h₃₂ h₃₃] [1 ]
              <br />
              <br />
              x_world = x_w / w, y_world = y_w / w
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Depth (Z-axis) Estimation:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              z_world = z_mediapipe × depth_scale_factor + z_offset
              <br />
              <br />
              where depth_scale_factor = f(camera_params, player_height)
            </div>
          </div>
        </div>

        <!-- 4. Velocity & Acceleration -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            4. Velocity & Acceleration Computation
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Instantaneous Velocity (Finite Difference):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              v⃗(t) = [r⃗(t) - r⃗(t-Δt)] / Δt
              <br />
              <br />
              vₓ = [x(t) - x(t-Δt)] / Δt
              <br />
              vᵧ = [y(t) - y(t-Δt)] / Δt
              <br />
              vᵤ = [z(t) - z(t-Δt)] / Δt
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Smoothed Velocity (Moving Average):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              v⃗_smooth(t) = (1/n) × Σᵢ₌₀ⁿ⁻¹ v⃗(t-i×Δt)
              <br />
              <br />
              where n = smoothing_window (typically 3-5 frames)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Acceleration:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              a⃗(t) = [v⃗(t) - v⃗(t-Δt)] / Δt
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Noise Reduction Techniques:</strong></p>
            <ul class="list-disc list-inside mt-2 space-y-1">
              <li>Kalman filtering for state estimation</li>
              <li>Savitzky-Golay filter for smoothing</li>
              <li>Outlier rejection (3σ rule)</li>
              <li>Temporal consistency checks</li>
            </ul>
          </div>
        </div>

        <!-- 5. Speed Metrics -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            5. Speed Metrics Calculation
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>3D Speed (Magnitude):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              s₃ᴅ = ||v⃗|| = √(vₓ² + vᵧ² + vᵤ²)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Horizontal Speed (Court Plane):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              s_horizontal = √(vₓ² + vᵤ²)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Vertical Speed Component:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              s_vertical = |vᵧ|
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Individual Landmark Speed (e.g., Racket/Foot):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              s_landmark = ||Δr⃗_landmark|| / Δt
              <br />
              <br />
              where Δr⃗_landmark = r⃗_landmark(t) - r⃗_landmark(t-Δt)
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Statistical Metrics:</strong></p>
            <ul class="list-disc list-inside mt-2 space-y-1">
              <li>Average Speed: s̄ = (1/T) × ∫₀ᵀ s(t) dt</li>
              <li>Peak Speed: s_max = max(s(t)) for t ∈ [0, T]</li>
              <li>Speed Variance: σ² = E[(s - s̄)²]</li>
              <li>Speed Percentiles: P₅₀, P₇₅, P₉₅</li>
            </ul>
          </div>
        </div>

        <!-- 6. Camera Calibration (Homography) -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            6. Camera Calibration & Homography Transformation
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Homography Matrix Computation (DLT Algorithm):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Given n ≥ 4 point correspondences:
              <br />
              {(xᵢ, yᵢ) ↔ (Xᵢ, Yᵢ)} for i = 1...n
              <br />
              <br />
              Solve: Ah = 0 using SVD
              <br />
              where A is 2n×9 matrix, h = vec(H)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Transformation Equations:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Forward (Image → World):
              <br />
              X = (h₁₁x + h₁₂y + h₁₃)/(h₃₁x + h₃₂y + h₃₃)
              <br />
              Y = (h₂₁x + h₂₂y + h₂₃)/(h₃₁x + h₃₂y + h₃₃)
              <br />
              <br />
              Inverse (World → Image):
              <br />
              x = (g₁₁X + g₁₂Y + g₁₃)/(g₃₁X + g₃₂Y + g₃₃)
              <br />
              y = (g₂₁X + g₂₂Y + g₂₃)/(g₃₁X + g₃₂Y + g₃₃)
              <br />
              where G = H⁻¹
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Calibration Quality Metrics:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Reprojection Error:
              <br />
              ε = (1/n) × Σᵢ ||p̂ᵢ - pᵢ||₂
              <br />
              <br />
              Homography Condition Number:
              <br />
              κ(H) = ||H|| × ||H⁻¹||
              <br />
              <br />
              Geometric Error (meters):
              <br />
              ε_geo = (1/n) × Σᵢ ||P̂ᵢ - Pᵢ||₂
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Court Dimensions (Standard):</strong></p>
            <div class="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p class="font-semibold">Badminton:</p>
                <ul class="list-disc list-inside text-xs">
                  <li>Singles: 13.4m × 5.18m</li>
                  <li>Doubles: 13.4m × 6.1m</li>
                  <li>Service line: 1.98m from net</li>
                </ul>
              </div>
              <div>
                <p class="font-semibold">Tennis:</p>
                <ul class="list-disc list-inside text-xs">
                  <li>Singles: 23.77m × 8.23m</li>
                  <li>Doubles: 23.77m × 10.97m</li>
                  <li>Service box: 6.4m × 4.115m</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- 7. Scaling & Normalization -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            7. Scaling Factors & Normalization
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Anthropometric Scaling:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              k_height = h_player / h_reference
              <br />
              <br />
              where:
              <br />
              h_player = actual player height (cm)
              <br />
              h_reference = 170 cm (default adult)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Perspective Correction Factor:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              k_perspective = f(camera_angle, focal_length, distance)
              <br />
              <br />
              k_p ≈ 1 / cos(θ) for small angles
              <br />
              where θ = camera tilt angle
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Combined Scaling:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              k_total = k_height × k_perspective × k_calibration
              <br />
              <br />
              r⃗_scaled = k_total × r⃗_raw
            </div>
          </div>
        </div>

        <!-- 8. Error Analysis -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            8. Error Analysis & Uncertainty Quantification
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Sources of Error:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              σ²_total = σ²_detection + σ²_calibration + σ²_temporal + σ²_depth
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Error Propagation (Speed):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              σ_s = s × √[(σ_r/r)² + (σ_t/t)²]
              <br />
              <br />
              where:
              <br />
              σ_r = position uncertainty
              <br />
              σ_t = temporal uncertainty
            </div>
          </div>
          <div class="text-sm text-gray-600">
            <p><strong>Typical Error Magnitudes:</strong></p>
            <ul class="list-disc list-inside mt-2 space-y-1">
              <li>Pose detection: ±2-5 pixels (2D), ±5-10% (depth)</li>
              <li>Homography calibration: ±5-20 cm (world coordinates)</li>
              <li>Temporal sampling: ±1/(2×fps) seconds</li>
              <li>Speed measurement: ±0.1-0.5 m/s (typical conditions)</li>
            </ul>
          </div>
        </div>

        <!-- 9. Performance Optimization -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            9. Performance Optimization & Real-time Processing
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Computational Complexity:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Pose Detection: O(n) where n = image pixels
              <br />
              CoM Calculation: O(k) where k = landmarks
              <br />
              Speed Calculation: O(1) per frame
              <br />
              Homography: O(m²) where m = calibration points
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Optimization Strategies:</strong>
            </p>
            <ul class="list-disc list-inside text-sm space-y-1">
              <li>GPU acceleration for pose detection (WebGL/WASM)</li>
              <li>
                Frame skipping for high-fps videos (process every nth frame)
              </li>
              <li>Caching homography matrix (compute once per session)</li>
              <li>Vectorized operations for batch processing</li>
              <li>Web Workers for parallel computation</li>
            </ul>
          </div>
        </div>

        <!-- 10. Unit Conversions -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            10. Unit Conversions & Display Formats
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Speed Unit Conversions:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              1 m/s = 3.6 km/h = 2.237 mph
              <br />
              1 km/h = 0.278 m/s = 0.621 mph
              <br />
              1 mph = 0.447 m/s = 1.609 km/h
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Distance Conversions:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              1 meter = 3.281 feet = 39.37 inches
              <br />
              1 foot = 0.305 meters = 12 inches
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Time Resolution:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Frame interval: Δt = 1/fps seconds
              <br />
              30 fps → Δt = 33.33 ms
              <br />
              60 fps → Δt = 16.67 ms
            </div>
          </div>
        </div>

        <!-- 11. Smoothing & Filtering -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            11. Smoothing & Filtering Algorithms
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Moving Average Filter:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              x̄(t) = (1/w) × Σᵢ₌₀^(w-1) x(t-i)
              <br />
              where w = window size (frames)
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Exponential Smoothing:</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              x̂(t) = α × x(t) + (1-α) × x̂(t-1)
              <br />
              where α ∈ [0,1] = smoothing factor
            </div>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Kalman Filter (State Estimation):</strong>
            </p>
            <div class="font-mono text-sm bg-white p-3 rounded border">
              Prediction: x̂ₖ|ₖ₋₁ = Fₖx̂ₖ₋₁|ₖ₋₁
              <br />
              Update: x̂ₖ|ₖ = x̂ₖ|ₖ₋₁ + Kₖ(zₖ - Hₖx̂ₖ|ₖ₋₁)
              <br />
              where Kₖ = Kalman gain
            </div>
          </div>
        </div>

        <!-- 12. Validation Metrics -->
        <div class="border-b border-gray-200 pb-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            12. Validation & Quality Metrics
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg mb-3">
            <p class="text-sm text-gray-700 mb-2">
              <strong>Pose Quality Indicators:</strong>
            </p>
            <ul class="list-disc list-inside text-sm space-y-1">
              <li>Minimum visibility threshold: 0.5</li>
              <li>Required visible landmarks: ≥ 15/33</li>
              <li>Temporal consistency: Δposition < 0.5m between frames</li>
              <li>Anatomical constraints: Joint angle limits</li>
            </ul>
            <p class="text-sm text-gray-700 mb-2 mt-3">
              <strong>Speed Validation Checks:</strong>
            </p>
            <ul class="list-disc list-inside text-sm space-y-1">
              <li>Maximum human running speed: ~12 m/s (elite athletes)</li>
              <li>Typical badminton court movement: 2-8 m/s</li>
              <li>Racket head speed: up to 130 m/s (smash)</li>
              <li>Acceleration limits: < 10 m/s² (typical court movement)</li>
            </ul>
          </div>
        </div>

        <!-- Current Values Section -->
        <div>
          <h3 class="text-lg font-semibold text-gray-800 mb-3">
            13. Current Calculation Values
          </h3>
          <slot name="current-values">
            <!-- This slot will be filled by the parent component -->
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean;
}>();

defineEmits<{
  close: [];
}>();
</script>
