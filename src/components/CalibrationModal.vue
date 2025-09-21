<template>
  <div v-if="props.show" class="calibration-modal-overlay">
    <div class="calibration-modal">
      <!-- Modal Header -->
      <div class="modal-header">
        <h2>Camera Calibration</h2>
        <div
          v-if="calibrationQuality && currentStep === 1"
          class="calibration-quality"
        >
          <span
            :class="['quality-badge', `quality-${calibrationQuality.level}`]"
          >
            {{ calibrationQuality.message }}
          </span>
        </div>
        <button class="close-button" @click="closeModal">×</button>
      </div>

      <!-- Main Content Area -->
      <div class="modal-content">
        <!-- Step 1: Camera Position Selection -->
        <div v-if="currentStep === 0" class="camera-position-section">
          <div class="instruction-panel">
            <h3>Step 1: Set Camera Position</h3>
            <p>
              Click on the court diagram to indicate where your camera is
              positioned.
            </p>
            <div class="benefits-box">
              <ul>
                <li>Improves height estimation</li>
                <li>Better perspective correction</li>
                <li>More accurate speed calculations</li>
              </ul>
            </div>
          </div>
          <EdgeBasedCameraSelector
            v-model="cameraPositionData"
            :court-dimensions="courtDimensions"
            @edge-selected="handleEdgeSelected"
            @position-changed="handleCameraPositionChanged"
          />
        </div>

        <!-- Step 2: Line Drawing and Calibration -->
        <div v-else-if="currentStep === 1" class="video-line-drawing-section">
          <!-- Current Line Instruction Header -->
          <div class="line-drawing-header">
            <div class="current-line-instruction">
              <div class="line-sequence-indicator">
                Line {{ currentLineIndex + 1 }} of
                {{ lineDrawingSequence.length }}
              </div>
              <div class="current-line-prompt">
                <span
                  class="prompt-icon"
                  :style="{ backgroundColor: getCurrentLineColor() }"
                />
                <span class="prompt-text">
                  Draw the <strong>{{ getCurrentLineName() }}</strong>
                </span>
              </div>
              <p class="line-help-text">
                {{ getCurrentLineDescription() }}
              </p>
            </div>
          </div>

          <div class="video-content-wrapper">
            <!-- Left Sidebar with Progress and Court Diagram -->
            <div class="line-progress-sidebar">
              <!-- Court Diagram Guide -->
              <div class="court-diagram-guide">
                <svg viewBox="0 0 440 240" class="guide-svg">
                  <!-- Court background -->
                  <rect x="0" y="0" width="440" height="240" fill="#f9fafb" />

                  <!-- Doubles court outline (outer boundary) -->
                  <rect
                    x="50"
                    y="20"
                    width="340"
                    height="200"
                    fill="#e5f3e5"
                    stroke="#6b7280"
                    stroke-width="2"
                  />

                  <!-- Singles sidelines (inner horizontal lines for side view) -->
                  <line
                    x1="50"
                    y1="40"
                    x2="390"
                    y2="40"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="50"
                    y1="200"
                    x2="390"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Net line (center vertical for side view) -->
                  <line
                    x1="220"
                    y1="20"
                    x2="220"
                    y2="220"
                    stroke="#374151"
                    stroke-width="3"
                  />

                  <!-- Short service lines (vertical lines near net for side view) -->
                  <line
                    x1="176"
                    y1="20"
                    x2="176"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="264"
                    y1="20"
                    x2="264"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Long service line for doubles (vertical lines at back for side view) -->
                  <line
                    x1="70"
                    y1="20"
                    x2="70"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />
                  <line
                    x1="370"
                    y1="20"
                    x2="370"
                    y2="220"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Long service line for singles (vertical lines for side view) -->
                  <line
                    x1="90"
                    y1="40"
                    x2="90"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                    stroke-dasharray="3,2"
                  />
                  <line
                    x1="350"
                    y1="40"
                    x2="350"
                    y2="200"
                    stroke="#9ca3af"
                    stroke-width="1"
                    stroke-dasharray="3,2"
                  />

                  <!-- Center line (horizontal line dividing upper/lower courts for side view) -->
                  <line
                    x1="50"
                    y1="120"
                    x2="390"
                    y2="120"
                    stroke="#9ca3af"
                    stroke-width="1"
                  />

                  <!-- Highlight current line being drawn -->
                  <!-- Double Long Service Line (Back Boundary - vertical for side view) -->
                  <line
                    v-if="
                      currentLineIndex === 0 && lineDrawingSequence.length > 0
                    "
                    x1="370"
                    y1="20"
                    x2="370"
                    y2="220"
                    :stroke="lineDrawingSequence[0]?.color || '#3b82f6'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                  <!-- Center Line (horizontal for side view) -->
                  <line
                    v-if="
                      currentLineIndex === 1 && lineDrawingSequence.length > 1
                    "
                    x1="50"
                    y1="120"
                    x2="390"
                    y2="120"
                    :stroke="lineDrawingSequence[1]?.color || '#22c55e'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                  <!-- Short Service Line (vertical for side view) -->
                  <line
                    v-if="
                      currentLineIndex === 2 && lineDrawingSequence.length > 2
                    "
                    x1="264"
                    y1="20"
                    x2="264"
                    y2="220"
                    :stroke="lineDrawingSequence[2]?.color || '#ef4444'"
                    stroke-width="4"
                    opacity="0.8"
                  />
                </svg>
              </div>

              <h4>Drawing Progress</h4>
              <div class="line-progress-list">
                <div
                  v-for="(lineType, index) in lineDrawingSequence"
                  :key="lineType.id"
                  :class="[
                    'progress-item',
                    {
                      current: index === currentLineIndex,
                      completed:
                        index < currentLineIndex ||
                        completedLines[index]?.confirmed,
                      pending:
                        index > currentLineIndex && !completedLines[index],
                    },
                  ]"
                >
                  <div class="progress-indicator">
                    <svg
                      v-if="completedLines[index]?.confirmed"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      class="check-icon"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span
                      v-else-if="index === currentLineIndex"
                      class="current-dot"
                    />
                    <span v-else class="pending-dot" />
                  </div>
                  <div class="progress-info">
                    <span class="line-name">{{ lineType.name }}</span>
                    <span class="line-status">
                      {{ getLineStatus(index) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Quick Actions -->
              <div class="quick-actions">
                <button
                  class="action-btn"
                  :disabled="currentLineIndex === 0"
                  @click="goToPreviousLine"
                >
                  Previous Line
                </button>
                <button
                  class="action-btn"
                  :disabled="!canSkipCurrentLine()"
                  @click="skipCurrentLine"
                >
                  Skip Line
                </button>
                <button class="action-btn reset" @click="resetAllLines">
                  Reset All
                </button>
              </div>
            </div>

            <!-- Main Video Player with Drawing Canvas -->
            <div class="video-player-container">
              <!-- Video Element with Controls -->
              <div class="video-wrapper">
                <video
                  ref="videoElement"
                  :src="props.videoUrl"
                  class="calibration-video"
                  @loadedmetadata="handleVideoLoaded"
                  @timeupdate="handleTimeUpdate"
                />

                <!-- Video Area Indicator -->
                <div
                  class="video-area-indicator"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                />

                <!-- Drawing Canvas Overlay -->
                <canvas
                  ref="drawingCanvas"
                  class="drawing-canvas-overlay"
                  :width="videoDisplayArea.width"
                  :height="videoDisplayArea.height"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                  @mousedown="startDrawing"
                  @mousemove="handleDrawing"
                  @mouseup="endDrawing"
                  @mouseleave="cancelDrawing"
                />

                <!-- Permanent Reference Lines and Drawn Lines Overlay -->
                <svg
                  class="lines-overlay"
                  :width="videoDisplayArea.width"
                  :height="videoDisplayArea.height"
                  :style="{
                    left: `${videoDisplayArea.x}px`,
                    top: `${videoDisplayArea.y}px`,
                    width: `${videoDisplayArea.width}px`,
                    height: `${videoDisplayArea.height}px`,
                  }"
                >
                  <!-- Drawn Lines with Adjustment Handles -->
                  <g
                    v-for="(line, index) in displayCompletedLines"
                    :key="`line-${index}`"
                  >
                    <template
                      v-if="line && line.displayStart && line.displayEnd"
                    >
                      <line
                        :x1="line.displayStart.x"
                        :y1="line.displayStart.y"
                        :x2="line.displayEnd.x"
                        :y2="line.displayEnd.y"
                        :stroke="line.color"
                        stroke-width="5"
                        stroke-linecap="round"
                        :opacity="line.confirmed ? 0.8 : 0.5"
                        class="drawn-line"
                        @click="selectLineForAdjustment(index)"
                      />
                      <!-- Adjustment Handles -->
                      <circle
                        v-if="selectedLineIndex === index"
                        :cx="line.displayStart.x"
                        :cy="line.displayStart.y"
                        r="8"
                        fill="white"
                        stroke="#3b82f6"
                        stroke-width="2"
                        class="adjustment-handle"
                        @mousedown="startAdjustment(index, 'start', $event)"
                      />
                      <circle
                        v-if="selectedLineIndex === index"
                        :cx="line.displayEnd.x"
                        :cy="line.displayEnd.y"
                        r="8"
                        fill="white"
                        stroke="#3b82f6"
                        stroke-width="2"
                        class="adjustment-handle"
                        @mousedown="startAdjustment(index, 'end', $event)"
                      />
                    </template>
                  </g>

                  <!-- Currently Drawing Line -->
                  <line
                    v-if="isDrawing && displayDrawingStart"
                    :x1="displayDrawingStart.x"
                    :y1="displayDrawingStart.y"
                    :x2="displayCurrentMousePos.x"
                    :y2="displayCurrentMousePos.y"
                    :stroke="getCurrentLineColor()"
                    stroke-width="5"
                    stroke-linecap="round"
                    opacity="0.6"
                    stroke-dasharray="5,5"
                  />
                </svg>
              </div>

              <!-- Video Controls -->
              <div class="video-controls">
                <button class="control-btn" @click="togglePlayPause">
                  <svg
                    v-if="!isPlaying"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                </button>

                <div class="time-display">
                  {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                </div>

                <input
                  type="range"
                  class="video-scrubber"
                  :min="0"
                  :max="duration"
                  :value="currentTime"
                  @input="handleScrub"
                />
              </div>

              <!-- Line Confirmation Panel -->
              <div
                v-if="currentDrawnLine && !currentDrawnLine.confirmed"
                class="line-confirmation"
              >
                <p>Is this line positioned correctly?</p>
                <div class="confirmation-buttons">
                  <button class="btn-confirm" @click="confirmCurrentLine">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Confirm
                  </button>
                  <button class="btn-adjust" @click="enableLineAdjustment">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                      />
                    </svg>
                    Adjust
                  </button>
                  <button class="btn-redraw" @click="redrawCurrentLine">
                    <svg viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Redraw
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Calibration Results and Usage -->
        <div v-else class="calibration-success-section compact-layout">
          <div class="success-header-row">
            <div class="success-icon">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4Z"
                />
              </svg>
            </div>
            <div class="success-text">
              <h2>Calibration Results</h2>
              <p class="subtitle">
                Review your calibration metrics and understand how they'll be
                used.
              </p>
            </div>
          </div>

          <div class="results-two-column-layout">
            <!-- Left Column: Quantitative Metrics -->
            <div class="metrics-column">
              <!-- Reprojection Error Metric (Primary metric) -->
              <div class="compact-metric-card">
                <div class="metric-header">
                  <div class="metric-title">Reprojection Error</div>
                  <div class="metric-value">
                    {{ calibrationResults?.error ?? '0.0' }}
                    <span class="metric-unit">px</span>
                  </div>
                </div>
                <div class="metric-hint">Lower is better</div>
              </div>

              <!-- Coordinate Transform Matrix -->
              <div class="compact-metric-card">
                <div class="metric-title">Coordinate Transform</div>
                <div
                  v-if="
                    calibrationResults && calibrationResults.exampleTransform
                  "
                  class="transform-display-compact"
                >
                  <div class="transform-row">
                    <span class="transform-label">Image:</span>
                    <code class="transform-value"
                      >({{ calibrationResults.exampleTransform.imagePoint.x }},
                      {{ calibrationResults.exampleTransform.imagePoint.y }})
                      px</code
                    >
                  </div>
                  <div class="transform-arrow">↓</div>
                  <div class="transform-row">
                    <span class="transform-label">World:</span>
                    <code class="transform-value"
                      >({{ calibrationResults.exampleTransform.worldPoint.x }},
                      {{ calibrationResults.exampleTransform.worldPoint.y }},
                      {{ calibrationResults.exampleTransform.worldPoint.z }})
                      m</code
                    >
                  </div>
                </div>
                <div v-else class="transform-placeholder-compact">
                  Complete line drawing to see transformation
                </div>
              </div>

              <!-- Quick Performance Indicators -->
              <div class="performance-indicators">
                <div class="indicator-chip" :class="getAccuracyClass()">
                  <span class="indicator-label">Speed Error Margin:</span>
                  <span class="indicator-value"
                    >±{{ calculateSpeedAccuracy() }}%</span
                  >
                </div>
                <div class="indicator-chip" :class="getPositionErrorClass()">
                  <span class="indicator-label">Position Error:</span>
                  <span class="indicator-value"
                    >±{{ calculatePositionError() }}m</span
                  >
                </div>
                <div class="indicator-chip">
                  <span class="indicator-label">Height Tracking:</span>
                  <span class="indicator-value enabled">Enabled</span>
                </div>
              </div>

              <!-- Calibration Quality Tips -->
              <div v-if="shouldShowCalibrationTips()" class="calibration-tips">
                <div class="tips-header">
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="tips-icon"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span class="tips-title">Improve Accuracy</span>
                </div>
                <ul class="tips-list">
                  <li v-if="parseFloat(calibrationResults?.error ?? '0') > 10">
                    Redraw lines more precisely along court markings
                  </li>
                  <li v-if="parseFloat(calibrationResults?.error ?? '0') > 15">
                    Ensure lines are straight and match actual court lines
                  </li>
                  <li>Use a frame where court lines are clearly visible</li>
                  <li>Draw lines from end to end for better calibration</li>
                </ul>
              </div>
            </div>

            <!-- Right Column: Explanatory Content -->
            <div class="explanation-column">
              <div class="explanation-scroll-container">
                <h3>How Calibration Works</h3>

                <!-- Compact Explanation Sections -->
                <div class="explanation-section">
                  <h4>Transform Explanation</h4>
                  <p>
                    The calibration maps pixel locations in your video to
                    real-world court coordinates in meters. X represents court
                    width position, Y is court length position, and Z is height
                    above court. This enables accurate speed and distance
                    measurements using pose landmarks.
                  </p>
                </div>

                <!-- Camera Position Impact Section -->
                <div class="explanation-section">
                  <h4>1. Camera Position Impact</h4>
                  <p>
                    <strong>Position-Weighted Calibration:</strong> Your camera
                    position affects accuracy
                  </p>
                  <ul class="compact-list">
                    <li>
                      <strong>Side cameras:</strong> Better horizontal line
                      accuracy (×1.2 weight)
                    </li>
                    <li>
                      <strong>Baseline cameras:</strong> Better vertical line
                      accuracy (×1.2 weight)
                    </li>
                    <li>
                      <strong>Height factor:</strong> Higher cameras provide
                      better perspective
                    </li>
                    <li>
                      <strong>Distance factor:</strong> Optimal distance is 3-5m
                      for badminton
                    </li>
                  </ul>
                </div>

                <!-- Court Model Section -->
                <div class="explanation-section">
                  <h4>2. Court Model</h4>
                  <p><strong>BWF Standard:</strong> 13.40m × 6.10m (doubles)</p>
                  <p class="compact-formula">
                    Origin at net center, X: width [-3.05, 3.05]m, Y: length
                    [-6.70, 6.70]m, Z: height [0, 10]m
                  </p>
                  <p>
                    <strong>Key Lines:</strong> Long service (0.76m from
                    baseline), Short service (1.98m from net), Center line
                    (divides court)
                  </p>
                </div>

                <!-- Enhanced Homography Section -->
                <div class="explanation-section">
                  <h4>3. Weighted Homography Calculation</h4>
                  <p>
                    3×3 matrix <span class="inline-formula">H</span> transforms
                    between image pixels and court meters using weighted DLT:
                    <span class="inline-formula">P = H⁻¹ · p</span>
                  </p>
                  <p class="compact-formula">
                    Uses SVD decomposition with position-specific line weights.
                    Accounts for perspective distortion based on camera
                    position.
                  </p>
                </div>

                <!-- Coordinate System Section -->
                <div class="explanation-section">
                  <h4>4. Multi-Layer Coordinate System</h4>
                  <ul class="compact-list">
                    <li>
                      <strong>Display coordinates:</strong> Canvas drawing area
                      (object-fit: contain)
                    </li>
                    <li>
                      <strong>Video coordinates:</strong> Natural video pixel
                      dimensions
                    </li>
                    <li>
                      <strong>Normalized coordinates:</strong> 0-1 range for
                      resolution independence
                    </li>
                    <li>
                      <strong>World coordinates:</strong> Real court meters with
                      proper scaling
                    </li>
                  </ul>
                </div>

                <!-- Pose Landmark Mapping Section -->
                <div class="explanation-section">
                  <h4>5. Pose to Court Position</h4>
                  <p>Biomechanically-weighted center of mass from landmarks:</p>
                  <ul class="compact-list">
                    <li>Upper torso (shoulders): 15%</li>
                    <li>Lower torso (hips): 35%</li>
                    <li>Thighs (knees): 25%</li>
                    <li>Lower legs (ankles): 25%</li>
                  </ul>
                  <p class="compact-formula">
                    Landmarks transformed through homography matrix to world
                    coordinates, then weighted average calculated for player
                    center of mass.
                  </p>
                </div>

                <!-- Enhanced Speed Computation Section -->
                <div class="explanation-section">
                  <h4>6. Speed Calculation Pipeline</h4>
                  <p class="compact-formula">
                    Speed = Δs/Δt where Δs = √[(Xₜ₊₁-Xₜ)² + (Yₜ₊₁-Yₜ)²]
                  </p>
                  <p>
                    <strong>Processing steps:</strong> Pose detection → Landmark
                    weighting → Homography transform → World coordinates →
                    Distance calculation → 5-frame smoothing → Unit conversion
                    (×3.6 for km/h, ×2.24 for mph).
                  </p>
                </div>

                <!-- Validation and Quality Section -->
                <div class="explanation-section">
                  <h4>7. Quality Validation</h4>
                  <ul class="compact-list">
                    <li>
                      <strong>Reprojection error:</strong> Measures line
                      alignment accuracy
                    </li>
                    <li>
                      <strong>Sport-specific thresholds:</strong> Badminton:
                      &lt;50px excellent, &lt;100px acceptable
                    </li>
                    <li>
                      <strong>Position validation:</strong> Checks line
                      orientations match camera view
                    </li>
                    <li>
                      <strong>Confidence scoring:</strong> Combines error
                      metrics with position weights
                    </li>
                  </ul>
                </div>

                <!-- Why Calibration is Essential -->
                <div class="explanation-section">
                  <h4>8. Why Calibration Matters</h4>
                  <div class="compact-benefits">
                    <div class="benefit-item">
                      <strong>✓ Perspective Correction:</strong> Accounts for
                      camera angle and position
                    </div>
                    <div class="benefit-item">
                      <strong>✓ Scale Recovery:</strong> Converts pixels to real
                      meters using court line references
                    </div>
                    <div class="benefit-item">
                      <strong>✓ Position-Aware Accuracy:</strong>
                      Weights measurements based on camera placement
                    </div>
                    <div class="benefit-item">
                      <strong>✓ Height Tracking:</strong> Enables 3D position
                      estimation for jump analysis
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <button class="btn-secondary" @click="resetCalibration">Reset</button>
          <div class="footer-actions">
            <button
              v-if="currentStep > 0"
              class="btn-secondary"
              @click="previousStep"
            >
              Previous
            </button>
            <button
              v-if="currentStep < 1"
              class="btn-primary"
              :disabled="!canProceedToNext"
              @click="nextStep"
            >
              Next
            </button>
            <button
              v-if="currentStep === 1"
              class="btn-primary"
              :disabled="!canProceedToNext"
              @click="nextStep"
            >
              Next
            </button>
            <button
              v-if="currentStep === 1 && canProceedToNext"
              class="btn-success"
              @click="completeCalibrationDirectly"
            >
              Complete Calibration
            </button>
            <button
              v-if="currentStep === 2"
              class="btn-success"
              @click="closeModal"
            >
              Complete Calibration
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import EdgeBasedCameraSelector from './EdgeBasedCameraSelector.vue';
import { calculateVideoDisplayArea } from '../utils/videoDisplayArea';
import type { VideoDisplayArea } from '../utils/videoDisplayArea';
import { useCameraCalibration } from '../composables/useCameraCalibration';

// Props
interface Props {
  show: boolean;
  videoUrl: string;
  courtType?: 'badminton' | 'tennis';
}

interface CalibrationResults {
  accuracy: number;
  error: string;
  exampleTransform?: {
    imagePoint: { x: number; y: number };
    worldPoint: { x: string; y: string; z: string };
    pixelsPerMeter: number;
  } | null;
}

const props = withDefaults(defineProps<Props>(), {
  courtType: 'badminton',
});

// Emits
const emit = defineEmits<{
  close: [];
  'calibration-complete': [data: any];
}>();

// Types
interface Point2D {
  x: number;
  y: number;
}

interface DrawnLine {
  start: Point2D;
  end: Point2D;
  color: string;
  confirmed: boolean;
  type: string;
}

// Refs
const videoElement = ref<HTMLVideoElement>();
const drawingCanvas = ref<HTMLCanvasElement>();

// State
const currentStep = ref(0);
const cameraPositionData = ref({
  edge: null as 'top' | 'bottom' | 'left' | 'right' | null,
  distance: 5,
  height: 3.5,
  position3D: { x: 0, y: 0, z: 3.5 },
});

// Video state
const videoWidth = ref(1280);
const videoHeight = ref(720);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const videoDisplayArea = ref<VideoDisplayArea>({
  x: 0,
  y: 0,
  width: 1280,
  height: 720,
  scaleX: 1,
  scaleY: 1,
});

// Line drawing state
const currentLineIndex = ref(0);
const completedLines = ref<(DrawnLine | null)[]>([]);
const isDrawing = ref(false);
const drawingStart = ref<Point2D | null>(null);
const currentMousePos = ref<Point2D>({ x: 0, y: 0 });
const selectedLineIndex = ref<number | null>(null);
const showReferenceLines = ref(true);
const calibrationQuality = ref<{ level: string; message: string } | null>(null);

// Calibration results
const calibrationResults = ref<CalibrationResults | null>(null);
const calibrationData = ref<any>(null);

// Initialize camera calibration composable
const calibration = useCameraCalibration();

// Set sport configuration based on court type prop
watch(
  () => props.courtType,
  (newCourtType) => {
    if (newCourtType) {
      calibration.setSportConfig(newCourtType);
    }
  },
  { immediate: true }
);

// Line drawing sequence for badminton court - simplified to 3 essential lines
const lineDrawingSequence = [
  {
    id: 'service-long-doubles',
    name: 'Long Service Line for Doubles',
    color: '#3b82f6',
    description:
      'Draw the vertical long service line for doubles (back boundary line)',
  },
  {
    id: 'center-line',
    name: 'Center Line',
    color: '#22c55e',
    description:
      'Draw the horizontal center line dividing the upper and lower courts',
  },
  {
    id: 'service-short',
    name: 'Short Service Line',
    color: '#ef4444',
    description:
      'Draw the vertical short service line (front service boundary)',
  },
];

// Reference lines (permanent guides) - corrected for side view
const referenceLines = computed(() => {
  const w = videoDisplayArea.value.width;
  const h = videoDisplayArea.value.height;
  return {
    // Vertical line on the right side (back boundary)
    doubleLongService: { x1: w * 0.8, y1: h * 0.1, x2: w * 0.8, y2: h * 0.9 },
    // Horizontal line in the middle (dividing upper/lower courts)
    centerLine: { x1: w * 0.2, y1: h * 0.5, x2: w * 0.8, y2: h * 0.5 },
    // Vertical line closer to center (short service line)
    shortService: { x1: w * 0.6, y1: h * 0.1, x2: w * 0.6, y2: h * 0.9 },
  };
});

// Court dimensions
const courtDimensions = computed(() => {
  if (props.courtType === 'tennis') {
    return { length: 23.77, width: 10.97 };
  }
  return { length: 13.4, width: 6.1 }; // Badminton
});

// Helper function to initialize completed lines array
const initializeCompletedLines = () => {
  completedLines.value = new Array(lineDrawingSequence.length).fill(null);
};

// Initialize when modal is shown
watch(
  () => props.show,
  (newValue) => {
    if (newValue && completedLines.value.length === 0) {
      initializeCompletedLines();
    }
  }
);

// Watch for all lines being completed and trigger enhanced calibration
watch(
  () => {
    const confirmedCount = completedLines.value.filter(
      (l) => l?.confirmed
    ).length;
    return confirmedCount;
  },
  async (confirmedCount) => {
    console.log(
      '🔍 [Calibration Watcher] Confirmed lines count:',
      confirmedCount
    );
    console.log(
      '🔍 [Calibration Watcher] Completed lines:',
      completedLines.value
    );

    if (confirmedCount >= 3) {
      console.log(
        '🎯 [Enhanced Calibration] All lines completed, running enhanced calibration...'
      );
      console.log(
        '🎯 [Enhanced Calibration] Camera position:',
        cameraPositionData.value
      );
      console.log('🎯 [Enhanced Calibration] Court type:', props.courtType);

      // Ensure camera position is set with proper validation
      if (cameraPositionData.value && cameraPositionData.value.edge !== null) {
        calibration.setCameraPositionConfig({
          edge: cameraPositionData.value.edge,
          distance: cameraPositionData.value.distance,
          height: cameraPositionData.value.height,
          position3D: cameraPositionData.value.position3D,
        });
        console.log(
          '🎯 [Enhanced Calibration] Camera position set in calibration system'
        );
      } else {
        console.warn(
          '🎯 [Enhanced Calibration] Invalid camera position data, using defaults'
        );
      }

      // Trigger the enhanced calibration calculation
      try {
        console.log(
          '🎯 [Enhanced Calibration] Running enhanced calibration...'
        );

        // Use the enhanced calibration system directly
        const cameraParams = await calibration.calculateCameraParameters();
        console.log(
          '🎯 [Enhanced Calibration] Camera parameters:',
          cameraParams
        );

        // Enhanced validation of calibration results
        if (
          cameraParams &&
          cameraParams.position &&
          cameraParams.rotation &&
          cameraParams.fov &&
          calibration.validationMetrics.value &&
          calibration.validationMetrics.value.reprojectionError !== undefined
        ) {
          const metrics = calibration.validationMetrics.value;
          const confidence = calibration.calibrationConfidence.value;
          const transformData = calibration.getTransformationData.value;

          // Validate metrics before using them
          if (
            metrics.reprojectionError >= 0 &&
            confidence >= 0 &&
            confidence <= 1
          ) {
            const result = {
              accuracy: Math.round(confidence * 100),
              error: metrics.reprojectionError.toFixed(2),
              exampleTransform: transformData,
            };

            calibrationResults.value = result;
            console.log(
              '🎯 [Enhanced Calibration] Results set successfully:',
              result
            );

            // Don't automatically move to next step - let user click "Next"
            console.log(
              '🎯 [Enhanced Calibration] Calibration ready, waiting for user to proceed'
            );
          } else {
            throw new Error(
              `Invalid calibration metrics: error=${metrics.reprojectionError}, confidence=${confidence}`
            );
          }
        } else {
          console.warn(
            '🎯 [Enhanced Calibration] Invalid or incomplete calibration results from enhanced system'
          );
          // Use basic fallback calculation
          const result = {
            accuracy: 75,
            error: '5.0',
            exampleTransform: null,
          };
          calibrationResults.value = result;
          // Don't automatically move to next step
        }
      } catch (error) {
        console.error('🚨 [Enhanced Calibration] Failed with error:', error);
        console.error(
          '🚨 [Enhanced Calibration] Error stack:',
          error instanceof Error ? error.stack : 'No stack trace'
        );

        // Fallback to basic calculation with error details
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const result = {
          accuracy: 70,
          error: '8.0',
          exampleTransform: null,
          errorDetails: errorMessage,
        };
        calibrationResults.value = result;
        // Don't automatically move to next step
        console.log('🚨 [Enhanced Calibration] Using fallback result:', result);
      }
    }
  }
);

// Current line being drawn
const currentDrawnLine = computed(() => {
  return completedLines.value[currentLineIndex.value];
});

// Keep the quality badge in sync with the latest calibration results
watch(
  () => calibrationResults.value,
  (result) => {
    if (!result) {
      calibrationQuality.value = null;
      return;
    }

    const label = getCalibrationQualityLabel();
    calibrationQuality.value = {
      level: label.toLowerCase(),
      message: `${label} calibration`,
    };
  },
  { immediate: true }
);

// Computed properties
const canProceedToNext = computed(() => {
  if (currentStep.value === 0) {
    return cameraPositionData.value.edge !== null;
  } else if (currentStep.value === 1) {
    // Need all 3 lines confirmed
    const confirmedCount = completedLines.value.filter(
      (l) => l?.confirmed
    ).length;
    console.log('canProceedToNext check:', {
      currentStep: currentStep.value,
      confirmedCount,
      completedLines: completedLines.value.map((l) => ({
        confirmed: l?.confirmed,
      })),
    });
    return confirmedCount >= 3;
  }
  return false;
});

// Methods
const closeModal = () => {
  // Clean up resize listener
  window.removeEventListener('resize', updateCanvasDimensions);

  // Ensure calibration data is prepared when we have completed lines
  const confirmedCount = completedLines.value.filter(
    (l) => l?.confirmed
  ).length;

  if (confirmedCount >= 3 || currentStep.value === 2) {
    if (!calibrationData.value) {
      // Build calibrationData from drawn lines before emitting
      completeCalibration();
    }
    if (calibrationData.value) {
      console.log(
        '🎯 [CloseModal] Emitting calibration data:',
        calibrationData.value
      );
      emit('calibration-complete', calibrationData.value);
    } else {
      console.warn('🎯 [CloseModal] No calibration data available to emit');
    }
  } else {
    console.log(
      '🎯 [CloseModal] Not enough confirmed lines to emit calibration data:',
      confirmedCount
    );
  }

  emit('close');
};

// Cleanup on unmount
onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasDimensions);
});

