import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy /api to Flask so the browser sees one origin in development, exactly
    // as vercel.json rewrites /api/(.*) to the backend service in production.
    // Same-origin matters here: the session cookie is httpOnly and SameSite=Lax,
    // so a cross-origin XHR from :5173 to :5000 would not carry it.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: false, // keep the Host header so Set-Cookie stays on localhost
      },
    },
  },
})
