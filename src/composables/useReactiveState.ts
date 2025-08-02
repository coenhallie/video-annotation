import { ref, computed, watch, onUnmounted } from 'vue';

/**
 * Safe reactive state management utility
 * Prevents null reference errors and provides fallbacks
 */
export function useSafeReactive<T>(initialValue: T, fallback?: T) {
  const state = ref<T>(initialValue);
  const isValid = computed(() => state.value != null);

  const safeValue = computed(() => {
    if (state.value != null) {
      return state.value;
    }
    return fallback ?? initialValue;
  });

  const setValue = (value: T) => {
    try {
      state.value = value;
    } catch (error) {
      console.error('Error setting reactive state:', error);
      if (fallback !== undefined) {
        state.value = fallback;
      }
    }
  };

  const reset = () => {
    setValue(initialValue);
  };

  return {
    state: state,
    value: safeValue,
    isValid,
    setValue,
    reset,
  };
}

/**
 * Safe computed property that handles null/undefined values
 */
export function useSafeComputed<T>(
  getter: () => T,
  fallback: T,
  errorHandler?: (error: Error) => void
) {
  return computed(() => {
    try {
      const result = getter();
      return result ?? fallback;
    } catch (error) {
      console.error('Error in safe computed:', error);
      if (errorHandler) {
        errorHandler(error as Error);
      }
      return fallback;
    }
  });
}

/**
 * Safe watcher that handles errors gracefully
 */
export function useSafeWatch<T>(
  source: () => T,
  callback: (newValue: T, oldValue: T) => void,
  options?: { immediate?: boolean; deep?: boolean }
) {
  const stopWatcher = watch(
    source,
    (newValue, oldValue) => {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        console.error('Error in safe watcher:', error);
      }
    },
    options
  );

  onUnmounted(() => {
    if (stopWatcher) {
      stopWatcher();
    }
  });

  return stopWatcher;
}

/**
 * Safe async operation handler
 */
export function useSafeAsync() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const execute = async <T>(
    operation: () => Promise<T>,
    errorHandler?: (error: Error) => void
  ): Promise<T | null> => {
    try {
      isLoading.value = true;
      error.value = null;

      const result = await operation();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      error.value = errorMessage;
      console.error('Safe async operation failed:', err);

      if (errorHandler) {
        errorHandler(err as Error);
      }

      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const clearError = () => {
    error.value = null;
  };

  return {
    isLoading,
    error,
    execute,
    clearError,
  };
}

/**
 * Safe object property access
 */
export function safeGet<T>(obj: any, path: string, fallback: T): T {
  try {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return fallback;
      }
      current = current[key];
    }

    return current ?? fallback;
  } catch (error) {
    console.error('Error in safeGet:', error);
    return fallback;
  }
}

/**
 * Safe array operations
 */
export function useSafeArray<T>(initialArray: T[] = []) {
  const array = ref<T[]>([...initialArray]);

  const safeArray = computed(() => {
    return Array.isArray(array.value) ? array.value : [];
  });

  const length = computed(() => safeArray.value.length);

  const push = (...items: T[]) => {
    try {
      if (Array.isArray(array.value)) {
        (array.value as any).push(...items);
      } else {
        array.value = [...items];
      }
    } catch (error) {
      console.error('Error pushing to safe array:', error);
    }
  };

  const remove = (index: number) => {
    try {
      if (
        Array.isArray(array.value) &&
        index >= 0 &&
        index < array.value.length
      ) {
        array.value.splice(index, 1);
      }
    } catch (error) {
      console.error('Error removing from safe array:', error);
    }
  };

  const clear = () => {
    try {
      array.value = [];
    } catch (error) {
      console.error('Error clearing safe array:', error);
    }
  };

  const find = (predicate: (item: any) => boolean): T | undefined => {
    try {
      return safeArray.value.find(predicate) as T | undefined;
    } catch (error) {
      console.error('Error finding in safe array:', error);
      return undefined;
    }
  };

  return {
    array: safeArray,
    length,
    push,
    remove,
    clear,
    find,
  };
}
