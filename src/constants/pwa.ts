/**
 * 설치·오프라인 실행에 필요한 값.
 *
 * vite.config.ts(빌드)와 constants/pwa.test.ts(검증)가 함께 씁니다.
 * manifest의 scope·start_url이 Vite의 base와 어긋나면 설치는 되는데 열면 404가
 * 나므로, 두 값을 따로 적지 않고 base 하나에서 만들어 냅니다.
 */

/** GitHub Pages project site는 저장소 이름 아래에서 열립니다. */
export const PAGES_BASE = "/algorithm-visualizer/"

/**
 * 앱 테마색.
 *
 * index.html의 <meta name="theme-color">, styles/_tokens.scss의 --surface-page와
 * 같은 값이어야 합니다. 어긋나면 설치 창이 뜰 때 배경색이 한 번 번쩍입니다.
 */
export const THEME_COLOR = "#eef2fa"

/** index.html의 <meta name="description">과 같은 문장. */
const DESCRIPTION = "의사코드와 순서도를 함께 익힐 수 있는 웹 기반 알고리즘 학습 도구"

export interface WebManifestIcon {
  src: string
  sizes: string
  type: string
  purpose: string
}

export interface WebManifestScreenshot {
  src: string
  sizes: string
  type: string
  label: string
  /** 넓은 화면용임을 밝히는 값. 비워 두면 모든 화면에서 쓰입니다. */
  form_factor?: "wide"
}

export interface WebManifest {
  id: string
  name: string
  short_name: string
  description: string
  lang: string
  start_url: string
  scope: string
  display: "standalone" | "fullscreen" | "minimal-ui" | "browser"
  theme_color: string
  background_color: string
  categories: string[]
  icons: WebManifestIcon[]
  screenshots: WebManifestScreenshot[]
}

/** 앱 화면 갈무리. 실제 크기와 같아야 설치 창에서 잘리지 않습니다. */
const SCREENSHOT = { src: "screenshot-wide.png", sizes: "1366x768" }

/**
 * base 아래에서 동작하는 manifest를 만듭니다.
 *
 * 아이콘은 PNG입니다. 그림의 원본은 public/의 SVG지만 **Chrome은 manifest 아이콘으로
 * SVG를 받지 않습니다**(favicon으로는 잘 동작합니다). 정사각형 PNG가 없으면 설치
 * 아이콘을 불러오지 못하고 운영체제가 쓸 아이콘도 없습니다. PNG는
 * scripts/generate-icons.mjs로 SVG에서 뽑아 저장소에 함께 둡니다.
 */
export function buildManifest(base: string): WebManifest {
  const icon = (file: string, size: number, purpose: string): WebManifestIcon => ({
    src: `${base}${file}`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose,
  })

  return {
    id: base,
    name: "알고리즘 표현하기",
    short_name: "알고리즘",
    description: DESCRIPTION,
    lang: "ko",
    start_url: base,
    scope: base,
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    categories: ["education"],
    icons: [
      icon("icon-192.png", 192, "any"),
      icon("icon-512.png", 512, "any"),
      icon("icon-maskable-512.png", 512, "maskable"),
    ],
    /*
     * 설치 창에 미리보기를 보여 주려면 넓은 화면용과 그 밖의 화면용이 각각 필요합니다.
     * 이 도구는 가로 화면 전용이라 좁은 화면용 갈무리를 따로 만들 수 없으므로,
     * 같은 그림을 form_factor 없이 한 번 더 등록해 어떤 화면에서든 쓰이게 합니다.
     */
    screenshots: [
      {
        ...SCREENSHOT,
        src: `${base}${SCREENSHOT.src}`,
        type: "image/png",
        label: "의사코드와 순서도를 나란히 편집하는 화면",
        form_factor: "wide",
      },
      {
        ...SCREENSHOT,
        src: `${base}${SCREENSHOT.src}`,
        type: "image/png",
        label: "의사코드와 순서도를 나란히 편집하는 화면",
      },
    ],
  }
}
