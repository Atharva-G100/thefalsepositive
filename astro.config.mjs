// @ts-check
import { defineConfig } from 'astro/config';
import { remarkReadingTime } from './src/theme/assets/utils/reading-time.ts';

export default defineConfig({
  // Build output
  outDir: './dist',
  markdown: {
    remarkPlugins: [remarkReadingTime],
    shikiConfig: { langAlias: { jinja2: 'jinja' } },
  },

  // Content collections are auto-detected from src/content/
  // No framework integrations needed — we use vanilla JS
});
