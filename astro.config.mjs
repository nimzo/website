import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.nimzo.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
