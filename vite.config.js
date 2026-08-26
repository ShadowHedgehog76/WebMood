import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Le site est publié sur https://shadowhedgehog76.github.io/WebMood/ : les fichiers
// construits doivent donc être référencés sous ce sous-chemin. En développement on
// reste à la racine.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/WebMood/' : '/',
  plugins: [react()],
  server: { port: 5173, open: true },
  build: {
    // three.js part déjà dans son propre morceau, chargé au premier bloc 3D.
    chunkSizeWarningLimit: 800,
  },
}))
