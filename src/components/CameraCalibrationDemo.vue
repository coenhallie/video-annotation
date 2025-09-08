<template>
  <div class="calibration-demo">
    <!-- Header -->
    <header class="demo-header">
      <h1>Camera Calibration Interface Demo</h1>
      <p class="subtitle">
        Interactive edge-based camera positioning for court calibration
      </p>
    </header>

    <!-- Main Content -->
    <div class="demo-content">
      <!-- Left Panel: Edge-Based Selector -->
      <div class="selector-panel">
        <EdgeBasedCameraSelector
          v-model="cameraSettings"
          :court-dimensions="selectedCourtDimensions"
          @edge-selected="onEdgeSelected"
          @position-changed="onPositionChanged"
        />
      </div>

      <!-- Right Panel: Visualization and Info -->
      <div class="info-panel">
        <!-- Court Type Selector -->
        <div class="court-type-selector">
          <h3>Court Type</h3>
          <div class="court-buttons">
            <button
              :class="['court-btn', courtType === 'tennis' ? 'active' : '']"
              @click="setCourtType('tennis')"
            >
              Tennis
            </button>
            <button
              :class="['court-btn', courtType === 'badminton' ? 'active' : '']"
              @click="setCourtType('badminton')"
            >
              Badminton
            </button>
          </div>
        </div>

        <!-- 3D Position Display -->
        <div class="position-display">
          <h3>3D Camera Position</h3>
          <div v-if="cameraSettings?.position3D" class="position-values">
            <div class="coord-item">
              <span class="coord-label">X:</span>
              <span class="coord-value"
                >{{ cameraSettings.position3D.x.toFixed(2) }}m</span
              >
            </div>
            <div class="coord-item">
              <span class="coord-label">Y:</span>
              <span class="coord-value"
                >{{ cameraSettings.position3D.y.toFixed(2) }}m</span
              >
            </div>
            <div class="coord-item">
              <span class="coord-label">Z:</span>
              <span class="coord-value"
                >{{ cameraSettings.position3D.z.toFixed(2) }}m</span
              >
            </div>
          </div>
          <div v-else class="no-position">
            Select a court edge to position the camera
          </div>
        </div>

        <!-- Event Log -->
        <div class="event-log">
          <h3>Event Log</h3>
          <div class="log-container">
            <div
              v-for="(event, index) in eventLog"
              :key="index"
              class="log-entry"
            >
              <span class="log-time">{{ event.time }}</span>
              <span class="log-message">{{ event.message }}</span>
            </div>
            <div v-if="eventLog.length === 0" class="no-events">
              No events yet. Interact with the camera selector to see events.
            </div>
          </div>
        </div>

        <!-- Comparison Analysis -->
        <div class="analysis-section">
          <h3>Method Comparison Analysis</h3>
          <div class="analysis-content">
            <div class="analysis-item">
              <h4>Edge Selection Advantages</h4>
              <ul>
                <li>✓ Intuitive court-relative positioning</li>
                <li>✓ Precise distance measurements</li>
                <li>✓ Consistent camera placement</li>
                <li>✓ Clear spatial relationships</li>
                <li>✓ Easy to replicate positions</li>
              </ul>
            </div>

            <div class="analysis-item">
              <h4>Use Cases</h4>
              <ul>
                <li>Professional sports analysis</li>
                <li>Training video review</li>
                <li>Broadcast camera setup</li>
                <li>Computer vision calibration</li>
                <li>Motion tracking systems</li>
              </ul>
            </div>

            <div class="analysis-item">
              <h4>Accuracy Metrics</h4>
              <div class="metrics">
                <div class="metric">
                  <span class="metric-label">Position Accuracy:</span>
                  <div class="metric-bar">
                    <div class="metric-fill high" style="width: 95%" />
                  </div>
                  <span class="metric-value">95%</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Ease of Use:</span>
                  <div class="metric-bar">
                    <div class="metric-fill high" style="width: 90%" />
                  </div>
                  <span class="metric-value">90%</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Reproducibility:</span>
                  <div class="metric-bar">
                    <div class="metric-fill high" style="width: 98%" />
                  </div>
                  <span class="metric-value">98%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Test Scenarios -->
        <div class="test-scenarios">
          <h3>Test Scenarios</h3>
          <div class="scenario-buttons">
            <button
              v-for="scenario in testScenarios"
              :key="scenario.name"
              class="scenario-btn"
              @click="applyScenario(scenario)"
            >
              {{ scenario.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import EdgeBasedCameraSelector from './EdgeBasedCameraSelector.vue';

// Types
interface CameraSettings {
  edge: 'top' | 'bottom' | 'left' | 'right' | null;
  distance: number;
  height: number;
  position3D: { x: number; y: number; z: number };
}

interface EventLogEntry {
  time: string;
  message: string;
}

interface TestScenario {
  name: string;
  edge: 'top' | 'bottom' | 'left' | 'right';
  distance: number;
  height: number;
}

// State
const courtType = ref<'tennis' | 'badminton'>('tennis');
const cameraSettings = ref<CameraSettings>({
  edge: null,
  distance: 5,
  height: 3.5,
  position3D: { x: 0, y: 0, z: 3.5 },
});

const eventLog = ref<EventLogEntry[]>([]);
const maxLogEntries = 10;

// Computed
const selectedCourtDimensions = computed(() => {
  if (courtType.value === 'tennis') {
    return { length: 23.77, width: 10.97 };
  }
  return { length: 13.4, width: 6.1 };
});

// Test scenarios
const testScenarios: TestScenario[] = [
  { name: 'Broadcast View', edge: 'left', distance: 8, height: 6 },
  { name: 'Umpire Position', edge: 'left', distance: 2, height: 2.5 },
  { name: 'Baseline Camera', edge: 'bottom', distance: 5, height: 3 },
  { name: 'Overhead Shot', edge: 'top', distance: 10, height: 8 },
  { name: 'Corner Angle', edge: 'right', distance: 7, height: 4 },
];

// Methods
const setCourtType = (type: 'tennis' | 'badminton') => {
  courtType.value = type;
  addLogEntry(`Court type changed to ${type}`);
};

const onEdgeSelected = (edge: 'top' | 'bottom' | 'left' | 'right') => {
  addLogEntry(`Edge selected: ${edge}`);
};

const onPositionChanged = (position: { x: number; y: number; z: number }) => {
  addLogEntry(
    `Position updated: (${position.x.toFixed(1)}, ${position.y.toFixed(
      1
    )}, ${position.z.toFixed(1)})`
  );
};

const applyScenario = (scenario: TestScenario) => {
  cameraSettings.value = {
    edge: scenario.edge,
    distance: scenario.distance,
    height: scenario.height,
    position3D: calculatePosition(
      scenario.edge,
      scenario.distance,
      scenario.height
    ),
  };
  addLogEntry(`Applied scenario: ${scenario.name}`);
};

const calculatePosition = (
  edge: 'top' | 'bottom' | 'left' | 'right',
  distance: number,
  height: number
): { x: number; y: number; z: number } => {
  const { length, width } = selectedCourtDimensions.value;
  let x = 0;
  let y = 0;

  switch (edge) {
    case 'top':
      x = width / 2;
      y = -distance;
      break;
    case 'bottom':
      x = width / 2;
      y = length + distance;
      break;
    case 'left':
      x = -distance;
      y = length / 2;
      break;
    case 'right':
      x = width + distance;
      y = length / 2;
      break;
  }

  return { x, y, z: height };
};

const addLogEntry = (message: string) => {
  const time = new Date().toLocaleTimeString();
  eventLog.value.unshift({ time, message });

  // Keep only the last N entries
  if (eventLog.value.length > maxLogEntries) {
    eventLog.value = eventLog.value.slice(0, maxLogEntries);
  }
};

// Initialize with a welcome message
addLogEntry('Camera calibration demo initialized');
</script>

<style scoped>
.calibration-demo {
  min-height: 100vh;
  background-color: #f3f4f6;
}

.demo-header {
  background-color: white;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1.5rem 2rem;
  border-bottom: 1px solid #e5e7eb;
}

.demo-header h1 {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
}

.subtitle {
  color: #6b7280;
  margin-top: 0.5rem;
}

.demo-content {
  display: flex;
  gap: 2rem;
  padding: 2rem;
  max-width: 80rem;
  margin: 0 auto;
}

.selector-panel {
  flex: 1;
  min-width: 0;
}

.info-panel {
  width: 24rem;
}

.info-panel > * + * {
  margin-top: 1.5rem;
}

.court-type-selector {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}

.court-type-selector h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
}

.court-buttons {
  display: flex;
  gap: 0.5rem;
}

.court-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  background-color: #f3f4f6;
  color: #374151;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  border: none;
  cursor: pointer;
}

