// src/test/setup.js
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Mở rộng expect của vitest với các matchers từ jest-dom
expect.extend(matchers);

// Tự động dọn dẹp DOM ảo sau mỗi bài test
afterEach(() => {
  cleanup();
});