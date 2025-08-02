<template>
  <div
    v-if="showModal"
    class="keypoint-selector-modal"
    @click.self="closeModal"
  >
    <div class="modal-content">
      <div class="modal-header">
        <h2>Select Keypoints to Track</h2>
        <button
          @click="closeModal"
          class="close-button"
          aria-label="Close keypoint selector"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <KeypointSelector
          :selected-keypoints="localSelectedKeypoints"
          @update:selected-keypoints="handleUpdate"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import KeypointSelector from './KeypointSelector.vue';

const props = defineProps({
  showModal: {
    type: Boolean,
    default: false,
  },
  selectedKeypoints: {
    type: Array,
    default: () => Array.from({ length: 33 }, (_, i) => i),
  },
});

const emit = defineEmits(['update:selectedKeypoints', 'close']);

const localSelectedKeypoints = ref([...props.selectedKeypoints]);

watch(
  () => props.selectedKeypoints,
  (newVal) => {
    localSelectedKeypoints.value = [...newVal];
  }
);

const handleUpdate = (newKeypoints: number[]) => {
  localSelectedKeypoints.value = newKeypoints;
  emit('update:selectedKeypoints', newKeypoints);
};

const closeModal = () => {
  emit('close');
};
</script>

<style scoped>
.keypoint-selector-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: #1f2937;
  border-radius: 12px;
  max-width: 600px;
  max-height: 80vh;
  width: 90%;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  border: 1px solid #374151;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #374151;
  background: #111827;
}

.modal-header h2 {
  margin: 0;
  color: #f9fafb;
  font-size: 18px;
  font-weight: 600;
}

.close-button {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  background: #374151;
  color: #f9fafb;
}

.close-button svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}

.modal-body {
  padding: 0;
  overflow-y: auto;
  max-height: calc(80vh - 80px);
}
</style>
