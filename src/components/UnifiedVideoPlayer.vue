<!-- eslint-disable vue/comment-directive -->
<template>
  <div class="unified-video-player">
    <!-- Single Video Mode -->
    <div v-if="mode === 'single'" class="single-video-container">
      <div ref="singleVideoContainer" class="video-wrapper">
        <!-- Loading indicator for single video -->
        <div v-if="singleVideoState.isLoading" class="loading-overlay">
          <div class="loading-spinner" />
          <div class="loading-text">Loading video...</div>
        </div>

        <!-- Error message -->
        <div v-if="singleVideoState.error" class="error-overlay">
          <svg
            class="error-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <p class="error-message">
            {{ singleVideoState.error }}
          </p>
          <button class="retry-button" @click="singleVideoState.error = null">
            Try Again
          </button>
        </div>

        <!-- Placeholder when no video URL -->
        <div v-if="!props.videoUrl" class="no-video-placeholder">
          <svg
            class="placeholder-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <h3 class="placeholder-title">No Video Loaded</h3>
          <p class="placeholder-description">
            Please upload a MP4 video to start annotating.
          </p>
        </div>

        <!-- Single Video Element -->
        <video
          v-else
          ref="singleVideoElement"
          class="video-element"
          :class="{ 'video-fade-transition': isVideoTransitioning }"
          :style="{ opacity: videoOpacity }"
          :src="props.videoUrl"
          :poster="posterAttr"
          :autoplay="autoplayAttr"
          preload="metadata"
          crossorigin="anonymous"
          @click="handleVideoClick"
        >
          Your browser does not support the video tag.
        </video>

        <!-- Drawing Canvas Overlay for Single Video -->
        <DrawingCanvas
          v-if="props.videoUrl && drawingCanvas"
          ref="singleDrawingCanvasRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvas?.isDrawingMode?.value ?? false"
          :stroke-width="drawingCanvas?.currentTool?.value?.strokeWidth ?? 3"
          :severity="
            drawingCanvas?.currentTool?.value?.severity ?? defaultSeverity
          "
          :current-color="resolveCanvasColor(drawingCanvas) ?? '#ef4444'"
          :existing-drawings="drawingCanvas?.allDrawings?.value ?? []"
          :is-loading-drawings="
            drawingCanvas?.isLoadingDrawings?.value ?? false
          "
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />

        <!-- Pose Visualization Overlay for Single Video -->
        <PoseVisualization
          v-if="props.videoUrl && poseLandmarker"
          :current-pose="poseLandmarker.getCurrentPose"
          :canvas-width="singleVideoElement?.videoWidth || 1920"
          :canvas-height="singleVideoElement?.videoHeight || 1080"
          :show-pose="poseLandmarker.isEnabled.value"
          :show-skeleton="poseVisualizationSettings.showSkeleton"
          :show-landmarks="poseVisualizationSettings.showLandmarks"
          :show-labels="poseVisualizationSettings.showLabels"
          :show-confidence="poseVisualizationSettings.showConfidence"
          :show-center-of-mass="poseVisualizationSettings.showCenterOfMass"
          :speed-metrics="poseLandmarker?.speedMetrics"
          :selected-keypoints="poseLandmarker?.selectedKeypoints?.value || []"
          :current-r-o-i="roiSettings.currentROI"
          :use-r-o-i="roiSettings.enabled"
        />

        <!-- Enhanced ROI Selector Overlay for Single Video -->
        <ROISelector
          v-if="props.videoUrl && poseLandmarker && roiSettings.enabled"
          :canvas-width="singleVideoElement?.videoWidth || 1920"
          :canvas-height="singleVideoElement?.videoHeight || 1080"
          :current-r-o-i="roiSettings.currentROI"
          :predicted-r-o-i="roiSettings.predictedROI"
          :roi-history="roiSettings.roiHistory"
          :roi-confidence="roiSettings.roiConfidence"
          :stability-metrics="roiSettings.stabilityMetrics"
          :motion-prediction="(roiSettings as any).useMotionPrediction"
          :show-roi="roiSettings.showROI"
          :show-prediction="roiSettings.showPrediction"
          :show-history="roiSettings.showHistory"
          :show-instructions="roiSettings.showInstructions"
          :show-stats="roiSettings.showStats"
          :enabled="roiSettings.enabled"
          @roi-selected="handleROISelected"
          @roi-updated="handleROIUpdated"
          @roi-cleared="handleROICleared"
          @motion-prediction-toggled="handleMotionPredictionToggled"
        />

        <!-- CalibrationOverlay moved to App.vue level for better positioning -->

        <!-- Heatmap Minimap for Position Tracking -->
        <HeatmapMinimap
          :is-visible="showHeatmapMinimap"
          :heatmap-data="heatmapDataComputed"
          :current-position="currentPositionComputed"
          :court-dimensions="courtDimensionsComputed"
          :total-distance="totalDistanceComputed"
          :average-speed="averageSpeedComputed"
          :most-visited-zone="mostVisitedZoneComputed"
          :total-samples="totalSamplesComputed"
          :get-zone-name="positionHeatmap.getZoneName"
          @close="showHeatmapMinimap = false"
        />

        <!-- Speed Visualization for Single Video is handled by App.vue -->

        <!-- Custom controls for single video -->
        <div
          v-if="controlsAttr && props.videoUrl && !singleVideoState.isLoading"
          class="video-controls"
        >
          <div class="controls-content">
            <div class="controls-left">
              <!-- Play/Pause button -->
              <button
                class="control-button"
                :aria-label="isPlaying ? 'Pause' : 'Play'"
                @click="togglePlayPause"
              >
                <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <svg v-else class="control-icon" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              </button>

              <!-- Volume controls -->
              <div class="volume-controls">
                <button
                  class="control-button"
                  :aria-label="isMuted ? 'Unmute' : 'Mute'"
                  @click="toggleMute"
                >
                  <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                  <svg
                    v-else-if="volume < 0.5"
                    class="control-icon"
                    viewBox="0 0 24 24"
                  >
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <svg v-else class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  :value="isMuted ? 0 : volume"
                  class="volume-slider"
                  :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
                  @input="handleVolumeChange"
                />
              </div>

              <!-- Speed controls -->
              <div class="speed-controls">
                <select
                  :value="playbackSpeed"
                  class="speed-select"
                  :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
                  @change="handleSpeedSelect($event)"
                >
                  <!-- @ts-expect-error: DOM typing -->
                  <option value="0.1">0.1x</option>
                  <option value="0.25">0.25x</option>
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>

              <!-- Pose detection controls -->
              <div v-if="poseLandmarker" class="pose-controls">
                <div class="pose-toggle-wrapper">
                  <button
                    class="control-button"
                    :class="{
                      'pose-active': poseLandmarker.isEnabled.value,
                      'pose-loading': poseLandmarker.isLoading.value,
                    }"
                    :disabled="
                      poseLandmarker.isLoading.value || !isCalibrationReady
                    "
                    :aria-label="
                      poseLandmarker.isLoading.value
                        ? 'Loading pose detection...'
                        : !isCalibrationReady
                        ? 'Calibrate camera to enable pose visualization'
                        : poseLandmarker.isEnabled.value
                        ? 'Disable pose visualization'
                        : 'Enable pose visualization'
                    "
                    :title="
                      poseLandmarker.isLoading.value
                        ? 'Loading pose detection...'
                        : !isCalibrationReady
                        ? 'Calibrate camera first to enable pose visualization'
                        : poseLandmarker.isEnabled.value
                        ? 'Disable pose visualization'
                        : 'Enable pose visualization'
                    "
                    @click="togglePoseDetection"
                  >
                    <!-- Loading spinner -->
                    <div
                      v-if="poseLandmarker.isLoading.value"
                      class="pose-loading-spinner"
                    />
                    <!-- Pose icon -->
                    <svg
                      v-else
                      class="control-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <circle cx="12" cy="5" r="2" />
                      <path d="M12 7v5" />
                      <path d="M10 12h4" />
                      <path d="M8 17l2-5 2 5" />
                      <path d="M16 17l-2-5-2 5" />
                    </svg>
                  </button>
                  <span
                    v-if="
                      mode === 'single' &&
                      poseLandmarker &&
                      speedToggleIndicatorVisible &&
                      !poseLandmarker.isEnabled.value
                    "
                    class="speed-toggle-indicator"
                    aria-hidden="true"
                  />
                  <div v-if="poseTooltipVisible" class="pose-next-step-tooltip">
                    Next step: start speed calculation
                  </div>
                </div>

                <!-- Labels toggle (only show when pose detection is enabled) -->
                <button
                  v-if="poseLandmarker.isEnabled.value"
                  class="control-button"
                  :class="{
                    'pose-active': poseVisualizationSettings.showLabels,
                  }"
                  title="Toggle skeleton labels"
                  @click="
                    poseVisualizationSettings.showLabels =
                      !poseVisualizationSettings.showLabels
                  "
                >
                  <svg
                    class="control-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <!-- "Tag" icon -->
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M6 6h.008v.008H6V6z"
                    />
                  </svg>
                </button>

                <!-- Camera Calibration Button -->
                <div class="calibration-toggle-wrapper">
                  <button
                    class="control-button"
                    :class="{
                      'pose-active':
                        cameraCalibration.cameraParameters.position !== null,
                      calibrated:
                        cameraCalibration.cameraParameters.position !== null,
                    }"
                    :title="
                      cameraCalibration.cameraParameters.position !== null
                        ? 'Camera calibrated - Click to recalibrate'
                        : 'Calibrate camera angle'
                    "
                    @click="$emit('toggle-calibration')"
                  >
                    <svg
                      class="control-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.5"
                    >
                      <!-- "Cube Transparent" icon -->
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
                      />
                    </svg>
                  </button>
                  <div
                    v-if="calibrationTooltipVisible"
                    class="calibration-next-step-tooltip"
                  >
                    Start by calibrating the camera
                  </div>
                </div>

                <!-- Heatmap Toggle Button (disabled until calibration is complete) -->
                <button
                  class="control-button"
                  :class="{
                    'pose-active':
                      showHeatmapMinimap || positionHeatmap.isTracking,
                  }"
                  :disabled="
                    cameraCalibration.cameraParameters.position === null
                  "
                  :title="
                    cameraCalibration.cameraParameters.position === null
                      ? 'Calibrate camera first to enable heatmap'
                      : positionHeatmap.isTracking.value
                      ? 'Position tracking active - Click to toggle heatmap'
                      : 'Start position tracking'
                  "
                  @click="toggleHeatmap"
                >
                  <svg
                    class="control-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <!-- Heatmap icon - simplified grid with heat spots -->
                    <!-- Grid lines -->
                    <path d="M3 3h18v18H3z" />
                    <path d="M3 9h18M3 15h18" />
                    <path d="M9 3v18M15 3v18" />

                    <!-- Heat spots -->
                    <circle
                      cx="6"
                      cy="6"
                      r="1.5"
                      fill="currentColor"
                      opacity="0.3"
                    />
                    <circle
                      cx="12"
                      cy="6"
                      r="1.5"
                      fill="currentColor"
                      opacity="0.6"
                    />
                    <circle
                      cx="18"
                      cy="12"
                      r="1.5"
                      fill="currentColor"
                      opacity="0.9"
                    />
                    <circle
                      cx="6"
                      cy="18"
                      r="1.5"
                      fill="currentColor"
                      opacity="0.5"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="2"
                      fill="currentColor"
                      opacity="0.8"
                    />
                  </svg>
                </button>

                <!-- Keypoint Selection Button (only show when pose detection is enabled) -->
                <button
                  v-if="poseLandmarker.isEnabled.value"
                  class="control-button"
                  :class="{
                    'pose-active': showKeypointSelector,
                  }"
                  title="Select keypoints to track"
                  @click="openKeypointSelector"
                >
                  <svg
                    class="control-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                    <circle cx="5" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="7.5" cy="7.5" r="1" />
                    <circle cx="16.5" cy="7.5" r="1" />
                    <circle cx="7.5" cy="16.5" r="1" />
                    <circle cx="16.5" cy="16.5" r="1" />
                  </svg>
                </button>

                <!-- ROI toggle (only show when pose detection is enabled) -->
                <button
                  v-if="poseLandmarker.isEnabled.value"
                  class="control-button"
                  :class="{ 'pose-active': roiSettings.enabled }"
                  title="Toggle ROI selection"
                  @click="toggleROIMode"
                >
                  ROI
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dual Video Mode -->
    <div v-else-if="mode === 'dual'" class="dual-video-container">
      <div class="videos-grid">
        <!-- Video A -->
        <div class="video-section">
          <div class="video-label">Video A</div>
          <div class="video-wrapper">
            <!-- Loading indicator for Video A -->
            <div
              v-if="!videoAStateResolved?.isLoaded && videoAUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner" />
              <div class="loading-text">Loading Video A...</div>
            </div>

            <!-- Video A Element -->
            <video
              v-if="videoAUrl"
              ref="videoAElement"
              class="video-element"
              :class="{ 'video-fade-transition': isVideoTransitioning }"
              :style="{ opacity: videoOpacity }"
              :src="videoAUrl"
              preload="metadata"
              crossorigin="anonymous"
              @click="handleVideoClick"
            >
              Your browser does not support the video tag.
            </video>

            <!-- Drawing Canvas Overlay for Video A -->
            <DrawingCanvas
              v-if="videoAUrl && drawingCanvasA"
              ref="drawingCanvasARef"
              :current-frame="
                props.dualVideoPlayer?.videoACurrentFrame?.value || 0
              "
              :is-drawing-mode="drawingCanvasA?.isDrawingMode?.value ?? false"
              :stroke-width="
                drawingCanvasA?.currentTool?.value?.strokeWidth ?? 3
              "
              :severity="
                drawingCanvasA?.currentTool?.value?.severity ?? defaultSeverity
              "
              :current-color="resolveCanvasColor(drawingCanvasA) ?? '#ef4444'"
              :existing-drawings="drawingCanvasA?.allDrawings?.value ?? []"
              :is-loading-drawings="
                drawingCanvasA?.isLoadingDrawings?.value ?? false
              "
              :video-context="'A'"
              @drawing-created="
                (drawing: DrawingData, event?: Event) =>
                  handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing: DrawingData, event?: Event) =>
                  handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId: string, event?: Event) =>
                  handleDrawingDeleted(drawingId, event)
              "
            />

            <!-- Pose Detection Error Overlay for Video A -->
            <div v-if="poseDetectionErrorA" class="pose-error-overlay">
              <div class="pose-error-content">
                <svg
                  class="pose-error-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p class="pose-error-message">
                  {{ poseDetectionErrorA }}
                </p>
              </div>
            </div>

            <!-- Pose Visualization Overlay for Video A -->
            <PoseVisualization
              v-if="videoAUrl && poseLandmarkerA"
              :current-pose="poseLandmarkerA.getCurrentPose"
              :canvas-width="videoAElement?.videoWidth || 1920"
              :canvas-height="videoAElement?.videoHeight || 1080"
              :show-pose="poseLandmarkerA.isEnabled.value"
              :show-skeleton="poseVisualizationSettings.showSkeleton"
              :show-landmarks="poseVisualizationSettings.showLandmarks"
              :show-labels="poseVisualizationSettings.showLabels"
              :show-confidence="poseVisualizationSettings.showConfidence"
              :show-center-of-mass="poseVisualizationSettings.showCenterOfMass"
              :speed-metrics="poseLandmarkerA?.speedMetrics"
              :selected-keypoints="
                poseLandmarkerA?.selectedKeypoints?.value || []
              "
              :current-r-o-i="roiSettingsA.currentROI"
              :use-r-o-i="roiSettingsA.enabled"
            />

            <!-- Enhanced ROI Selector Overlay for Video A -->
            <ROISelector
              v-if="videoAUrl && poseLandmarkerA && roiSettingsA.enabled"
              :canvas-width="videoAElement?.videoWidth || 1920"
              :canvas-height="videoAElement?.videoHeight || 1080"
              :current-r-o-i="roiSettingsA.currentROI"
              :predicted-r-o-i="roiSettingsA.predictedROI"
              :roi-history="roiSettingsA.roiHistory"
              :roi-confidence="roiSettingsA.roiConfidence"
              :stability-metrics="roiSettingsA.stabilityMetrics"
              :motion-prediction="(roiSettingsA as any).useMotionPrediction"
              :show-roi="roiSettingsA.showROI"
              :show-prediction="roiSettingsA.showPrediction"
              :show-history="roiSettingsA.showHistory"
              :show-instructions="roiSettingsA.showInstructions"
              :show-stats="false"
              :show-confidence-in-label="false"
              :enabled="roiSettingsA.enabled"
              @roi-selected="(roi: any) => handleROISelected(roi, 'A')"
              @roi-updated="(roi: any) => handleROIUpdated(roi, 'A')"
              @roi-cleared="() => handleROICleared('A')"
              @motion-prediction-toggled="
                () => handleMotionPredictionToggled('A')
              "
            />

            <!-- Speed Visualization Overlay for Video A is disabled in dual mode -->
            <SpeedVisualization
              v-if="false"
              :speed-metrics="poseLandmarkerA?.speedMetrics"
              :canvas-width="videoAElement?.videoWidth || 1920"
              :canvas-height="videoAElement?.videoHeight || 1080"
              :video-loaded="!!videoAUrl"
              :current-timestamp="currentTime"
              :current-frame="currentFrame"
            />
          </div>

          <!-- External Speed Panel for Video A moved into "Video A - Movement Speed" container -->
        </div>

        <!-- Video B -->
        <div class="video-section">
          <div class="video-label">Video B</div>
          <div class="video-wrapper">
            <!-- Loading indicator for Video B -->
            <div
              v-if="!videoBStateResolved?.isLoaded && videoBUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner" />
              <div class="loading-text">Loading Video B...</div>
            </div>

            <!-- Video B Element -->
            <video
              v-if="videoBUrl"
              ref="videoBElement"
              class="video-element"
              :class="{ 'video-fade-transition': isVideoTransitioning }"
              :style="{ opacity: videoOpacity }"
              :src="videoBUrl"
              preload="metadata"
              crossorigin="anonymous"
              @click="handleVideoClick"
            >
              Your browser does not support the video tag.
            </video>

            <!-- Drawing Canvas Overlay for Video B -->
            <DrawingCanvas
              v-if="videoBUrl && drawingCanvasB"
              ref="drawingCanvasBRef"
              :current-frame="
                props.dualVideoPlayer?.videoBCurrentFrame?.value || 0
              "
              :is-drawing-mode="drawingCanvasB?.isDrawingMode?.value ?? false"
              :stroke-width="
                drawingCanvasB?.currentTool?.value?.strokeWidth ?? 3
              "
              :severity="
                drawingCanvasB?.currentTool?.value?.severity ?? defaultSeverity
              "
              :current-color="resolveCanvasColor(drawingCanvasB) ?? '#ef4444'"
              :existing-drawings="drawingCanvasB?.allDrawings?.value ?? []"
              :is-loading-drawings="
                drawingCanvasB?.isLoadingDrawings?.value ?? false
              "
              :video-context="'B'"
              @drawing-created="
                (drawing: DrawingData, event?: Event) =>
                  handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing: DrawingData, event?: Event) =>
                  handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId: string, event?: Event) =>
                  handleDrawingDeleted(drawingId, event)
              "
            />

            <!-- Pose Detection Error Overlay for Video B -->
            <div v-if="poseDetectionErrorB" class="pose-error-overlay">
              <div class="pose-error-content">
                <svg
                  class="pose-error-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <p class="pose-error-message">
                  {{ poseDetectionErrorB }}
                </p>
              </div>
            </div>

            <!-- Pose Visualization Overlay for Video B -->
            <PoseVisualization
              v-if="videoBUrl && poseLandmarkerB"
              :current-pose="poseLandmarkerB.getCurrentPose"
              :canvas-width="videoBElement?.videoWidth || 1920"
              :canvas-height="videoBElement?.videoHeight || 1080"
              :show-pose="poseLandmarkerB.isEnabled.value"
              :show-skeleton="poseVisualizationSettings.showSkeleton"
              :show-landmarks="poseVisualizationSettings.showLandmarks"
              :show-labels="poseVisualizationSettings.showLabels"
              :show-confidence="poseVisualizationSettings.showConfidence"
              :show-center-of-mass="poseVisualizationSettings.showCenterOfMass"
              :speed-metrics="poseLandmarkerB?.speedMetrics"
              :selected-keypoints="
                poseLandmarkerB?.selectedKeypoints?.value || []
              "
              :current-r-o-i="roiSettingsB.currentROI"
              :use-r-o-i="roiSettingsB.enabled"
            />

            <!-- Enhanced ROI Selector Overlay for Video B -->
            <ROISelector
              v-if="videoBUrl && poseLandmarkerB && roiSettingsB.enabled"
              :canvas-width="videoBElement?.videoWidth || 1920"
              :canvas-height="videoBElement?.videoHeight || 1080"
              :current-r-o-i="roiSettingsB.currentROI"
              :predicted-r-o-i="roiSettingsB.predictedROI"
              :roi-history="roiSettingsB.roiHistory"
              :roi-confidence="roiSettingsB.roiConfidence"
              :stability-metrics="roiSettingsB.stabilityMetrics"
              :motion-prediction="(roiSettingsB as any).useMotionPrediction"
              :show-roi="roiSettingsB.showROI"
              :show-prediction="roiSettingsB.showPrediction"
              :show-history="roiSettingsB.showHistory"
              :show-instructions="roiSettingsB.showInstructions"
              :show-stats="false"
              :show-confidence-in-label="false"
              :enabled="roiSettingsB.enabled"
              @roi-selected="(roi: any) => handleROISelected(roi, 'B')"
              @roi-updated="(roi: any) => handleROIUpdated(roi, 'B')"
              @roi-cleared="() => handleROICleared('B')"
              @motion-prediction-toggled="
                () => handleMotionPredictionToggled('B')
              "
            />

            <!-- Speed Visualization Overlay for Video B is disabled in dual mode -->
            <SpeedVisualization
              v-if="false"
              :speed-metrics="poseLandmarkerB?.speedMetrics"
              :canvas-width="videoBElement?.videoWidth || 1920"
              :canvas-height="videoBElement?.videoHeight || 1080"
              :video-loaded="!!videoBUrl"
              :current-timestamp="currentTime"
              :current-frame="currentFrame"
            />
          </div>

          <!-- External Speed Panel for Video B moved into "Video B - Movement Speed" container -->
        </div>
      </div>

      <!-- Movement Speed containers under the dual comparison videos -->
      <div
        v-if="
          (videoAUrl &&
            poseLandmarkerA &&
            poseLandmarkerA.isEnabled.value &&
            poseLandmarkerA.speedMetrics &&
            poseLandmarkerA.speedMetrics.value &&
            poseLandmarkerA.speedMetrics.value.isValid) ||
          (videoBUrl &&
            poseLandmarkerB &&
            poseLandmarkerB.isEnabled.value &&
            poseLandmarkerB.speedMetrics &&
            poseLandmarkerB.speedMetrics.value &&
            poseLandmarkerB.speedMetrics.value.isValid)
        "
        class="dual-speed-panels"
      >
        <!-- Video A - Movement Speed -->
        <div
          v-if="
            videoAUrl &&
            poseLandmarkerA &&
            poseLandmarkerA.isEnabled.value &&
            poseLandmarkerA.speedMetrics &&
            poseLandmarkerA.speedMetrics.value &&
            poseLandmarkerA.speedMetrics.value.isValid
          "
          class="movement-speed-container"
        >
          <div class="dual-speed-content">
            <!-- Mini-cards on the left -->
            <div class="speed-mini-cards">
              <div
                v-if="
                  poseLandmarkerA?.speedMetrics &&
                  poseLandmarkerA.speedMetrics.value &&
                  poseLandmarkerA.speedMetrics.value.isValid
                "
                class="speed-panel-container-dual"
              >
                <h3
                  class="text-sm font-semibold mb-1 text-center text-gray-800"
                >
                  Speed (m/s)
                </h3>

                <!-- 2x2 compact grid: Overall, Horizontal, Right Foot, CoM Height -->
                <div class="grid grid-cols-2 gap-1 mb-1">
                  <!-- Overall Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Overall</div>
                    <div
                      class="mini-value"
                      :class="
                        getSpeedColorClass(
                          poseLandmarkerA.speedMetrics.value.speed
                        )
                      "
                    >
                      {{ poseLandmarkerA.speedMetrics.value.speed.toFixed(2) }}
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-1 mt-0.5">
                      <div
                        class="h-1 rounded-full transition-all duration-300"
                        :class="
                          getSpeedBarColorClass(
                            poseLandmarkerA.speedMetrics.value.speed
                          )
                        "
                        :style="{
                          width: `${Math.min(
                            100,
                            (poseLandmarkerA.speedMetrics.value.speed /
                              maxSpeedForBar) *
                              100
                          )}%`,
                        }"
                      />
                    </div>
                  </div>

                  <!-- Horizontal Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Horizontal</div>
                    <div class="mini-value text-gray-700">
                      {{
                        poseLandmarkerA.speedMetrics.value.generalMovingSpeed?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>

                  <!-- Right Foot Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Right Foot</div>
                    <div class="mini-value text-gray-600">
                      {{
                        poseLandmarkerA.speedMetrics.value.rightFootSpeed?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>

                  <!-- CoM Height -->
                  <div class="mini-card">
                    <div class="mini-label">CoM Height</div>
                    <div class="mini-value text-gray-700">
                      {{
                        poseLandmarkerA.speedMetrics.value.centerOfGravityHeight?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>
                </div>

                <!-- Chart Controls (always visible) -->
                <div class="grid grid-cols-2 gap-1 mt-2">
                  <!-- Duration Control -->
                  <div class="mini-card">
                    <div class="mini-label">Duration</div>
                    <select v-model="chartDurationA" class="mini-select">
                      <option :value="10">10s</option>
                      <option :value="30">30s</option>
                      <option :value="60">1min</option>
                      <option :value="120">2min</option>
                    </select>
                  </div>

                  <!-- Max Speed Control -->
                  <div class="mini-card">
                    <div class="mini-label">Max Speed</div>
                    <select v-model="maxSpeedScaleA" class="mini-select">
                      <option :value="1">1 m/s</option>
                      <option :value="2">2 m/s</option>
                      <option :value="5">5 m/s</option>
                    </select>
                  </div>
                </div>
              </div>
              <div v-else class="speed-panel-container-dual">
                <h3
                  class="text-sm font-semibold mb-1 text-center text-gray-800"
                >
                  Speed (m/s)
                </h3>
                <div class="text-sm text-gray-600 text-center py-2 mb-2">
                  No speed data available
                </div>

                <!-- Chart Controls (always visible) -->
                <div class="grid grid-cols-2 gap-1">
                  <!-- Duration Control -->
                  <div class="mini-card">
                    <div class="mini-label">Duration</div>
                    <select v-model="chartDurationA" class="mini-select">
                      <option :value="10">10s</option>
                      <option :value="30">30s</option>
                      <option :value="60">1min</option>
                      <option :value="120">2min</option>
                    </select>
                  </div>

                  <!-- Max Speed Control -->
                  <div class="mini-card">
                    <div class="mini-label">Max Speed</div>
                    <select v-model="maxSpeedScaleA" class="mini-select">
                      <option :value="1">1 m/s</option>
                      <option :value="2">2 m/s</option>
                      <option :value="5">5 m/s</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Chart on the right -->
            <div class="speed-chart-section">
              <SpeedChart
                v-if="
                  poseLandmarkerA?.speedMetrics &&
                  poseLandmarkerA.speedMetrics.value &&
                  poseLandmarkerA.speedMetrics.value.isValid
                "
                :speed-metrics="poseLandmarkerA.speedMetrics.value"
                :timestamp="currentTime"
                :current-frame="currentFrame"
                :visible="true"
                :chart-duration="chartDurationA"
                :max-speed-scale="maxSpeedScaleA"
                :compact-mode="true"
              />
            </div>
          </div>
        </div>

        <!-- Video B - Movement Speed -->
        <div
          v-if="
            videoBUrl &&
            poseLandmarkerB &&
            poseLandmarkerB.isEnabled.value &&
            poseLandmarkerB.speedMetrics &&
            poseLandmarkerB.speedMetrics.value &&
            poseLandmarkerB.speedMetrics.value.isValid
          "
          class="movement-speed-container"
        >
          <div class="dual-speed-content">
            <!-- Mini-cards on the left -->
            <div class="speed-mini-cards">
              <div
                v-if="
                  poseLandmarkerB?.speedMetrics &&
                  poseLandmarkerB.speedMetrics.value &&
                  poseLandmarkerB.speedMetrics.value.isValid
                "
                class="speed-panel-container-dual"
              >
                <h3
                  class="text-sm font-semibold mb-1 text-center text-gray-800"
                >
                  Speed (m/s)
                </h3>

                <!-- 2x2 compact grid: Overall, Horizontal, Right Foot, CoM Height -->
                <div class="grid grid-cols-2 gap-1 mb-1">
                  <!-- Overall Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Overall</div>
                    <div
                      class="mini-value"
                      :class="
                        getSpeedColorClass(
                          poseLandmarkerB.speedMetrics.value.speed
                        )
                      "
                    >
                      {{ poseLandmarkerB.speedMetrics.value.speed.toFixed(2) }}
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-1 mt-0.5">
                      <div
                        class="h-1 rounded-full transition-all duration-300"
                        :class="
                          getSpeedBarColorClass(
                            poseLandmarkerB.speedMetrics.value.speed
                          )
                        "
                        :style="{
                          width: `${Math.min(
                            100,
                            (poseLandmarkerB.speedMetrics.value.speed /
                              maxSpeedForBar) *
                              100
                          )}%`,
                        }"
                      />
                    </div>
                  </div>

                  <!-- Horizontal Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Horizontal</div>
                    <div class="mini-value text-gray-700">
                      {{
                        poseLandmarkerB.speedMetrics.value.generalMovingSpeed?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>

                  <!-- Right Foot Speed -->
                  <div class="mini-card">
                    <div class="mini-label">Right Foot</div>
                    <div class="mini-value text-gray-600">
                      {{
                        poseLandmarkerB.speedMetrics.value.rightFootSpeed?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>

                  <!-- CoM Height -->
                  <div class="mini-card">
                    <div class="mini-label">CoM Height</div>
                    <div class="mini-value text-gray-700">
                      {{
                        poseLandmarkerB.speedMetrics.value.centerOfGravityHeight?.toFixed(
                          2
                        ) || 'N/A'
                      }}
                    </div>
                  </div>
                </div>

                <!-- Chart Controls (always visible) -->
                <div class="grid grid-cols-2 gap-1 mt-2">
                  <!-- Duration Control -->
                  <div class="mini-card">
                    <div class="mini-label">Duration</div>
                    <select v-model="chartDurationB" class="mini-select">
                      <option :value="10">10s</option>
                      <option :value="30">30s</option>
                      <option :value="60">1min</option>
                      <option :value="120">2min</option>
                    </select>
                  </div>

                  <!-- Max Speed Control -->
                  <div class="mini-card">
                    <div class="mini-label">Max Speed</div>
                    <select v-model="maxSpeedScaleB" class="mini-select">
                      <option :value="1">1 m/s</option>
                      <option :value="2">2 m/s</option>
                      <option :value="5">5 m/s</option>
                    </select>
                  </div>
                </div>
              </div>
              <div v-else class="speed-panel-container-dual">
                <h3
                  class="text-sm font-semibold mb-1 text-center text-gray-800"
                >
                  Speed (m/s)
                </h3>
                <div class="text-sm text-gray-600 text-center py-2 mb-2">
                  No speed data available
                </div>

                <!-- Chart Controls (always visible) -->
                <div class="grid grid-cols-2 gap-1">
                  <!-- Duration Control -->
                  <div class="mini-card">
                    <div class="mini-label">Duration</div>
                    <select v-model="chartDurationB" class="mini-select">
                      <option :value="10">10s</option>
                      <option :value="30">30s</option>
                      <option :value="60">1min</option>
                      <option :value="120">2min</option>
                    </select>
                  </div>

                  <!-- Max Speed Control -->
                  <div class="mini-card">
                    <div class="mini-label">Max Speed</div>
                    <select v-model="maxSpeedScaleB" class="mini-select">
                      <option :value="1">1 m/s</option>
                      <option :value="2">2 m/s</option>
                      <option :value="5">5 m/s</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Chart on the right -->
            <div class="speed-chart-section">
              <SpeedChart
                v-if="
                  poseLandmarkerB?.speedMetrics &&
                  poseLandmarkerB.speedMetrics.value &&
                  poseLandmarkerB.speedMetrics.value.isValid
                "
                :speed-metrics="poseLandmarkerB.speedMetrics.value"
                :timestamp="currentTime"
                :current-frame="currentFrame"
                :visible="true"
                :chart-duration="chartDurationB"
                :max-speed-scale="maxSpeedScaleB"
                :compact-mode="true"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom controls for dual video -->
    <div
      v-if="controlsAttr && (videoAUrl || videoBUrl)"
      class="dual-video-controls"
    >
      <div class="controls-content">
        <div class="controls-left">
          <!-- Play/Pause button for both videos -->
          <button
            class="control-button"
            :aria-label="isPlaying ? 'Pause both videos' : 'Play both videos'"
            @click="toggleDualPlayPause"
          >
            <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            <svg v-else class="control-icon" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </button>

          <!-- Volume controls -->
          <div class="volume-controls">
            <button
              class="control-button"
              :aria-label="isMuted ? 'Unmute' : 'Mute'"
              @click="toggleMute"
            >
              <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
              <svg
                v-else-if="volume < 0.5"
                class="control-icon"
                viewBox="0 0 24 24"
              >
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
              <svg v-else class="control-icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              :value="isMuted ? 0 : volume"
              class="volume-slider"
              :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
              @input="handleVolumeChange"
            />
          </div>

          <!-- Speed controls -->
          <div class="speed-controls">
            <select
              :value="playbackSpeed"
              class="speed-select"
              :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
              @change="handleSpeedSelect($event)"
            >
              <option value="0.1">0.1x</option>
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>

          <!-- Pose detection controls for dual video -->
          <div v-if="poseLandmarkerA || poseLandmarkerB" class="pose-controls">
            <!-- Video A Pose Detection -->
            <div v-if="poseLandmarkerA" class="pose-control-group">
              <span class="pose-label">A:</span>
              <button
                class="control-button"
                :class="{
                  'pose-active': poseLandmarkerA.isEnabled.value,
                  'pose-loading': poseLandmarkerA.isLoading.value,
                }"
                :disabled="poseLandmarkerA.isLoading.value"
                :aria-label="
                  poseLandmarkerA.isLoading.value
                    ? 'Loading pose detection for Video A...'
                    : poseLandmarkerA.isEnabled.value
                    ? 'Disable pose visualization for Video A'
                    : 'Enable pose visualization for Video A'
                "
                :title="
                  poseLandmarkerA.isLoading.value
                    ? 'Loading pose detection for Video A...'
                    : 'Toggle pose visualization for Video A'
                "
                @click="togglePoseDetectionA"
              >
                <!-- Loading spinner -->
                <div
                  v-if="poseLandmarkerA.isLoading.value"
                  class="pose-loading-spinner"
                />
                <!-- Pose icon -->
                <svg
                  v-else
                  class="control-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v5" />
                  <path d="M10 12h4" />
                  <path d="M8 17l2-5 2 5" />
                  <path d="M16 17l-2-5-2 5" />
                </svg>
              </button>
            </div>

            <!-- Video B Pose Detection -->
            <div v-if="poseLandmarkerB" class="pose-control-group">
              <span class="pose-label">B:</span>
              <button
                class="control-button"
                :class="{
                  'pose-active': poseLandmarkerB.isEnabled.value,
                  'pose-loading': poseLandmarkerB.isLoading.value,
                }"
                :disabled="poseLandmarkerB.isLoading.value"
                :aria-label="
                  poseLandmarkerB.isLoading.value
                    ? 'Loading pose detection for Video B...'
                    : poseLandmarkerB.isEnabled.value
                    ? 'Disable pose visualization for Video B'
                    : 'Enable pose visualization for Video B'
                "
                :title="
                  poseLandmarkerB.isLoading.value
                    ? 'Loading pose detection for Video B...'
                    : 'Toggle pose visualization for Video B'
                "
                @click="togglePoseDetectionB"
              >
                <!-- Loading spinner -->
                <div
                  v-if="poseLandmarkerB.isLoading.value"
                  class="pose-loading-spinner"
                />
                <!-- Pose icon -->
                <svg
                  v-else
                  class="control-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v5" />
                  <path d="M10 12h4" />
                  <path d="M8 17l2-5 2 5" />
                  <path d="M16 17l-2-5-2 5" />
                </svg>
              </button>
            </div>

            <!-- ROI controls for individual videos -->
            <div
              v-if="
                poseLandmarkerA?.isEnabled.value ||
                poseLandmarkerB?.isEnabled.value
              "
              class="roi-controls"
            >
              <!-- ROI toggle for Video A -->
              <div
                v-if="poseLandmarkerA?.isEnabled.value"
                class="roi-control-group"
              >
                <span class="pose-label">A:</span>
                <button
                  class="control-button"
                  :class="{ 'pose-active': roiSettingsA.enabled }"
                  title="Toggle ROI selection for Video A"
                  @click="toggleROIModeA"
                >
                  ROI
                </button>
              </div>

              <!-- ROI toggle for Video B -->
              <div
                v-if="poseLandmarkerB?.isEnabled.value"
                class="roi-control-group"
              >
                <span class="pose-label">B:</span>
                <button
                  class="control-button"
                  :class="{ 'pose-active': roiSettingsB.enabled }"
                  title="Toggle ROI selection for Video B"
                  @click="toggleROIModeB"
                >
                  ROI
                </button>
              </div>
            </div>

            <!-- Shared pose visualization controls (only show when at least one pose detection is enabled) -->
            <div
              v-if="
                poseLandmarkerA?.isEnabled.value ||
                poseLandmarkerB?.isEnabled.value
              "
              class="shared-pose-controls"
            >
              <!-- Labels toggle -->
              <button
                class="control-button"
                :class="{
                  'pose-active': poseVisualizationSettings.showLabels,
                }"
                title="Toggle skeleton labels"
                @click="
                  poseVisualizationSettings.showLabels =
                    !poseVisualizationSettings.showLabels
                "
              >
                <svg
                  class="control-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                  />
                  <polyline points="14,2 14,8 20,8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10,9 9,9 8,9" />
                </svg>
              </button>

              <!-- Keypoint Selection Button -->
              <button
                class="control-button"
                :class="{
                  'pose-active': showKeypointSelector,
                }"
                title="Select keypoints to track"
                @click="openKeypointSelector"
              >
                <svg
                  class="control-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="7.5" cy="7.5" r="1" />
                  <circle cx="16.5" cy="7.5" r="1" />
                  <circle cx="7.5" cy="16.5" r="1" />
                  <circle cx="16.5" cy="16.5" r="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Keypoint Selector Modal -->
    <KeypointSelectorModal
      :show-modal="showKeypointSelector"
      :selected-keypoints="localSelectedKeypoints"
      @update:selected-keypoints="(v) => (localSelectedKeypoints = v as number[])"
      @close="showKeypointSelector = false"
    />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  reactive,
  computed,
} from 'vue';
import DrawingCanvas from './DrawingCanvas.vue';
import PoseVisualization from './PoseVisualization.vue';
import SpeedVisualization from './SpeedVisualization.vue';
import SpeedChart from './SpeedChart.vue';
// @ts-ignore: Vue SFC without d.ts
import ROISelector from './ROISelector.vue';
import KeypointSelectorModal from './KeypointSelectorModal.vue';
import { useVideoPlayer } from '../composables/useVideoPlayer.ts';
import {
  CalibrationStep,
  useCameraCalibration,
} from '../composables/useCameraCalibration.ts';
import { usePositionHeatmap } from '../composables/usePositionHeatmap';
import type { Point3D } from '../composables/usePositionHeatmap';
import HeatmapMinimap from './HeatmapMinimap.vue';
import type {
  DualVideoPlayer,
  DualVideoPlayerState,
} from '../composables/useDualVideoPlayer.ts';
import type { SeverityLevel } from '../types/database';
// Fallback local type to satisfy TS if path alias not resolved
type DrawingData = {
  id?: string;
  frame?: number;
  paths?: any[];
  [k: string]: any;
};

interface DrawingCanvasLike {
  isDrawingMode: { value: boolean };
  currentTool: {
    value: { type: string; strokeWidth: number; severity: SeverityLevel };
  };
  allDrawings: { value: any[] };
  isLoadingDrawings: { value: boolean };
  setVideoSize?: (w: number, h: number) => void;
  disableDrawingMode?: () => void;
  getCurrentColor?: { value?: string } | (() => string);
  [key: string]: any;
}

type OptionalDrawingCanvas = Partial<DrawingCanvasLike> | null | undefined;

type VideoState = Partial<DualVideoPlayerState> | Record<string, unknown>;

type DualVideoPlayerLike = Partial<DualVideoPlayer> & {
  getCurrentVideoElement?: () => HTMLVideoElement | null;
  getCurrentVideoContainer?: () => HTMLElement | null;
};
interface Props {
  mode?: 'single' | 'dual';
  // Single video props
  videoUrl?: string;
  videoId?: string;
  autoplay?: boolean;
  controls?: boolean;
  poster?: string;
  // Accept narrow typing for optional drawing canvas integration
  drawingCanvas?: OptionalDrawingCanvas;
  // Dual video props
  videoAUrl?: string;
  videoAId?: string;
  videoBUrl?: string;
  videoBId?: string;
  drawingCanvasA?: OptionalDrawingCanvas;
  drawingCanvasB?: OptionalDrawingCanvas;
  videoAState?: VideoState;
  videoBState?: VideoState;
  dualVideoPlayer?: DualVideoPlayerLike | null;
  // FPS compatibility props for dual video mode
  fpsCompatible?: boolean;
  primaryVideo?: 'A' | 'B';
  // Annotation-related props
  projectId?: string;
  comparisonVideoId?: string;
  user?: unknown;
  // Pose detection props
  poseLandmarker?: any;
  poseLandmarkerA?: any;
  poseLandmarkerB?: any;
  enablePoseDetection?: boolean;
}

interface Emits {
  (
    e: 'time-update',
    data: { currentTime: number; duration: number; videoId?: string }
  ): void;
  (
    e: 'frame-update',
    data: {
      currentFrame: number;
      totalFrames: number;
      fps: number;
      videoId?: string;
    }
  ): void;
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'duration-change', duration: number): void;
  (e: 'fps-detected', data: { fps: number; totalFrames: number }): void;
  (e: 'error', error: string): void;
  (e: 'loaded', data?: any): void;
  (e: 'video-click'): void;
  (e: 'drawing-created', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-updated', drawing: DrawingData, videoContext?: string): void;
  (e: 'drawing-deleted', drawingId: string, videoContext?: string): void;
  (e: 'video-a-loaded'): void;
  (e: 'video-b-loaded'): void;
  (e: 'pose-detected', poseData: any, videoContext?: string): void;
  (e: 'pose-detection-error', error: string, videoContext?: string): void;
  (e: 'toggle-calibration'): void;
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'single',
  videoUrl: '',
  videoId: 'default-video',
  autoplay: false,
  controls: true,
  poster: '',
  fpsCompatible: true,
  primaryVideo: 'A',
});

const emit = defineEmits<Emits>();

const posterAttr = computed(() => props.poster ?? '');
const autoplayAttr = computed(() => props.autoplay ?? false);
const controlsAttr = computed(() => props.controls ?? true);

const drawingCanvas = computed<OptionalDrawingCanvas>(
  () => props.drawingCanvas ?? null
);
const drawingCanvasA = computed<OptionalDrawingCanvas>(
  () => props.drawingCanvasA ?? null
);
const drawingCanvasB = computed<OptionalDrawingCanvas>(
  () => props.drawingCanvasB ?? null
);

const videoAStateResolved = computed<VideoState | null>(
  () => props.videoAState ?? null
);
const videoBStateResolved = computed<VideoState | null>(
  () => props.videoBState ?? null
);

const resolveCanvasColor = (
  canvas: OptionalDrawingCanvas
): string | undefined => {
  if (!canvas) return undefined;
  const maybeCanvas = canvas as Partial<DrawingCanvasLike>;
  const source = maybeCanvas.getCurrentColor;
  if (typeof source === 'function') {
    return source();
  }
  if (source && typeof source === 'object' && 'value' in source) {
    const value = (source as { value?: string }).value;
    if (typeof value === 'string') {
      return value;
    }
  }
  return undefined;
};

const defaultSeverity: SeverityLevel = 'medium';

type PoseDetectionResult = {
  detected?: boolean;
  landmarks?: Array<Record<string, number>>;
  [key: string]: unknown;
} | null;

// Video player composable for shared functionality
const {
  playerRef,
  playerState,
  isPlaying,
  currentTime,
  duration,
  isLoading,
  error,
  volume,
  isMuted,
  playbackSpeed,
  fps,
  currentFrame,
  totalFrames,
  play,
  pause,
  togglePlayPause,
  seekTo,
  setVolume,
  toggleMute,
  setPlaybackSpeed,
  startListening,
  stopListening,
  detectFPS,
  updateFrameFromTime,
} = useVideoPlayer();

/* removed duplicate defineExpose used for type hints to avoid duplicate defineExpose() error.
   All necessary methods/refs are exposed once at the end of the script. */

// Template refs
const singleVideoElement = ref<HTMLVideoElement | null>(null);
const singleVideoContainer = ref<HTMLElement | null>(null);
const videoAElement = ref<HTMLVideoElement | null>(null);
const videoBElement = ref<HTMLVideoElement | null>(null);
const singleDrawingCanvasRef = ref<any | null>(null);
const drawingCanvasARef = ref<any | null>(null);
const drawingCanvasBRef = ref<any | null>(null);

// Single video state
const singleVideoState = ref<{ isLoading: boolean; error: string | null }>({
  isLoading: false,
  error: null,
});

// Video fade transition state
const isVideoTransitioning = ref(false);
const videoOpacity = ref(1);

// Pose visualization settings
const poseVisualizationSettings = reactive({
  showSkeleton: true,
  showLandmarks: true,
  showLabels: false,
  showConfidence: true,
  showNoPoseIndicator: true,
  showCenterOfMass: true,
});

// Keypoint selector state
const showKeypointSelector = ref(false);
const localSelectedKeypoints = ref<number[]>(
  Array.from({ length: 33 }, (_, i) => i)
);

// Camera calibration composable (for accessing calibration state)
const cameraCalibration = useCameraCalibration();

// Tooltip state for guiding pose visualization activation post-calibration
const poseTooltipVisible = ref(false);
const speedToggleIndicatorVisible = ref(false);
const hasShownSpeedToggleIndicator = ref(false);
const calibrationTooltipVisible = ref(false);
const hasShownCalibrationTooltip = ref(false);

const isCalibrationReady = computed(() => {
  const calibrated = cameraCalibration.isCalibrated?.value ?? false;
  if (calibrated) {
    return true;
  }
  return cameraCalibration.cameraParameters.position !== null;
});

// Computed properties for heatmap reactivity
const heatmapDataComputed = computed(() => positionHeatmap.heatmapData.value);
const currentPositionComputed = computed(
  () => positionHeatmap.currentPosition.value
);
const courtDimensionsComputed = computed(
  () => cameraCalibration.courtDimensions.value
);
const totalDistanceComputed = computed(
  () => positionHeatmap.totalDistance.value
);
const averageSpeedComputed = computed(() => positionHeatmap.averageSpeed.value);
const mostVisitedZoneComputed = computed(
  () => positionHeatmap.mostVisitedZone.value
);
const totalSamplesComputed = computed(
  () => positionHeatmap.positionHistory.value.length
);

let poseTooltipTimeout: ReturnType<typeof setTimeout> | null = null;
let calibrationTooltipTimeout: ReturnType<typeof setTimeout> | null = null;

const showPoseTooltip = () => {
  poseTooltipVisible.value = true;
  if (poseTooltipTimeout) {
    clearTimeout(poseTooltipTimeout);
  }
  poseTooltipTimeout = setTimeout(() => {
    poseTooltipVisible.value = false;
    poseTooltipTimeout = null;
  }, 6500);
};

const hidePoseTooltip = () => {
  poseTooltipVisible.value = false;
  if (poseTooltipTimeout) {
    clearTimeout(poseTooltipTimeout);
    poseTooltipTimeout = null;
  }
};

const showCalibrationTooltip = () => {
  if (calibrationTooltipTimeout) {
    clearTimeout(calibrationTooltipTimeout);
  }
  calibrationTooltipVisible.value = true;
  calibrationTooltipTimeout = setTimeout(() => {
    calibrationTooltipVisible.value = false;
    calibrationTooltipTimeout = null;
  }, 6500);
};

const hideCalibrationTooltip = () => {
  calibrationTooltipVisible.value = false;
  if (calibrationTooltipTimeout) {
    clearTimeout(calibrationTooltipTimeout);
    calibrationTooltipTimeout = null;
  }
};

const maybeShowCalibrationTooltip = () => {
  if (
    hasShownCalibrationTooltip.value ||
    cameraCalibration.cameraParameters.position !== null ||
    cameraCalibration.calibrationStep.value !== CalibrationStep.SETUP ||
    cameraCalibration.isModalOpen.value ||
    props.mode !== 'single' ||
    !props.videoUrl
  ) {
    return;
  }

  hasShownCalibrationTooltip.value = true;
  showCalibrationTooltip();
};

const showSpeedToggleIndicator = () => {
  if (
    hasShownSpeedToggleIndicator.value ||
    props.mode !== 'single' ||
    !props.poseLandmarker ||
    props.poseLandmarker.isEnabled?.value
  ) {
    return;
  }
  speedToggleIndicatorVisible.value = true;
  hasShownSpeedToggleIndicator.value = true;
};

const hideSpeedToggleIndicator = () => {
  speedToggleIndicatorVisible.value = false;
};

watch(
  () => cameraCalibration.calibrationStep.value,
  (step, previousStep) => {
    if (step === CalibrationStep.SETUP) {
      if (previousStep !== CalibrationStep.SETUP) {
        hasShownCalibrationTooltip.value = false;
      }
      nextTick(() => {
        maybeShowCalibrationTooltip();
      });
    } else {
      hideCalibrationTooltip();
    }
  },
  { immediate: true }
);

watch(
  () => cameraCalibration.cameraParameters.position,
  (position, previousPosition) => {
    if (position) {
      hideCalibrationTooltip();
    } else if (
      previousPosition !== null &&
      cameraCalibration.calibrationStep.value === CalibrationStep.SETUP
    ) {
      hasShownCalibrationTooltip.value = false;
      nextTick(() => {
        maybeShowCalibrationTooltip();
      });
    }
  }
);

watch(
  () => cameraCalibration.isModalOpen.value,
  (isOpen) => {
    if (isOpen) {
      hideCalibrationTooltip();
    } else {
      nextTick(() => {
        maybeShowCalibrationTooltip();
      });
    }
  }
);

watch(
  () => props.videoUrl,
  (videoUrl) => {
    if (videoUrl) {
      nextTick(() => {
        maybeShowCalibrationTooltip();
      });
    } else {
      hideCalibrationTooltip();
      hasShownCalibrationTooltip.value = false;
    }
  }
);

watch(
  () => props.mode,
  (mode) => {
    if (mode !== 'single') {
      hideCalibrationTooltip();
      hasShownCalibrationTooltip.value = false;
    } else {
      nextTick(() => {
        maybeShowCalibrationTooltip();
      });
    }
  }
);

watch(
  () => isCalibrationReady.value,
  (ready, wasReady) => {
    if (ready && !wasReady) {
      showPoseTooltip();
      showSpeedToggleIndicator();
    } else if (!ready) {
      hidePoseTooltip();
      hideSpeedToggleIndicator();
      hasShownSpeedToggleIndicator.value = false;
    }
  }
);

watch(
  () => props.poseLandmarker?.isEnabled?.value,
  (enabled) => {
    if (enabled) {
      hideSpeedToggleIndicator();
    }
  }
);

watch(
  () => props.poseLandmarker?.isEnabled?.value,
  (isEnabled) => {
    if (isEnabled) {
      hidePoseTooltip();
    }
  }
);

watch(
  () => props.poseLandmarker,
  (landmarker) => {
    if (!landmarker) {
      hidePoseTooltip();
    }
  }
);

onUnmounted(() => {
  hidePoseTooltip();
  hideCalibrationTooltip();
});

// Position heatmap tracking
const showHeatmapMinimap = ref(false); // Hide heatmap by default, show only after calibration
const positionHeatmap = usePositionHeatmap(cameraCalibration.courtDimensions);

// Enhanced ROI state
const roiSettings = reactive({
  enabled: false,
  showROI: true,
  showInstructions: true,
  showPrediction: true,
  showHistory: false,
  showStats: true,
  currentROI: null as any,
  predictedROI: null as any,
  roiHistory: [] as any[],
  roiConfidence: 0,
  stabilityMetrics: {
    stabilityScore: 0,
    velocityEstimate: { x: 0, y: 0 },
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
  },
  useMotionPrediction: false,
});

// Enhanced ROI state for Video A
const roiSettingsA = reactive({
  enabled: false,
  showROI: true,
  showInstructions: true,
  showPrediction: true,
  showHistory: false,
  showStats: true,
  currentROI: null,
  predictedROI: null,
  roiHistory: [],
  roiConfidence: 0,
  stabilityMetrics: {
    stabilityScore: 0,
    velocityEstimate: { x: 0, y: 0 },
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
  },
  useMotionPrediction: false,
});

// Enhanced ROI state for Video B
const roiSettingsB = reactive({
  enabled: false,
  showROI: true,
  showInstructions: true,
  showPrediction: true,
  showHistory: false,
  showStats: true,
  currentROI: null,
  predictedROI: null,
  roiHistory: [],
  roiConfidence: 0,
  stabilityMetrics: {
    stabilityScore: 0,
    velocityEstimate: { x: 0, y: 0 },
    averageSize: { width: 0, height: 0 },
    averagePosition: { x: 0, y: 0 },
  },
  useMotionPrediction: false,
});

// Speed visualization helper functions and constants
const maxSpeedForBar = 5; // Maximum speed for progress bar scaling

// Chart control states for dual videos
const chartDurationA = ref(30); // seconds
const maxSpeedScaleA = ref(1); // m/s
const chartDurationB = ref(30); // seconds
const maxSpeedScaleB = ref(1); // m/s

// Speed color functions - converted to grayscale
const getSpeedColorClass = (speed: number) => {
  if (speed < 0.5) return 'text-gray-700';
  if (speed < 1.5) return 'text-gray-500';
  if (speed < 3.0) return 'text-gray-400';
  return 'text-gray-300';
};

const getSpeedBarColorClass = (speed: number) => {
  if (speed < 0.5) return 'bg-gray-700';
  if (speed < 1.5) return 'bg-gray-500';
  if (speed < 3.0) return 'bg-gray-400';
  return 'bg-gray-300';
};

// Optimized pose detection with requestAnimationFrame
const processPoseDetection = async (
  videoElement: HTMLVideoElement,
  videoContext?: string
) => {
  if (!props.enablePoseDetection) return;

  const poseLandmarker =
    videoContext === 'A'
      ? props.poseLandmarkerA
      : videoContext === 'B'
      ? props.poseLandmarkerB
      : props.poseLandmarker;

  if (!poseLandmarker || !poseLandmarker.isEnabled.value) return;

  try {
    // Use video-relative timestamp instead of performance.now()
    const videoTimestamp = videoElement.currentTime * 1000; // Convert to milliseconds
    const playbackRate = videoElement.playbackRate;

    const poseData = await poseLandmarker.detectPose(
      videoElement,
      videoTimestamp,
      currentFrame.value,
      playbackRate
    );

    if (poseData) {
      // Track position if camera is calibrated and heatmap tracking is enabled
      if (
        cameraCalibration.cameraParameters.position !== null &&
        positionHeatmap.isTracking.value &&
        poseData.landmarks?.length > 0
      ) {
        // Use the center of mass or hip center as the tracking point
        // MediaPipe landmark indices: 23 (left hip), 24 (right hip)
        const leftHip = poseData.landmarks[23];
        const rightHip = poseData.landmarks[24];

        if (leftHip && rightHip) {
          // Calculate hip center as tracking point
          const hipCenter = {
            x: (leftHip.x + rightHip.x) / 2,
            y: (leftHip.y + rightHip.y) / 2,
          };

          const videoWidth =
            videoElement.videoWidth || videoElement.clientWidth || 1;
          const videoHeight =
            videoElement.videoHeight || videoElement.clientHeight || 1;
          const hipCenterPixels = {
            x: hipCenter.x * videoWidth,
            y: hipCenter.y * videoHeight,
          };

          // Transform to world coordinates using camera calibration
          const { width: courtWidth = 6.1, length: courtLength = 13.4 } =
            cameraCalibration.courtDimensions?.value ?? {};

          let worldPos: Point3D | null = null;
          if (typeof cameraCalibration.transformToWorld === 'function') {
            try {
              const transformed = cameraCalibration.transformToWorld(
                hipCenterPixels,
                0
              );
              if (
                transformed &&
                Number.isFinite(transformed.x) &&
                Number.isFinite(transformed.y)
              ) {
                const withinBounds =
                  Math.abs(transformed.x) <= courtWidth &&
                  Math.abs(transformed.y) <= courtLength;

                if (withinBounds) {
                  worldPos = {
                    x: transformed.x,
                    y: transformed.y,
                    z: transformed.z ?? 0,
                  };
                  console.debug('🗺️ [Heatmap] transformToWorld success', {
                    hipCenter,
                    hipCenterPixels,
                    worldPos,
                  });
                } else {
                  console.warn(
                    '⚠️ [Heatmap] Discarding transformToWorld result outside court bounds',
                    {
                      hipCenter,
                      hipCenterPixels,
                      transformed,
                      courtWidth,
                      courtLength,
                    }
                  );
                }
              }
            } catch (error) {
              console.warn(
                '🗺️ [Heatmap] Failed to transform hip center to world coordinates:',
                error
              );
            }
          }

          if (!worldPos) {
            // Fallback to scaled normalized coordinates centered on the court
            worldPos = {
              x: hipCenter.x * courtWidth - courtWidth / 2,
              y: hipCenter.y * courtLength - courtLength / 2,
              z: 0,
            };
            console.debug('🗺️ [Heatmap] Using fallback hip center transform', {
              hipCenter,
              worldPos,
              courtWidth,
              courtLength,
            });
          }

          // Add position sample to heatmap tracker
          positionHeatmap.addPositionSample(
            worldPos,
            hipCenter,
            poseData.confidence || 0.8,
            currentFrame.value
          );

          // Log every 30th frame to avoid spam
          if (currentFrame.value % 30 === 0) {
            console.log('🗺️ [Heatmap] Position tracked', {
              frame: currentFrame.value,
              hipCenter,
              worldPos,
              totalSamples: positionHeatmap.positionHistory.value.length,
            });
          }
        }
      }

      // Update enhanced ROI state if using enhanced pose landmarker
      if (poseLandmarker.getROIInsights) {
        const roiInsights = poseLandmarker.getROIInsights();

        // Update the appropriate ROI settings based on video context
        const roiSettingsToUpdate =
          videoContext === 'A'
            ? roiSettingsA
            : videoContext === 'B'
            ? roiSettingsB
            : roiSettings;

        roiSettingsToUpdate.currentROI = roiInsights.currentROI;
        roiSettingsToUpdate.predictedROI = roiInsights.predictedROI;
        roiSettingsToUpdate.roiHistory = roiInsights.history;
        roiSettingsToUpdate.roiConfidence = roiInsights.confidence;
        roiSettingsToUpdate.stabilityMetrics = roiInsights.stability;
      }

      emit('pose-detected', poseData, videoContext);
    }
  } catch (error) {
    const err = error as unknown as { message?: string };
    console.error('❌ [UnifiedVideoPlayer] Pose detection error:', error);
    emit('pose-detection-error', err?.message || 'Unknown error', videoContext);
  }
};

// Start RAF-based pose detection
const startRAFPoseDetection = (
  videoElement: HTMLVideoElement,
  videoContext?: string
) => {
  console.log('🔍 [DEBUG] startRAFPoseDetection called', {
    enablePoseDetection: props.enablePoseDetection,
    videoContext,
    videoElement: !!videoElement,
  });

  if (!props.enablePoseDetection) {
    console.log(
      '🔍 [DEBUG] startRAFPoseDetection early return - pose detection not enabled'
    );
    return;
  }

  const poseLandmarker =
    videoContext === 'A'
      ? props.poseLandmarkerA
      : videoContext === 'B'
      ? props.poseLandmarkerB
      : props.poseLandmarker;

  console.log('🔍 [DEBUG] poseLandmarker check', {
    poseLandmarker: !!poseLandmarker,
    isEnabled: poseLandmarker?.isEnabled?.value,
    videoContext,
  });

  if (!poseLandmarker || !poseLandmarker.isEnabled.value) {
    console.log(
      '🔍 [DEBUG] startRAFPoseDetection early return - no landmarker or not enabled'
    );
    return;
  }

  console.log(
    '🔍 [DEBUG] Starting RAF pose detection for',
    videoContext || 'single'
  );

  // Use RAF-based detection for smooth performance with playback rate compensation
  poseLandmarker.detectPoseRAF(
    videoElement,
    (poseData: PoseDetectionResult) => {
      console.log('🔍 [DEBUG] RAF pose detection callback', {
        poseData: !!poseData,
        detected: poseData?.detected,
        landmarksCount: poseData?.landmarks?.length || 0,
        videoContext,
      });

      // Update enhanced ROI state if using enhanced pose landmarker
      if (poseLandmarker.getROIInsights) {
        const roiInsights = poseLandmarker.getROIInsights();

        // Update the appropriate ROI settings based on video context
        const roiSettingsToUpdate =
          videoContext === 'A'
            ? roiSettingsA
            : videoContext === 'B'
            ? roiSettingsB
            : roiSettings;

        roiSettingsToUpdate.currentROI = roiInsights.currentROI;
        roiSettingsToUpdate.predictedROI = roiInsights.predictedROI;
        roiSettingsToUpdate.roiHistory = roiInsights.history;
        roiSettingsToUpdate.roiConfidence = roiInsights.confidence;
        roiSettingsToUpdate.stabilityMetrics = roiInsights.stability;
      }

      emit('pose-detected', poseData, videoContext);
    },
    videoElement.playbackRate
  );
};

// ROI event handlers
const setROI = (
  roi: { x: number; y: number; width: number; height: number } | null,
  videoContext?: string
) => {
  const poseLandmarker =
    videoContext === 'A'
      ? props.poseLandmarkerA
      : videoContext === 'B'
      ? props.poseLandmarkerB
      : props.poseLandmarker;

  if (poseLandmarker?.isInitialized?.value) {
    // Use the setROI method from the composable which expects ROI format: { x, y, width, height }
    poseLandmarker.setROI(roi);
    console.log(
      `[UnifiedVideoPlayer] ROI set for ${videoContext || 'single'}:`,
      roi
    );
  }
};

const handleROISelected = (roiBox: any, videoContext?: string) => {
  const roiSettingsToUpdate =
    videoContext === 'A'
      ? roiSettingsA
      : videoContext === 'B'
      ? roiSettingsB
      : roiSettings;

  setROI(roiBox, videoContext);
  roiSettingsToUpdate.currentROI = roiBox;
  roiSettingsToUpdate.showInstructions = false;
  console.log(
    `🎯 [UnifiedVideoPlayer] ROI selected for ${videoContext || 'single'}:`,
    roiBox
  );
};

const handleROIUpdated = (roiBox: any, videoContext?: string) => {
  const roiSettingsToUpdate =
    videoContext === 'A'
      ? roiSettingsA
      : videoContext === 'B'
      ? roiSettingsB
      : roiSettings;

  setROI(roiBox, videoContext);
  roiSettingsToUpdate.currentROI = roiBox;
};

const handleROICleared = (videoContext?: string) => {
  const roiSettingsToUpdate =
    videoContext === 'A'
      ? roiSettingsA
      : videoContext === 'B'
      ? roiSettingsB
      : roiSettings;

  setROI(null, videoContext);
  roiSettingsToUpdate.currentROI = null;
  roiSettingsToUpdate.showInstructions = true;
  console.log(
    `🎯 [UnifiedVideoPlayer] ROI cleared for ${videoContext || 'single'}`
  );
};

// Enhanced ROI event handlers
const handleMotionPredictionToggled = (videoContext?: string) => {
  const poseLandmarker =
    videoContext === 'A'
      ? props.poseLandmarkerA
      : videoContext === 'B'
      ? props.poseLandmarkerB
      : props.poseLandmarker;

  const roiSettingsToUpdate =
    videoContext === 'A'
      ? roiSettingsA
      : videoContext === 'B'
      ? roiSettingsB
      : roiSettings;

  if (poseLandmarker && poseLandmarker.updateSettings) {
    roiSettingsToUpdate.useMotionPrediction =
      !roiSettingsToUpdate.useMotionPrediction;
    poseLandmarker.updateSettings({
      useMotionPrediction: roiSettingsToUpdate.useMotionPrediction,
    });
    console.log(
      `🎯 [UnifiedVideoPlayer] Motion prediction toggled for ${
        videoContext || 'single'
      }:`,
      roiSettingsToUpdate.useMotionPrediction
    );
  }
};

const toggleROIMode = () => {
  roiSettings.enabled = !roiSettings.enabled;
  if (!roiSettings.enabled) {
    handleROICleared();
  } else {
    // Configure enhanced ROI for fast movements when enabling
    configureEnhancedROIForFastMovements();
  }
  console.log('🎯 [UnifiedVideoPlayer] ROI mode toggled:', roiSettings.enabled);
};

const toggleROIModeA = () => {
  roiSettingsA.enabled = !roiSettingsA.enabled;
  if (!roiSettingsA.enabled) {
    handleROICleared('A');
  } else {
    // Configure enhanced ROI for fast movements when enabling
    configureEnhancedROIForFastMovements();
  }
  console.log(
    '🎯 [UnifiedVideoPlayer] ROI mode A toggled:',
    roiSettingsA.enabled
  );
};

const toggleROIModeB = () => {
  roiSettingsB.enabled = !roiSettingsB.enabled;
  if (!roiSettingsB.enabled) {
    handleROICleared('B');
  } else {
    // Configure enhanced ROI for fast movements when enabling
    configureEnhancedROIForFastMovements();
  }
  console.log(
    '🎯 [UnifiedVideoPlayer] ROI mode B toggled:',
    roiSettingsB.enabled
  );
};

// Dual video control functions
const toggleDualPlayPause = () => {
  if (props.dualVideoPlayer) {
    if (isPlaying.value) {
      props.dualVideoPlayer.pauseVideoA?.();
      props.dualVideoPlayer.pauseVideoB?.();
    } else {
      props.dualVideoPlayer.playVideoA?.();
      props.dualVideoPlayer.playVideoB?.();
    }
  }
};

// Enhanced pose detection error state
const poseDetectionErrorA = ref<string | null>(null);
const poseDetectionErrorB = ref<string | null>(null);
const poseDetectionRetryCountA = ref(0);
const poseDetectionRetryCountB = ref(0);
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Helper function to wait for video element readiness
const waitForVideoReadiness = async (
  videoElement: HTMLVideoElement | null,
  videoLabel: string,
  maxWaitTime = 5000
): Promise<boolean> => {
  if (!videoElement) {
    console.error(`❌ [DEBUG] ${videoLabel} element is null`);
    return false;
  }

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    if (videoElement.videoWidth > 0 && videoElement.readyState >= 2) {
      console.log(`✅ [DEBUG] ${videoLabel} is ready for pose detection`);
      return true;
    }

    console.log(`⏳ [DEBUG] Waiting for ${videoLabel} readiness...`, {
      videoWidth: videoElement.videoWidth,
      readyState: videoElement.readyState,
      elapsed: Date.now() - startTime,
    });

    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.warn(
    `⚠️ [DEBUG] ${videoLabel} readiness timeout after ${maxWaitTime}ms`
  );
  return false;
};

// Helper function to show user-visible error feedback
const showPoseDetectionError = (videoContext: string, error: string) => {
  if (videoContext === 'A') {
    poseDetectionErrorA.value = error;
    setTimeout(() => {
      poseDetectionErrorA.value = null;
    }, 5000);
  } else if (videoContext === 'B') {
    poseDetectionErrorB.value = error;
    setTimeout(() => {
      poseDetectionErrorB.value = null;
    }, 5000);
  }
};

const togglePoseDetectionA = async () => {
  console.log('🔍 [DEBUG] togglePoseDetectionA clicked');
  console.log('🔍 [DEBUG] poseLandmarkerA exists:', !!props.poseLandmarkerA);

  // Clear any previous errors
  poseDetectionErrorA.value = null;

  if (!props.poseLandmarkerA) {
    console.warn('⚠️ [DEBUG] poseLandmarkerA is null/undefined');
    showPoseDetectionError('A', 'Pose detection not available for Video A');
    return;
  }

  // ENHANCED DEBUG: Check initialization state
  console.log(
    '🔍 [DEBUG] poseLandmarkerA.isInitialized.value:',
    props.poseLandmarkerA.isInitialized.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerA.isEnabled.value:',
    props.poseLandmarkerA.isEnabled.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerA.isLoading.value:',
    props.poseLandmarkerA.isLoading.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerA.error.value:',
    props.poseLandmarkerA.error.value
  );

  // ENHANCED DEBUG: Check video element readiness
  if (videoAElement.value) {
    console.log('🔍 [DEBUG] videoAElement readiness:', {
      videoWidth: videoAElement.value.videoWidth,
      videoHeight: videoAElement.value.videoHeight,
      readyState: videoAElement.value.readyState,
      currentTime: videoAElement.value.currentTime,
      duration: videoAElement.value.duration,
      src: videoAElement.value.src,
      currentSrc: videoAElement.value.currentSrc,
    });
  } else {
    console.warn('⚠️ [DEBUG] videoAElement is null/undefined');
    showPoseDetectionError('A', 'Video A not loaded');
    return;
  }

  // Check if pose landmarker is initialized before proceeding
  if (!props.poseLandmarkerA.isInitialized.value) {
    console.warn(
      '⚠️ [DEBUG] poseLandmarkerA is not initialized, attempting to initialize...'
    );

    // Show loading state to user
    props.poseLandmarkerA.isLoading.value = true;

    try {
      await props.poseLandmarkerA.initialize();
      console.log('✅ [DEBUG] poseLandmarkerA initialized successfully');

      // Reset retry count on successful initialization
      poseDetectionRetryCountA.value = 0;
    } catch (initError) {
      console.error(
        '❌ [DEBUG] Failed to initialize poseLandmarkerA:',
        initError
      );

      const errorMsg =
        initError instanceof Error
          ? initError.message
          : 'Unknown initialization error';

      // Implement retry logic for initialization
      if (poseDetectionRetryCountA.value < MAX_RETRY_ATTEMPTS) {
        poseDetectionRetryCountA.value++;
        console.log(
          `🔄 [DEBUG] Retrying initialization for Video A (attempt ${poseDetectionRetryCountA.value}/${MAX_RETRY_ATTEMPTS})`
        );

        showPoseDetectionError(
          'A',
          `Initializing pose detection... (attempt ${poseDetectionRetryCountA.value})`
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

        // Recursive retry
        return togglePoseDetectionA();
      } else {
        showPoseDetectionError(
          'A',
          `Failed to initialize pose detection: ${errorMsg}`
        );
        poseDetectionRetryCountA.value = 0; // Reset for next attempt
        return;
      }
    } finally {
      props.poseLandmarkerA.isLoading.value = false;
    }
  }

  try {
    if (props.poseLandmarkerA.isEnabled.value) {
      console.log('🔍 [DEBUG] Disabling pose detection for Video A...');
      await props.poseLandmarkerA.disablePoseDetection();
      console.log(
        '🔍 [DEBUG] After disable - isEnabled:',
        props.poseLandmarkerA.isEnabled.value
      );
      console.log(
        '✅ [UnifiedVideoPlayer] Pose detection disabled for Video A'
      );
    } else {
      console.log('🔍 [DEBUG] Enabling pose detection for Video A...');

      // ENHANCED: Wait for video element readiness with timeout
      const isVideoReady = await waitForVideoReadiness(
        videoAElement.value,
        'Video A'
      );

      if (!isVideoReady) {
        showPoseDetectionError(
          'A',
          'Video A is not ready for pose detection. Please wait for the video to load.'
        );
        return;
      }

      await props.poseLandmarkerA.enablePoseDetection();
      console.log(
        '🔍 [DEBUG] poseLandmarkerA enabled, starting RAF detection...'
      );
      startRAFPoseDetection(videoAElement.value, 'A');

      console.log(
        '🔍 [DEBUG] After enable - isEnabled:',
        props.poseLandmarkerA.isEnabled.value
      );
      console.log('✅ [UnifiedVideoPlayer] Pose detection enabled for Video A');

      // Reset retry count on success
      poseDetectionRetryCountA.value = 0;
    }
  } catch (error) {
    console.error(
      '❌ [UnifiedVideoPlayer] Failed to toggle pose detection for Video A:',
      error
    );

    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    showPoseDetectionError('A', `Pose detection error: ${errorMsg}`);
  }
};

const togglePoseDetectionB = async () => {
  console.log('🔍 [DEBUG] togglePoseDetectionB clicked');
  console.log('🔍 [DEBUG] poseLandmarkerB exists:', !!props.poseLandmarkerB);

  // Clear any previous errors
  poseDetectionErrorB.value = null;

  if (!props.poseLandmarkerB) {
    console.warn('⚠️ [DEBUG] poseLandmarkerB is null/undefined');
    showPoseDetectionError('B', 'Pose detection not available for Video B');
    return;
  }

  // ENHANCED DEBUG: Check initialization state
  console.log(
    '🔍 [DEBUG] poseLandmarkerB.isInitialized.value:',
    props.poseLandmarkerB.isInitialized.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerB.isEnabled.value:',
    props.poseLandmarkerB.isEnabled.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerB.isLoading.value:',
    props.poseLandmarkerB.isLoading.value
  );
  console.log(
    '🔍 [DEBUG] poseLandmarkerB.error.value:',
    props.poseLandmarkerB.error.value
  );

  // ENHANCED DEBUG: Check video element readiness
  if (videoBElement.value) {
    console.log('🔍 [DEBUG] videoBElement readiness:', {
      videoWidth: videoBElement.value.videoWidth,
      videoHeight: videoBElement.value.videoHeight,
      readyState: videoBElement.value.readyState,
      currentTime: videoBElement.value.currentTime,
      duration: videoBElement.value.duration,
      src: videoBElement.value.src,
      currentSrc: videoBElement.value.currentSrc,
    });
  } else {
    console.warn('⚠️ [DEBUG] videoBElement is null/undefined');
    showPoseDetectionError('B', 'Video B not loaded');
    return;
  }

  // Check if pose landmarker is initialized before proceeding
  if (!props.poseLandmarkerB.isInitialized.value) {
    console.warn(
      '⚠️ [DEBUG] poseLandmarkerB is not initialized, attempting to initialize...'
    );

    // Show loading state to user
    props.poseLandmarkerB.isLoading.value = true;

    try {
      await props.poseLandmarkerB.initialize();
      console.log('✅ [DEBUG] poseLandmarkerB initialized successfully');

      // Reset retry count on successful initialization
      poseDetectionRetryCountB.value = 0;
    } catch (initError) {
      console.error(
        '❌ [DEBUG] Failed to initialize poseLandmarkerB:',
        initError
      );

      const errorMsg =
        initError instanceof Error
          ? initError.message
          : 'Unknown initialization error';

      // Implement retry logic for initialization
      if (poseDetectionRetryCountB.value < MAX_RETRY_ATTEMPTS) {
        poseDetectionRetryCountB.value++;
        console.log(
          `🔄 [DEBUG] Retrying initialization for Video B (attempt ${poseDetectionRetryCountB.value}/${MAX_RETRY_ATTEMPTS})`
        );

        showPoseDetectionError(
          'B',
          `Initializing pose detection... (attempt ${poseDetectionRetryCountB.value})`
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

        // Recursive retry
        return togglePoseDetectionB();
      } else {
        showPoseDetectionError(
          'B',
          `Failed to initialize pose detection: ${errorMsg}`
        );
        poseDetectionRetryCountB.value = 0; // Reset for next attempt
        return;
      }
    } finally {
      props.poseLandmarkerB.isLoading.value = false;
    }
  }

  try {
    if (props.poseLandmarkerB.isEnabled.value) {
      console.log('🔍 [DEBUG] Disabling pose detection for Video B...');
      await props.poseLandmarkerB.disablePoseDetection();
      console.log(
        '🔍 [DEBUG] After disable - isEnabled:',
        props.poseLandmarkerB.isEnabled.value
      );
      console.log(
        '✅ [UnifiedVideoPlayer] Pose detection disabled for Video B'
      );
    } else {
      console.log('🔍 [DEBUG] Enabling pose detection for Video B...');

      // ENHANCED: Wait for video element readiness with timeout
      const isVideoReady = await waitForVideoReadiness(
        videoBElement.value,
        'Video B'
      );

      if (!isVideoReady) {
        showPoseDetectionError(
          'B',
          'Video B is not ready for pose detection. Please wait for the video to load.'
        );
        return;
      }

      await props.poseLandmarkerB.enablePoseDetection();
      console.log(
        '🔍 [DEBUG] poseLandmarkerB enabled, starting RAF detection...'
      );
      startRAFPoseDetection(videoBElement.value, 'B');

      console.log(
        '🔍 [DEBUG] After enable - isEnabled:',
        props.poseLandmarkerB.isEnabled.value
      );
      console.log('✅ [UnifiedVideoPlayer] Pose detection enabled for Video B');

      // Reset retry count on success
      poseDetectionRetryCountB.value = 0;
    }
  } catch (error) {
    console.error(
      '❌ [UnifiedVideoPlayer] Failed to toggle pose detection for Video B:',
      error
    );

    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    showPoseDetectionError('B', `Pose detection error: ${errorMsg}`);
  }
};

// Configure enhanced ROI settings for fast movements
const configureEnhancedROIForFastMovements = () => {
  const poseLandmarkers = [
    props.poseLandmarker,
    props.poseLandmarkerA,
    props.poseLandmarkerB,
  ].filter(Boolean);

  poseLandmarkers.forEach((poseLandmarker) => {
    if (poseLandmarker && poseLandmarker.updateSettings) {
      // Fast movements configuration
      poseLandmarker.updateSettings({
        // High performance setup for fast movements
        roiSmoothingFactor: 0.5, // Less smoothing for responsiveness
        motionPredictionWeight: 0.4, // Higher prediction weight
        adaptiveROIExpansionRate: 0.08, // Faster expansion
        frameSkip: 1, // Process every frame
        maxFPS: 60, // Higher frame rate
        useMotionPrediction: true,
        roiValidationEnabled: true,
        roiValidationMinLandmarks: 5,
        roiValidationMinConfidence: 0.4,
      });

      console.log(
        '🚀 [UnifiedVideoPlayer] Enhanced ROI configured for fast movements'
      );
    }
  });
};

// Keypoint selection methods
const getCurrentSelectedKeypoints = () => {
  // Get selected keypoints from the appropriate pose landmarker
  if (props.mode === 'single' && props.poseLandmarker?.selectedKeypoints) {
    return props.poseLandmarker.selectedKeypoints.value || [];
  } else if (props.mode === 'dual') {
    // For dual mode, use the first available pose landmarker's selection
    // Both videos will share the same keypoint selection
    if (props.poseLandmarkerA?.selectedKeypoints) {
      return props.poseLandmarkerA.selectedKeypoints.value || [];
    } else if (props.poseLandmarkerB?.selectedKeypoints) {
      return props.poseLandmarkerB.selectedKeypoints.value || [];
    }
  }
  // Default to all keypoints if no pose landmarker is available
  return Array.from({ length: 33 }, (_, i) => i);
};

const updateSelectedKeypoints = (keypoints: number[]) => {
  localSelectedKeypoints.value = [...keypoints];
  // Update selected keypoints for all active pose landmarkers
  if (props.mode === 'single' && props.poseLandmarker?.setSelectedKeypoints) {
    props.poseLandmarker.setSelectedKeypoints(keypoints);
  } else if (props.mode === 'dual') {
    // Update both pose landmarkers in dual mode
    if (props.poseLandmarkerA?.setSelectedKeypoints) {
      props.poseLandmarkerA.setSelectedKeypoints(keypoints);
    }
    if (props.poseLandmarkerB?.setSelectedKeypoints) {
      props.poseLandmarkerB.setSelectedKeypoints(keypoints);
    }
  }
  console.log(
    '🎯 [UnifiedVideoPlayer] Selected keypoints updated:',
    keypoints.length,
    'keypoints'
  );
};

const openKeypointSelector = () => {
  // Initialize local state with current selection
  localSelectedKeypoints.value = getCurrentSelectedKeypoints();
  showKeypointSelector.value = true;
};

// Camera calibration methods moved to App.vue level
// Expose calibration state for other components
const getCalibrationState = () => ({
  isCalibrated: cameraCalibration.cameraParameters.position !== null,
  calibrationError: cameraCalibration.calibrationError.value,
});

// Heatmap tracking methods
const toggleHeatmap = () => {
  console.log('🗺️ [Heatmap] Toggle clicked', {
    isCalibrated: cameraCalibration.cameraParameters.position !== null,
    isTracking: positionHeatmap.isTracking.value,
    showMinimap: showHeatmapMinimap.value,
  });

  if (cameraCalibration.cameraParameters.position === null) {
    console.warn(
      '🗺️ [Heatmap] Camera must be calibrated before using heatmap tracking'
    );
    return;
  }

  if (positionHeatmap.isTracking.value) {
    // Stop tracking and show heatmap
    console.log('🗺️ [Heatmap] Stopping tracking and generating heatmap');
    positionHeatmap.stopTracking();
    positionHeatmap.generateHeatmap();
    showHeatmapMinimap.value = true;
  } else {
    // Start tracking
    console.log('🗺️ [Heatmap] Starting position tracking');
    positionHeatmap.startTracking();
    showHeatmapMinimap.value = true;
  }

  console.log('🗺️ [Heatmap] Toggle complete', {
    isTracking: positionHeatmap.isTracking.value,
    showMinimap: showHeatmapMinimap.value,
    positionHistory: positionHeatmap.positionHistory.value.length,
  });
};

// Setup video event listeners
const setupVideoEventListeners = (
  videoElement: HTMLVideoElement,
  videoState: any,
  videoLabel?: string
) => {
  if (!videoElement) return;

  const videoId = videoLabel
    ? `video-${videoLabel.toLowerCase()}`
    : props.videoId;

  videoElement.addEventListener('timeupdate', () => {
    currentTime.value = videoElement.currentTime;
    updateFrameFromTime();

    // DEBUG: Log video timing
    console.log(
      `🎬 [VideoPlayer] timeupdate - currentTime: ${videoElement.currentTime.toFixed(
        3
      )}s, frame: ${currentFrame.value}`
    );

    // Update pose landmarker current frame
    if (props.poseLandmarker) {
      props.poseLandmarker.setCurrentFrame(currentFrame.value);
    }
    if (props.poseLandmarkerA && videoLabel === 'A') {
      props.poseLandmarkerA.setCurrentFrame(currentFrame.value);
    }
    if (props.poseLandmarkerB && videoLabel === 'B') {
      props.poseLandmarkerB.setCurrentFrame(currentFrame.value);
    }

    // Process pose detection for current frame (optimized with frame skipping)
    if (props.enablePoseDetection) {
      processPoseDetection(videoElement, videoLabel);
    }

    emit('time-update', {
      currentTime: videoElement.currentTime,
      duration: videoElement.duration || duration.value,
      videoId,
    });
    emit('frame-update', {
      currentFrame: currentFrame.value,
      totalFrames: totalFrames.value,
      fps: fps.value,
      videoId,
    });
  });

  videoElement.addEventListener('durationchange', () => {
    duration.value = videoElement.duration;
    emit('duration-change', videoElement.duration);
    detectFPS();
    emit('fps-detected', {
      fps: fps.value,
      totalFrames: totalFrames.value,
    });
  });

  videoElement.addEventListener('play', () => {
    isPlaying.value = true;
    emit('play');
  });

  videoElement.addEventListener('pause', () => {
    isPlaying.value = false;
    emit('pause');
  });

  videoElement.addEventListener('ended', () => {
    isPlaying.value = false;
  });

  videoElement.addEventListener('loadstart', () => {
    if (props.mode === 'single') {
      singleVideoState.value.isLoading = true;
    } else if (videoState) {
      videoState.isLoaded = false;
    }
  });

  videoElement.addEventListener('loadeddata', () => {
    duration.value = videoElement.duration;
    if (videoElement.duration > 0) {
      emit('duration-change', videoElement.duration);
    }

    if (props.mode === 'single') {
      singleVideoState.value.isLoading = false;

      // Debug video dimensions to understand native vs rendered size when helper is present
      const debugVideoDimensions = (globalThis as Record<string, unknown>)
        .debugVideoDimensions;
      if (typeof debugVideoDimensions === 'function') {
        (debugVideoDimensions as (video: HTMLVideoElement) => void)(
          videoElement
        );
      }

      // Get actual native dimensions from the video file
      const nativeWidth = videoElement.videoWidth;
      const nativeHeight = videoElement.videoHeight;

      console.log('📹 [UnifiedVideoPlayer] Video Native Dimensions:', {
        nativeWidth,
        nativeHeight,
        hasValidDimensions: nativeWidth > 0 && nativeHeight > 0,
        fallbackUsed: nativeWidth === 0 || nativeHeight === 0,
      });

      // Create video data object for the loaded event
      const videoData = {
        id: props.videoId || 'default-video',
        url: props.videoUrl || '',
        duration: videoElement.duration,
        dimensions: {
          width: nativeWidth || 1920, // Only use fallback if truly needed
          height: nativeHeight || 1080,
        },
        videoType: props.videoUrl?.startsWith('blob:') ? 'upload' : 'url',
        fps: 30, // Default FPS, will be updated by FPS detection
        totalFrames: Math.floor((videoElement.duration || 0) * 30),
      };

      emit('loaded', videoData);
    } else if (videoState) {
      videoState.isLoaded = true;
      if (videoLabel === 'A') {
        emit('video-a-loaded');
      } else if (videoLabel === 'B') {
        emit('video-b-loaded');
      }
    }
  });

  // Add rich error diagnostics
  // Add rich error diagnostics
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  videoElement.addEventListener('error', (e) => {
    const mediaError = (videoElement as HTMLVideoElement).error;
    const codes: Record<number, string> = {
      1: 'ABORTED',
      2: 'NETWORK',
      3: 'DECODE',
      4: 'SRC_NOT_SUPPORTED',
    };
    const codeName = mediaError?.code
      ? codes[mediaError.code] || `CODE_${mediaError.code}`
      : 'UNKNOWN';
    const currentSrc =
      (videoElement as HTMLVideoElement).currentSrc || '(no currentSrc)';
    const errorMsg = `Error loading video [${
      videoLabel || 'single'
    }]: ${codeName} | src=${currentSrc}`;

    console.error('❌ [UnifiedVideoPlayer] video error:', {
      label: videoLabel,
      code: mediaError?.code,
      codeName,
      message: (mediaError as any)?.message,
      currentSrc,
    });

    if (props.mode === 'single') {
      singleVideoState.value.error = errorMsg;
    } else if (videoState) {
      videoState.isLoaded = false;
    }

    emit('error', errorMsg);
  });

  videoElement.addEventListener('volumechange', () => {
    volume.value = videoElement.volume;
    isMuted.value = videoElement.muted;
  });

  // Set initial volume
  videoElement.volume = volume.value;
};

// Watch for video elements and set up event listeners
watch(
  singleVideoElement,
  (video) => {
    if (video && props.mode === 'single') {
      playerRef.value = video;
      setupVideoEventListeners(video, null);
    }
  },
  { flush: 'post' }
);

watch(
  videoAElement,
  (video) => {
    if (video && props.mode === 'dual') {
      if (props.videoAState) {
        setupVideoEventListeners(video, props.videoAState, 'A');
      }
      const videoARef = props.dualVideoPlayer?.videoARef;
      if (videoARef) {
        videoARef.value = video;
      }
    }
  },
  { flush: 'post' }
);

watch(
  videoBElement,
  (video) => {
    if (video && props.mode === 'dual') {
      if (props.videoBState) {
        setupVideoEventListeners(video, props.videoBState, 'B');
      }
      const videoBRef = props.dualVideoPlayer?.videoBRef;
      if (videoBRef) {
        videoBRef.value = video;
      }
    }
  },
  { flush: 'post' }
);

// Watch for canvas refs and set them in dual video player
watch(
  [drawingCanvasARef, drawingCanvasBRef],
  ([canvasA, canvasB]) => {
    if (
      props.mode === 'dual' &&
      props.dualVideoPlayer &&
      props.dualVideoPlayer.setCanvasRefs
    ) {
      props.dualVideoPlayer.setCanvasRefs(canvasA, canvasB);
    }
  },
  { flush: 'post' }
);

// Watch for video URL changes
watch(
  () => props.videoUrl,
  (newUrl) => {
    if (newUrl && singleVideoElement.value) {
      playerRef.value = singleVideoElement.value;
      singleVideoElement.value.src = newUrl;
      singleVideoElement.value.load();
    }
  },
  { flush: 'post' }
);

// Watch for dual video URL changes
watch(
  () => [props.videoAUrl, props.videoBUrl],
  async ([newVideoAUrl, newVideoBUrl]) => {
    console.log('🔍 [UnifiedVideoPlayer] Video URLs changed:', {
      mode: props.mode,
      videoAUrl: newVideoAUrl,
      videoBUrl: newVideoBUrl,
      hasAEl: !!videoAElement.value,
      hasBEl: !!videoBElement.value,
    });

    if (props.mode !== 'dual') return;

    // Ensure DOM refs are mounted before setting src
    await nextTick();

    const setSrcAndLoad = (
      el: HTMLVideoElement | null,
      url?: string,
      label?: string
    ) => {
      if (!el || !url) return;
      // Force a clean load by clearing source first (avoids some browser caching edge cases)
      try {
        el.pause();
      } catch {}
      el.removeAttribute('src');
      // Also clear any &download query residue if present (defensive; not required)
      el.load();

      console.log(`🎯 [UnifiedVideoPlayer] Binding ${label} src`, { url });
      el.src = url;
      el.load();

      // Attach one-time verbose diagnostics
      const onLoadedMeta = () => {
        console.log(`✅ [UnifiedVideoPlayer] ${label} loadedmetadata`, {
          duration: el.duration,
          videoWidth: el.videoWidth,
          videoHeight: el.videoHeight,
          currentSrc: el.currentSrc,
        });
        el.removeEventListener('loadedmetadata', onLoadedMeta);
      };
      const onCanPlay = () => {
        console.log(`✅ [UnifiedVideoPlayer] ${label} canplay`, {
          readyState: el.readyState,
          currentTime: el.currentTime,
        });
        el.removeEventListener('canplay', onCanPlay);
      };
      const onErr = () => {
        const me = el.error;
        console.error(`❌ [UnifiedVideoPlayer] ${label} error`, {
          code: me?.code,
          currentSrc: el.currentSrc,
        });
        el.removeEventListener('error', onErr);
      };
      el.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      el.addEventListener('canplay', onCanPlay, { once: true });
      el.addEventListener('error', onErr, { once: true });
    };

    setSrcAndLoad(videoAElement.value, newVideoAUrl, 'Video A');
    setSrcAndLoad(videoBElement.value, newVideoBUrl, 'Video B');
  },
  { flush: 'post', immediate: true }
);

// Volume control
const handleVolumeChange = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const newVolume = parseFloat(target?.value ?? '1');
  setVolume(newVolume);
};

const handleSpeedSelect = (event: Event) => {
  const target = event.target as HTMLSelectElement | null;
  const nextSpeed = Number.parseFloat(target?.value ?? '1');
  if (Number.isNaN(nextSpeed)) {
    handleSpeedChange(1);
    return;
  }
  handleSpeedChange(nextSpeed);
};

// Custom speed control for dual video mode
const handleSpeedChange = (speed: number) => {
  if (props.mode === 'dual') {
    // For dual video mode, use the dual video player's setPlaybackRate method
    if (props.dualVideoPlayer && props.dualVideoPlayer.setPlaybackRate) {
      props.dualVideoPlayer.setPlaybackRate(speed);
    } else {
      // Fallback: directly set playback rate on both video elements
      if (videoAElement.value) {
        videoAElement.value.playbackRate = speed;
      }
      if (videoBElement.value) {
        videoBElement.value.playbackRate = speed;
      }
    }
    // Update the playback speed state
    playbackSpeed.value = speed;
  } else {
    // For single video mode, use the original setPlaybackSpeed
    setPlaybackSpeed(speed);
  }
};

// Handle video fade transition when seeking to a new frame
const performVideoFadeTransition = async (seekFunction: () => void) => {
  // Start fade transition
  isVideoTransitioning.value = true;

  // Fade out video
  videoOpacity.value = 0;

  // Wait for fade out to complete
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Perform the seek operation
  seekFunction();

  // Wait a bit for the video to update the frame
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Fade in video
  videoOpacity.value = 1;

  // Wait for fade in to complete, then end transition
  setTimeout(() => {
    isVideoTransitioning.value = false;
  }, 150);
};

// Handle video click
const handleVideoClick = () => {
  console.log(
    '🎬 [UnifiedVideoPlayer] Video click detected, isPlaying:',
    isPlaying.value
  );

  // Only pause if currently playing to avoid interfering with play button
  if (isPlaying.value) {
    console.log('🎬 [UnifiedVideoPlayer] Pausing video due to click');
    pause();
  } else {
    console.log('🎬 [UnifiedVideoPlayer] Video not playing, ignoring click');
  }

  emit('video-click');
};

// Pose detection controls
const togglePoseDetection = async () => {
  hidePoseTooltip();
  if (props.poseLandmarker) {
    await props.poseLandmarker.togglePoseDetection();
    console.log(
      '🤖 [UnifiedVideoPlayer] Pose detection toggled:',
      props.poseLandmarker.isEnabled.value
    );

    // If pose detection was just enabled and we have a video, process the current frame
    if (props.poseLandmarker.isEnabled.value) {
      hideSpeedToggleIndicator();
      if (props.mode === 'single' && singleVideoElement.value) {
        processPoseDetection(singleVideoElement.value);
      }
      // For dual mode, pose detection is handled separately for each video
    }
  }
};

// Drawing event handlers
const handleDrawingCreated = (drawing: DrawingData, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from based on the canvas ref
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing created on video ${videoContext}:`,
      drawing
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-created', drawing, videoContext);
  } else {
    emit('drawing-created', drawing);
  }
};

const handleDrawingUpdated = (drawing: DrawingData, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing updated on video ${videoContext}:`,
      drawing
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-updated', drawing, videoContext);
  } else {
    emit('drawing-updated', drawing);
  }
};

const handleDrawingDeleted = (drawingId: string, event?: Event) => {
  if (props.mode === 'dual') {
    // Determine which video the drawing came from
    const target = event?.target as HTMLElement;
    const canvasA = drawingCanvasARef.value?.$el;
    const canvasB = drawingCanvasBRef.value?.$el;

    let videoContext = 'A'; // default
    if (target && canvasB && (target === canvasB || canvasB.contains(target))) {
      videoContext = 'B';
    }

    console.log(
      `🎨 [UnifiedVideoPlayer] Drawing deleted on video ${videoContext}:`,
      drawingId
    );

    // CRITICAL FIX: Pass the detected video context to the parent
    emit('drawing-deleted', drawingId, videoContext);
  } else {
    emit('drawing-deleted', drawingId);
  }
};

// Lifecycle
onMounted(() => {
  startListening();

  // Set up video dimensions for drawing canvas
  nextTick(() => {
    if (
      props.mode === 'single' &&
      singleVideoElement.value &&
      props.drawingCanvas
    ) {
      const video = singleVideoElement.value;
      (props.drawingCanvas as any).setVideoSize?.(
        video.videoWidth || 1920,
        video.videoHeight || 1080
      );
    }
  });
});

onUnmounted(() => {
  stopListening();
});

// Expose methods to parent component
defineExpose({
  seekTo,
  play,
  pause,
  togglePlayPause,
  performVideoFadeTransition,
  singleVideoElement,
  videoAElement,
  videoBElement,
  // Expose drawing canvas refs for annotation panel
  singleDrawingCanvasRef,
  drawingCanvasARef,
  drawingCanvasBRef,
  // Expose calibration state and video element for calibration
  getCalibrationState,
  getCurrentVideoElement: () => {
    if (props.mode === 'single') {
      return singleVideoElement.value;
    }
    const primary = props.primaryVideo === 'B' ? videoBElement : videoAElement;
    const secondary =
      props.primaryVideo === 'B' ? videoAElement : videoBElement;
    return primary.value ?? secondary.value ?? null;
  },
  getCurrentVideoContainer: () => {
    if (props.mode === 'single') {
      return singleVideoContainer.value;
    }
    const primary = props.primaryVideo === 'B' ? videoBElement : videoAElement;
    const container =
      primary.value?.parentElement ??
      (props.primaryVideo === 'B'
        ? videoAElement.value?.parentElement
        : videoBElement.value?.parentElement);
    return container ?? null;
  },
});
</script>

<style scoped>
.dual-speed-panels {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}
.dual-speed-panels.compact {
  gap: 8px;
}
@media (min-width: 900px) {
  .dual-speed-panels {
    grid-template-columns: 1fr 1fr;
  }
  /* For large screens, show 2x2 grid rows with smaller card height */
  .dual-speed-panels.compact {
    grid-template-columns: 1fr 1fr;
  }
}
.movement-speed-container {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}
.compact-card {
  padding: 8px 10px;
}
.movement-speed-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

/* New dual speed content layout */
.dual-speed-content {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.speed-mini-cards {
  flex: 0 0 auto;
  min-width: 180px;
}

.speed-chart-section {
  flex: 1;
  min-width: 0;
}

.speed-panel-container-dual {
  background-color: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.8);
  border-radius: 8px;
  padding: 8px;
  min-width: 180px;
}

/* Mini card styles */
.mini-card {
  background-color: rgba(249, 250, 251, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.6);
  border-radius: 6px;
  padding: 6px 8px;
  text-align: center;
}

.mini-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.mini-value {
  font-size: 0.9rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 2px;
}

.mini-select {
  font-size: 0.75rem;
  padding: 2px 4px;
  border: 1px solid rgba(209, 213, 219, 0.8);
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.9);
  color: #374151;
  width: 100%;
  margin-top: 2px;
}

.mini-select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

/* Camera calibration button styles */
.control-button.calibrated {
  background-color: rgba(34, 197, 94, 0.1);
  border-color: rgba(34, 197, 94, 0.3);
}

.control-button.calibrated .control-icon {
  color: #22c55e;
}

.control-button.calibrated:hover {
  background-color: rgba(34, 197, 94, 0.2);
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .dual-speed-content {
    flex-direction: column;
    gap: 12px;
  }

  .speed-mini-cards {
    min-width: auto;
  }
}
:deep(.speed-panel-root) {
  /* If SpeedVisualization exposes a root class, tighten spacing */
  --panel-padding: 6px;
  --panel-gap: 6px;
  --chip-size: 0.8rem;
}
</style>

<style scoped>
.unified-video-player {
  width: 100%;
  height: 100%;
  margin: 0 auto;
}

.single-video-container,
.dual-video-container {
  width: 100%;
  height: 100%;
}

.video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px;
  background: black;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  display: grid;
  place-items: center;
  /* Safari-specific fixes */
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  contain: layout style;
}

.video-element {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  display: block;
  cursor: pointer;
  transition: opacity 150ms ease-in-out;
  object-fit: contain;
  object-position: center;
  /* Safari-specific fixes for video sizing */
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
  flex-shrink: 0;
  /* Prevent Safari from growing the video beyond container */
  min-width: 0;
  min-height: 0;
}

.video-wrapper > * {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
}

.video-element.video-fade-transition {
  transition: opacity 150ms ease-in-out;
}

/* Loading States */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  border-radius: 0.5rem;
}

