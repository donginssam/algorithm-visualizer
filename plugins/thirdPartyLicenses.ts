import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { FONT_LICENSE_PATH } from "../src/constants/legal.ts"

/*
 * 함께 배포하는 오픈소스 소프트웨어 목록.
 *
 * 번들에 실린 모듈만 세면 빠지는 것이 있습니다. @dagrejs/dagre처럼 하위 의존성을
 * 자기 배포 파일 안에 통째로 넣어 둔 패키지는 소스맵에 그 의존성이 드러나지
 * 않습니다. 그래서 package.json의 dependencies에서 시작해 하위 의존성을 모두 따라가고,
 * service worker에 들어가는 workbox 런타임도 같은 방식으로 더합니다. 빌드할 때는
 * 번들에 실린 모듈이 모두 이 목록에 있는지 따로 확인합니다(findUnlisted).
 */

/**
 * service worker에 들어가는 workbox 런타임의 시작점.
 *
 * vite.config.ts의 generateSW 설정(precache와 navigateFallback)이 이 두 모듈을
 * 가져옵니다. 설정을 바꿔 다른 workbox 모듈을 쓰게 되면 여기에 더합니다.
 */
const SERVICE_WORKER_ENTRIES = ["workbox-precaching", "workbox-routing"]

/** service worker를 만드는 도구. 런타임 모듈은 이 도구가 설치한 것을 씁니다. */
const SERVICE_WORKER_BUILDER = ["vite-plugin-pwa", "workbox-build"]

/**
 * 패키지 안에 라이선스 파일이 없어 저장소에 원문을 따로 둔 것.
 *
 * 값은 배포 경로이며 원본은 public/ 아래에 있습니다. 빌드가 그대로 복사하므로
 * 생성하지 않고 이 경로로 링크합니다.
 */
const BUNDLED_LICENSE_FILES: Record<string, string> = {
  pretendard: FONT_LICENSE_PATH,
}

export interface ThirdPartyPackage {
  name: string
  version: string
  license: string
  licenseText: string
}

export interface LicenseGroup {
  /** 같은 라이선스 원문을 쓰는 패키지들. */
  packages: string[]
  license: string
  /** 원문에서 읽은 저작권자. 연도와 `Copyright (c)`는 원문 파일에만 둡니다. */
  holder: string
  /** 원문의 배포 경로. */
  path: string
  licenseText: string
  /** 저장소에 이미 있는 원문이면 true. 빌드가 따로 만들지 않습니다. */
  bundled: boolean
}

interface PackageJson {
  name: string
  version: string
  license?: string | { type: string }
  dependencies?: Record<string, string>
  author?: string | { name?: string }
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as PackageJson

/** Node와 같은 방식으로 위쪽 node_modules를 거슬러 올라가며 패키지 폴더를 찾습니다. */
function findPackageDir(
  name: string,
  fromDir: string,
  track: (path: string) => void = () => {},
): string {
  let dir = realpathSync(fromDir)
  for (;;) {
    const candidate = join(dir, "node_modules", name)
    track(candidate)
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate)
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`${fromDir}에서 ${name} 패키지를 찾지 못했습니다.`)
    dir = parent
  }
}

function readLicenseText(
  name: string,
  dir: string,
  root: string,
  track: (path: string) => void,
): string {
  const bundled = BUNDLED_LICENSE_FILES[name]
  if (bundled) {
    const path = join(root, "public", bundled)
    track(path)
    return readFileSync(path, "utf8")
  }

  const file = readdirSync(dir).find(entry => /^(licen[cs]e|copying)(\.|$)/i.test(entry))
  if (!file) {
    throw new Error(
      `${name} 패키지에 라이선스 파일이 없습니다. 원문을 public/licenses/에 두고 ` +
        "plugins/thirdPartyLicenses.ts의 BUNDLED_LICENSE_FILES에 더해 주세요.",
    )
  }
  const path = join(dir, file)
  track(path)
  return readFileSync(path, "utf8")
}

/**
 * 배포물에 들어가는 패키지를 모두 모읍니다. `root`는 저장소 폴더입니다.
 *
 * 같은 패키지가 여러 버전으로 실릴 수 있어(@xyflow/react는 zustand v4를, 앱은 v5를
 * 씁니다) 이름이 아니라 설치 위치로 구분합니다. 그래야 각 버전의 하위 의존성까지
 * 따라갑니다.
 */
