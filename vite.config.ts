import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { buildManifest, PAGES_BASE } from "./src/constants/pwa"

export default defineConfig(({ command, isPreview }) => {
  // GitHub Pages project sites are served below /<repository>/.
  // Keep the development server at / so the existing local workflow is unchanged.
  const base = command === "build" || isPreview ? PAGES_BASE : "/"

  return {
    base,
    plugins: [
      react(),
      /*
       * 오프라인 실행과 설치.
       *
       * precache 목록은 손으로 적지 않습니다. 파일 이름에 해시가 붙고 아래
       * manualChunks로 vendor chunk가 갈라져 있어, 손으로 적은 목록은 배포할 때마다
       * 낡습니다. Workbox가 빌드 결과에서 만들게 둡니다.
       */
      VitePWA({
        // 새 버전을 자동으로 적용하지 않습니다. 수업 중에 기호를 끌거나 글자를 치는
        // 도중 화면이 갑자기 새로 고쳐지지 않도록, App에서 물어본 뒤 적용합니다.
        registerType: "prompt",
        manifest: buildManifest(base),
        workbox: {
          // 기본값(js,css,html)은 아이콘을 빠뜨립니다. 설치 창 갈무리
          // (screenshot-*.png)는 오프라인에서 쓸 일이 없어 담지 않습니다.
          globPatterns: ["**/*.{js,css,html,svg}", "icon-*.png"],
          // 화면 전환이 URL 해시라서 실제 문서는 index.html 하나뿐입니다.
          // 주소에 쿼리가 붙으면(예: LMS에서 온 ?from=...) precache와 어긋나므로
          // 이 fallback이 받습니다.
          navigateFallback: "index.html",
        },
      }),
    ],
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
  }
})
