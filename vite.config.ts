import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 静态站用 /auto-dictation/；全栈托管（Render 等）用 /
const base = process.env.VITE_BASE || '/auto-dictation/'

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787',
    },
  },
})
