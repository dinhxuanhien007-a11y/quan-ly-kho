/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Cấu hình cho Vitest
  test: {
    globals: true, // Cho phép dùng các hàm test (describe, it, expect) mà không cần import
    environment: 'jsdom', // Môi trường giả lập trình duyệt để test component
    setupFiles: './src/test/setup.js',
  },
})