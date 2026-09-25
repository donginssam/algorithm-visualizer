import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { findPlaceholders, renderPrivacyPage } from "./privacyPage"

const markdown = readFileSync(new URL("../docs/privacy.md", import.meta.url), "utf8")
const template = readFileSync(new URL("legal-template.html", import.meta.url), "utf8")
const html = renderPrivacyPage(markdown, template)

const articleNumbers = [...html.matchAll(/<h2 id="article-(\d+)">제(\d+)조/g)]

/*
 * 기준: 개인정보보호위원회 「개인정보 처리방침 작성지침」(2026. 4.)
 */
describe("개인정보 처리방침 페이지", () => {
  it("조마다 번호와 같은 앵커가 1부터 빠짐없이 붙는다", () => {
    const numbers = articleNumbers.map(match => Number(match[1]))
    expect(numbers).toEqual(numbers.map((_, index) => index + 1))
    for (const match of articleNumbers) expect(match[1]).toBe(match[2])
  })

  it("작성지침의 법정 기재사항을 모두 조로 나누어 적는다", () => {
    const headings = [...html.matchAll(/<h2 id="article-\d+">(.*?)<\/h2>/g)].map(m => m[1])
    for (const required of [
      "처리 목적",
      "처리하는 개인정보의 항목",
      "처리 및 보유 기간",
      "파기",
      "제3자 제공",
      "위탁",
      "안전성 확보조치",
      "자동 수집 장치",
      "권리·의무 및 행사방법",
      "개인정보 보호책임자",
      "변경",
    ]) {
      expect(
        headings.some(heading => heading.includes(required)),
        required,
      ).toBe(true)
    }
  })

  it("제목·서문·목차·본문 순서이고, 목차가 모든 조로 이어진다", () => {
    const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ""
    const tocLinks = [...toc.matchAll(/href="#(article-\d+)"/g)].map(m => m[1])
    expect(tocLinks).toEqual(articleNumbers.map(match => `article-${match[1]}`))

    const titleAt = html.indexOf("<h1>")
    const tocAt = html.indexOf('<nav class="toc"')
    const firstArticleAt = html.indexOf('<h2 id="article-1"')
    expect(titleAt).toBeLessThan(tocAt)
    expect(tocAt).toBeLessThan(firstArticleAt)
  })

  it("본문의 조 참조 링크가 실제 앵커를 가리킨다", () => {
    const ids = new Set(articleNumbers.map(match => `article-${match[1]}`))
    for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
      expect(ids.has(target), target).toBe(true)
    }
  })

  it("시행일을 채우며 템플릿 자리표시자를 남기지 않는다", () => {
    expect(html).toContain("<h1>개인정보 처리방침</h1>")
    expect(html).toMatch(/시행일 \d{4}년 \d{1,2}월 \d{1,2}일/)
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).not.toContain("[[")
  })

  it("변경 조항의 시행일이 머리말의 시행일과 같다", () => {
    const effective = /^effective:\s*(.+)$/m.exec(markdown)?.[1].trim() ?? ""
    const article16 = /<h2 id="article-16">[\s\S]*$/.exec(html)?.[0] ?? ""
    expect(effective).not.toBe("")
    expect(article16).toContain(`${effective}부터 적용됩니다`)
  })

  it("편집자용 주석과 Markdown 문법이 페이지에 새지 않는다", () => {
    expect(html).not.toContain("정본입니다. 빌드할 때")
    expect(html).not.toContain("**")
    expect(html).not.toMatch(/^\|/m)
  })

  it("표는 가로 스크롤 상자로 감싼다", () => {
    const tables = html.match(/<table>/g)?.length ?? 0
    expect(tables).toBeGreaterThan(0)
    expect(html.match(/<div class="table-wrap"><table>/g)?.length).toBe(tables)
  })

  it("채우지 않은 값을 찾아낸다", () => {
    expect(findPlaceholders("연락처: `__CONTACT__`, `__NAME__`, `__CONTACT__`")).toEqual([
      "__CONTACT__",
      "__NAME__",
    ])
    expect(findPlaceholders("모두 채움")).toEqual([])
  })

  it("머리말이 없으면 알아보기 쉬운 오류를 낸다", () => {
    expect(() => renderPrivacyPage("# 제목만", template)).toThrow(/title·effective/)
  })
})
