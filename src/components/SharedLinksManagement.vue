<template>
  <div class="shared-links-management">
    <!-- Controls Bar -->
    <div class="controls-bar">
      <!-- Search -->
      <div class="search-box">
        <svg
          class="search-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search by video title..."
          class="search-input"
        >
        <button
          v-if="searchQuery"
          @click="searchQuery = ''"
          class="clear-search"
        >
          <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Filters -->
      <div class="filters">
        <select v-model="permissionFilter" class="filter-select">
          <option value="all">All Permissions</option>
          <option value="view-only">View-only</option>
          <option value="annotate">Annotation Enabled</option>
        </select>

        <select v-model="sortBy" class="filter-select">
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="title-asc">Title A-Z</option>
          <option value="title-desc">Title Z-A</option>
        </select>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner" />
      <p>Loading shared videos...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="error-state">
      <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="error-message">{{ error }}</p>
      <button @click="loadSharedVideos" class="retry-button">Try Again</button>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredVideos.length === 0 && !searchQuery && permissionFilter === 'all'" class="empty-state">
      <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
      </svg>
      <h3>No Shared Videos</h3>
      <p>You haven't shared any videos yet. Share a video to manage its link here.</p>
    </div>

    <!-- No Results State -->
    <div v-else-if="filteredVideos.length === 0" class="empty-state">
      <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <h3>No Results Found</h3>
      <p>No videos match your search or filter criteria.</p>
      <button @click="clearFilters" class="retry-button">Clear Filters</button>
    </div>

    <!-- Table View -->
    <div v-else class="table-container">
      <table class="shared-links-table">
        <thead>
          <tr>
            <th>Video</th>
            <th>Permission</th>
            <th>Share Link</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="video in filteredVideos"
            :key="`${video.type}-${video.id}`"
            class="table-row"
          >
            <td class="video-cell">
              <div class="video-info">
                <div
                  v-if="video.thumbnailUrl"
                  class="thumbnail"
                  :style="{ backgroundImage: `url(${video.thumbnailUrl})` }"
                />
                <div v-else class="thumbnail-placeholder">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div class="video-details">
                  <div class="video-title">{{ video.title }}</div>
                  <div v-if="video.description" class="video-description">{{ video.description }}</div>
                </div>
              </div>
            </td>
            <td>
              <select
                :value="video.allowAnnotations ? 'annotate' : 'view-only'"
                @change="handlePermissionChange(video, ($event.target as HTMLSelectElement).value)"
                class="permission-select"
              >
                <option value="view-only">View-only</option>
                <option value="annotate">Annotations</option>
              </select>
            </td>
            <td class="link-cell">
              <div class="link-container">
                <input
                  :value="video.shareUrl"
                  readonly
                  class="link-input"
                  @click="selectLink"
                >
                <button
                  @click="copyLink(video.shareUrl)"
                  class="copy-button"
                  :class="{ 'copied': copiedId === video.id }"
                >
                  <svg v-if="copiedId !== video.id" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <svg v-else class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </td>
            <td class="actions-cell">
              <button
                @click="confirmRevoke(video)"
                class="action-button revoke"
                title="Revoke sharing"
              >
                <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Confirmation Dialog -->
    <div v-if="confirmDialog.show" class="modal-overlay" @click="closeConfirmDialog">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3 class="modal-title">{{ confirmDialog.title }}</h3>
          <button @click="closeConfirmDialog" class="close-button">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p>{{ confirmDialog.message }}</p>
        </div>
        <div class="modal-footer">
          <button @click="closeConfirmDialog" class="button-secondary">Cancel</button>
          <button @click="confirmAction" class="button-primary" :class="confirmDialog.type">
            {{ confirmDialog.confirmText }}
          </button>
        </div>
      </div>
    </div>

    <!-- Success Notification -->
    <div v-if="notification.show" class="notification" :class="notification.type">
      <svg v-if="notification.type === 'success'" class="notification-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <svg v-else class="notification-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{{ notification.message }}</span>
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

