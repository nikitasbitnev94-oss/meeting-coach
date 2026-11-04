import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 6000 }, // vosk-browser встраивает wasm в бандл
  test: { environment: 'node', globals: true },
});
