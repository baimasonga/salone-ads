import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('motion')) return 'motion';
            if (id.includes('html-to-image') || id.includes('jszip')) return 'export-tools';
            // These parsers are fetched only after a subscriber explicitly asks to
            // analyse a matching document. Keep the much larger PDF runtime out of
            // both the initial application and the DOCX analysis path.
            if (id.includes('pdfjs-dist')) return 'pdf-intelligence';
            if (id.includes('mammoth')) return 'docx-intelligence';
            if (id.includes('qrcode')) return 'qr-tools';
            if (id.includes('react') || id.includes('scheduler')) return 'react';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