.loading-spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top: 3px solid #ffffff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.loading-text {
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Error States */
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: white;
  text-align: center;
  padding: 2rem;
}

.error-icon {
  width: 3rem;
  height: 3rem;
  margin-bottom: 1rem;
  color: #ef4444;
}

.error-message {
  font-size: 0.875rem;
  margin-bottom: 1rem;
  color: #d1d5db;
}

.retry-button {
  background: #374151;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background: #4b5563;
}

/* Placeholder */
.no-video-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 24rem;
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
}

.placeholder-icon {
  width: 4rem;
  height: 4rem;
  margin-bottom: 1rem;
  color: #6b7280;
}

.placeholder-title {
  font-size: 1.125rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: #d1d5db;
}

.placeholder-description {
  font-size: 0.875rem;
  max-width: 28rem;
  color: #9ca3af;
}

/* Dual Video Layout */
.videos-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  width: 100%;
  height: 100%;
  /* Safari-specific fixes */
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
}

.video-section {
  position: relative;
  height: 100%;
  /* Safari-specific fixes for video container growth */
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  -webkit-box-sizing: border-box;
  box-sizing: border-box;
}

.video-label {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  z-index: 20;
}

/* Controls */
.video-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
  color: white;
  padding: 1rem;
  z-index: 30;
}

