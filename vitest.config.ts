import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    env: { TZ: 'UTC' }, // run as a non-IST machine so timezone bugs show up
  },
});
