import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const repoEnvDir = path.resolve(__dirname, '..', '..');

// Use the same env values for both backend and frontend defaults so only one .env is needed.
export default defineConfig(({ mode }) => {
  // Load env (including non-VITE_ keys) so we can mirror backend defaults. Explicit env wins.
  const env = { ...loadEnv(mode, repoEnvDir, ''), ...process.env };
  const defaultUserEmail = env.VITE_USER_EMAIL || env.EXPLORER_DEFAULT_USER_EMAIL || '';
  const defaultUsername = env.VITE_USERNAME || env.EXPLORER_DEFAULT_USERNAME || '';

  return {
    plugins: [react()],
    // Allow Vite to pick up the repo root .env automatically.
    envDir: repoEnvDir,
    define: {
      // Make the backend defaults available to the browser bundle.
      'import.meta.env.VITE_USER_EMAIL': JSON.stringify(defaultUserEmail),
      'import.meta.env.VITE_USERNAME': JSON.stringify(defaultUsername),
    },
  };
});
