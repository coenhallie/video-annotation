<script setup>
import { useNotifications } from '../composables/useNotifications.ts';

const { notifications, removeNotification } = useNotifications();

const getIconForType = (type) => {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    case 'info':
    default:
      return 'ℹ';
  }
};

const getColorClasses = (type) => {
  switch (type) {
    case 'success':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'error':
      return 'bg-red-50 border-red-200 text-red-800';
    case 'warning':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'info':
    default:
      return 'bg-blue-50 border-blue-200 text-blue-800';
  }
};
</script>

<template>
  <div class="fixed top-4 right-4 z-50 space-y-2">
    <TransitionGroup name="notification" tag="div" class="space-y-2">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        :class="[
          'max-w-sm w-full shadow-lg rounded-lg border p-4 flex items-start space-x-3',
          'transform transition-all duration-300 ease-in-out',
          getColorClasses(notification.type),
        ]"
      >
        <div class="flex-shrink-0">
          <span class="text-lg font-semibold">
            {{ getIconForType(notification.type) }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium">
            {{ notification.title }}
          </p>
          <p v-if="notification.message" class="text-sm mt-1 opacity-90">
            {{ notification.message }}
          </p>
        </div>
        <div class="flex-shrink-0">
          <button
            @click="removeNotification(notification.id)"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span class="sr-only">Close</span>
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-move {
  transition: transform 0.3s ease;
}
</style>
