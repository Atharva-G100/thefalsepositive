// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Build output
  outDir: './dist',

  // Content collections are auto-detected from src/content/
  // No framework integrations needed — we use vanilla JS
});