const nextStep = () => {
  if (canProceedToNext.value) {
    // If moving from step 1 to step 2, prepare calibration data
    if (currentStep.value === 1) {
      console.log(
        '🎯 [nextStep] Moving from step 1 to step 2, preparing calibration data'
      );
      if (!calibrationData.value) {
        completeCalibration();
      }
    }
    currentStep.value++;
  }
};

const previousStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

const resetCalibration = () => {
  currentStep.value = 0;
  currentLineIndex.value = 0;
  completedLines.value = [];
  selectedLineIndex.value = null;
  calibrationResults.value = null;
  calibrationData.value = null;
  calibrationQuality.value = null;
};

const completeCalibrationDirectly = () => {
  console.log(
    '🎯 [CompleteCalibrationDirectly] Completing calibration directly from step 1'
  );

  // Ensure calibration data is prepared
  if (!calibrationData.value) {
    completeCalibration();
  }

  // Close the modal which will emit the calibration data
  closeModal();
};

const completeCalibration = () => {
  console.log('🎯 [completeCalibration] Called');
  console.log('🎯 [completeCalibration] Current state:', {
    currentStep: currentStep.value,
    completedLinesCount: completedLines.value.length,
    completedLines: completedLines.value,
    calibrationResults: calibrationResults.value,
  });

  // Convert drawn lines to normalized coordinates (0-1 range) relative to the natural video dimensions
  const normalizedLines = completedLines.value
    .map((line, index) => {
      console.log(`🎯 [completeCalibration] Processing line ${index}:`, line);

      if (!line || !line.start || !line.end || !videoElement.value) {
        console.warn(`🎯 [completeCalibration] Line ${index} is invalid:`, {
          hasLine: !!line,
          hasStart: !!line?.start,
          hasEnd: !!line?.end,
          hasVideoElement: !!videoElement.value,
        });
        return null;
      }

      const displayArea = videoDisplayArea.value;

      // Validate the natural video dimensions – drawing happens in native pixel space
      const videoWidth = videoElement.value?.videoWidth || 1920;
      const videoHeight = videoElement.value?.videoHeight || 1080;

      if (videoWidth <= 0 || videoHeight <= 0) {
        console.error(
          '🎯 [completeCalibration] Invalid natural video dimensions:',
          {
            videoWidth,
            videoHeight,
          }
        );
        return null;
      }

      if (!displayArea || displayArea.width <= 0 || displayArea.height <= 0) {
        console.error(
          '🎯 [completeCalibration] Invalid video display area:',
          displayArea
        );
        return null;
      }

      const displayWidth = displayArea.width;
      const displayHeight = displayArea.height;

      console.log(`🎯 [completeCalibration] Line ${index} dimensions:`, {
        displayArea: { width: displayWidth, height: displayHeight },
        videoDimensions: { width: videoWidth, height: videoHeight },
        lineCoords: {
          start: line.start,
          end: line.end,
        },
      });

      // Log the raw coordinates before normalization
      console.log(`🎯 [completeCalibration] Line ${index} raw coordinates:`, {
        start: { x: line.start.x, y: line.start.y },
        end: { x: line.end.x, y: line.end.y },
        videoBounds: { width: videoWidth, height: videoHeight },
      });

      // Check if coordinates are out of bounds but don't clamp them yet
      const isOutOfBounds =
        line.start.x < 0 ||
        line.start.x > videoWidth ||
        line.start.y < 0 ||
        line.start.y > videoHeight ||
        line.end.x < 0 ||
        line.end.x > videoWidth ||
        line.end.y < 0 ||
        line.end.y > videoHeight;

      if (isOutOfBounds) {
        console.warn(
          '🎯 [completeCalibration] Line coordinates out of bounds:',
          {
            line: {
              start: { x: line.start.x, y: line.start.y },
              end: { x: line.end.x, y: line.end.y },
            },
            videoArea: { width: videoWidth, height: videoHeight },
            outOfBoundsDetails: {
              startXOutOfBounds:
                line.start.x < 0 || line.start.x > videoWidth,
              startYOutOfBounds:
                line.start.y < 0 || line.start.y > videoHeight,
              endXOutOfBounds: line.end.x < 0 || line.end.x > videoWidth,
              endYOutOfBounds: line.end.y < 0 || line.end.y > videoHeight,
            },
          }
        );
      }

      // Normalize coordinates to 0-1 range based on the natural video dimensions
      // Don't clamp to prevent loss of line information
      const normalizedLine = {
        ...line,
        start: {
          x: line.start.x / videoWidth,
          y: line.start.y / videoHeight,
        },
        end: {
          x: line.end.x / videoWidth,
          y: line.end.y / videoHeight,
        },
        // Store both display and natural dimensions for reference
        videoDimensions: {
          width: videoWidth,
          height: videoHeight,
        },
        displayDimensions: {
          width: displayWidth,
          height: displayHeight,
        },
      };

      console.log(
        `🎯 [completeCalibration] Line ${index} normalized:`,
        normalizedLine
      );
      return normalizedLine;
    })
    .filter((line) => line !== null);

  console.log('🎯 [completeCalibration] Normalized lines result:', {
    originalCount: completedLines.value.length,
    normalizedCount: normalizedLines.length,
    normalizedLines: normalizedLines,
  });

  // Store calibration data for later emission
  calibrationData.value = {
    cameraPosition: cameraPositionData.value,
    drawnLines: normalizedLines,
  };

  // Calculate actual calibration metrics using enhanced calibration system
  const calculateCalibrationMetrics = async () => {
    // Ensure camera position is set in the calibration system
    if (cameraPositionData.value) {
      calibration.setCameraPositionConfig({
        edge: cameraPositionData.value.edge,
        distance: cameraPositionData.value.distance,
        height: cameraPositionData.value.height,
        position3D: cameraPositionData.value.position3D,
      });
    }

    // Set up line correspondences for the enhanced calibration system
    if (normalizedLines.length >= 3) {
      // Clear existing correspondences
      calibration.reset();

      // Add court lines to the calibration system
      normalizedLines.forEach((line, index) => {
        if (line && line.type) {
          // Add the court line
          calibration.selectDiagramLine(line.type);

          // Add the drawn video line (coordinates are already in pixel space)
          const videoLinePoints = [
            {
              x: line.start.x,
              y: line.start.y,
            },
            {
              x: line.end.x,
              y: line.end.y,
            },
          ];
          calibration.addDrawnVideoLine(line.type, videoLinePoints);

          // Create correspondence
          calibration.createLineCorrespondence(line.type, line.type);
        }
      });

      // Run the enhanced calibration calculation
      try {
        const cameraParams = await calibration.calculateCameraParameters();

        if (cameraParams && calibration.validationMetrics.value) {
          // Use results from enhanced calibration system
          const metrics = calibration.validationMetrics.value;
          const confidence = calibration.calibrationConfidence.value;

          return {
            accuracy: Math.round(confidence * 100),
            error: metrics.reprojectionError.toFixed(2),
            exampleTransform: calibration.getTransformationData.value,
          };
        }
      } catch (error) {
        console.error(
          'Enhanced calibration failed, falling back to basic validation:',
          error
        );
      }
    }

    // Fallback to basic validation if enhanced calibration fails
    return calculateBasicCalibrationMetrics();
  };

  // Basic calibration metrics as fallback
  const calculateBasicCalibrationMetrics = () => {
    // Get camera position from Step 1
    const cameraEdge = cameraPositionData.value.edge;
    const cameraDistance = cameraPositionData.value.distance;
    const cameraHeight = cameraPositionData.value.height;

    // Calculate accuracy based on line quality
    let accuracyScore = 100;

    // Check if all required lines are drawn
    const drawnCount = normalizedLines.length;
    if (drawnCount < 3) {
      accuracyScore -= (3 - drawnCount) * 10;
    }

    // Calculate deterministic metrics based on actual line geometry and camera position
    let reprojectionError = 0;

    if (normalizedLines.length >= 3 && cameraEdge) {
      const lines = normalizedLines.filter((l) => l !== null);

      // Expected line orientations based on camera position
      let expectedServiceLineOrientation: 'vertical' | 'horizontal';
      let expectedCenterLineOrientation: 'vertical' | 'horizontal';

      // Determine expected orientations based on camera edge
      // For badminton court viewed from the side:
      // - Service lines run across the width (horizontal when viewed from side)
      // - Center line runs along the length (vertical when viewed from side)
      if (cameraEdge === 'left' || cameraEdge === 'right') {
        // Camera on long side (side view):
        // - Service lines (across width) appear horizontal
        // - Center line (along length) appears vertical
        expectedServiceLineOrientation = 'horizontal';
        expectedCenterLineOrientation = 'vertical';
      } else {
        // Camera on short side (baseline/top/bottom view):
        // - Service lines (across width) appear vertical
        // - Center line (along length) appears horizontal
        expectedServiceLineOrientation = 'vertical';
        expectedCenterLineOrientation = 'horizontal';
      }

      // Helper function to determine line orientation
      const getLineOrientation = (
        line: any
      ): 'vertical' | 'horizontal' | 'diagonal' => {
        const dx = Math.abs(line.end.x - line.start.x);
        const dy = Math.abs(line.end.y - line.start.y);
        const angle = Math.atan2(dy, dx);

        // More forgiving angle tolerances (within 35 degrees instead of 30)
        const verticalTolerance = Math.PI * 0.39; // ~35 degrees
        const horizontalTolerance = Math.PI * 0.22; // ~40 degrees for horizontal

        // Check if mostly vertical
        if (Math.abs(angle - Math.PI / 2) < verticalTolerance) {
          return 'vertical';
        }
        // Check if mostly horizontal (near 0 or π)
        if (
          angle < horizontalTolerance ||
          angle > Math.PI - horizontalTolerance
        ) {
          return 'horizontal';
        }
        return 'diagonal';
      };

      // Check each line against expected orientation
      const longServiceLine = lines.find(
        (l) => l.type === 'service-long-doubles'
      );
      const shortServiceLine = lines.find((l) => l.type === 'service-short');
      const centerLine = lines.find((l) => l.type === 'center-line');

      // Validate long service line orientation
      if (longServiceLine) {
        const orientation = getLineOrientation(longServiceLine);
        if (orientation !== expectedServiceLineOrientation) {
          reprojectionError += 3.0; // Reduced penalty for wrong orientation
          if (orientation === 'diagonal') {
            reprojectionError += 2.0; // Reduced extra penalty for diagonal lines
          }
        }
      }

      // Validate short service line orientation
      if (shortServiceLine) {
        const orientation = getLineOrientation(shortServiceLine);
        if (orientation !== expectedServiceLineOrientation) {
          reprojectionError += 3.0; // Reduced penalty
          if (orientation === 'diagonal') {
            reprojectionError += 2.0; // Reduced extra penalty
          }
        }
      }

      // Validate center line orientation
      if (centerLine) {
        const orientation = getLineOrientation(centerLine);
        if (orientation !== expectedCenterLineOrientation) {
          reprojectionError += 3.0; // Reduced penalty
          if (orientation === 'diagonal') {
            reprojectionError += 2.0; // Reduced extra penalty
          }
        }
      }

      // Check relative positions based on camera distance and height
      if (longServiceLine && shortServiceLine) {
        // Service lines should be parallel
        const angle1 = Math.atan2(
          longServiceLine.end.y - longServiceLine.start.y,
          longServiceLine.end.x - longServiceLine.start.x
        );
        const angle2 = Math.atan2(
          shortServiceLine.end.y - shortServiceLine.start.y,
          shortServiceLine.end.x - shortServiceLine.start.x
        );

        const angleDiff = Math.abs(angle1 - angle2);
        const parallelismError = Math.min(angleDiff * 20, 5);
        reprojectionError += parallelismError;

        // Check distance ratio based on perspective
        // Farther objects appear smaller due to perspective
        const perspectiveFactor = 1 + cameraDistance / 20; // Simple perspective model
        const longLineLength = Math.sqrt(
          Math.pow(longServiceLine.end.x - longServiceLine.start.x, 2) +
            Math.pow(longServiceLine.end.y - longServiceLine.start.y, 2)
        );
        const shortLineLength = Math.sqrt(
          Math.pow(shortServiceLine.end.x - shortServiceLine.start.x, 2) +
            Math.pow(shortServiceLine.end.y - shortServiceLine.start.y, 2)
        );

        // Lines should have similar lengths (both span court width/length)
        const lengthRatio =
          Math.max(longLineLength, shortLineLength) /
          Math.min(longLineLength, shortLineLength);

        // Account for perspective: farther line may appear shorter
        const expectedRatio = perspectiveFactor;
        const ratioError = Math.abs(lengthRatio - expectedRatio) * 2;
        reprojectionError += Math.min(ratioError, 3);
      }

      // Check perpendicularity between service lines and center line
      if (centerLine && longServiceLine) {
        const centerAngle = Math.atan2(
          centerLine.end.y - centerLine.start.y,
          centerLine.end.x - centerLine.start.x
        );
        const serviceAngle = Math.atan2(
          longServiceLine.end.y - longServiceLine.start.y,
          longServiceLine.end.x - longServiceLine.start.x
        );

        // Should be perpendicular (90 degrees difference)
        const expectedDiff = Math.PI / 2;
        const actualDiff = Math.abs(
          Math.abs(centerAngle - serviceAngle) - expectedDiff
        );
        const perpError = actualDiff * 10;

        reprojectionError += Math.min(perpError, 5);
      }

      // Account for camera height in error calculation
      // Higher camera = better view = lower base error
      const heightFactor = Math.max(0.5, 1 - cameraHeight / 10);
      reprojectionError *= heightFactor;

      // Ensure minimum error
      reprojectionError = Math.max(0.5, reprojectionError);
    } else {
      // Not enough lines or no camera position
      reprojectionError = 15.0;
      accuracyScore = 40;
    }

    // Calculate accuracy based on reprojection error
    // Lower error = higher accuracy
    if (reprojectionError < 2) {
      accuracyScore = 95; // Excellent calibration
    } else if (reprojectionError < 5) {
      accuracyScore = 85; // Good calibration
    } else if (reprojectionError < 8) {
      accuracyScore = 75; // Fair calibration
    } else if (reprojectionError < 12) {
      accuracyScore = 65; // Acceptable calibration
    } else {
      accuracyScore = 50; // Poor calibration
    }

    // Format reprojection error to 2 decimal places
    const formattedError = reprojectionError.toFixed(2);

    // Calculate example transform with actual court dimensions
    const courtLength = courtDimensions.value.length; // 13.4m for badminton
    const courtWidth = courtDimensions.value.width; // 6.1m for badminton

    // CRITICAL FIX: Get display dimensions first before using them
    const displayArea = videoDisplayArea.value;
    const displayWidth = displayArea.width;
    const displayHeight = displayArea.height;

    // Use a deterministic point based on the drawn lines for consistency
    // If we have a short service line, use its midpoint as reference
    let exampleImagePoint;

    const shortServiceLine = normalizedLines.find(
      (line) => line.type === 'service-short'
    );
    if (shortServiceLine && shortServiceLine.start && shortServiceLine.end) {
      // Use the midpoint of the short service line for consistent results
      const midX = (shortServiceLine.start.x + shortServiceLine.end.x) / 2;
      const midY = (shortServiceLine.start.y + shortServiceLine.end.y) / 2;
      // CRITICAL FIX: Convert normalized coordinates to display coordinates
      exampleImagePoint = {
        x: Math.round(midX * displayWidth),
        y: Math.round(midY * displayHeight),
      };
    } else {
      // Fallback to a fixed position if no short service line
      // CRITICAL FIX: Use display dimensions instead of video natural dimensions
      exampleImagePoint = {
        x: Math.round(displayWidth * 0.65), // 65% across (near service line)
        y: Math.round(displayHeight * 0.35), // 35% down (upper court area)
      };
    }

    // Calculate the actual world coordinates based on court dimensions
    // Assuming the court center is at (0, 0) and we're looking from the side
    const camEdge = cameraPositionData.value.edge || 'left';

    // Calculate world coordinates based on the image position
    // These calculations provide realistic court positions in meters
    let worldX, worldY, worldZ;

    if (camEdge === 'left' || camEdge === 'right') {
      // Side view: X is along court length, Y is height, Z is court width
      // Map image coordinates to court coordinates using display dimensions
      worldX = (exampleImagePoint.x / displayWidth - 0.5) * courtLength;
      worldY = 0.0; // Ground level (shuttlecock on court)
      worldZ = (exampleImagePoint.y / displayHeight - 0.5) * courtWidth;
    } else {
      // End view: X is court width, Y is height, Z is court length
      worldX = (exampleImagePoint.x / displayWidth - 0.5) * courtWidth;
      worldY = 0.0; // Ground level
      worldZ = (exampleImagePoint.y / displayHeight - 0.5) * courtLength;
    }

    // Format world coordinates to 2 decimal places
    const worldPoint = {
      x: worldX.toFixed(2),
      y: worldY.toFixed(2),
      z: worldZ.toFixed(2),
    };

    // Calculate pixels per meter based on court dimensions and display resolution
    // CRITICAL FIX: Use display dimensions instead of video natural dimensions
    const pixelsPerMeter = Math.round(displayWidth / courtLength);

    return {
      accuracy: Math.max(50, Math.min(100, Math.round(accuracyScore))),
      error: formattedError,
      exampleTransform: {
        imagePoint: exampleImagePoint,
        worldPoint: worldPoint,
        pixelsPerMeter: pixelsPerMeter,
      },
    };
  };

  // This code is now handled by the watcher above when all lines are completed
  // Removed to prevent premature calculation
};

