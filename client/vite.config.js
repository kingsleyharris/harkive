import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/years': 'http://localhost:3001',
      '/image': 'http://localhost:3001',
      '/cover': 'http://localhost:3001',
      '/docs': 'http://localhost:3001',
      '/doc': 'http://localhost:3001',
      '/search': 'http://localhost:3001',
      '/projects': 'http://localhost:3001',
      '/project-image': 'http://localhost:3001',
      '/project-audio': 'http://localhost:3001',
      '/shots': 'http://localhost:3001',
      '/screenshots': 'http://localhost:3001',
      '/notion': 'http://localhost:3001',
      '/archive': 'http://localhost:3001',
      '/studio': 'http://localhost:3001',
      '/videos': 'http://localhost:3001',
      '/video': 'http://localhost:3001',
      '/dashboard': 'http://localhost:3001',
    }
  }
})
