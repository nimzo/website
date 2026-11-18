import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nimzo.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'directory' },
});
