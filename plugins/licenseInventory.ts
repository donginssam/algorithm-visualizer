import { statSync } from "node:fs"
import { collectThirdPartyPackages, groupByLicenseText } from "./thirdPartyLicenses.ts"

function fingerprint(path: string): string {
  try {
    const stat = statSync(path, { bigint: true })
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing"
    throw error
  }
}

/** 표·원문·번들 검증이 한 수집 결과를 공유합니다. 관련 요청에서만 파일 변경을 확인합니다. */
export function createLicenseInventory(root: string, collect = collectThirdPartyPackages) {
  let snapshot: ReturnType<typeof load> | undefined
  let inputs = new Map<string, string>()
  function load() {
    const paths = new Set<string>()
    const packages = collect(root, path => paths.add(path))
    const groups = groupByLicenseText(packages)
    inputs = new Map([...paths].map(path => [path, fingerprint(path)]))
    return {
      groups,
      names: packages.map(pkg => pkg.name),
      assets: groups
        .filter(group => !group.bundled)
        .map(group => ({ fileName: group.path, source: group.licenseText })),
    }
  }
  return {
    get() {
      if (!snapshot || [...inputs].some(([path, signature]) => fingerprint(path) !== signature)) {
        snapshot = load()
      }
      return snapshot
    },
    reset() {
      snapshot = undefined
    },
  }
}
