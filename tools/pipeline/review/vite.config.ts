import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { reviewApi } from './api';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svelte(), reviewApi()],
  resolve: { alias: { $lib: fileURLToPath(new URL('../../../src/lib', import.meta.url)) } },
  server: {
    port: 5190,
    open: `/?id=${process.env.EVENT_ID ?? ''}`,
    fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] },
  },
});
