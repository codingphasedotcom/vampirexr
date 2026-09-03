import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:vr` serves over HTTPS so a headset on the same network can open it
// (WebXR requires a secure context). Plain `npm run dev` stays on http://localhost.
export default defineConfig({
  plugins: process.env.SSL ? [basicSsl()] : [],
  server: { port: 5173 },
});
