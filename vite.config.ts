import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import geminiApiHandler from './api/gemini';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
      process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
    }

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              docs: ['mammoth'],
            }
          }
        }
      },
      plugins: [
        react(),
        {
          name: 'local-gemini-api',
          apply: 'serve',
          configureServer(server) {
            server.middlewares.use('/api/gemini', (req, res) => {
              void geminiApiHandler(req, res);
            });
          },
        },
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
