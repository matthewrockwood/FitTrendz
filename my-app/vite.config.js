import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  base: '/FitTrendz/',     // repo name
  server: { port: 5173 }
})
