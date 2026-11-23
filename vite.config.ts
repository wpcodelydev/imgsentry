import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

// The URL is an unused jsPDF fallback for opening PDFs in a new window; the plugin only downloads PDFs; WordPress.org forbids loading code from CDNs.
function imgsentryStripUnusedCdnUrl(): Plugin {
  return {
    name: 'imgsentry-strip-unused-cdn-url',
    renderChunk(code: string, chunk: { fileName: string }) {
      const cdnUrlRegex = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdfobject\/[^\s"']+/g;
      const transformed = code.replace(cdnUrlRegex, '');
      if (/cdnjs\.cloudflare\.com/.test(transformed)) {
        throw new Error(`Forbidden CDN URL found in chunk ${chunk.fileName}`);
      }
      return { code: transformed, map: null };
    },
  };
}

function copyToDist(): Plugin {
  return {
    name: 'copy-to-dist',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'imgsentry/build');
      const destDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(srcDir, destDir, { recursive: true });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: '',
    build: {
      outDir: 'imgsentry/build',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/plugin.js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/plugin.[ext]',
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
          },
        },
      },
    },
    plugins: [imgsentryStripUnusedCdnUrl(), copyToDist(), react(), tailwindcss()],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});