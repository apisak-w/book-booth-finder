import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
});
