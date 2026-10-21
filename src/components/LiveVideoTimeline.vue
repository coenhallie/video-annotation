<script setup lang="ts">
/**
 * VideoTimeline, reading the playing position itself.
 *
 * The position changes on every tick of playback, 120 times a second on a
 * 120 Hz screen. Passed down as values, it had to be read in the parent's
 * render, so the whole editor re-rendered on every tick, along with
 * everything in it that takes a fresh prop each time. Reading it here keeps
 * those re-renders to this wrapper and the timeline. Everything else,
 * listeners included, goes straight through to VideoTimeline.
 */
import { computed, ref } from 'vue';
import VideoTimeline from './VideoTimeline.vue';
import type { TimelineNumbers } from '@/utils/timelineBinding';

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** Read during this component's render, never the parent's. */
  numbers: () => TimelineNumbers;
}>();

const current = computed(() => props.numbers());

const timeline = ref<InstanceType<typeof VideoTimeline> | null>(null);

defineExpose({
  /** See VideoTimeline: where Enter opens the quick pick. */
  playheadAnchor: () => timeline.value?.playheadAnchor() ?? null,
});
</script>

<template>
  <VideoTimeline
    ref="timeline"
    v-bind="$attrs"
    :current-time="current.currentTime"
    :duration="current.duration"
    :current-frame="current.currentFrame"
    :total-frames="current.totalFrames"
    :fps="current.fps"
  />
</template>
