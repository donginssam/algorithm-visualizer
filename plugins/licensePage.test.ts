import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { FONT_LICENSE_PATH } from "../src/constants/legal.ts"
import { licenseTable, renderLicensePage } from "./licensePage"
import {
  collectThirdPartyPackages,
  copyrightHolder,
  findUnlisted,
  groupByLicenseText,
} from "./thirdPartyLicenses"

const ROOT = fileURLToPath(new URL("..", import.meta.url))
const markdown = readFileSync(new URL("../docs/licenses.md", import.meta.url), "utf8")
const template = readFileSync(new URL("legal-template.html", import.meta.url), "utf8")
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { dependencies: Record<string, string> }

const packages = collectThirdPartyPackages(ROOT)
const groups = groupByLicenseText(packages)
const html = renderLicensePage(markdown, template, groups)
const names = new Set(packages.map(pkg => pkg.name))

/** 고지 표의 첫 열에 적힌 패키지 이름. */
function listedPackages(): string[] {
  const table = /<div class="table-wrap">[\s\S]*?<\/table>/.exec(html)?.[0] ?? ""
  const rows = [...table.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>/g)]
  return rows.flatMap(([, cell]) => [...cell.matchAll(/<code>(.*?)<\/code>/g)].map(m => m[1]))
}

describe("함께 배포하는 패키지 목록", () => {
  it("직접 쓰는 의존성을 모두 담는다", () => {
    for (const name of Object.keys(packageJson.dependencies))
      expect(names.has(name), name).toBe(true)
  })

  it("하위 의존성까지 따라간다", () => {
    // 모두 실제 번들에 실리는 것입니다. graphlib는 dagre의 배포 파일 안에 통째로 들어 있어
    // 소스맵에는 드러나지 않습니다.
    for (const name of ["@xyflow/system", "d3-zoom", "d3-ease", "scheduler", "@dagrejs/graphlib"]) {
      expect(names.has(name), name).toBe(true)
    }
  })

  it("같은 패키지의 여러 버전과 그 하위 의존성을 모두 담는다", () => {
    // @xyflow/react는 zustand v4를, 앱은 v5를 씁니다. v4만 쓰는 의존성도 빠지면 안 됩니다.
    expect(packages.filter(pkg => pkg.name === "zustand").length).toBeGreaterThan(1)
    expect(names.has("use-sync-external-store")).toBe(true)
  })

  it("service worker에 들어가는 workbox 런타임을 담는다", () => {
    for (const name of [
      "workbox-core",
      "workbox-precaching",
      "workbox-routing",
      "workbox-strategies",
    ]) {
      expect(names.has(name), name).toBe(true)
    }
  })

  it("타입 선언과 빌드 도구는 담지 않는다", () => {
    for (const name of names) expect(name.startsWith("@types/"), name).toBe(false)
    for (const name of ["vite", "vitest", "vite-plugin-pwa", "workbox-build", "marked"]) {
      expect(names.has(name), name).toBe(false)
    }
  })

  it("패키지마다 라이선스 원문을 읽는다", () => {
    for (const pkg of packages) expect(pkg.licenseText.trim().length, pkg.name).toBeGreaterThan(0)
  })
})

describe("번들 확인", () => {
  it("목록에 없는 패키지를 찾아낸다", () => {
    const ids = [
      "/repo/node_modules/.pnpm/d3-zoom@3.0.0/node_modules/d3-zoom/src/zoom.js",
      "/repo/node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/index.js",
      "/repo/node_modules/@scope/pkg/dist/index.js",
      "/repo/src/App.tsx",
      "\0vite/preload-helper",
    ]
    expect(findUnlisted(ids, ["d3-zoom"])).toEqual(["@scope/pkg", "left-pad"])
  })
})

describe("저작권자", () => {
  it("연도·(c)·by·이메일·주소를 빼고 저작권자만 남긴다", () => {
    expect(copyrightHolder("Copyright (c) 2019-2025 webkid GmbH")).toBe("webkid GmbH")
    expect(copyrightHolder("Copyright (C) 2018-2021 by Marijn Haverbeke <m@h.be> and others")).toBe(
      "Marijn Haverbeke and others",
    )
    expect(copyrightHolder("Copyright © Jorge Bucaran <<https://jorgebucaran.com>>")).toBe(
      "Jorge Bucaran",
    )
    expect(copyrightHolder("Copyright (c) 2021, Kil Hyung-jin (https://example.com),")).toBe(
      "Kil Hyung-jin",
    )
  })

  it("본문의 'Copyright Holder' 같은 말은 저작권 표시로 읽지 않는다", () => {
    expect(copyrightHolder("Copyright 2018 Google LLC\nthe Copyright Holder(s) may not")).toBe(
      "Google LLC",
    )
  })
})

