<template>
  <div
    v-if="showModal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click.self="closeModal"
  >
    <div
      class="flex flex-col w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl max-h-[90vh]"
      @click.stop
    >
      <div
        class="flex items-center justify-between p-4 border-b border-gray-200"
      >
        <h2 class="text-xl font-semibold text-gray-900">
          Select Keypoints to Track
        </h2>
        <button
          class="transition-colors text-gray-400 hover:text-gray-600"
          aria-label="Close keypoint selector"
          @click="closeModal"
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
      <div class="p-6 overflow-y-auto">
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