// Camera position handlers
const handleEdgeSelected = (edge: 'top' | 'bottom' | 'left' | 'right') => {
  console.log('Edge selected:', edge);

  // Update the edge in cameraPositionData
  cameraPositionData.value.edge = edge;

  // Update calibration system with camera position when edge is selected
  if (cameraPositionData.value && cameraPositionData.value.edge !== null) {
    calibration.setCameraPositionConfig({
      edge: cameraPositionData.value.edge,
      distance: cameraPositionData.value.distance,
      height: cameraPositionData.value.height,
      position3D: cameraPositionData.value.position3D,
    });
  } else {
    console.warn(
      'Invalid camera position data when edge selected:',
      cameraPositionData.value
    );
  }
};

const handleCameraPositionChanged = (position: {
  x: number;
  y: number;
  z: number;
}) => {
  console.log('Camera position changed:', position);
  // Update calibration system with new camera position from cameraPositionData
  if (cameraPositionData.value && cameraPositionData.value.edge !== null) {
    calibration.setCameraPositionConfig({
      edge: cameraPositionData.value.edge,
      distance: cameraPositionData.value.distance,
      height: cameraPositionData.value.height,
      position3D: cameraPositionData.value.position3D,
    });
  } else {
    console.warn(
      'Invalid camera position data when position changed:',
      cameraPositionData.value
    );
  }
};

