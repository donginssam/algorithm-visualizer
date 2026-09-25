import type { Plugin } from "vite"
import { PRIVACY_PAGE_PATH } from "../src/constants/legal.ts"
import {
  fillTemplate,
  insertToc,
  legalPagePlugin,
  renderMarkdown,
  splitFrontMatter,
} from "./legalPage.ts"

/*
 * 개인정보 처리방침 페이지.
 *
 * 정본은 docs/privacy.md 하나입니다. 공통 절차는 legalPage.ts에 있고, 여기에는
 * 처리방침에만 필요한 것(조 번호 앵커, 목차, 채우지 않은 값 경고)만 둡니다.
 */

const SOURCE = new URL("../docs/privacy.md", import.meta.url)
const SOURCE_NAME = "docs/privacy.md"
const REQUIRED = ["title", "effective"] as const

/** 본문에서 시행일이 들어갈 자리. */
const EFFECTIVE_MARKER = "[[시행일]]"

/** 채워 넣어야 하는 값(`__NAME__` 등)이 남아 있는지 찾습니다. */
export function findPlaceholders(markdown: string): string[] {
  return [...new Set(markdown.match(/__[A-Z]+__/g) ?? [])]
}

/** Markdown 본문과 겉모양 템플릿으로 완성된 HTML을 만듭니다. */
export function renderPrivacyPage(markdown: string, template: string): string {
  const { meta, body } = splitFrontMatter(markdown, REQUIRED, SOURCE_NAME)

  // 학교 제출 서류가 조 번호로 가리키므로 `제N조`마다 고정 앵커를 답니다.
  // 시행일은 머리말 한 곳에만 적고, 본문(제16조)에는 같은 값을 채워 넣습니다.
  const withDate = body.replaceAll(EFFECTIVE_MARKER, () => meta.effective)
  const content = renderMarkdown(withDate).replace(/<h2>제(\d+)조/g, '<h2 id="article-$1">제$1조')

  const entries = [...content.matchAll(/<h2 id="(article-\d+)">(.*?)<\/h2>/g)].map(
    ([, id, label]) => ({ id, label }),
  )

  return fillTemplate(template, {
    title: meta.title,
    lead: `시행일 ${meta.effective}`,
    content: insertToc(content, entries),
  })
}

export function privacyPage(): Plugin {
  return legalPagePlugin({
    name: "privacy-page",
    pagePath: PRIVACY_PAGE_PATH,
    source: SOURCE,
    render: renderPrivacyPage,
    warn: markdown => {
      const placeholders = findPlaceholders(markdown)
      if (placeholders.length === 0) return undefined
      return `${SOURCE_NAME}에 채우지 않은 값이 있습니다: ${placeholders.join(", ")} — 배포 전에 채워 주세요.`
    },
  })
}
