import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLicenseInventory } from "./licenseInventory"

describe("라이선스 수집 스냅샷", () => {
  const directories: string[] = []
  afterEach(() => {
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it("결과를 공유하고 잠금 파일·원문 변경 및 빌드 초기화 시 다시 수집한다", () => {
    const root = mkdtempSync(join(tmpdir(), "license-inventory-"))
    directories.push(root)
    const lock = join(root, "pnpm-lock.yaml")
    const license = join(root, "LICENSE")
    writeFileSync(lock, "v1")
    writeFileSync(license, "Copyright (c) Alice")
    const collect = vi.fn((_root: string, track: (path: string) => void = () => {}) => {
      track(lock)
      track(license)
      return [
        {
          name: "sample",
          version: "1",
          license: "MIT",
          licenseText: readFileSync(license, "utf8"),
        },
      ]
    })
    const inventory = createLicenseInventory(root, collect)
    const first = inventory.get()
    expect(inventory.get()).toBe(first)
    expect(collect).toHaveBeenCalledTimes(1)
    writeFileSync(lock, "v2-longer")
    expect(inventory.get()).not.toBe(first)
    expect(collect).toHaveBeenCalledTimes(2)
    writeFileSync(license, "Copyright (c) Bob Changed")
    const changed = inventory.get()
    expect(changed.groups[0].path).not.toBe(first.groups[0].path)
    expect(changed.assets[0].source).toBe("Copyright (c) Bob Changed")
    expect(collect).toHaveBeenCalledTimes(3)
    inventory.reset()
    inventory.get()
    expect(collect).toHaveBeenCalledTimes(4)
  })
})
