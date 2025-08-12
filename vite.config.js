import { defineConfig } from 'vite';

export default defineConfig({
  base: '', // Important for GitHub Pages root domain
  build: {
    outDir: 'dist'
  }
});
