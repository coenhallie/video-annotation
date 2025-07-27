# Dual-Video Drawing Bug Investigation Plan

This document outlines the steps to diagnose the bug related to updating annotations in the dual-video comparison view.

## 1. Trace `currentAnnotationContext`

- **Objective:** Verify that `currentAnnotationContext` in [`useDualVideoPlayer.js`](src/composables/useDualVideoPlayer.js) is correctly populated when an annotation is selected.
- **Action:**
  - I will inspect [`useDualVideoPlayer.js`](src/composables/useDualVideoPlayer.js) to identify where `currentAnnotationContext` is set.
  - I will then examine the component responsible for selecting an annotation (likely [`Timeline.vue`](src/components/Timeline.vue) or a similar component) to see how it interacts with `useDualVideoPlayer.js`.

## 2. Analyze 'Save' action in `AnnotationPanel.vue`

- **Objective:** Understand the data flow when the 'Save' button is clicked in [`AnnotationPanel.vue`](src/components/AnnotationPanel.vue).
- **Action:**
  - I will review the code for [`AnnotationPanel.vue`](src/components/AnnotationPanel.vue) to find the `@click` handler for the 'Save' button.
  - I will trace the function(s) called by this handler to see how it collects data from the form and drawings.
  - I will determine how it gets drawing data from both video players, and its interaction with `useDualVideoPlayer.js`.

## 3. Re-examine `handleDrawingCreated`

- **Objective:** Determine if `handleDrawingCreated` in [`useDualVideoPlayer.js`](src/composables/useDualVideoPlayer.js) is the correct place for the update logic.
- **Action:**
  - Based on the 'Save' button analysis, I will evaluate if `handleDrawingCreated` is being used for updates or only for new drawings.
  - I will consider if a dedicated "update" function is more appropriate.

## 4. Examine `annotationService.ts`

- **Objective:** Verify the data structure expected by the `updateAnnotation` function in [`annotationService.ts`](src/services/annotationService.ts).
- **Action:**
  - I will read [`annotationService.ts`](src/services/annotationService.ts) and [`database.ts`](src/types/database.ts) to understand the expected `drawings` format.
  - I will compare this with the data payload being sent from the frontend.

## 5. Synthesize and Propose Solution

- **Objective:** Document the findings and propose a concrete fix.
- **Action:**
  - I will create a step-by-step data flow diagram (using Mermaid.js) of the annotation update process.
  - I will pinpoint the likely root cause of the bug.
  - I will propose a specific, actionable solution with code examples.
