import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import { licensePage } from "./plugins/licensePage.ts"
import { privacyPage } from "./plugins/privacyPage.ts"
import { buildManifest, PAGES_BASE } from "./src/constants/pwa.ts"

/**
 * 라이브러리를 이름 붙은 chunk로 떼어 냅니다.
 *
 * 앱 코드만 고쳐 배포해도 이 chunk들의 해시는 그대로라 캐시가 살아남습니다.
 *
 * 편집 화면 라이브러리(React Flow·CodeMirror·dagre)는 지연 불러오는 편집 화면에서만
 * 쓰므로 **첫 화면에 딸려 오면 안 됩니다.** 두 가지를 지켜야 합니다.
 *
 * - **JavaScript만** 담습니다. `main.tsx`가 불러오는 `@xyflow/react/dist/style.css`까지
 *   담기면, 진입점이 그 CSS를 쓰려고 React Flow chunk 전체에 의존하게 됩니다.
 * - rolldown은 그룹에 모듈을 담을 때 그 모듈이 의존하는 것까지 함께 담습니다. 진입점과
 *   함께 쓰는 React·zustand를 `vendor-react`로 **먼저**(높은 priority) 가져가지 않으면
 *   React Flow chunk에 섞여 들어가, 진입점이 React 하나를 쓰려고 그 chunk(약 60 KB gzip)
 *   전체를 받습니다.
 */
const vendorGroup = (name: string, packages: string, priority: number) => ({
  name,
  test: new RegExp(`[\\\\/]node_modules[\\\\/](?:${packages})[\\\\/].*\\.[cm]?js$`),
  priority,
})

export default defineConfig(({ command, isPreview }) => {
  // GitHub Pages project sites are served below /<repository>/.
  // Keep the development server at / so the existing local workflow is unchanged.
  const base = command === "build" || isPreview ? PAGES_BASE : "/"

  return {
    base,
    // 미리보기 도구가 PORT로 빈 포트를 넘겨줍니다. 없으면 Vite 기본값(5173)을 씁니다.
    server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
    plugins: [
      react(),
      privacyPage(),
      licensePage(),
      /*
       * 오프라인 실행과 설치.
       *
       * precache 목록은 손으로 적지 않습니다. 파일 이름에 해시가 붙고 아래
       * codeSplitting으로 vendor chunk가 갈라져 있어, 손으로 적은 목록은 배포할 때마다
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
          // 자체 호스팅 글꼴도 포함해 오프라인에서 새 한글 입력을 지원합니다.
          // 오픈소스 라이선스 원문(licenses/*.txt)도 담아 오프라인에서 고지 페이지의 링크가 열리게 합니다.
          globPatterns: ["**/*.{js,css,html,svg,woff2}", "icon-*.png", "licenses/*.txt"],
          // 화면 전환이 URL 해시라서 실제 문서는 index.html 하나뿐입니다.
          // 주소에 쿼리가 붙으면(예: LMS에서 온 ?from=...) precache와 어긋나므로
          // 이 fallback이 받습니다.
          navigateFallback: "index.html",
        },
      }),
    ],
    build: {
      rolldownOptions: {
        output: {
          // Vite 8(rolldown)에서는 manualChunks 대신 codeSplitting을 씁니다.
          codeSplitting: {
            groups: [
              vendorGroup(
                "vendor-react",
                "react|react-dom|scheduler|zustand|use-sync-external-store",
                2,
              ),
              vendorGroup("vendor-reactflow", "@xyflow", 1),
              vendorGroup("vendor-codemirror", "@codemirror", 1),
              vendorGroup("vendor-dagre", "@dagrejs", 1),
            ],
          },
        },
      },
    },
  }
})
