<template>
  <div class="shared-links-management">
    <!-- Controls Bar -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search by video title…"
        class="min-w-[10rem] flex-1 rounded border border-gray-200 bg-transparent px-2.5 py-1.5 text-[12px] leading-snug text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/25"
      >

      <!-- Permission scope as pills; sort stays a select because four ordered
           options do not read as a pill row. -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-for="option in PERMISSION_FILTERS"
          :key="option.value"
          type="button"
          class="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
          :class="
            permissionFilter === option.value
              ? 'bg-gray-900 text-white dark:bg-gray-700 dark:text-white'
              : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
          "
          @click="permissionFilter = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <select
        v-model="sortBy"
        class="shrink-0 rounded border border-gray-200 bg-transparent px-2 py-1.5 text-[11px] text-gray-700 outline-none transition-colors focus:border-gray-400 dark:border-white/10 dark:text-gray-200 dark:focus:border-white/25"
      >
        <option value="date-desc">
          Newest
        </option>
        <option value="date-asc">
          Oldest
        </option>
        <option value="title-asc">
          Title A–Z
        </option>
        <option value="title-desc">
          Title Z–A
        </option>
      </select>
    </div>

    <!-- Loading State -->
    <p
      v-if="isLoading"
      class="px-4 py-10 text-center text-[12px] text-gray-600 dark:text-gray-400"
    >
      Loading shared videos…
    </p>

    <!-- Error State -->
    <div
      v-else-if="error"
      class="px-4 py-10 text-center"
    >
      <p class="text-[12px] text-red-600 dark:text-red-400">
        {{ error }}
      </p>
      <button
        type="button"
        class="mt-4 rounded bg-gray-900 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
        @click="loadSharedVideos"
      >
        Try again
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredVideos.length === 0 && !searchQuery && permissionFilter === 'all'"
      class="px-4 py-10 text-center"
    >
      <p class="text-[12px] text-gray-600 dark:text-gray-400">
        No shared videos
      </p>
      <p class="mt-1.5 text-[11px] text-gray-500 dark:text-gray-500">
        Share a video to manage its link here.
      </p>
    </div>

    <!-- No Results State -->
    <div
      v-else-if="filteredVideos.length === 0"
      class="px-4 py-10 text-center"
    >
      <p class="text-[12px] text-gray-600 dark:text-gray-400">
        No results found
      </p>
      <button
        type="button"
        class="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
        @click="clearFilters"
      >
        Clear filters
      </button>
    </div>

    <!-- Rows. A four-column table for four fields was more grid than the data
         needed; this is the same row shape as the rest of the app. -->
    <div v-else>
      <div
        v-for="video in filteredVideos"
        :key="`${video.type}-${video.id}`"
        class="group flex items-center gap-3 rounded px-2 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
      >
        <span class="h-9 w-16 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-white/5">
          <img
            v-if="video.thumbnailUrl"
            :src="video.thumbnailUrl"
            :alt="video.title"
            class="h-full w-full object-cover"
          >
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] font-medium tracking-tight text-gray-900 dark:text-white">
            {{ video.title }}
          </p>
          <div class="mt-1 flex items-center gap-2">
            <!-- The permission is editable in place, so it stays a control -
              but a bare one, sized like the mono meta beside it. -->
            <select
              :value="video.allowAnnotations ? 'annotate' : 'view-only'"
              class="-ml-1 rounded bg-transparent px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 outline-none transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              @change="handlePermissionChange(video, ($event.target as HTMLSelectElement).value)"
            >
              <option value="view-only">
                VIEW ONLY
              </option>
              <option value="annotate">
                ANNOTATE
              </option>
            </select>
            <input
              :value="video.shareUrl"
              readonly
              class="min-w-0 flex-1 truncate bg-transparent font-mono text-[10px] tracking-wider text-gray-500 outline-none dark:text-gray-500"
              @click="selectLink"
            >
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-3">
          <!-- Copy is what this screen is for, so it is always visible: a
               hover-only primary action is unreachable on touch, and the
               "Copied" confirmation would vanish with the pointer. -->
          <button
            type="button"
            class="text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors"
            :class="
              copiedId === video.id
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300'
            "
            @click="copyLink(video.shareUrl)"
          >
            {{ copiedId === video.id ? 'Copied' : 'Copy' }}
          </button>
          <!-- Revoke is destructive and secondary, so it stays on hover. -->
          <button
            type="button"
            class="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 opacity-0 transition hover:text-red-600 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-gray-500 dark:hover:text-red-400"
            title="Revoke sharing"
            @click="confirmRevoke(video)"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <div
      v-if="confirmDialog.show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      @click="closeConfirmDialog"
    >
      <div
        class="w-full max-w-sm rounded border border-gray-200 bg-white shadow-xl dark:border-white/10 dark:bg-gray-900"
        @click.stop
      >
        <div
          class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10"
        >
          <h3 class="text-[13px] font-semibold tracking-tight text-gray-900 dark:text-white">
            {{ confirmDialog.title }}
          </h3>
          <button
            type="button"
            class="rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            @click="closeConfirmDialog"
          >
            <svg
              class="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M18 6 6 18M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="px-4 py-4">
          <p class="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">
            {{ confirmDialog.message }}
          </p>
        </div>
        <div
          class="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3 dark:border-white/10"
        >
          <button
            type="button"
            class="rounded px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300"
            @click="closeConfirmDialog"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors"
            :class="
              confirmDialog.type === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-gray-900 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600'
            "
            @click="confirmAction"
          >
            {{ confirmDialog.confirmText }}
          </button>
        </div>
      </div>
    </div>

    <!-- Success Notification. Same shape as the app-wide toast: a status dot
         and text, nothing else. -->
    <div
      v-if="notification.show"
      class="fixed right-4 top-4 z-50 flex w-full max-w-sm items-start gap-3 rounded border border-gray-200 bg-white px-3 py-2.5 shadow-lg dark:border-white/10 dark:bg-gray-900"
    >
      <span
        class="mt-[7px] h-2 w-2 shrink-0 rounded-full"
        :class="notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'"
      />
      <span class="min-w-0 flex-1 text-[12px] text-gray-900 dark:text-white">
        {{ notification.message }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ShareService } from '../services/shareService';
