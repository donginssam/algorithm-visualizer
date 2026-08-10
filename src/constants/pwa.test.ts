import { describe, expect, it } from "vitest"
import { buildManifest, PAGES_BASE, THEME_COLOR } from "./pwa"

/*
 * manifest 값을 그대로 다시 적는 대신, 어긋날 수 있는 결합과 Chrome이 실제로
 * 요구하는 조건만 검사합니다. scope·start_url이 Vite의 base를 따라가지 않으면
 * 설치는 되는데 열면 404가 납니다.
 */
describe("설치 manifest", () => {
  it("scope와 start_url이 base를 따라간다", () => {
    expect(buildManifest(PAGES_BASE)).toMatchObject({
      scope: PAGES_BASE,
      start_url: PAGES_BASE,
    })

    // 개발 서버는 base가 "/"입니다.
    expect(buildManifest("/")).toMatchObject({ scope: "/", start_url: "/" })
  })

  it("아이콘과 갈무리 경로가 base 아래로 나온다", () => {
    const manifest = buildManifest(PAGES_BASE)
    const sources = [...manifest.icons, ...manifest.screenshots].map(item => item.src)

    expect(sources.length).toBeGreaterThan(0)
    for (const src of sources) {
      expect(src.startsWith(PAGES_BASE)).toBe(true)
    }
  })

  /*
   * Chrome은 manifest 아이콘으로 SVG를 받지 않고("Icon … failed to load"),
   * 정사각형 아이콘이 하나도 없으면 운영체제가 쓸 아이콘이 없다고 알립니다.
   */
  it("아이콘이 모두 PNG이고 정사각형이다", () => {
    const icons = buildManifest(PAGES_BASE).icons

    expect(icons.length).toBeGreaterThan(0)
    for (const { src, type, sizes } of icons) {
      expect(type).toBe("image/png")
      expect(src.endsWith(".png")).toBe(true)

      const [width, height] = sizes.split("x")
      expect(width).toBe(height)
    }
  })

  it("maskable 아이콘이 있다", () => {
    const purposes = buildManifest(PAGES_BASE).icons.map(icon => icon.purpose)

    expect(purposes).toContain("maskable")
  })

  /* 넓은 화면용과 그 밖의 화면용이 각각 없으면 설치 창에 미리보기가 나오지 않습니다. */
  it("갈무리가 넓은 화면용과 그 밖의 화면용으로 하나씩 있다", () => {
    const screenshots = buildManifest(PAGES_BASE).screenshots

    expect(screenshots.some(shot => shot.form_factor === "wide")).toBe(true)
    expect(screenshots.some(shot => shot.form_factor === undefined)).toBe(true)
  })

  it("테마색이 index.html·_tokens.scss와 같은 값을 쓴다", () => {
    const manifest = buildManifest(PAGES_BASE)

    expect(manifest.theme_color).toBe(THEME_COLOR)
    expect(manifest.background_color).toBe(THEME_COLOR)
  })
})
