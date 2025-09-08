<template>
  <div class="instruction-panel">
    <div class="step-header">
      <h3 class="step-title">
        Step {{ currentStepNumber }} of {{ totalSteps }}
      </h3>
      <div class="progress-bar">
        <div
          class="progress-fill"
          :style="{ width: `${progressPercentage}%` }"
        />
      </div>
    </div>

    <div class="instruction-content">
      <h4 class="instruction-title">
        {{ currentInstruction.title }}
      </h4>
      <p class="instruction-text">
        {{ currentInstruction.description }}
      </p>

      <ul v-if="currentInstruction.steps" class="instruction-steps">
        <li v-for="step in currentInstruction.steps" :key="step">
          {{ step }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  currentStep: string | number;
  totalSteps: number;
}

const props = withDefaults(defineProps<Props>(), {
  totalSteps: 6,
});

interface Instruction {
  title: string;
  description: string;
  steps?: string[];
}

// Mapping of calibration steps to instructions
const instructionMap: Record<string | number, Instruction> = {
  0: {
    title: 'Setup Camera Calibration',
    description:
      'Welcome to the camera calibration wizard. This process will help you accurately position and calibrate your camera for precise court analysis.',
    steps: [
      'Ensure your video shows clear court lines',
      'Make sure the court is well-lit and visible',
      'Have your video ready at a frame with good line visibility',
    ],
  },
  1: {
    title: 'Select Court Lines',
    description:
      'Select exactly 3 non-parallel court lines from the diagram. These lines will be used to calculate the camera position.',
    steps: [
      'Click on 3 different court lines in the diagram',
      'Ensure the lines are not parallel to each other',
      'Lines will be highlighted in different colors when selected',
    ],
  },
  2: {
    title: 'Mark Lines on Video',
    description:
      'Draw the corresponding lines on your video that match the court lines you selected in the previous step.',
    steps: [
      'Use the drawing tool to trace each court line on the video',
      'Match the colors from the court diagram',
      'Draw lines as accurately as possible for best results',
    ],
  },
  3: {
    title: 'Calculate Camera Parameters',
    description:
      'The system is calculating your camera position and orientation based on the line correspondences.',
    steps: [
      'Please wait while calculations are performed',
      'This may take a few moments',
      'Results will be displayed in the 3D visualization',
    ],
  },
  4: {
    title: 'Validate Calibration',
    description:
      'Review the calibration results and accuracy metrics. Make adjustments if needed.',
    steps: [
      'Check the 3D camera position visualization',
      'Review the accuracy metrics displayed',
      'Verify the perspective overlay matches your video',
    ],
  },
  5: {
    title: 'Confirm and Save',
    description:
      'Review the final calibration results and save your camera configuration.',
    steps: [
      'Review the calibration summary',
      'Check that all metrics are within acceptable ranges',
      'Save the calibration to apply it to your project',
    ],
  },
  'select-line-1': {
    title: 'Select First Baseline',
    description:
      'Select the far baseline on the court diagram. This will be your first reference line.',
  },
  'draw-line-1': {
    title: 'Draw First Baseline',
    description:
      'Draw the corresponding baseline on your video that matches the selected court line.',
  },
  'select-line-2': {
    title: 'Select Second Line',
    description:
      'Select a sideline or service line that is not parallel to your first selection.',
  },
  'draw-line-2': {
    title: 'Draw Second Line',
    description:
      'Draw the corresponding line on your video that matches your second court line selection.',
  },
  'select-line-3': {
    title: 'Select Third Line',
    description:
      'Select your final reference line. Ensure it is not parallel to either of your previous selections.',
  },
  'draw-line-3': {
    title: 'Draw Third Line',
    description:
      'Draw the final corresponding line on your video to complete the calibration setup.',
  },
};

const currentInstruction = computed((): Instruction => {
  return (
    instructionMap[props.currentStep] || {
      title: 'Camera Calibration',
      description:
        'Follow the step-by-step instructions to calibrate your camera.',
    }
  );
});

const currentStepNumber = computed((): number => {
  if (typeof props.currentStep === 'number') {
    return props.currentStep + 1;
  }

  // Handle string-based steps like 'select-line-1', 'draw-line-1', etc.
  const stepMatch = props.currentStep.match(/(\d+)$/);
  if (stepMatch && stepMatch[1]) {
    return parseInt(stepMatch[1]);
  }

  return 1;
});

const progressPercentage = computed((): number => {
  return Math.round((currentStepNumber.value / props.totalSteps) * 100);
});
</script>

<style scoped>
.instruction-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.step-header {
  margin-bottom: 20px;
}

.step-title {
  margin: 0 0 12px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.instruction-content {
  color: #374151;
}

.instruction-title {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.instruction-text {
  margin: 0 0 16px 0;
  font-size: 14px;
  line-height: 1.5;
  color: #6b7280;
}

.instruction-steps {
  margin: 0;
  padding-left: 20px;
  list-style-type: disc;
}

.instruction-steps li {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.4;
  color: #6b7280;
}

.instruction-steps li:last-child {
  margin-bottom: 0;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .instruction-panel {
    background: #1f2937;
    border-color: #374151;
    color: #f9fafb;
  }

  .step-title,
  .instruction-title {
    color: #f9fafb;
  }

  .instruction-text,
  .instruction-steps li {
    color: #d1d5db;
  }

  .progress-bar {
    background-color: #374151;
  }
}
</style>
