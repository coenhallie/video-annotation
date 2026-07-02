import { ref, readonly, type Ref } from 'vue';
import { handleServiceError } from '@/utils/errorHandler';

type CleanupFn = () => void | Promise<void>;

interface CleanupEntry {
  name: string;
  fn: CleanupFn;
  /** If true, this cleanup only runs during full session cleanup (sign-out), not project switch. */
  fullCleanupOnly: boolean;
}

interface CleanupRegistry {
  /** Register a cleanup function by name. Replaces any existing entry with the same name. */
  registerCleanup: (
    name: string,
    fn: CleanupFn,
    options?: { fullCleanupOnly?: boolean }
  ) => void;
  /** Remove a cleanup function by name. */
  unregisterCleanup: (name: string) => void;
  /** Run ALL registered cleanups (sign-out, session end). */
  runAllCleanups: () => Promise<void>;
  /** Run only the project-switch subset of cleanups. */
  runProjectSwitchCleanups: () => Promise<void>;
  /** Whether a cleanup pass is currently in progress. */
  isCleaningUp: Readonly<Ref<boolean>>;
}

// ── Module-level singleton state ──────────────────────────────────────────────
const registry = new Map<string, CleanupEntry>();
const isCleaningUp = ref(false);

// ── Internal helpers ──────────────────────────────────────────────────────────

function registerCleanup(
  name: string,
  fn: CleanupFn,
  options: { fullCleanupOnly?: boolean } = {}
): void {
  registry.set(name, {
    name,
    fn,
    fullCleanupOnly: options.fullCleanupOnly ?? false,
  });
}

function unregisterCleanup(name: string): void {
  registry.delete(name);
}

/**
 * Execute a single cleanup entry, catching and logging any error so that
 * one failure never prevents subsequent cleanups from running.
 */
async function executeCleanup(entry: CleanupEntry): Promise<void> {
  try {
    await entry.fn();
  } catch (error) {
    handleServiceError(`SessionCleanup:${entry.name}`, error);
  }
}

async function runAllCleanups(): Promise<void> {
  if (isCleaningUp.value) {
    console.warn('[SessionCleanup] Cleanup already in progress, skipping');
    return;
  }

  try {
    isCleaningUp.value = true;
    console.log('[SessionCleanup] Starting full session cleanup...');

    for (const entry of registry.values()) {
      await executeCleanup(entry);
    }

    console.log('[SessionCleanup] Full session cleanup completed');
  } catch (error) {
    handleServiceError('SessionCleanup:runAllCleanups', error);
    throw error;
  } finally {
    isCleaningUp.value = false;
  }
}

async function runProjectSwitchCleanups(): Promise<void> {
  if (isCleaningUp.value) {
    console.warn(
      '[SessionCleanup] Project switch cleanup already in progress, skipping'
    );
    return;
  }

  try {
    isCleaningUp.value = true;
    console.log('[SessionCleanup] Starting project switch cleanup...');

    for (const entry of registry.values()) {
      if (!entry.fullCleanupOnly) {
        await executeCleanup(entry);
      }
    }

    console.log('[SessionCleanup] Project switch cleanup completed');
  } catch (error) {
    handleServiceError('SessionCleanup:runProjectSwitchCleanups', error);
    throw error;
  } finally {
    isCleaningUp.value = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Composable that exposes the session-cleanup registry.
 *
 * Usage:
 *   const { registerCleanup, runAllCleanups, runProjectSwitchCleanups } = useSessionCleanup();
 *
 * Each composable / component calls `registerCleanup` during setup to add its
 * own teardown logic.  The dashboard then calls `runAllCleanups` (sign-out) or
 * `runProjectSwitchCleanups` (project switch) without needing to know any
 * details about what gets cleaned up.
 */
export function useSessionCleanup(): CleanupRegistry {
  return {
    registerCleanup,
    unregisterCleanup,
    runAllCleanups,
    runProjectSwitchCleanups,
    isCleaningUp: readonly(isCleaningUp),
  };
}
