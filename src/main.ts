import './assets/main.css';

import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);

// Global error handler
app.config.errorHandler = (error, instance, info) => {
  console.error('Vue Global Error Handler:', error);
  console.error('Component instance:', instance);
  console.error('Error info:', info);

  // Log to external service in production
  if (process.env.NODE_ENV === 'production') {
    // You can add error reporting service here
    // e.g., Sentry, LogRocket, etc.
  }
};

app.mount('#app');