import { useAuth } from '../composables/useAuth';

// Types
interface SharedVideo {
  id: string;
  title: string;
  type: 'video' | 'comparison';
  shareUrl: string;
  allowAnnotations: boolean;
  isPublic: boolean;
  createdAt: string;
  thumbnailUrl?: string;
  description?: string;
}

// State
const { user } = useAuth();
const sharedVideos = ref<SharedVideo[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const searchQuery = ref('');
const permissionFilter = ref('all');

/** Permission scopes, as pills rather than a select. */
const PERMISSION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'view-only', label: 'View' },
  { value: 'annotate', label: 'Annotate' },
] as const;
const sortBy = ref('date-desc');
const copiedId = ref<string | null>(null);

const confirmDialog = ref({
  show: false,
  title: '',
  message: '',
  confirmText: '',
  type: '',
  action: null as (() => Promise<void>) | null,
});

const notification = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error',
});

// Computed
const filteredVideos = computed(() => {
  let filtered = [...sharedVideos.value];

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(video =>
      video.title.toLowerCase().includes(query) ||
      (video.description && video.description.toLowerCase().includes(query))
    );
  }

  // Permission filter
  if (permissionFilter.value !== 'all') {
    const allowAnnotations = permissionFilter.value === 'annotate';
    filtered = filtered.filter(video => video.allowAnnotations === allowAnnotations);
  }

  // Sort
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'date-desc':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'date-asc':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'title-asc':
        return a.title.localeCompare(b.title);
      case 'title-desc':
        return b.title.localeCompare(a.title);
      default:
        return 0;
    }
  });

  return filtered;
});

// Methods
const loadSharedVideos = async () => {
  if (!user.value) {
    error.value = 'You must be logged in to view shared videos';
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const result = await ShareService.getAllSharedVideos(user.value.id);
    sharedVideos.value = result.videos;
  } catch (err) {
    console.error('Error loading shared videos:', err);
    error.value = 'Failed to load shared videos. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const handlePermissionChange = (video: SharedVideo, value: string) => {
  const newPermission = value === 'annotate';
  confirmDialog.value = {
    show: true,
    title: 'Change Permission',
    message: `Change permission to ${newPermission ? 'allow annotations' : 'view-only'}? This will affect all users with the share link.`,
    confirmText: 'Change Permission',
    type: 'warning',
    action: async () => {
      await updatePermission(video, newPermission);
    },
  };
};

const updatePermission = async (video: SharedVideo, allowAnnotations: boolean) => {
  try {
    await ShareService.updateSharePermissions(video.id, video.type, allowAnnotations);
    video.allowAnnotations = allowAnnotations;
    showNotification(
      `Permission changed to ${allowAnnotations ? 'annotation enabled' : 'view-only'}`,
      'success'
    );
  } catch (err) {
    console.error('Error updating permission:', err);
    showNotification('Failed to update permission', 'error');
  }
};

const confirmRevoke = (video: SharedVideo) => {
  confirmDialog.value = {
    show: true,
    title: 'Revoke Share Link',
    message: `Are you sure you want to revoke sharing for "${video.title}"? The share link will no longer work.`,
    confirmText: 'Revoke Access',
    type: 'danger',
    action: async () => {
      await revokeShare(video);
    },
  };
};

const revokeShare = async (video: SharedVideo) => {
  try {
    await ShareService.revokeShare(video.id, video.type);
    sharedVideos.value = sharedVideos.value.filter(v => v.id !== video.id);
    showNotification('Share link revoked successfully', 'success');
  } catch (err) {
    console.error('Error revoking share:', err);
    showNotification('Failed to revoke share link', 'error');
  }
};

const copyLink = async (url: string) => {
  try {
    await ShareService.copyToClipboard(url);
    const video = sharedVideos.value.find(v => v.shareUrl === url);
    if (video) {
      copiedId.value = video.id;
      setTimeout(() => {
        copiedId.value = null;
      }, 2000);
    }
  } catch (err) {
    showNotification('Failed to copy link', 'error');
  }
};

const openLink = (url: string) => {
  window.open(url, '_blank');
};

const selectLink = (event: Event) => {
  const input = event.target as HTMLInputElement;
  input.select();
};

const clearFilters = () => {
  searchQuery.value = '';
  permissionFilter.value = 'all';
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
};

const confirmAction = async () => {
  if (confirmDialog.value.action) {
    await confirmDialog.value.action();
  }
  closeConfirmDialog();
};

const closeConfirmDialog = () => {
  confirmDialog.value.show = false;
  confirmDialog.value.action = null;
};

const showNotification = (message: string, type: 'success' | 'error') => {
  notification.value = { show: true, message, type };
  setTimeout(() => {
    notification.value.show = false;
  }, 3000);
};

// Lifecycle
onMounted(() => {
  loadSharedVideos();
});
</script>
