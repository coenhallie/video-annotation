<!-- eslint-disable vue/comment-directive -->
<template>
  <div class="unified-video-player">
    <!-- Single Video Mode -->
    <div v-if="mode === 'single'" class="single-video-container">
      <div class="video-wrapper">
        <!-- Loading indicator for single video -->
        <div v-if="singleVideoState.isLoading" class="loading-overlay">
          <div class="loading-spinner"></div>
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
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <p class="error-message">{{ singleVideoState.error }}</p>
          <button @click="singleVideoState.error = null" class="retry-button">
            Try Again
          </button>
        </div>

        <!-- Placeholder when no video URL -->
        <div v-if="!videoUrl" class="no-video-placeholder">
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
          :src="videoUrl"
          :poster="poster"
          :autoplay="autoplay"
          preload="metadata"
          crossorigin="anonymous"
          @click="handleVideoClick"
        >
          Your browser does not support the video tag.
        </video>

        <!-- Drawing Canvas Overlay for Single Video -->
        <DrawingCanvas
          v-if="videoUrl && drawingCanvas"
          ref="singleDrawingCanvasRef"
          :current-frame="currentFrame"
          :is-drawing-mode="drawingCanvas?.isDrawingMode?.value"
          :selected-tool="drawingCanvas?.currentTool?.value?.type"
          :stroke-width="drawingCanvas?.currentTool?.value?.strokeWidth"
          :severity="drawingCanvas?.currentTool?.value?.severity"
          :existing-drawings="drawingCanvas?.allDrawings?.value"
          :is-loading-drawings="drawingCanvas?.isLoadingDrawings?.value"
          @drawing-created="handleDrawingCreated"
          @drawing-updated="handleDrawingUpdated"
          @drawing-deleted="handleDrawingDeleted"
        />

        <!-- Pose Visualization Overlay for Single Video -->
        <PoseVisualization
          v-if="videoUrl && poseLandmarker"
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
        />

        <!-- Enhanced ROI Selector Overlay for Single Video -->
        <ROISelector
          v-if="videoUrl && poseLandmarker && roiSettings.enabled"
          :canvas-width="singleVideoElement?.videoWidth || 1920"
          :canvas-height="singleVideoElement?.videoHeight || 1080"
          :current-r-o-i="roiSettings.currentROI"
          :predicted-r-o-i="roiSettings.predictedROI"
          :roi-history="roiSettings.roiHistory"
          :roi-confidence="roiSettings.roiConfidence"
          :stability-metrics="roiSettings.stabilityMetrics"
          :adaptive-r-o-i="(roiSettings as any).useAdaptiveROI"
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
          @adaptive-roi-toggled="handleAdaptiveROIToggled"
          @motion-prediction-toggled="handleMotionPredictionToggled"
        />

        <!-- Speed Visualization Overlay for Single Video -->
        <SpeedVisualization
          v-if="videoUrl && poseLandmarker"
          :speed-metrics="poseLandmarker?.speedMetrics"
          :canvas-width="singleVideoElement?.videoWidth || 1920"
          :canvas-height="singleVideoElement?.videoHeight || 1080"
          :video-loaded="!!videoUrl"
          :current-timestamp="currentTime"
          :current-frame="currentFrame"
        />

        <!-- Custom controls for single video -->
        <div v-if="controls && videoUrl" class="video-controls">
          <div class="controls-content">
            <div class="controls-left">
              <!-- Play/Pause button -->
              <button
                @click="togglePlayPause"
                class="control-button"
                :aria-label="isPlaying ? 'Pause' : 'Play'"
              >
                <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16"></rect>
                  <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
                <svg v-else class="control-icon" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21"></polygon>
                </svg>
              </button>

              <!-- Volume controls -->
              <div class="volume-controls">
                <button
                  @click="toggleMute"
                  class="control-button"
                  :aria-label="isMuted ? 'Unmute' : 'Mute'"
                >
                  <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                  <svg
                    v-else-if="volume < 0.5"
                    class="control-icon"
                    viewBox="0 0 24 24"
                  >
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                  <svg v-else class="control-icon" viewBox="0 0 24 24">
                    <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  :value="isMuted ? 0 : volume"
                  @input="handleVolumeChange"
                  class="volume-slider"
                  :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
                />
              </div>

              <!-- Speed controls -->
              <div class="speed-controls">
                <select
                  :value="playbackSpeed"
                  @change="
                    handleSpeedChange(
                      parseFloat(
                        $event.target && $event.target.value
                          ? $event.target.value
                          : '1'
                      )
                    )
                  "
                  class="speed-select"
                  :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
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
                <button
                  @click="togglePoseDetection"
                  class="control-button"
                  :class="{
                    'pose-active': poseLandmarker.isEnabled.value,
                    'pose-loading': poseLandmarker.isLoading.value,
                  }"
                  :disabled="poseLandmarker.isLoading.value"
                  :aria-label="
                    poseLandmarker.isLoading.value
                      ? 'Loading pose detection...'
                      : poseLandmarker.isEnabled.value
                      ? 'Disable pose visualization'
                      : 'Enable pose visualization'
                  "
                  :title="
                    poseLandmarker.isLoading.value
                      ? 'Loading pose detection...'
                      : 'Toggle pose visualization'
                  "
                >
                  <!-- Loading spinner -->
                  <div
                    v-if="poseLandmarker.isLoading.value"
                    class="pose-loading-spinner"
                  ></div>
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

                <!-- Labels toggle (only show when pose detection is enabled) -->
                <button
                  v-if="poseLandmarker.isEnabled.value"
                  @click="
                    poseVisualizationSettings.showLabels =
                      !poseVisualizationSettings.showLabels
                  "
                  class="control-button"
                  :class="{
                    'pose-active': poseVisualizationSettings.showLabels,
                  }"
                  title="Toggle skeleton labels"
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

                <!-- Keypoint Selection Button (only show when pose detection is enabled) -->
                <button
                  v-if="poseLandmarker.isEnabled.value"
                  @click="openKeypointSelector"
                  class="control-button"
                  :class="{
                    'pose-active': showKeypointSelector,
                  }"
                  title="Select keypoints to track"
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
                  @click="toggleROIMode"
                  class="control-button"
                  :class="{ 'pose-active': roiSettings.enabled }"
                  title="Toggle ROI selection"
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
              v-if="!videoAState?.isLoaded && videoAUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner"></div>
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
              :current-frame="currentFrame"
              :is-drawing-mode="drawingCanvasA?.isDrawingMode?.value"
              :selected-tool="drawingCanvasA?.currentTool?.value?.type"
              :stroke-width="drawingCanvasA?.currentTool?.value?.strokeWidth"
              :severity="drawingCanvasA?.currentTool?.value?.severity"
              :existing-drawings="drawingCanvasA?.allDrawings?.value"
              :is-loading-drawings="drawingCanvasA?.isLoadingDrawings?.value"
              @drawing-created="
                (drawing: any, event: Event) => handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing: any, event: Event) => handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId: string, event: Event) => handleDrawingDeleted(drawingId, event)
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
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p class="pose-error-message">{{ poseDetectionErrorA }}</p>
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
              :adaptive-r-o-i="(roiSettingsA as any).useAdaptiveROI"
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
              @adaptive-roi-toggled="() => handleAdaptiveROIToggled('A')"
              @motion-prediction-toggled="
                () => handleMotionPredictionToggled('A')
              "
            />

            <!-- Speed Visualization Overlay for Video A -->
            <SpeedVisualization
              v-if="videoAUrl && poseLandmarkerA"
              :speed-metrics="poseLandmarkerA?.speedMetrics"
              :canvas-width="videoAElement?.videoWidth || 1920"
              :canvas-height="videoAElement?.videoHeight || 1080"
              :video-loaded="!!videoAUrl"
              :current-timestamp="currentTime"
              :current-frame="currentFrame"
            />
          </div>
        </div>

        <!-- Video B -->
        <div class="video-section">
          <div class="video-label">Video B</div>
          <div class="video-wrapper">
            <!-- Loading indicator for Video B -->
            <div
              v-if="!videoBState?.isLoaded && videoBUrl"
              class="loading-overlay"
            >
              <div class="loading-spinner"></div>
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
              :current-frame="currentFrame"
              :is-drawing-mode="drawingCanvasB?.isDrawingMode?.value"
              :selected-tool="drawingCanvasB?.currentTool?.value?.type"
              :stroke-width="drawingCanvasB?.currentTool?.value?.strokeWidth"
              :severity="drawingCanvasB?.currentTool?.value?.severity"
              :existing-drawings="drawingCanvasB?.allDrawings?.value"
              :is-loading-drawings="drawingCanvasB?.isLoadingDrawings?.value"
              @drawing-created="
                (drawing, event) => handleDrawingCreated(drawing, event)
              "
              @drawing-updated="
                (drawing, event) => handleDrawingUpdated(drawing, event)
              "
              @drawing-deleted="
                (drawingId, event) => handleDrawingDeleted(drawingId, event)
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
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p class="pose-error-message">{{ poseDetectionErrorB }}</p>
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
              :adaptive-r-o-i="(roiSettingsB as any).useAdaptiveROI"
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
              @adaptive-roi-toggled="() => handleAdaptiveROIToggled('B')"
              @motion-prediction-toggled="
                () => handleMotionPredictionToggled('B')
              "
            />

            <!-- Speed Visualization Overlay for Video B -->
            <SpeedVisualization
              v-if="videoBUrl && poseLandmarkerB"
              :speed-metrics="poseLandmarkerB?.speedMetrics"
              :canvas-width="videoBElement?.videoWidth || 1920"
              :canvas-height="videoBElement?.videoHeight || 1080"
              :video-loaded="!!videoBUrl"
              :current-timestamp="currentTime"
              :current-frame="currentFrame"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Custom controls for dual video -->
    <div
      v-if="controls && (videoAUrl || videoBUrl)"
      class="dual-video-controls"
    >
      <div class="controls-content">
        <div class="controls-left">
          <!-- Play/Pause button for both videos -->
          <button
            @click="toggleDualPlayPause"
            class="control-button"
            :aria-label="isPlaying ? 'Pause both videos' : 'Play both videos'"
          >
            <svg v-if="isPlaying" class="control-icon" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            <svg v-else class="control-icon" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21"></polygon>
            </svg>
          </button>

          <!-- Volume controls -->
          <div class="volume-controls">
            <button
              @click="toggleMute"
              class="control-button"
              :aria-label="isMuted ? 'Unmute' : 'Mute'"
            >
              <svg v-if="isMuted" class="control-icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
              <svg
                v-else-if="volume < 0.5"
                class="control-icon"
                viewBox="0 0 24 24"
              >
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <svg v-else class="control-icon" viewBox="0 0 24 24">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              :value="isMuted ? 0 : volume"
              @input="handleVolumeChange"
              class="volume-slider"
              :aria-label="'Volume: ' + Math.round(volume * 100) + '%'"
            />
          </div>

          <!-- Speed controls -->
          <div class="speed-controls">
            <select
              :value="playbackSpeed"
              @change="
                handleSpeedChange(
                  parseFloat(
                    $event.target && $event.target.value
                      ? $event.target.value
                      : '1'
                  )
                )
              "
              class="speed-select"
              :aria-label="'Playback speed: ' + playbackSpeed + 'x'"
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
                @click="togglePoseDetectionA"
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
              >
                <!-- Loading spinner -->
                <div
                  v-if="poseLandmarkerA.isLoading.value"
                  class="pose-loading-spinner"
                ></div>
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
                @click="togglePoseDetectionB"
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
              >
                <!-- Loading spinner -->
                <div
                  v-if="poseLandmarkerB.isLoading.value"
                  class="pose-loading-spinner"
                ></div>
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
                  @click="toggleROIModeA"
                  class="control-button"
                  :class="{ 'pose-active': roiSettingsA.enabled }"
                  title="Toggle ROI selection for Video A"
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
                  @click="toggleROIModeB"
                  class="control-button"
                  :class="{ 'pose-active': roiSettingsB.enabled }"
                  title="Toggle ROI selection for Video B"
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
                @click="
                  poseVisualizationSettings.showLabels =
                    !poseVisualizationSettings.showLabels
                "
                class="control-button"
                :class="{
                  'pose-active': poseVisualizationSettings.showLabels,
                }"
                title="Toggle skeleton labels"
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
                @click="openKeypointSelector"
                class="control-button"
                :class="{
                  'pose-active': showKeypointSelector,
                }"
                title="Select keypoints to track"
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
  computed,
  reactive,
} from 'vue';
import DrawingCanvas from './DrawingCanvas.vue';
import PoseVisualization from './PoseVisualization.vue';
import SpeedVisualization from './SpeedVisualization.vue';
// @ts-ignore: Vue SFC without d.ts
import ROISelector from './ROISelector.vue';
import KeypointSelectorModal from './KeypointSelectorModal.vue';
import { useVideoPlayer } from '../composables/useVideoPlayer.ts';
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
    value: { type: string; strokeWidth: number; severity: string };
  };
  allDrawings: { value: any[] };
  isLoadingDrawings: { value: boolean };
  setVideoSize?: (w: number, h: number) => void;
  disableDrawingMode?: () => void;
}
interface Props {
  mode?: 'single' | 'dual';
  // Single video props
  videoUrl?: string;
  videoId?: string;
  autoplay?: boolean;
  controls?: boolean;
  poster?: string;
  // Accept unknown but narrow at use-sites; keep template happy with optional chaining
  drawingCanvas?: Partial<DrawingCanvasLike> | unknown;
  // Dual video props
  videoAUrl?: string;
  videoAId?: string;
  videoBUrl?: string;
  videoBId?: string;
  drawingCanvasA?: Partial<DrawingCanvasLike> | unknown;
  drawingCanvasB?: Partial<DrawingCanvasLike> | unknown;
  videoAState?:
    | { isLoaded?: boolean; fps?: number; duration?: number }
    | Record<string, any>
    | unknown;
  videoBState?:
    | { isLoaded?: boolean; fps?: number; duration?: number }
    | Record<string, any>
    | unknown;
  dualVideoPlayer?:
    | {
        pauseVideoA?: () => void;
        pauseVideoB?: () => void;
        playVideoA?: () => void;
        playVideoB?: () => void;
        videoARef?: { value: HTMLVideoElement | null };
        videoBRef?: { value: HTMLVideoElement | null };
        setCanvasRefs?: (a: any, b: any) => void;
      }
    | unknown;
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
  useAdaptiveROI: true,
  useMotionPrediction: true,
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
  useAdaptiveROI: true,
  useMotionPrediction: true,
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
  useAdaptiveROI: true,
  useMotionPrediction: true,
});

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
    (poseData) => {
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

// Stop RAF-based pose detection
const stopRAFPoseDetection = (videoContext?: string) => {
  const poseLandmarker =
    videoContext === 'A'
      ? props.poseLandmarkerA
      : videoContext === 'B'
      ? props.poseLandmarkerB
      : props.poseLandmarker;

  if (poseLandmarker) {
    poseLandmarker.stopPoseDetectionRAF();
  }
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
    const regionOfInterest = roi
      ? {
          left: roi.x,
          top: roi.y,
          right: roi.x + roi.width,
          bottom: roi.y + roi.height,
        }
      : { left: 0, top: 0, right: 1, bottom: 1 };

    poseLandmarker.setOptions({ regionOfInterest }).catch((err: any) => {
      console.error(
        `[UnifiedVideoPlayer] Error setting ROI for ${
          videoContext || 'single'
        }:`,
        err
      );
    });
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
const handleAdaptiveROIToggled = (videoContext?: string) => {
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
    roiSettingsToUpdate.useAdaptiveROI = !roiSettingsToUpdate.useAdaptiveROI;
    poseLandmarker.updateSettings({
      useAdaptiveROI: roiSettingsToUpdate.useAdaptiveROI,
    });
    console.log(
      `🎯 [UnifiedVideoPlayer] Adaptive ROI toggled for ${
        videoContext || 'single'
      }:`,
      roiSettingsToUpdate.useAdaptiveROI
    );
  }
};

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
      props.dualVideoPlayer.pauseVideoA();
      props.dualVideoPlayer.pauseVideoB();
    } else {
      props.dualVideoPlayer.playVideoA();
      props.dualVideoPlayer.playVideoB();
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
      stopRAFPoseDetection('A');
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
      stopRAFPoseDetection('B');
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
        useAdaptiveROI: true,
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

      // Create video data object for the loaded event
      const videoData = {
        id: props.videoId || 'default-video',
        url: props.videoUrl || '',
        duration: videoElement.duration,
        dimensions: {
          width: videoElement.videoWidth || 1920,
          height: videoElement.videoHeight || 1080,
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
      if (props.dualVideoPlayer) {
        props.dualVideoPlayer.videoARef.value = video;
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
      if (props.dualVideoPlayer) {
        props.dualVideoPlayer.videoBRef.value = video;
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
  if (props.poseLandmarker) {
    await props.poseLandmarker.togglePoseDetection();
    console.log(
      '🤖 [UnifiedVideoPlayer] Pose detection toggled:',
      props.poseLandmarker.isEnabled.value
    );

    // If pose detection was just enabled and we have a video, process the current frame
    if (props.poseLandmarker.isEnabled.value) {
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
});
</script>

<style scoped>
.unified-video-player {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

.single-video-container,
.dual-video-container {
  width: 100%;
}

.video-wrapper {
  position: relative;
  width: 100%;
  background: black;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

.video-element {
  width: 100%;
  height: auto;
  display: block;
  cursor: pointer;
  transition: opacity 150ms ease-in-out;
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
}

.video-section {
  position: relative;
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

.control-button:hover {
  background: rgba(255, 255, 255, 0.1);
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
</style>
