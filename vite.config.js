import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '',            // important for root domain
  plugins: [react()],
  build: { outDir: 'dist' }
})
