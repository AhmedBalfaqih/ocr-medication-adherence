import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    globalSetup: './test/global-setup.js',
    setupFiles: ['./test/setup-env.js'],
    fileParallelism: false, // one shared database
    // The setup and the tests talk to Supabase over the network
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
