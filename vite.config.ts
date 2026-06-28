import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Relative base so the static build works on any host (Vercel root, GitHub Pages subpath, plain file server).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 4317 }
})