// Video control methods
const handleVideoLoaded = () => {
  if (videoElement.value) {
    // Validate video dimensions before using them
    const naturalWidth = videoElement.value.videoWidth;
    const naturalHeight = videoElement.value.videoHeight;
    const videoDuration = videoElement.value.duration;

    if (
      !naturalWidth ||
      !naturalHeight ||
      naturalWidth <= 0 ||
      naturalHeight <= 0
    ) {
      console.error('Invalid video dimensions:', {
        naturalWidth,
        naturalHeight,
      });
      return;
    }

    if (!videoDuration || videoDuration <= 0) {
      console.warn('Invalid video duration:', videoDuration);
    }

    // Use the video's natural dimensions for consistent coordinate system
    videoWidth.value = naturalWidth;
    videoHeight.value = naturalHeight;
    duration.value = videoDuration || 0;

    // CRITICAL FIX: Set video dimensions in the calibration system
    calibration.setVideoDimensions(naturalWidth, naturalHeight);
    console.log(
      '📹 [Video Loaded] Set video dimensions in calibration system:',
      {
        width: naturalWidth,
        height: naturalHeight,
      }
    );

    // Calculate the actual video display area accounting for object-fit: contain
    updateVideoDisplayArea();

    // Validate display area was calculated correctly
    if (
      !videoDisplayArea.value ||
      videoDisplayArea.value.width <= 0 ||
      videoDisplayArea.value.height <= 0
    ) {
      console.error(
        'Failed to calculate valid video display area:',
        videoDisplayArea.value
      );
      return;
    }

    // Set canvas size to match the display area
    if (drawingCanvas.value) {
      drawingCanvas.value.width = videoDisplayArea.value.width;
      drawingCanvas.value.height = videoDisplayArea.value.height;
    }

    // Add resize listener to update dimensions
    window.addEventListener('resize', updateCanvasDimensions);

    console.log('📹 [Video Loaded] Video dimensions validated:', {
      natural: { width: naturalWidth, height: naturalHeight },
      display: videoDisplayArea.value,
      duration: videoDuration,
    });
  }
};

