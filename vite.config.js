import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // Relative URLs so the built file works from file:// as well as a server.
  base: './',

  // Folds the JS and CSS back into index.html, so `dist/index.html` is one
  // self-contained file you can email, copy to a USB stick or double-click.
  plugins: [viteSingleFile()],

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    target: 'es2020',
    // The pdf.js worker is inlined as a string, which makes the bundle large
    // on purpose. These limits are raised so the build does not complain.
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 8000,
    reportCompressedSize: false,
  },
});
