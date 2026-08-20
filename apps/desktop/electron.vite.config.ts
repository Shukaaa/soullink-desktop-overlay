import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    // @soullink/shared is a local workspace package (an npm-workspaces
    // symlink, not a real published dependency). Alias it straight to its
    // TypeScript source -- like the renderer config below -- so it's
    // bundled into out/main/index.js as plain ESM/CJS-free source instead of
    // requiring Rollup to statically re-analyze the compiled dist output's
    // getter-based CJS re-exports (which Rollup can't always resolve). This
    // also means the packaged Electron app never needs to resolve
    // node_modules/@soullink/shared at runtime, sidestepping
    // electron-builder's known issues with workspace symlinks.
    resolve: {
      alias: {
        '@soullink/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@soullink/shared'] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@soullink/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@soullink/shared'] })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      // Import shared's TypeScript source directly in the renderer bundle
      // instead of its compiled CJS dist output. Vite/esbuild handles real
      // ESM source natively; the compiled dist re-exports (which use
      // TypeScript's getter-based CJS interop) are otherwise awkward for
      // Rollup to statically analyze for named exports.
      alias: {
        '@soullink/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html'),
        },
      },
    },
    plugins: [react()],
  },
});
