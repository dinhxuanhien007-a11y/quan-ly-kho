// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from "@sentry/react";

import './index.css';
import App from './App.jsx';
import './styles/print.css';

// <-- PHẦN ĐÃ SỬA LỖI CÚ PHÁP -->
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [ // Lỗi sai ở đây: Cần có key "integrations" là một mảng
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
});
// <-- KẾT THÚC PHẦN SỬA LỖI -->

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);