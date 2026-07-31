import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useLayoutStore = defineStore('layout', () => {
  // State
  const isProjectModalOpen = ref(false);
  const isComparisonModalOpen = ref(false);
  const isShareModalOpen = ref(false);
  const isSharedLinksModalOpen = ref(false);

  const isAnnotationFormVisible = ref(false);
  
  // Actions
  function openProjectModal() {
    isProjectModalOpen.value = true;
  }
  
  function closeProjectModal() {
    isProjectModalOpen.value = false;
  }

  function openComparisonModal() {
    isComparisonModalOpen.value = true;
  }

  function closeComparisonModal() {
    isComparisonModalOpen.value = false;
  }

  function openShareModal() {
    isShareModalOpen.value = true;
  }

  function closeShareModal() {
    isShareModalOpen.value = false;
  }

  return {
    isProjectModalOpen,
    isComparisonModalOpen,
    isShareModalOpen,
    isSharedLinksModalOpen,
    isAnnotationFormVisible,
    openProjectModal,
    closeProjectModal,
    openComparisonModal,
    closeComparisonModal,
    openShareModal,
    closeShareModal,
  };
});
