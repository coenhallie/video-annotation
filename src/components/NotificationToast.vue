<script setup>
import { useNotifications } from '../composables/useNotifications.ts';

const { notifications, removeNotification } = useNotifications();

/**
 * The dot is the only colour on the toast, so it has to carry the status on
 * its own - the same job the label dot does on an annotation row. Flattening
 * these to grey would delete the one thing the toast is there to say.
 */
const getDotClass = (type) => {
  switch (type) {
    case 'success':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    case 'warning':
      return 'bg-amber-500';
    case 'info':
    default:
      return 'bg-gray-400 dark:bg-gray-500';
  }
};
</script>

<template>
  <div class="fixed right-4 top-4 z-50 space-y-2">
    <TransitionGroup
      name="notification"
      tag="div"
      class="space-y-2"
    >
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="flex w-full max-w-sm items-start gap-3 rounded border border-gray-200 bg-white px-3 py-2.5 shadow-lg transition-all duration-300 ease-in-out dark:border-white/10 dark:bg-gray-900"
      >
        <span
          class="mt-[7px] h-2 w-2 shrink-0 rounded-full"
          :class="getDotClass(notification.type)"
        />

        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-medium text-gray-900 dark:text-white">
            {{ notification.title }}
          </p>
          <p
            v-if="notification.message"
            class="mt-1 text-[11px] text-gray-500 dark:text-gray-400"
          >
            {{ notification.message }}
          </p>
        </div>

        <button
          type="button"
          class="-my-0.5 shrink-0 rounded p-1 text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          @click="removeNotification(notification.id)"
        >
          <span class="sr-only">Close</span>
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
