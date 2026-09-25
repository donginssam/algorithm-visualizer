import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { marked } from "marked"
import type { Plugin } from "vite"

/*
 * 법적 고지 페이지의 공통 부분.
 *
 * 개인정보 처리방침(privacyPage.ts)과 오픈소스 라이선스(licensePage.ts)가 같은
 * 겉모양(legal-template.html)과 같은 절차를 씁니다. 정본은 docs/ 아래 Markdown
 * 하나이고, 빌드할 때 HTML로 바꿔 내보냅니다. 개발 서버에서는 요청마다 새로 그려
 * 문서를 고치면 새로 고침만으로 반영됩니다. 생성된 HTML을 저장소에 두지 않으므로
 * 정본과 어긋날 일이 없습니다.
 */

export const TEMPLATE = new URL("legal-template.html", import.meta.url)

/** 본문에서 목차가 들어갈 자리. */
export const TOC_MARKER = "<p>[[목차]]</p>"

/**
 * 머리말(맨 위의 --- 로 감싼 부분)을 읽어 본문과 나눕니다.
 *
 * `required`에 적은 항목이 하나라도 없으면 어느 문서의 무엇이 빠졌는지 알려 줍니다.
 */
export function splitFrontMatter(
  markdown: string,
  required: readonly string[],
  sourceName: string,
): { meta: Record<string, string>; body: string } {
  const needed = required.join("·")
  const normalized = markdown.replace(/\r\n/g, "\n")
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized)
  if (!match) throw new Error(`${sourceName} 맨 위에 --- 로 감싼 ${needed}가 필요합니다.`)

  // YAML 전체 문법이 아닌, 한 줄의 key: value만 지원합니다.
  const entries = new Map<string, string>()
  for (const [index, line] of match[1].split("\n").entries()) {
    if (!line.trim()) continue
    const field = /^([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/.exec(line.trim())
    if (!field)
      throw new Error(`${sourceName} ${index + 2}행: 머리말은 key: value 형식이어야 합니다.`)
    const [, key, value] = field
    if (entries.has(key)) throw new Error(`${sourceName}의 머리말에 ${key}가 중복되었습니다.`)
    if (!value) throw new Error(`${sourceName}의 머리말 ${key} 값이 비어 있습니다.`)
    entries.set(key, value)
  }
  const meta = Object.fromEntries(entries)
  const missing = required.filter(field => !meta[field])
  if (missing.length > 0) {
    throw new Error(`${sourceName}의 머리말에 ${needed}가 모두 있어야 합니다.`)
  }
  return { meta, body: normalized.slice(match[0].length) }
}

/** Markdown 본문을 페이지에 실을 HTML로 바꿉니다. */
export function renderMarkdown(body: string): string {
  return (
    (
      marked.parse(
        // 편집자에게 남기는 주석은 페이지에 싣지 않습니다.
        body.replace(/<!--[\s\S]*?-->\n?/g, ""),
        { async: false, gfm: true },
      ) as string
    )
      // 좁은 화면에서 표가 본문 폭을 넘으면 표만 가로로 밀리게 합니다.
      .replace(/<table>/g, '<div class="table-wrap"><table>')
      .replace(/<\/table>/g, "</table></div>")
  )
}

/** 제목과 번호를 받아 목차를 만들어 [[목차]] 자리에 끼웁니다. */
export function insertToc(content: string, entries: { id: string; label: string }[]): string {
  const items = entries.map(({ id, label }) => `<li><a href="#${id}">${label}</a></li>`).join("")
  return content.replace(
    TOC_MARKER,
    `<nav class="toc" aria-label="목차"><h2 class="toc-title">목차</h2><ol>${items}</ol></nav>`,
  )
}

/** 겉모양 템플릿의 {{자리}}를 채웁니다. content는 본문이라 한 번만 바꿉니다. */
export function fillTemplate(
  template: string,
  values: { title: string; lead: string; content: string },
): string {
  return (
    template
      // 함수로 넘겨야 값 속의 `$&`, `$'` 같은 문자열이 치환 패턴으로 해석되지 않습니다.
      .replaceAll("{{title}}", () => values.title)
      .replaceAll("{{lead}}", () => values.lead)
      .replace("{{content}}", () => values.content)
  )
}

export interface LegalPageOptions {
  /** Vite 플러그인 이름. */
  name: string
  /** 배포 경로 base 기준으로 페이지가 놓일 자리. */
  pagePath: string
  /** 정본 Markdown. */
  source: URL
  /** 정본과 겉모양 템플릿으로 완성된 HTML을 만듭니다. */
  render: (markdown: string, template: string) => string
  /** 배포 전에 손봐야 할 것이 남았으면 경고 문구를 돌려줍니다. */
  warn?: (markdown: string) => string | undefined
  /** 페이지와 함께 내보낼 파일(배포 경로 base 기준). 개발 서버에서도 같은 경로로 응답합니다. */
  assets?: () => { fileName: string; source: string }[]
  /** 관련 경로가 아닌 요청에서 원문 수집을 실행하지 않습니다. */
  assetPrefix?: string
  /** watch 빌드를 포함해 빌드 시작 시 수집 스냅샷을 초기화합니다. */
  reset?: () => void
  /** 번들에 실린 모듈을 보고, 배포를 멈춰야 할 문제가 있으면 오류 문구를 돌려줍니다. */
  checkBundle?: (moduleIds: string[]) => string | undefined
}

/** 개발 서버 응답과 빌드 결과물을 함께 담당하는 Vite 플러그인을 만듭니다. */
export function legalPagePlugin({
  name,
  pagePath,
  source,
  render,
  warn,
  assets,
  assetPrefix,
  reset,
  checkBundle,
}: LegalPageOptions): Plugin {
  let base = "/"
  const renderFromDisk = () => render(readFileSync(source, "utf8"), readFileSync(TEMPLATE, "utf8"))

  return {
    name,
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request as { url?: string }).url?.split("?")[0]
        if (path === `${base}${pagePath}`) {
          response.setHeader("Content-Type", "text/html; charset=utf-8")
          response.end(renderFromDisk())
          return
        }
        if (!assetPrefix || !path?.startsWith(`${base}${assetPrefix}`)) return next()
        const asset = assets?.().find(({ fileName }) => path === `${base}${fileName}`)
        if (!asset) return next()
        response.setHeader("Content-Type", "text/plain; charset=utf-8")
        response.end(asset.source)
      })
    },
    buildStart() {
      reset?.()
      this.addWatchFile(fileURLToPath(source))
      this.addWatchFile(fileURLToPath(TEMPLATE))
    },
    // service worker가 precache 목록을 만들기 전에 결과물에 들어가야 합니다.
    generateBundle(_options, bundle) {
      const moduleIds = Object.values(bundle).flatMap(file =>
        file.type === "chunk" ? file.moduleIds : [],
      )
      const problem = checkBundle?.(moduleIds)
      if (problem) this.error(problem)

      const message = warn?.(readFileSync(source, "utf8"))
      if (message) this.warn(message)
      this.emitFile({ type: "asset", fileName: pagePath, source: renderFromDisk() })
      for (const asset of assets?.() ?? []) this.emitFile({ type: "asset", ...asset })
    },
  }
}