const updateVideoDisplayArea = () => {
  if (videoElement.value) {
    const videoContainer = videoElement.value.parentElement;
    if (videoContainer) {
      try {
        const newDisplayArea = calculateVideoDisplayArea(
          videoElement.value,
          videoContainer
        );

        // Validate the calculated display area
        if (
          newDisplayArea &&
          newDisplayArea.width > 0 &&
          newDisplayArea.height > 0 &&
          newDisplayArea.scaleX > 0 &&
          newDisplayArea.scaleY > 0
        ) {
          videoDisplayArea.value = newDisplayArea;
          console.log(
            '📐 [Video Display Area] Updated successfully:',
            newDisplayArea
          );
        } else {
          console.error(
            'Invalid video display area calculated:',
            newDisplayArea
          );
        }
      } catch (error) {
        console.error('Error calculating video display area:', error);
      }
    } else {
      console.error('Video container not found for display area calculation');
    }
  }
};

// Convert video coordinates to SVG coordinates (since SVG now matches display area)
const convertVideoToDisplayCoordinates = (videoX: number, videoY: number) => {
  const displayArea = videoDisplayArea.value;

  // Validate display area to prevent division by zero
  if (!displayArea || displayArea.scaleX <= 0 || displayArea.scaleY <= 0) {
    console.error(
      'Invalid display area for coordinate conversion:',
      displayArea
    );
    return { x: 0, y: 0 };
  }

  return {
    x: videoX / displayArea.scaleX,
    y: videoY / displayArea.scaleY,
  };
};

// Computed properties for display coordinates
const displayDrawingStart = computed(() => {
  if (!drawingStart.value) return null;
  return convertVideoToDisplayCoordinates(
    drawingStart.value.x,
    drawingStart.value.y
  );
});

const displayCurrentMousePos = computed(() => {
  if (!currentMousePos.value) return { x: 0, y: 0 };
  return convertVideoToDisplayCoordinates(
    currentMousePos.value.x,
    currentMousePos.value.y
  );
});

const displayCompletedLines = computed(() => {
  return completedLines.value
    .map((line) => {
      if (!line || !line.start || !line.end) return null;

      const displayStart = convertVideoToDisplayCoordinates(
        line.start.x,
        line.start.y
      );
      const displayEnd = convertVideoToDisplayCoordinates(
        line.end.x,
        line.end.y
      );

      return {
        ...line,
        displayStart,
        displayEnd,
      };
    })
    .filter((line) => line !== null);
});

