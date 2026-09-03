<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] overflow-y-auto">
      <!-- Background overlay -->
      <div
        class="fixed inset-0 bg-black/50 transition-opacity"
        @click="$emit('close')"
      />

      <!-- Center container -->
      <div class="flex min-h-screen items-center justify-center px-4 py-10">
        <!-- Modal panel. Same floating surface as NewFolderDialog, so a rename
             is the same object as every other dialog in the app. -->
        <div
          class="relative w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
          @click.stop
        >
          <div class="border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
              Rename video
            </h3>
          </div>

          <div class="px-4 py-4">
            <label
              for="video-name"
              class="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-500"
            >
              Video name
            </label>
            <input
              id="video-name"
              ref="nameInput"
              v-model="title"
              type="text"
              maxlength="200"
              class="w-full rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
              placeholder="Untitled video"
              @keydown.enter="submit"
              @keydown.esc="$emit('close')"
            >
            <!-- The consequence, not a warning. Renaming is allowed and
                 ordinary; what is not obvious is that it is not private. -->
            <p class="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
              Everyone sees this name. The change is recorded in this video's
              history.
            </p>
          </div>

          <div
            class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
          >
            <button
              type="button"
              class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              :disabled="!canSubmit"
              class="rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 disabled:pointer-events-none disabled:opacity-30 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
              @click="submit"
            >
              {{ busy ? 'Renaming' : 'Rename' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

const props = defineProps<{
  currentTitle: string;
  busy?: boolean;
}>();

const emit = defineEmits<{
  rename: [title: string];
  close: [];
}>();

const title = ref(props.currentTitle);
const nameInput = ref<HTMLInputElement | null>(null);

/**
 * Disabled on an empty or unchanged name, so Enter on an untouched dialog does
 * nothing rather than writing back the name that is already there and putting a
 * pointless entry in the history.
 */
const canSubmit = computed(() => {
  const next = title.value.trim();
  return !props.busy && next.length > 0 && next !== props.currentTitle.trim();
});

const submit = () => {
  if (!canSubmit.value) return;
  emit('rename', title.value.trim());
};

onMounted(async () => {
  await nextTick();
  // Selected, not just focused: the name is usually being replaced outright
  // rather than edited, and a DALF default name has nothing worth keeping.
  nameInput.value?.focus();
  nameInput.value?.select();
});
</script>
