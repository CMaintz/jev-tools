import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = ['core', 'guard', 'triage', 'sort'];

export default defineConfig({
  resolve: {
    // Tests run against core's source, so no build step is needed before `vitest`.
    alias: { '@cmaintz/jev-core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
  },
  test: {
    projects: packages.map((p) => ({
      extends: true,
      test: { name: `@cmaintz/jev-${p}`, root: `packages/${p}`, include: ['test/**/*.test.ts'] },
    })),
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      // I/O edges with no unit seam (the triage Action entrypoint, the sort CLI),
      // re-export barrels, and the types-only provider contract.
      exclude: [
        'packages/*/src/index.ts',
        'packages/triage/src/main.ts',
        'packages/sort/src/cli.ts',
        'packages/core/src/jev-provider.ts',
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