<style scoped>
.shared-links-management {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.header-content {
  flex: 1;
}

.title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.subtitle {
  color: #6b7280;
  margin: 0;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  color: #374151;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.refresh-button:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.refresh-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.controls-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 300px;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.25rem;
  height: 1.25rem;
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2.5rem 0.5rem 2.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  ring: 2px;
  ring-color: rgba(59, 130, 246, 0.5);
}

.clear-search {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  padding: 0.25rem;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: color 0.2s;
}

.clear-search:hover {
  color: #374151;
}

.filters {
  display: flex;
  gap: 0.5rem;
}

.filter-select {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.25rem;
}

.filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.spinner {
  width: 3rem;
  height: 3rem;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 1s linear infinite;
}

.error-icon,
.empty-icon {
  width: 4rem;
  height: 4rem;
  color: #9ca3af;
  margin: 0 auto 1rem;
}

.error-message {
  color: #ef4444;
  font-weight: 500;
  margin-bottom: 1rem;
}

.retry-button {
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-button:hover {
  background: #2563eb;
}

.empty-state h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem 0;
}

.empty-state p {
  color: #6b7280;
  margin: 0 0 1rem 0;
}

.table-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  overflow: hidden;
}

.shared-links-table {
  width: 100%;
  border-collapse: collapse;
}

.shared-links-table thead {
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.shared-links-table th {
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.shared-links-table td {
  padding: 1rem;
  border-top: 1px solid #f3f4f6;
}

.table-row {
  transition: background 0.2s;
}

.table-row:hover {
  background: #f9fafb;
}

.video-cell {
  min-width: 300px;
}

.video-info {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.thumbnail,
.thumbnail-placeholder {
  width: 4rem;
  height: 3rem;
  border-radius: 0.375rem;
  flex-shrink: 0;
}

.thumbnail {
  background-size: cover;
  background-position: center;
}

.thumbnail-placeholder {
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.thumbnail-placeholder svg {
  width: 1.5rem;
  height: 1.5rem;
}

.video-details {
  flex: 1;
  min-width: 0;
}

.video-title {
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-description {
  font-size: 0.875rem;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.permission-select {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  background: white;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.25rem;
  min-width: 150px;
}

.permission-select:focus {
  outline: none;
  border-color: #3b82f6;
}

.link-cell {
  min-width: 250px;
}

.link-container {
  display: flex;
  gap: 0.5rem;
}

.link-input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
  background: #f9fafb;
  cursor: pointer;
}

.link-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: white;
}

.copy-button {
  padding: 0.375rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-button:hover {
  background: #f9fafb;
  color: #374151;
}

.copy-button.copied {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}

.actions-cell {
  width: 3rem;
}

.action-button {
  padding: 0.375rem;
  border: 1px solid;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
  margin-right: 0.5rem;
}

.action-button.revoke {
  background: white;
  border-color: #fecaca;
  color: #ef4444;
}

.action-button.revoke:hover {
  background: #fef2f2;
  border-color: #ef4444;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal-content {
  background: white;
  border-radius: 0.5rem;
  max-width: 28rem;
  width: 100%;
  margin: 1rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.close-button {
  padding: 0.25rem;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.close-button:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  padding: 1.5rem;
}

.modal-body p {
  color: #6b7280;
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
}

.button-secondary {
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  color: #374151;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.button-secondary:hover {
  background: #f9fafb;
}

.button-primary {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 0.375rem;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.button-primary.warning {
  background: #f59e0b;
}

.button-primary.warning:hover {
  background: #d97706;
}

.button-primary.danger {
  background: #ef4444;
}

.button-primary.danger:hover {
  background: #dc2626;
}

.notification {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  z-index: 60;
  animation: slideIn 0.3s ease-out;
}

.notification.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.notification.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.notification-icon {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

@keyframes slideIn {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@media (max-width: 1024px) {
  .shared-links-management {
    padding: 1rem;
  }

  .controls-bar {
    flex-direction: column;
  }

  .search-box {
    min-width: 100%;
  }

  .filters {
    flex-wrap: wrap;
  }

  .table-container {
    overflow-x: auto;
  }

  .shared-links-table {
    min-width: 1000px;
  }
}
</style>