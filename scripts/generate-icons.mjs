/*
 * public/의 SVG에서 설치용 PNG 아이콘을 만듭니다.
 *
 * Chrome은 manifest 아이콘으로 SVG를 받지 않습니다(파일 자체는 favicon으로 잘
 * 동작하지만 설치 아이콘 처리기가 불러오지 못합니다). 그래서 그림의 원본은 SVG로
 * 두고, manifest에 넣을 PNG만 여기서 뽑아 저장소에 함께 커밋합니다.
 *
 * 빌드에는 넣지 않습니다. 브랜드 마크를 고쳤을 때만 손으로 한 번 돌립니다.
 *
 *   node scripts/generate-icons.mjs
 *
 * 크롬 실행 파일 경로는 CHROME 환경 변수로 바꿀 수 있습니다.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const PUBLIC_DIR = resolve(import.meta.dirname, "../public")

/** 만들 아이콘: [원본 SVG, 결과 PNG, 한 변 길이, 배경 투명 여부] */
const TARGETS = [
  ["icon.svg", "icon-192.png", 192, true],
  ["icon.svg", "icon-512.png", 512, true],
  ["icon-maskable.svg", "icon-maskable-512.png", 512, false],
]

const CHROME_CANDIDATES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find(path => existsSync(path))
if (!chrome) {
  console.error("크롬을 찾지 못했습니다. CHROME 환경 변수로 실행 파일 경로를 지정하세요.")
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), "icons-"))

try {
  for (const [source, output, size, transparent] of TARGETS) {
    // SVG를 원하는 크기로 채운 페이지를 만들어 그대로 캡처합니다.
    const page = join(work, `${output}.html`)
    writeFileSync(
      page,
      `<body style="margin:0">` +
        `<img src="file://${join(PUBLIC_DIR, source)}" ` +
        `style="display:block;width:${size}px;height:${size}px">` +
        `</body>`,
    )

    execFileSync(
      chrome,
      [
        "--headless=new",
        "--hide-scrollbars",
        // 투명 배경. 둥근 모서리 바깥이 흰색으로 채워지지 않게 합니다.
        `--default-background-color=${transparent ? "00000000" : "FFFFFFFF"}`,
        `--window-size=${size},${size}`,
        `--screenshot=${join(PUBLIC_DIR, output)}`,
        `file://${page}`,
      ],
      { stdio: "ignore" },
    )

    console.log(`${output} (${size}×${size}) ← ${source}`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