describe("오픈소스 라이선스 고지 페이지", () => {
  it("같은 이름의 여러 버전도 원문이 다르면 서로 다른 파일로 내보낸다", () => {
    const input = [
      {
        name: "sample",
        version: "1",
        license: "MIT",
        licenseText: "Copyright (c) 2020 Alice\nMIT",
      },
      { name: "sample", version: "2", license: "MIT", licenseText: "Copyright (c) 2026 Bob\nMIT" },
    ]
    const result = groupByLicenseText(input)
    expect(new Set(result.map(group => group.path)).size).toBe(2)
    expect(result.map(group => group.licenseText)).toEqual(input.map(pkg => pkg.licenseText))
    expect(
      groupByLicenseText([...input].reverse())
        .map(group => group.path)
        .sort(),
    ).toEqual(result.map(group => group.path).sort())
  })

  it("이름 변환이 충돌해도 원문으로 구분하고 동일 원문은 공유한다", () => {
    const input = [
      { name: "@scope/pkg", version: "1", license: "MIT", licenseText: "Alice" },
      { name: "scope-pkg", version: "1", license: "MIT", licenseText: "Bob" },
      { name: "shared", version: "1", license: "MIT", licenseText: "Alice" },
    ]
    const result = groupByLicenseText(input)
    expect(result).toHaveLength(2)
    expect(result[0].packages).toEqual(["@scope/pkg", "shared"])
    expect(result[0].path).not.toBe(result[1].path)
  })

  it("목록의 패키지를 빠짐없이 표에 싣는다", () => {
    expect(listedPackages().sort()).toEqual([...names].sort())
  })

  it("묶음마다 원문 링크와 저작권자가 있다", () => {
    const table = /<div class="table-wrap">[\s\S]*?<\/table>/.exec(html)?.[0] ?? ""
    const rows = [...table.matchAll(/<tr>\s*<td>[\s\S]*?<\/tr>/g)]
    expect(rows.length).toBe(groups.length)
    for (const [row] of rows) {
      expect(row, row).toMatch(/href="\.\.\/licenses\/[\w.-]+\.txt"/)
      // 마지막 칸이 저작권자입니다. 연도와 `Copyright (c)`는 원문 txt에만 둡니다.
      const holder = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].at(-1)?.[1].trim() ?? ""
      expect(holder, row).not.toBe("")
      expect(holder, row).not.toMatch(/copyright|\(c\)|©|\d{4}/i)
    }
  })

  it("MIT가 아닌 라이선스도 싣는다", () => {
    for (const license of ["ISC", "BSD-3-Clause", "OFL-1.1"]) expect(html).toContain(license)
  })

  it("원문 파일 경로가 겹치지 않는다", () => {
    const paths = groups.map(group => group.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("글꼴 원문은 저장소에 있는 파일로 링크한다", () => {
    const font = groups.find(group => group.packages.includes("pretendard"))
    expect(font?.path).toBe(FONT_LICENSE_PATH)
    expect(font?.bundled).toBe(true)
    expect(existsSync(new URL(`../public/${FONT_LICENSE_PATH}`, import.meta.url))).toBe(true)
  })

  it("표 칸에 `|`가 있어도 칸이 밀리지 않는다", () => {
    const table = licenseTable([
      {
        packages: ["a"],
        license: "MIT",
        holder: "A | B",
        path: "licenses/a.txt",
        licenseText: "",
        bundled: false,
      },
    ])
    expect(table).toContain("A \\| B")
  })

  it("템플릿 자리표시자를 남기지 않는다", () => {
    expect(html).toContain("<h1>오픈소스 라이선스</h1>")
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).not.toContain("[[")
  })

  it("편집자용 주석과 Markdown 문법이 페이지에 새지 않는다", () => {
    expect(html).not.toContain("정본입니다. 빌드할 때")
    expect(html).not.toMatch(/^\|/m)
  })

  it("머리말이나 표 자리가 없으면 알아보기 쉬운 오류를 낸다", () => {
    expect(() => renderLicensePage("# 제목만", template, groups)).toThrow(/title·updated/)
    expect(() =>
      renderLicensePage("---\ntitle: t\nupdated: u\n---\n본문", template, groups),
    ).toThrow(/라이선스 표/)
  })
})
