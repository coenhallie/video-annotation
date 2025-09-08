<template>
  <Transition name="fade-slide">
    <div v-if="show" class="calibration-success-overlay">
      <div class="overlay-content">
        <div class="success-header">
          <svg
            class="checkmark"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 52 52"
          >
            <circle
              class="checkmark-circle"
              cx="26"
              cy="26"
              r="25"
              fill="none"
            />
            <path
              class="checkmark-check"
              fill="none"
              d="M14.1 27.2l7.1 7.2 16.7-16.8"
            />
          </svg>
          <h2>Camera Calibration Complete!</h2>
        </div>

        <div class="calibration-details">
          <div class="detail-item">
            <span class="label">Accuracy:</span>
            <span class="value">{{ accuracy }}%</span>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: accuracy + '%' }" />
            </div>
          </div>

          <div class="detail-item">
            <span class="label">Reprojection Error:</span>
            <span class="value">{{ error }} px</span>
          </div>
        </div>

        <div class="transformation-demo">
          <h3>How it works:</h3>
          <div class="demo-content">
            <div class="demo-side">
              <h4>Before (Pixels)</h4>
              <div class="coordinate-box">
                <div class="coord">
                  X: {{ exampleTransform?.imagePoint.x || '960' }}px
                </div>
                <div class="coord">
                  Y: {{ exampleTransform?.imagePoint.y || '540' }}px
                </div>
              </div>
              <div class="speed-example">
                <span class="speed-label">Speed:</span>
                <span class="speed-value old">~pixels/frame</span>
              </div>
            </div>

            <div class="arrow-container">
              <svg class="transform-arrow" viewBox="0 0 100 50">
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                  </marker>
                </defs>
                <line
                  x1="10"
                  y1="25"
                  x2="85"
                  y2="25"
                  stroke="#10b981"
                  stroke-width="2"
                  marker-end="url(#arrowhead)"
                />
              </svg>
              <span class="transform-label">Calibrated</span>
            </div>

            <div class="demo-side">
              <h4>After (Meters)</h4>
              <div class="coordinate-box">
                <div class="coord">
                  X: {{ exampleTransform?.worldPoint.x || '0.00' }}m
                </div>
                <div class="coord">
                  Y: {{ exampleTransform?.worldPoint.y || '0.00' }}m
                </div>
              </div>
              <div class="speed-example">
                <span class="speed-label">Speed:</span>
                <span class="speed-value new">km/h & m/s</span>
              </div>
            </div>
          </div>
        </div>

        <div class="benefits">
          <div class="benefit-item">
            <svg class="benefit-icon" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              />
            </svg>
            <span>Real-world speed measurements</span>
          </div>
          <div class="benefit-item">
            <svg class="benefit-icon" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              />
            </svg>
            <span>Accurate distance calculations</span>
          </div>
          <div class="benefit-item">
            <svg class="benefit-icon" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              />
            </svg>
            <span>Court position tracking</span>
          </div>
        </div>

        <div class="countdown">Closing in {{ countdown }} seconds...</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

interface Props {
  show: boolean;
  accuracy: number;
  error: string;
  exampleTransform?: {
    imagePoint: { x: number; y: number };
    worldPoint: { x: string; y: string; z: string };
    pixelsPerMeter: number;
  } | null;
}

const props = defineProps<Props>();

const countdown = ref(5);
let countdownInterval: number | null = null;

watch(
  () => props.show,
  (newShow) => {
    if (newShow) {
      countdown.value = 5;
      countdownInterval = window.setInterval(() => {
        countdown.value--;
        if (countdown.value <= 0 && countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      }, 1000);
    } else {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  }
);

onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
</script>

<style scoped>
.calibration-success-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
}

.overlay-content {
  background: white;
  border-radius: 12px;
  padding: 32px;
  max-width: 680px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid #e5e7eb;
}

.success-header {
  text-align: center;
  margin-bottom: 28px;
}

.checkmark {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
}

.checkmark-circle {
  stroke-dasharray: 166;
  stroke-dashoffset: 166;
  stroke-width: 2;
  stroke-miterlimit: 10;
  stroke: #10b981;
  animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
}

.checkmark-check {
  transform-origin: 50% 50%;
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  stroke: #10b981;
  stroke-width: 3;
  animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
}

@keyframes stroke {
  100% {
    stroke-dashoffset: 0;
  }
}

h2 {
  color: #1f2937;
  font-size: 24px;
  margin: 0;
  font-weight: 600;
  letter-spacing: -0.025em;
}

.calibration-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
}

.detail-item {
  background: #f9fafb;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.detail-item .label {
  display: block;
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 6px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-item .value {
  display: block;
  color: #1f2937;
  font-size: 22px;
  font-weight: 600;
  margin-bottom: 10px;
}

.progress-bar {
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #34d399);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.transformation-demo {
  background: #f9fafb;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 24px;
  border: 1px solid #e5e7eb;
}

.transformation-demo h3 {
  color: #374151;
  font-size: 16px;
  margin: 0 0 20px 0;
  text-align: center;
  font-weight: 600;
}

.demo-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.demo-side {
  flex: 1;
  text-align: center;
}

.demo-side h4 {
  color: #6b7280;
  font-size: 12px;
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.coordinate-box {
  background: white;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid #e5e7eb;
}

.coord {
  color: #374151;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Consolas,
    'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  margin: 4px 0;
}

.arrow-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.transform-arrow {
  width: 60px;
  height: 32px;
}

.transform-arrow line {
  stroke: #10b981;
}

.transform-arrow polygon {
  fill: #10b981;
}

.transform-label {
  color: #10b981;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.speed-example {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.speed-label {
  color: #6b7280;
  font-size: 12px;
  font-weight: 500;
}

.speed-value {
  font-weight: 600;
  font-size: 13px;
}

.speed-value.old {
  color: #ef4444;
}

.speed-value.new {
  color: #10b981;
}

.benefits {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.benefit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #4b5563;
  font-size: 14px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  transition: all 0.2s ease;
}

.benefit-item:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.benefit-icon {
  width: 18px;
  height: 18px;
  color: #10b981;
  flex-shrink: 0;
}

.countdown {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  margin-top: 8px;
  font-weight: 500;
}

/* Transition animations */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.4s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* Responsive design */
@media (max-width: 640px) {
  .overlay-content {
    padding: 25px;
  }

  .calibration-details {
    grid-template-columns: 1fr;
  }

  .demo-content {
    flex-direction: column;
  }

  .arrow-container {
    transform: rotate(90deg);
    margin: 20px 0;
  }
}
</style>
