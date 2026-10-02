import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/globalSetup.ts'],
    setupFiles: ['./tests/setup/env.ts'],
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
})