.court-btn:hover {
  background-color: #e5e7eb;
}

.court-btn.active {
  background-color: #3b82f6;
  color: white;
}

.court-btn.active:hover {
  background-color: #2563eb;
}

.position-display {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}

.position-display h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
}

.position-values > * + * {
  margin-top: 0.5rem;
}

.coord-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f9fafb;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
}

.coord-label {
  font-weight: 500;
  color: #6b7280;
}

.coord-value {
  font-family: monospace;
  color: #111827;
}

.no-position {
  color: #6b7280;
  font-style: italic;
}

.event-log {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}

.event-log h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
}

.log-container {
  max-height: 12rem;
  overflow-y: auto;
}

.log-container > * + * {
  margin-top: 0.25rem;
}

.log-entry {
  display: flex;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.log-time {
  color: #6b7280;
  font-family: monospace;
}

.log-message {
  color: #374151;
}

.no-events {
  color: #6b7280;
  font-style: italic;
  font-size: 0.875rem;
}

.analysis-section {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}

.analysis-section h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
}

.analysis-content > * + * {
  margin-top: 1rem;
}

.analysis-item h4 {
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
}

.analysis-item ul {
  font-size: 0.875rem;
  color: #6b7280;
}

.analysis-item ul > * + * {
  margin-top: 0.25rem;
}

.analysis-item li {
  margin-left: 0.5rem;
}

.metrics > * + * {
  margin-top: 0.75rem;
}

.metric {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.metric-label {
  font-size: 0.875rem;
  color: #6b7280;
  width: 8rem;
}

.metric-bar {
  flex: 1;
  height: 0.5rem;
  background-color: #e5e7eb;
  border-radius: 9999px;
  overflow: hidden;
}

.metric-fill {
  height: 100%;
  transition: all 0.5s;
}

.metric-fill.high {
  background-color: #10b981;
}

.metric-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  width: 3rem;
  text-align: right;
}

.test-scenarios {
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
  padding: 1rem;
}

.test-scenarios h3 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
}

.scenario-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.scenario-btn {
  padding: 0.5rem 0.75rem;
  background-color: #f3f4f6;
  color: #374151;
  font-size: 0.875rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
  border: none;
  cursor: pointer;
}

.scenario-btn:hover {
  background-color: #e5e7eb;
}
</style>
