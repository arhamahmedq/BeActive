import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@/lib': '/Users/arhamahmedfiroz/Documents/Projects/BeActive/app/web/lib',
      '@/server': '/Users/arhamahmedfiroz/Documents/Projects/BeActive/server',
      '@/shared': '/Users/arhamahmedfiroz/Documents/Projects/BeActive/shared',
    },
  },
})
