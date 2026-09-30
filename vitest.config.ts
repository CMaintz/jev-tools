import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // I/O edges with no unit seam: the triage Action entrypoint, the sort CLI, the
      // package barrels, and the network adapters (fetch).
      exclude: [
        'packages/*/src/index.ts',
        'packages/triage/src/main.ts',
        'packages/sort/src/cli.ts',
        'packages/*/src/providers/**',
      ],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
