import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages project sites are served below /<repository>/.
  // Keep the development server at / so the existing local workflow is unchanged.
  base: command === "build" || isPreview ? "/algorithm-visualizer/" : "/",
  plugins: [react()],
}))
