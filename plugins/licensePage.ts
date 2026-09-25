import { fileURLToPath } from "node:url"
import type { Plugin } from "vite"
import { LICENSE_PAGE_PATH } from "../src/constants/legal.ts"
import { fillTemplate, legalPagePlugin, renderMarkdown, splitFrontMatter } from "./legalPage.ts"
import { createLicenseInventory } from "./licenseInventory.ts"
import { findUnlisted, type LicenseGroup } from "./thirdPartyLicenses.ts"

/*
 * 오픈소스 라이선스 고지 페이지.
 *
 * 정본은 docs/licenses.md 하나이고, 공통 절차는 legalPage.ts에 있습니다. 표는 손으로
 * 적지 않고 빌드할 때 실제 설치된 패키지에서 만듭니다(thirdPartyLicenses.ts). 의존성을
 * 올리거나 더해도 목록과 원문이 저절로 따라갑니다.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const SOURCE = new URL("../docs/licenses.md", import.meta.url)
const SOURCE_NAME = "docs/licenses.md"
const REQUIRED = ["title", "updated"] as const

/** 본문에서 표가 들어갈 자리. */
const TABLE_MARKER = "[[라이선스 표]]"

/** 표 안에서 `|`가 칸 구분으로 읽히지 않게 합니다. */
const cell = (text: string) => text.replace(/\|/g, "\\|")

/** 묶음마다 한 줄. 이름을 누르면 원문 txt가 열립니다. 페이지가 `legal/` 아래라 한 단계 올라갑니다. */
export function licenseTable(groups: LicenseGroup[]): string {
  const rows = groups.map(group => {
    const names = group.packages.map(name => `[\`${name}\`](../${group.path})`).join(", ")
    return `| ${names} | ${cell(group.license)} | ${cell(group.holder)} |`
  })
  return ["| 소프트웨어 | 라이선스 | 저작권자 |", "| --- | --- | --- |", ...rows].join("\n")
}

/** Markdown 본문과 겉모양 템플릿, 고지할 묶음으로 완성된 HTML을 만듭니다. */
export function renderLicensePage(
  markdown: string,
  template: string,
  groups: LicenseGroup[],
): string {
  const { meta, body } = splitFrontMatter(markdown, REQUIRED, SOURCE_NAME)
  // 편집자 주석도 표 자리를 언급하므로, 주석을 걷어낸 본문에서 찾습니다.
  const visible = body.replace(/<!--[\s\S]*?-->\n?/g, "")
  if (!visible.includes(TABLE_MARKER)) {
    throw new Error(`${SOURCE_NAME}에 표가 들어갈 ${TABLE_MARKER} 자리가 없습니다.`)
  }

  return fillTemplate(template, {
    title: meta.title,
    lead: `${meta.updated} 기준`,
    content: renderMarkdown(visible.replace(TABLE_MARKER, () => licenseTable(groups))),
  })
}

export function licensePage(): Plugin {
  const inventory = createLicenseInventory(ROOT)

  return legalPagePlugin({
    name: "license-page",
    pagePath: LICENSE_PAGE_PATH,
    source: SOURCE,
    render: (markdown, template) => renderLicensePage(markdown, template, inventory.get().groups),
    reset: inventory.reset,
    assetPrefix: "licenses/",
    // 저장소에 이미 있는 원문(글꼴)은 public/에서 그대로 복사되므로 만들지 않습니다.
    assets: () => inventory.get().assets,
    checkBundle: moduleIds => {
      const listed = inventory.get().names
      const unlisted = findUnlisted(moduleIds, listed)
      if (unlisted.length === 0) return undefined
      return (
        `번들에 실렸지만 오픈소스 라이선스 고지에 없는 패키지가 있습니다: ${unlisted.join(", ")}. ` +
        "plugins/thirdPartyLicenses.ts가 이 패키지를 찾도록 고쳐 주세요."
      )
    },
  })
}