.dual-video-controls {
  position: relative;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 10px;
  z-index: 30;
}

.controls-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.controls-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-button {
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: transparent;
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}

.control-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.control-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.control-button:disabled .control-icon {
  opacity: 0.6;
}

.control-icon {
  width: 1.25rem;
  height: 1.25rem;
  fill: currentColor;
}

.volume-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.volume-slider {
  width: 5rem;
  height: 0.25rem;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 9999px;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  appearance: none;
  width: 0.75rem;
  height: 0.75rem;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 0.75rem;
  height: 0.75rem;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.speed-controls {
  position: relative;
}

.speed-select {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.875rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  border: none;
  outline: none;
  cursor: pointer;
  transition: background-color 0.2s;
}

.speed-select:hover {
  background: rgba(255, 255, 255, 0.2);
}

.speed-select option {
  background: #1f2937;
  color: white;
}

/* Pose Controls */
.pose-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pose-toggle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.pose-next-step-tooltip {
  position: absolute;
  top: -2.35rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(17, 24, 39, 0.95);
  color: #f9fafb;
  font-size: 0.65rem;
  line-height: 1.1;
  padding: 0.35rem 0.5rem;
  border-radius: 0.35rem;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
  z-index: 15;
}

.pose-next-step-tooltip::after {
  content: '';
  position: absolute;
  bottom: -0.35rem;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0.35rem;
  border-style: solid;
  border-color: rgba(17, 24, 39, 0.95) transparent transparent transparent;
}

.calibration-toggle-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.calibration-next-step-tooltip {
  position: absolute;
  top: -2.35rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(17, 24, 39, 0.95);
  color: #f9fafb;
  font-size: 0.65rem;
  line-height: 1.1;
  padding: 0.35rem 0.5rem;
  border-radius: 0.35rem;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.35);
  z-index: 15;
}

