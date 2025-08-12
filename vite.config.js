import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '',                // correct for a root-domain Pages site
  plugins: [react()],
  build: { outDir: 'dist' }
})
