import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    proxy: {
      '/api': 'http://localhost:3030',
      '/create-payment-link': 'http://localhost:3030'
    }
  }
})