export function collectThirdPartyPackages(
  root: string,
  track: (path: string) => void = () => {},
): ThirdPartyPackage[] {
  track(join(root, "package.json"))
  track(join(root, "pnpm-lock.yaml"))
  const found = new Map<string, ThirdPartyPackage>()
  const queue: [string, string][] = Object.keys(
    readJson(join(root, "package.json")).dependencies ?? {},
  ).map(name => [name, root])

  let builder = root
  for (const name of SERVICE_WORKER_BUILDER) builder = findPackageDir(name, builder, track)
  for (const name of SERVICE_WORKER_ENTRIES) queue.push([name, builder])

  while (queue.length > 0) {
    const [name, fromDir] = queue.shift()!
    // 타입 선언만 담은 패키지는 배포물에 실리지 않습니다.
    if (name.startsWith("@types/")) continue

    const dir = findPackageDir(name, fromDir, track)
    if (found.has(dir)) continue
    track(join(dir, "package.json"))
    const pkg = readJson(join(dir, "package.json"))
    found.set(dir, {
      name,
      version: pkg.version,
      license: typeof pkg.license === "object" ? pkg.license.type : (pkg.license ?? "UNKNOWN"),
      licenseText: readLicenseText(name, dir, root, track),
    })
    for (const dependency of Object.keys(pkg.dependencies ?? {})) queue.push([dependency, dir])
  }

  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )
}

/**
 * 원문의 저작권 표시에서 저작권자만 남깁니다.
 *
 * `Copyright (c) 2019-2025 webkid GmbH` → `webkid GmbH`. 연도, `(c)`, `by`, 이메일,
 * 괄호 속 주소는 뺍니다. 원문 자체는 고치지 않고 txt로 그대로 배포합니다.
 */
export function copyrightHolder(licenseText: string): string {
  const holders = licenseText
    .split("\n")
    // 본문의 "Copyright Holder" 같은 말과 구분하려고, (c)·©·연도가 붙은 줄만 봅니다.
    .map(line => /^\s*Copyright\s*((?:\(c\)|©|\d{4}).*)$/i.exec(line)?.[1] ?? "")
    .map(rest =>
      rest
        .replace(/\((c|C)\)|©/g, "")
        .replace(/<+[^>]*>+/g, "")
        .replace(/\([^)]*\)/g, "")
        .replace(/\b\d{4}(\s*[-–,]\s*\d{4})*,?/g, "")
        .replace(/^\s*by\b/i, "")
        .replace(/\s+/g, " ")
        .replace(/^[\s,.]+|[\s,.]+$/g, ""),
    )
    .filter(holder => holder.length > 0)
  return [...new Set(holders)].join(", ")
}

/** 같은 원문을 쓰는 패키지를 한 줄로 묶습니다. 원문 파일도 하나만 둡니다. */
export function groupByLicenseText(packages: ThirdPartyPackage[]): LicenseGroup[] {
  const groups = new Map<string, ThirdPartyPackage[]>()
  for (const pkg of packages) {
    const key = pkg.licenseText
    groups.set(key, [...(groups.get(key) ?? []), pkg])
  }

  return [...groups.values()].map(members => {
    const first = members[0]
    const bundled = BUNDLED_LICENSE_FILES[first.name]
    return {
      packages: [...new Set(members.map(member => member.name))],
      license: [...new Set(members.map(member => member.license))].join(", "),
      holder: copyrightHolder(first.licenseText),
      path:
        bundled ?? `licenses/${createHash("sha256").update(first.licenseText).digest("hex")}.txt`,
      licenseText: first.licenseText,
      bundled: bundled !== undefined,
    }
  })
}

/**
 * 번들에 실렸는데 목록에 없는 패키지를 찾습니다.
 *
 * 빌드가 이 값을 확인해, 비어 있지 않으면 고지 없이 배포되지 않도록 멈춥니다.
 */
export function findUnlisted(moduleIds: Iterable<string>, listed: Iterable<string>): string[] {
  const names = new Set(listed)
  const unlisted = new Set<string>()
  for (const id of moduleIds) {
    const match = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replace(/\\/g, "/"))
    if (match && !names.has(match[1])) unlisted.add(match[1])
  }
  return [...unlisted].sort()
}
