import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: '_site', assets: '_site', fallback: undefined, strict: true }),
    prerender: { entries: ['*'], handleHttpError: 'fail' },
  },
};
