import { describe, expect, it, vi } from "vitest"
import { legalPagePlugin, splitFrontMatter } from "./legalPage"

describe("간단한 key: value 머리말", () => {
  const parse = (text: string) => splitFrontMatter(text, ["title", "updated"], "test.md")
  it.each(["\n", "\r\n"])("줄바꿈 %j를 지원한다", newline => {
    const result = parse(
      ["---", "title: 제목: 부제", "", "updated: 오늘", "---", "본문"].join(newline),
    )
    expect(result).toEqual({ meta: { title: "제목: 부제", updated: "오늘" }, body: "본문" })
  })
  it.each([
    ["title 제목", "key: value"],
    [": 제목", "key: value"],
    ["title:", "비어"],
    ["title: 제목\ntitle: 중복", "중복"],
  ])("잘못된 항목 %s를 거부한다", (line, error) => {
    expect(() => parse(`---\n${line}\nupdated: 오늘\n---\n본문`)).toThrow(error)
  })
  it("필수 항목과 닫는 구분자를 검사한다", () => {
    expect(() => parse("---\ntitle: 제목\n---\n본문")).toThrow("title·updated")
    expect(() => parse("---\ntitle: 제목\nupdated: 오늘")).toThrow("test.md")
  })
})

describe("고지 페이지 요청 처리", () => {
  it("관련 경로에만 원문을 조회하고 쿼리와 배포 base를 처리한다", () => {
    const assets = vi.fn(() => [{ fileName: "licenses/test.txt", source: "원문" }])
    const plugin = legalPagePlugin({
      name: "test",
      pagePath: "legal/test.html",
      source: new URL("../docs/licenses.md", import.meta.url),
      render: () => "페이지",
      assets,
      assetPrefix: "licenses/",
    })
    const use = vi.fn()
    if (typeof plugin.configResolved !== "function" || typeof plugin.configureServer !== "function")
      throw new Error("플러그인 훅 필요")
    plugin.configResolved.call({} as never, { base: "/app/" } as never)
    plugin.configureServer.call({} as never, { middlewares: { use } } as never)
    const middleware = use.mock.calls[0][0]
    const response = { setHeader: vi.fn(), end: vi.fn() }
    const next = vi.fn()
    for (const url of ["/app/", "/app/src/main.tsx", "/app/assets/font.woff2"])
      middleware({ url }, response, next)
    expect(next).toHaveBeenCalledTimes(3)
    expect(assets).not.toHaveBeenCalled()
    middleware({ url: "/app/legal/test.html?from=footer" }, response, next)
    expect(response.end).toHaveBeenLastCalledWith("페이지")
    expect(assets).not.toHaveBeenCalled()
    middleware({ url: "/app/licenses/test.txt?download=1" }, response, next)
    expect(assets).toHaveBeenCalledTimes(1)
    expect(response.end).toHaveBeenLastCalledWith("원문")
    middleware({ url: "/app/licenses/missing.txt" }, response, next)
    expect(next).toHaveBeenCalledTimes(4)
  })
})
