/**
 * useSpeedCalculator.ts
 * TS conversion of the previous JS composable. Computes instantaneous and average speeds
 * based on frame timestamps and optional smoothing window.
 */
import { ref, computed, type Ref } from 'vue';

export interface SpeedSample {
  frame: number;
  time: number; // seconds
  value: number; // speed in chosen units (e.g., px/s)
}

export interface UseSpeedCalculatorOptions {
  smoothingWindow?: number; // number of samples for moving average
}

export interface UseSpeedCalculator {
  currentSpeed: Ref<number>;
  averageSpeed: Ref<number>;
  samples: Ref<SpeedSample[]>;
  reset: () => void;
  pushSample: (frame: number, timeSec: number, distanceDelta: number) => void;
}

export function useSpeedCalculator(
  options: UseSpeedCalculatorOptions = {}
): UseSpeedCalculator {
  const smoothingWindow = Math.max(1, options.smoothingWindow ?? 5);

  const samples = ref<SpeedSample[]>([]);
  const currentSpeed = ref(0);
  const averageSpeed = computed(() => {
    if (samples.value.length === 0) return 0;
    const sum = samples.value.reduce((acc, s) => acc + s.value, 0);
    return sum / samples.value.length;
  });

  function reset() {
    samples.value = [];
    currentSpeed.value = 0;
  }

  function pushSample(frame: number, timeSec: number, distanceDelta: number) {
    // distanceDelta over time between samples gives speed; guard divide-by-zero
    if (samples.value.length > 0) {
      const last = samples.value[samples.value.length - 1];
      const dt = Math.max(1e-6, timeSec - last.time);
      const speed = distanceDelta / dt;
      currentSpeed.value = speed;
      samples.value.push({ frame, time: timeSec, value: speed });
    } else {
      // first sample, set speed to 0
      samples.value.push({ frame, time: timeSec, value: 0 });
      currentSpeed.value = 0;
    }

    // apply moving window smoothing by trimming the array
    if (samples.value.length > smoothingWindow) {
      samples.value.splice(0, samples.value.length - smoothingWindow);
    }
  }

  return {
    currentSpeed,
    averageSpeed: averageSpeed as Ref<number>,
    samples,
    reset,
    pushSample,
  };
}