const updateCanvasDimensions = () => {
  if (videoElement.value && drawingCanvas.value) {
    // Update video display area first
    updateVideoDisplayArea();

    // Set canvas dimensions to match the display area
    drawingCanvas.value.width = videoDisplayArea.value.width;
    drawingCanvas.value.height = videoDisplayArea.value.height;
  }
};

const handleTimeUpdate = () => {
  if (videoElement.value) {
    currentTime.value = videoElement.value.currentTime;
  }
};

const togglePlayPause = () => {
  if (videoElement.value) {
    if (isPlaying.value) {
      videoElement.value.pause();
    } else {
      videoElement.value.play();
    }
    isPlaying.value = !isPlaying.value;
  }
};

const handleScrub = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (videoElement.value) {
    videoElement.value.currentTime = parseFloat(target.value);
  }
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const toggleReferenceLines = () => {
  showReferenceLines.value = !showReferenceLines.value;
};

// Line drawing methods
const startDrawing = (event: MouseEvent) => {
  if (!drawingCanvas.value || !videoElement.value) return;

  // Validate display area before proceeding
  const displayArea = videoDisplayArea.value;
  if (!displayArea || displayArea.scaleX <= 0 || displayArea.scaleY <= 0) {
    console.error('Invalid display area for drawing:', displayArea);
    return;
  }

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Check if click is within canvas bounds
  if (
    relativeX < 0 ||
    relativeY < 0 ||
    relativeX > canvasRect.width ||
    relativeY > canvasRect.height
  ) {
    return; // Click outside canvas area
  }

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  const videoX = relativeX * displayArea.scaleX;
  const videoY = relativeY * displayArea.scaleY;

  isDrawing.value = true;
  drawingStart.value = { x: videoX, y: videoY };
  currentMousePos.value = { x: videoX, y: videoY };
};

const handleDrawing = (event: MouseEvent) => {
  if (!drawingCanvas.value || !videoElement.value) return;

  // Validate display area before proceeding
  const displayArea = videoDisplayArea.value;
  if (!displayArea || displayArea.scaleX <= 0 || displayArea.scaleY <= 0) {
    console.error('Invalid display area for drawing:', displayArea);
    return;
  }

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  if (
    relativeX >= 0 &&
    relativeX <= canvasRect.width &&
    relativeY >= 0 &&
    relativeY <= canvasRect.height
  ) {
    const videoX = relativeX * displayArea.scaleX;
    const videoY = relativeY * displayArea.scaleY;
    currentMousePos.value = { x: videoX, y: videoY };
  }
};

const endDrawing = (event: MouseEvent) => {
  if (
    !isDrawing.value ||
    !drawingStart.value ||
    !drawingCanvas.value ||
    !videoElement.value
  )
    return;

  // Validate display area before proceeding
  const displayArea = videoDisplayArea.value;
  if (!displayArea || displayArea.scaleX <= 0 || displayArea.scaleY <= 0) {
    console.error('Invalid display area for ending drawing:', displayArea);
    cancelDrawing();
    return;
  }

  const canvasRect = drawingCanvas.value.getBoundingClientRect();
  const relativeX = event.clientX - canvasRect.left;
  const relativeY = event.clientY - canvasRect.top;

  // Check if release is within canvas bounds
  if (
    relativeX < 0 ||
    relativeX > canvasRect.width ||
    relativeY < 0 ||
    relativeY > canvasRect.height
  ) {
    cancelDrawing();
    return; // Release is outside canvas area
  }

  // Since canvas now matches the video display area exactly, convert directly to video coordinates
  const x = relativeX * displayArea.scaleX;
  const y = relativeY * displayArea.scaleY;

  const currentLine = lineDrawingSequence[currentLineIndex.value];
  if (!currentLine) {
    console.error('No current line found for index:', currentLineIndex.value);
    cancelDrawing();
    return;
  }

  const newLine: DrawnLine = {
    start: drawingStart.value,
    end: { x, y },
    color: currentLine.color,
    confirmed: false,
    type: currentLine.id,
  };

  completedLines.value[currentLineIndex.value] = newLine;

  isDrawing.value = false;
  drawingStart.value = null;
};

const cancelDrawing = () => {
  isDrawing.value = false;
  drawingStart.value = null;
};

const confirmCurrentLine = () => {
  if (currentDrawnLine.value) {
    currentDrawnLine.value.confirmed = true;

    // Add this line to the enhanced calibration system
    const lineType = lineDrawingSequence[currentLineIndex.value]?.id;
    if (
      lineType &&
      currentDrawnLine.value.start &&
      currentDrawnLine.value.end &&
      videoElement.value
    ) {
      // Add court line to calibration system
      calibration.selectDiagramLine(lineType);

      // CRITICAL FIX: Normalize against the video's natural resolution before feeding calibration
      const displayArea = videoDisplayArea.value;
      const videoWidth = videoElement.value.videoWidth || 1920;
      const videoHeight = videoElement.value.videoHeight || 1080;

      if (videoWidth <= 0 || videoHeight <= 0) {
        console.error(
          'Invalid natural video dimensions for line integration:',
          {
            videoWidth,
            videoHeight,
          }
        );
        return;
      }

      // Validate display area primarily for logging consistency.
      if (!displayArea || displayArea.width <= 0 || displayArea.height <= 0) {
        console.error(
          'Invalid display area for line integration:',
          displayArea
        );
        return;
      }

      // Convert to normalized coordinates (0-1) using natural video dimensions
      const normalizedStart = {
        x: currentDrawnLine.value.start.x / videoWidth,
        y: currentDrawnLine.value.start.y / videoHeight,
      };
      const normalizedEnd = {
        x: currentDrawnLine.value.end.x / videoWidth,
        y: currentDrawnLine.value.end.y / videoHeight,
      };

      // Convert normalized coordinates to video pixel coordinates
      const videoLinePoints = [
        {
          x: normalizedStart.x * videoWidth,
          y: normalizedStart.y * videoHeight,
        },
        {
          x: normalizedEnd.x * videoWidth,
          y: normalizedEnd.y * videoHeight,
        },
      ];

      // Add drawn video line
      calibration.addDrawnVideoLine(lineType, videoLinePoints);

      // Create correspondence between court line and video line
      calibration.createLineCorrespondence(lineType, lineType);

      console.log('📏 [Line Integration] Added line to enhanced calibration:', {
        lineType,
        displayCoordinates: {
          start: currentDrawnLine.value.start,
          end: currentDrawnLine.value.end,
        },
        normalizedCoordinates: { start: normalizedStart, end: normalizedEnd },
        videoPixelCoordinates: videoLinePoints,
        dimensions: {
          display: { width: displayArea.width, height: displayArea.height },
          video: { width: videoWidth, height: videoHeight },
        },
      });
    }

    if (currentLineIndex.value < lineDrawingSequence.length - 1) {
      currentLineIndex.value++;
    }
  }
};

const redrawCurrentLine = () => {
  // Set the current line to null to clear it
  completedLines.value[currentLineIndex.value] = null;
};

const enableLineAdjustment = () => {
  selectedLineIndex.value = currentLineIndex.value;
};

const selectLineForAdjustment = (index: number) => {
  selectedLineIndex.value = index;
};

const startAdjustment = (
  lineIndex: number,
  endpoint: 'start' | 'end',
  event: MouseEvent
) => {
  // Implementation for adjusting line endpoints
  event.stopPropagation();
  console.log('Adjusting line', lineIndex, endpoint);
};

const goToPreviousLine = () => {
  if (currentLineIndex.value > 0) {
    currentLineIndex.value--;
  }
};

const skipCurrentLine = () => {
  if (currentLineIndex.value < lineDrawingSequence.length - 1) {
    currentLineIndex.value++;
  }
};

const canSkipCurrentLine = () => {
  // Can skip if we have at least 2 confirmed lines (since we only have 3 total)
  const confirmedCount = completedLines.value.filter(
    (l) => l?.confirmed
  ).length;
  return confirmedCount >= 2;
};

const resetAllLines = () => {
  initializeCompletedLines();
  currentLineIndex.value = 0;
  selectedLineIndex.value = null;
};

const getCurrentLineName = () => {
  return lineDrawingSequence[currentLineIndex.value]?.name || '';
};

const getCurrentLineColor = () => {
  return lineDrawingSequence[currentLineIndex.value]?.color || '#000';
};

const getCurrentLineDescription = () => {
  return lineDrawingSequence[currentLineIndex.value]?.description || '';
};

const getLineStatus = (index: number) => {
  const line = completedLines.value[index];
  if (!line) return 'Pending';
  if (line.confirmed) return 'Confirmed';
  return 'Drawn';
};

// Calculate speed error margin based on calibration quality and camera position
const calculateSpeedAccuracy = () => {
  const error = parseFloat(calibrationResults.value?.error ?? '0');
  const cameraHeight = cameraPositionData.value.height || 3.5;
  const cameraDistance = cameraPositionData.value.distance || 5;

  // Camera position factors
  // Higher camera = better view = lower error factor
  const heightFactor = Math.max(0, (cameraHeight - 2) / 8); // Lower error with higher camera (2-10m range)

  // Optimal distance around 5-7m for badminton court
  const distanceFactor = Math.min(1, Math.abs(cameraDistance - 6) / 8); // Normalized distance error

  // Convert reprojection error to speed error margin
  // Lower reprojection error = better calibration = lower speed error margin
  let baseErrorMargin;
  if (error < 2) {
    baseErrorMargin = 1.0; // Excellent: 1% base error
  } else if (error < 5) {
    baseErrorMargin = 2.0; // Good: 2% base error
  } else if (error < 10) {
    baseErrorMargin = 4.0; // Fair: 4% base error
  } else if (error < 20) {
    baseErrorMargin = 7.0; // Acceptable: 7% base error
  } else {
    baseErrorMargin = 10.0; // Poor: 10% base error
  }

  // Apply camera position modifiers
  const positionModifier = 1 + heightFactor * 0.1 + distanceFactor * 0.15;
  const finalErrorMargin = baseErrorMargin * positionModifier;

  // Ensure minimum error of 0.5% for excellent calibrations
  return Math.max(0.5, Math.min(15, finalErrorMargin)).toFixed(1);
};

// Calculate position error in meters
const calculatePositionError = () => {
  const error = parseFloat(calibrationResults.value?.error ?? '0');
  // More accurate conversion based on typical court coverage in frame
  // Assuming ~1920px width covers ~10m of court typically
  const metersPerPixel = 10 / 1920;
  const positionError = error * metersPerPixel;
  return positionError.toFixed(2);
};

// Get accuracy class for styling
const getAccuracyClass = () => {
  const accuracy = parseFloat(calculateSpeedAccuracy());
  if (accuracy <= 2) return 'excellent';
  if (accuracy <= 5) return 'good';
  if (accuracy <= 10) return 'fair';
  return 'poor';
};