.calibration-next-step-tooltip::after {
  content: '';
  position: absolute;
  bottom: -0.35rem;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0.35rem;
  border-style: solid;
  border-color: rgba(17, 24, 39, 0.95) transparent transparent transparent;
}

.speed-toggle-indicator {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 9999px;
  background: #22c55e;
  box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
  animation: speed-toggle-indicator-pulse 1.8s ease-out infinite;
  pointer-events: none;
}

.speed-toggle-indicator::after {
  content: '';
  position: absolute;
  inset: 0.2rem;
  border-radius: 9999px;
  background: #bbf7d0;
}

@keyframes speed-toggle-indicator-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.45);
  }
  70% {
    box-shadow: 0 0 0 0.6rem rgba(34, 197, 94, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}

.pose-control-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.pose-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  min-width: 1rem;
}

.roi-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.roi-control-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.shared-pose-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: 0.5rem;
  padding-left: 0.5rem;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.control-button.pose-active {
  background: rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.control-button.pose-loading {
  background: rgba(255, 255, 255, 0.1);
  color: #9ca3af;
  cursor: not-allowed;
}

.pose-loading-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Pose detection error overlay styles */
.pose-error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  pointer-events: none;
}

.pose-error-content {
  background: rgba(220, 38, 38, 0.9);
  color: white;
  padding: 16px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 300px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.pose-error-icon {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  stroke-width: 2;
}

.pose-error-message {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

/* Responsive */
@media (max-width: 768px) {
  .videos-grid {
    grid-template-columns: 1fr;
    height: 100%;
  }

  .volume-controls,
  .speed-controls,
  .pose-controls {
    display: none;
  }

  .pose-status-indicator {
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.5rem;
  }

  .pose-status-text {
    display: none;
  }
}

/* Large screen optimizations for TV displays */
@media (min-width: 1920px) {
  .unified-video-player {
    max-width: none;
  }

  .video-wrapper {
    border-radius: 0.75rem;
    min-height: 400px;
  }

  .video-element {
    min-width: 100%;
    min-height: 100%;
  }
}

/* Ultra-wide and TV display support */
@media (min-width: 2560px) {
  .video-wrapper {
    border-radius: 1rem;
    min-height: 600px;
  }

  .video-element {
    min-width: 100%;
    min-height: 100%;
  }
}

/* Force video scaling for all screen sizes */
@media (min-width: 1200px) {
  .video-element {
    min-width: 100%;
    min-height: 100%;
  }
}

/* Safari-specific fixes */
@supports (-webkit-appearance: none) {
  /* Target Safari specifically */
  .dual-video-container {
    /* Prevent container growth in Safari */
    max-height: 100vh;
    overflow: hidden;
  }

  .videos-grid {
    /* Force grid to respect container bounds in Safari */
    max-height: 100%;
    grid-template-rows: 1fr;
  }

  .video-section {
    /* Prevent video sections from growing beyond grid cell */
    max-height: 100%;
    max-width: 100%;
    contain: layout size;
  }

  .video-wrapper {
    /* Strict containment for Safari */
    max-height: 100%;
    max-width: 100%;
    contain: layout size style;
  }

  .video-element {
    /* Prevent video element from forcing container growth */
    max-height: 100% !important;
    max-width: 100% !important;
    height: auto;
    width: auto;
    object-fit: contain;
    /* Safari-specific video sizing fix */
    -webkit-transform: translateZ(0);
    transform: translateZ(0);
  }
}

/* Additional Safari WebKit specific fixes */
@media screen and (-webkit-min-device-pixel-ratio: 0) {
  .dual-video-container .video-wrapper {
    /* Force Safari to respect container dimensions */
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dual-video-container .video-element {
    /* Prevent Safari video from growing beyond wrapper */
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-height: 100%;
    max-width: 100%;
    height: auto;
    width: auto;
  }
}
</style>
