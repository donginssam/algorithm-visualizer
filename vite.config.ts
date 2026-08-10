import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ command, isPreview }) => ({
  // GitHub Pages project sites are served below /<repository>/.
  // Keep the development server at / so the existing local workflow is unchanged.
  base: command === "build" || isPreview ? "/algorithm-visualizer/" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-reactflow": ["@xyflow/react"],
          "vendor-codemirror": [
            "@codemirror/commands",
            "@codemirror/lint",
            "@codemirror/state",
            "@codemirror/view",
          ],
          "vendor-dagre": ["@dagrejs/dagre"],
        },
      },
    },
  },
}))