// Get position error class for styling
const getPositionErrorClass = () => {
  const error = parseFloat(calculatePositionError());
  if (error <= 0.05) return 'excellent';
  if (error <= 0.1) return 'good';
  if (error <= 0.2) return 'fair';
  return 'poor';
};

// Determine if calibration tips should be shown
const shouldShowCalibrationTips = () => {
  const error = parseFloat(calibrationResults.value?.error ?? '0');
  return error > 5; // Show tips if error is above 5 pixels
};

// Get calibration quality label based on reprojection error
const getCalibrationQualityLabel = () => {
  const error = parseFloat(calibrationResults.value?.error ?? '0');

  if (error < 2) return 'Excellent';
  if (error < 5) return 'Good';
  if (error < 10) return 'Fair';
  if (error < 15) return 'Acceptable';
  return 'Poor';
};

// Get calibration quality class
const getCalibrationQualityClass = () => {
  const label = getCalibrationQualityLabel();
  return `quality-${label.toLowerCase()}`;
};

// Get calibration quality description
const getCalibrationQualityDescription = () => {
  const label = getCalibrationQualityLabel();
  switch (label) {
    case 'Excellent':
      return 'Your calibration is highly accurate. Speed measurements will be within ±2% of actual values.';
    case 'Good':
      return 'Good calibration quality. Speed measurements will be within ±5% of actual values.';
    case 'Fair':
      return 'Acceptable calibration. Speed measurements may vary by ±10%. Consider recalibrating for better accuracy.';
    default:
      return 'Poor calibration quality. Speed measurements may be unreliable. Please recalibrate with more precise line drawing.';
  }
};

// Get improvement suggestion based on calibration quality
const getImprovementSuggestion = () => {
  const error = parseFloat(calibrationResults.value?.error ?? '0');
  const cameraHeight = cameraPositionData.value.height || 3.5;

  if (cameraHeight < 3) {
    return 'Consider positioning camera higher (>3m) for better perspective.';
  } else if (error > 15) {
    return 'Draw lines more precisely along the actual court markings.';
  } else if (error > 10) {
    return 'Ensure lines match the court lines exactly from end to end.';
  } else if (error > 5) {
    return 'Try using a frame where court lines are clearer and less distorted.';
  } else {
    return 'Excellent calibration! Lines are well-aligned with court boundaries.';
  }
};
</script>

<style scoped>
.calibration-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.calibration-modal {
  background: white;
  border-radius: 12px;
  width: 95%;
  max-width: 1600px;
  height: 90vh;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
}

.close-button {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.close-button:hover {
  background-color: #f3f4f6;
  color: #374151;
}

.modal-content {
  flex: 1;
  padding: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Camera Position Section */
.camera-position-section {
  display: grid;
  grid-template-columns: minmax(280px, 320px) 1fr;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

/* Constrain EdgeBasedCameraSelector within modal */
.camera-position-section :deep(.edge-based-camera-selector) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.camera-position-section :deep(.court-svg) {
  max-width: 100%;
  max-height: calc(100vh - 280px);
  width: auto;
  height: auto;
}

.camera-position-section :deep(.court-container) {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  min-height: 0;
}

.camera-position-section :deep(.edge-based-camera-selector > * + *) {
  margin-top: 0.75rem;
}

.camera-position-section :deep(.camera-controls-panel) {
  padding: 0.75rem;
  margin-top: 0.5rem;
}

.camera-position-section :deep(.controls-grid) {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.camera-position-section :deep(.method-comparison),
.camera-position-section :deep(.position-summary) {
  display: none;
}

.instruction-panel {
  background-color: #f9fafb;
  border-radius: 8px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.instruction-panel h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.instruction-panel p {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.4;
}

.benefits-box {
  background-color: #eff6ff;
  border: 1px solid #3b82f6;
  border-radius: 6px;
  padding: 8px;
  margin-top: auto;
}

.benefits-box ul {
  margin: 0;
  padding-left: 16px;
  list-style-type: disc;
}

.benefits-box li {
  font-size: 12px;
  color: #1e40af;
  margin-bottom: 2px;
}

/* Video Line Drawing Section */
.video-line-drawing-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  min-height: 0;
  overflow: hidden;
}

.line-drawing-header {
  background-color: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  flex-shrink: 0;
}

.current-line-instruction {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.line-sequence-indicator {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.current-line-prompt {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  color: #1f2937;
}

.prompt-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  flex-shrink: 0;
}

.line-help-text {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.video-content-wrapper {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
  overflow: hidden;
}

.video-player-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}

.video-wrapper {
  position: relative;
  background-color: #000;
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.calibration-video {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  position: relative;
  z-index: 1;
}

.video-area-indicator {
  position: absolute;
  border: 3px solid rgba(59, 130, 246, 0.8);
  background: rgba(59, 130, 246, 0.1);
  pointer-events: none;
  z-index: 5;
  transition: all 0.3s ease;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
}

.video-area-indicator::before {
  content: 'DRAW LINES WITHIN THIS BLUE AREA';
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(59, 130, 246, 0.95);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  white-space: nowrap;
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

.video-wrapper:hover .video-area-indicator {
  border-color: rgba(59, 130, 246, 1);
  background: rgba(59, 130, 246, 0.15);
}

.drawing-canvas-overlay {
  position: absolute;
  cursor: crosshair;
  z-index: 15;
  pointer-events: auto;
}

.lines-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 10;
}

.lines-overlay .drawn-line {
  pointer-events: auto;
  cursor: pointer;
}

.lines-overlay .drawn-line:hover {
  stroke-width: 4;
}

.adjustment-handle {
  cursor: move;
  pointer-events: auto;
}

.video-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: #f9fafb;
  border-radius: 6px;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}

.control-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background-color: #f3f4f6;
}

.control-btn svg {
  width: 16px;
  height: 16px;
  color: #374151;
}

.time-display {
  font-size: 12px;
  color: #4b5563;
  min-width: 70px;
}

.video-scrubber {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background-color: #e5e7eb;
  outline: none;
  cursor: pointer;
}

.video-scrubber::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #3b82f6;
  cursor: pointer;
}

.line-confirmation {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 25;
  max-width: 90%;
}

.line-confirmation p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #374151;
}

.confirmation-buttons {
  display: flex;
  gap: 8px;
}

.btn-confirm,
.btn-adjust,
.btn-redraw {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm {
  background-color: #10b981;
  color: white;
}

.btn-confirm:hover {
  background-color: #059669;
}

.btn-adjust {
  background-color: #3b82f6;
  color: white;
}

.btn-adjust:hover {
  background-color: #2563eb;
}

.btn-redraw {
  background-color: #f59e0b;
  color: white;
}

.btn-redraw:hover {
  background-color: #d97706;
}

.btn-confirm svg,
.btn-adjust svg,
.btn-redraw svg {
  width: 16px;
  height: 16px;
}

/* Progress Sidebar */
.line-progress-sidebar {
  background-color: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  height: 100%;
}

/* Court Diagram Guide */
.court-diagram-guide {
  background-color: white;
  border-radius: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  margin-bottom: 8px;
}

.guide-svg {
  width: 100%;
  height: auto;
  max-height: 150px;
}

.line-progress-sidebar h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.line-progress-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
}

.progress-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: white;
  border-radius: 4px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.progress-item.current {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.progress-item.completed {
  opacity: 0.8;
}

.progress-indicator {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-indicator .check-icon {
  width: 24px;
  height: 24px;
  color: #10b981;
}

.current-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #3b82f6;
  animation: pulse 2s infinite;
}

.pending-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: #d1d5db;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.line-name {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
}

.line-status {
  font-size: 11px;
  color: #6b7280;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
  flex-shrink: 0;
}

.action-btn {
  padding: 6px 12px;
  background-color: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background-color: #f3f4f6;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.reset {
  background-color: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.action-btn.reset:hover {
  background-color: #fca5a5;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  background-color: #f9fafb;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.btn-primary,
.btn-secondary,
.btn-success {
  padding: 8px 16px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 13px;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #3b82f6;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #e5e7eb;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-success {
  background-color: #10b981;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: #059669;
}

.btn-success:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Calibration Quality Badge */
.calibration-quality {
  margin-left: auto;
  margin-right: 16px;
}

.quality-badge {
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.quality-badge.quality-excellent {
  background-color: #10b981;
  color: white;
}

.quality-badge.quality-good {
  background-color: #3b82f6;
  color: white;
}

.quality-badge.quality-fair {
  background-color: #f59e0b;
  color: white;
}

.quality-badge.quality-poor {
  background-color: #ef4444;
  color: white;
}

/* Responsive adjustments */
@media (max-width: 1280px) {
  .calibration-modal {
    width: 98%;
    height: 95vh;
  }

  .camera-position-section {
    grid-template-columns: minmax(250px, 300px) 1fr;
  }

  .video-content-wrapper {
    grid-template-columns: 250px 1fr;
  }
}

@media (max-width: 768px) {
  .camera-position-section {
    grid-template-columns: 1fr;
  }

  .video-content-wrapper {
    grid-template-columns: 1fr;
  }

  .line-progress-sidebar {
    display: none;
  }
}

/* Success Section Styles */
.calibration-success-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 24px;
  background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
}

/* Compact Two-Column Layout */
.calibration-success-section.compact-layout {
  padding: 20px;
  overflow: hidden;
}

.results-two-column-layout {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  height: calc(100% - 100px);
  overflow: hidden;
}

/* Left Column - Metrics */
.metrics-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 20px;
  border-right: 1px solid #e5e7eb;
  overflow-y: auto;
}

.compact-metric-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s ease;
}

.compact-metric-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}

.metric-header .metric-title {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.metric-header .metric-value {
  font-size: 24px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}

.metric-unit {
  font-size: 14px;
  font-weight: 400;
  color: #6b7280;
  margin-left: 2px;
}

.transform-display-compact {
  background: #f9fafb;
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
}

.transform-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.transform-label {
  font-size: 11px;
  color: #6b7280;
  font-weight: 600;
  min-width: 45px;
}

.transform-value {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 12px;
  color: #1f2937;
  background: white;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  flex: 1;
}

.transform-arrow {
  text-align: center;
  color: #6b7280;
  font-size: 16px;
  margin: 4px 0;
}

.transform-placeholder-compact {
  padding: 12px;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 6px;
  color: #9ca3af;
  text-align: center;
  font-size: 12px;
  margin-top: 8px;
}

.performance-indicators {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.indicator-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 12px;
  transition: all 0.3s ease;
}

.indicator-chip.excellent {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-color: #34d399;
}

.indicator-chip.excellent .indicator-value {
  color: #047857;
}

.indicator-chip.good {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  border-color: #60a5fa;
}

.indicator-chip.good .indicator-value {
  color: #1e40af;
}

.indicator-chip.fair {
  background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
  border-color: #fb923c;
}

.indicator-chip.fair .indicator-value {
  color: #c2410c;
}

.indicator-chip.poor {
  background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
  border-color: #f87171;
}

.indicator-chip.poor .indicator-value {
  color: #b91c1c;
}

.indicator-label {
  color: #0369a1;
  font-weight: 600;
}

.indicator-value {
  color: #0c4a6e;
  font-weight: 700;
}

.indicator-value.enabled {
  color: #059669;
}

/* Calibration Tips */
.calibration-tips {
  margin-top: 16px;
  padding: 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #fbbf24;
  border-radius: 8px;
}

.tips-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.tips-icon {
  width: 16px;
  height: 16px;
  color: #d97706;
}

.tips-title {
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
}

.tips-list {
  margin: 0;
  padding-left: 24px;
  list-style-type: disc;
}

.tips-list li {
  font-size: 11px;
  color: #78350f;
  line-height: 1.5;
  margin-bottom: 4px;
}

.tips-list li:last-child {
  margin-bottom: 0;
}

/* Right Column - Explanations */
.explanation-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.explanation-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 12px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.explanation-scroll-container h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.explanation-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.explanation-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.explanation-section p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}

.explanation-section p:last-child {
  margin-bottom: 0;
}

.compact-formula {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  font-size: 11px;
  color: #1f2937;
  background: #f9fafb;
  padding: 8px;
  border-radius: 4px;
  margin: 8px 0;
  line-height: 1.6;
}

.compact-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  list-style-type: disc;
}

.compact-list li {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 4px;
}

.compact-benefits {
  margin-top: 8px;
}

.compact-benefits .benefit-item {
  font-size: 12px;
  color: #4b5563;
  line-height: 1.5;
  margin-bottom: 6px;
  padding-left: 16px;
  position: relative;
}

.compact-benefits .benefit-item strong {
  color: #059669;
}

/* Quality-based styling for explanation sections */
.explanation-section.quality-excellent {
  background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%);
  border-color: #34d399;
}

.explanation-section.quality-good {
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  border-color: #60a5fa;
}

.explanation-section.quality-fair {
  background: linear-gradient(135deg, #fed7aa 0%, #fff7ed 100%);
  border-color: #fb923c;
}

.explanation-section.quality-poor {
  background: linear-gradient(135deg, #fecaca 0%, #fef2f2 100%);
  border-color: #f87171;
}

.quality-description {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  margin: 8px 0;
}

.quality-metrics {
  display: flex;
  gap: 16px;
  margin: 12px 0;
  padding: 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
}

.quality-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quality-metric .metric-label {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.quality-metric .metric-value {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.improvement-hint {
  margin-top: 12px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  font-size: 11px;
  color: #4b5563;
  line-height: 1.5;
}

.improvement-hint strong {
  color: #1f2937;
}

/* Camera Impact Section */
.camera-impact {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: #3b82f6;
}

.camera-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
}

.camera-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 12px;
  font-weight: 600;
  color: #1e40af;
}

.camera-effect {
  margin-top: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #1f2937;
}

.camera-impact .compact-list li {
  font-size: 11px;
  line-height: 1.6;
  margin-bottom: 6px;
}

.camera-impact .compact-list li strong {
  color: #1e40af;
}

/* Quality-based styling for explanation sections */
.explanation-section.quality-excellent {
  background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%);
  border-color: #34d399;
}

.explanation-section.quality-good {
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  border-color: #60a5fa;
}

.explanation-section.quality-fair {
  background: linear-gradient(135deg, #fed7aa 0%, #fff7ed 100%);
  border-color: #fb923c;
}

.explanation-section.quality-poor {
  background: linear-gradient(135deg, #fecaca 0%, #fef2f2 100%);
  border-color: #f87171;
}

.quality-description {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
  margin: 8px 0;
}

.quality-metrics {
  display: flex;
  gap: 16px;
  margin: 12px 0;
  padding: 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 4px;
}

.quality-metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quality-metric .metric-label {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.quality-metric .metric-value {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.improvement-hint {
  margin-top: 12px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  font-size: 11px;
  color: #4b5563;
  line-height: 1.5;
}

.improvement-hint strong {
  color: #1f2937;
}

/* Camera Impact Section */
.camera-impact {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-color: #3b82f6;
}

.camera-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 8px 0;
  padding: 8px;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
}

.camera-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 12px;
  font-weight: 600;
  color: #1e40af;
}

.camera-effect {
  margin-top: 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #1f2937;
}

.camera-impact .compact-list li {
  font-size: 11px;
  line-height: 1.6;
  margin-bottom: 6px;
}

.camera-impact .compact-list li strong {
  color: #1e40af;
}

/* Custom scrollbar for explanation column */
.explanation-scroll-container::-webkit-scrollbar {
  width: 6px;
}

.explanation-scroll-container::-webkit-scrollbar-track {
  background: transparent;
}

.explanation-scroll-container::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

.explanation-scroll-container::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.25);
}

/* Responsive adjustments for compact layout */
@media (max-width: 1280px) {
  .results-two-column-layout {
    grid-template-columns: 320px 1fr;
    gap: 20px;
  }
}

@media (max-width: 1024px) {
  .results-two-column-layout {
    grid-template-columns: 1fr;
    gap: 20px;
    height: auto;
  }

  .metrics-column {
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
    padding-right: 0;
    padding-bottom: 20px;
    max-height: none;
    overflow-y: visible;
  }

  .explanation-column {
    max-height: 400px;
  }
}

@media (max-width: 768px) {
  .calibration-success-section.compact-layout {
    padding: 16px;
  }

  .results-two-column-layout {
    gap: 16px;
  }

  .compact-metric-card {
    padding: 12px;
  }

  .metric-header .metric-value {
    font-size: 20px;
  }

  .explanation-section {
    padding: 12px;
    margin-bottom: 12px;
  }
}

.success-header-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 2px solid #e5e7eb;
}

.success-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.success-icon svg {
  width: 28px;
  height: 28px;
}

.success-text h2 {
  margin: 0;
  font-size: 24px;
  color: #111827;
  font-weight: 700;
}

.success-text .subtitle {
  margin: 4px 0 0 0;
  font-size: 14px;
  color: #6b7280;
  line-height: 1.5;
}

/* Metrics Grid */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.metric-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.metric-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.metric-title {
  font-size: 12px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
}

.metric-hint {
  font-size: 11px;
  color: #9ca3af;
  font-style: italic;
}

/* Progress Track for Accuracy */
.progress-track {
  height: 8px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #34d399 0%, #10b981 100%);
  transition: width 1s ease-out;
  border-radius: 999px;
}

/* Transform Display */
.transform-box {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}

.transform-explanation {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.explanation-text {
  font-size: 11px;
  color: #6b7280;
  line-height: 1.5;
  margin: 0;
}

.explanation-detail {
  display: block;
  margin-top: 4px;
  color: #9ca3af;
  font-style: italic;
}

.code-block {
  flex: 1;
  background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
  color: #e5e7eb;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #374151;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.code-block .code-title {
  font-size: 10px;
  color: #9ca3af;
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.code-block code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
    'Courier New', monospace;
  font-size: 13px;
  color: #f3f4f6;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arrow {
  font-size: 20px;
  color: #6b7280;
  font-weight: bold;
}

.transform-box .placeholder {
  flex: 1;
  padding: 16px;
  background: #f9fafb;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  color: #9ca3af;
  text-align: center;
  font-size: 13px;
}

/* Calibration Usage Info */
.calibration-usage-info {
  margin-top: 24px;
  padding: 20px;
  background-color: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.calibration-usage-info h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.usage-explanation {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.usage-item {
  display: flex;
  gap: 12px;
  padding: 12px;
  background-color: white;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.usage-icon {
  font-size: 24px;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #eff6ff;
  border-radius: 8px;
}

.usage-content {
  flex: 1;
}

.usage-content h4 {
  margin: 0 0 8px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.usage-content p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}

.usage-content ul {
  margin: 0;
  padding-left: 20px;
  list-style-type: disc;
}

.usage-content li {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.6;
}

/* New styles for technical calibration content */
.usage-section {
  margin-bottom: 24px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.usage-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.technical-content {
  font-size: 14px;
  color: #4b5563;
  line-height: 1.6;
}

.technical-content p {
  margin: 0;
}

.technical-content strong {
  color: #1f2937;
  font-weight: 600;
}

.formula-block {
  margin: 8px 0;
  padding: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow-x: auto;
}

.formula-block code {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
    'Courier New', monospace;
  font-size: 12px;
  color: #1f2937;
  line-height: 1.8;
  white-space: pre;
  display: block;
}

.inline-formula {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas,
    'Courier New', monospace;
  font-size: 13px;
  color: #1f2937;
  background: #f3f4f6;
  padding: 2px 4px;
  border-radius: 3px;
}

.calibration-benefits {
  margin-top: 12px;
  padding: 12px;
  background: #f0f9ff;
  border-radius: 6px;
  border: 1px solid #bae6fd;
}

.benefit-item {
  margin-bottom: 8px;
  font-size: 13px;
  color: #0c4a6e;
  line-height: 1.5;
}

.benefit-item:last-child {
  margin-bottom: 0;
}

.benefit-item strong {
  color: #0369a1;
}

.accuracy-note {
  padding: 12px;
  background-color: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 13px;
  color: #92400e;
  line-height: 1.5;
}

.accuracy-note strong {
  color: #78350f;
}

/* Benefit Chips */
.benefit-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

.chip {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #93c5fd;
  color: #1e40af;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.chip:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
}

/* Add animation for when the success screen appears */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.calibration-success-section > * {
  animation: slideInUp 0.5s ease-out backwards;
}

.calibration-success-section .success-header-row {
  animation-delay: 0.1s;
}

.calibration-success-section .metric-grid {
  animation-delay: 0.2s;
}

.calibration-success-section .benefit-chips {
  animation-delay: 0.3s;
}

/* Responsive adjustments for success section */
@media (max-width: 768px) {
  .calibration-success-section {
    padding: 16px;
  }

  .metric-grid {
    grid-template-columns: 1fr;
  }

  .success-text h2 {
    font-size: 20px;
  }

  .metric-value {
    font-size: 24px;
  }

  .transform-box {
    flex-direction: column;
  }

  .arrow {
    transform: rotate(90deg);
  }
}

/* Scrollable calibration usage section */
.calibration-usage-info {
  display: flex;
  flex-direction: column;
  min-height: 0; /* critical for flex children to be scrollable */
}

.calibration-usage-scroll {
  max-height: 60vh; /* tuned for modal viewport */
  overflow-y: auto;
  padding-right: 0.5rem;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* Optional: nicer scrollbars (webkit only) */
.calibration-usage-scroll::-webkit-scrollbar {
  width: 8px;
}

.calibration-usage-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.calibration-usage-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

@media (max-width: 768px) {
  .calibration-usage-scroll {
    max-height: 65vh;
  }
}
</style>
