import { describe, expect, it } from "vitest"
import { edgeAppearance, loopBackRoute } from "./flowEdges"
import type { AlgorithmFlowNode } from "./flowTypes"
import { sourcePoint, targetPoint } from "./nodeGeometry"

describe("공통 복귀선", () => {
  const target: AlgorithmFlowNode = {
    id: "outer",
    type: "decision",
    position: { x: 200, y: 100 },
    data: { kind: "decision", label: "바깥", controlKind: "loop" },
  }
  const source: AlgorithmFlowNode = {
    id: "inner",
    type: "decision",
    position: { x: 300, y: 500 },
    measured: { width: 260, height: 140 },
    data: { kind: "decision", label: "안쪽", controlKind: "loop" },
  }

  it.each(["yes", "no"] as const)(
    "%s는 실제 꼭짓점에서 해당 방향의 바깥 통로로 돌아간다",
    handle => {
      const route = loopBackRoute([target, source], source.id, handle, target.id)!
      expect(route[0]).toEqual(sourcePoint(source, handle))
      expect(route.at(-1)).toEqual(targetPoint(target))
      if (handle === "no") expect(route[1].x).toBeGreaterThan(560)
      else expect(route[1].x).toBeLessThan(200)
      expect(edgeAppearance("loop-back", handle)).toMatchObject({
        type: "loop-back",
        className: "loop-back-edge",
        label: handle === "yes" ? "예" : "아니오",
      })
    },
  )

  it("일반 기호는 아래에서 나가고 통로 간격을 반영한다", () => {
    const process: AlgorithmFlowNode = {
      ...source,
      type: "process",
      data: { kind: "process", label: "처리" },
    }
    const route = loopBackRoute([target, process], process.id, "next", target.id, 26)!
    expect(route[0]).toEqual({ x: 430, y: 640 })
    expect(route[2].x).toBe(200 - 46 - 26)
    expect(route.at(-1)).toEqual(targetPoint(target))
  })

  /** 경로의 각 선분이 기호 상자를 지나는지. */
  const passesThrough = (
    route: Array<{ x: number; y: number }>,
    node: AlgorithmFlowNode,
    size: { width: number; height: number },
  ) => {
    const left = node.position.x
    const right = node.position.x + size.width
    const top = node.position.y
    const bottom = node.position.y + size.height
    return route.slice(1).some((point, index) => {
      const previous = route[index]
      const x0 = Math.min(previous.x, point.x)
      const x1 = Math.max(previous.x, point.x)
      const y0 = Math.min(previous.y, point.y)
      const y1 = Math.max(previous.y, point.y)
      return x1 > left && x0 < right && y1 > top && y0 < bottom
    })
  }

  it("같은 높이에 기호가 있으면 아니오 복귀선이 꼭짓점 옆에서 비켜 통로로 간다", () => {
    // 중첩 반복에서 안쪽 판단과 같은 줄에 놓인 '끝'. 꼭짓점 높이 그대로 가면 뒤를 지납니다.
    const end: AlgorithmFlowNode = {
      id: "end",
      type: "terminal",
      position: { x: 700, y: 540 },
      data: { kind: "terminal", label: "끝", terminalRole: "end" },
    }
    const route = loopBackRoute([target, source, end], source.id, "no", target.id)!

    expect(route[0]).toEqual(sourcePoint(source, "no"))
    expect(route.at(-1)).toEqual(targetPoint(target))
    expect(passesThrough(route, end, { width: 172, height: 64 })).toBe(false)
    // 꼭짓점 바로 옆에서 위로 비킨 뒤(목적지가 위이므로) 오른쪽 통로로 갑니다.
    expect(route[1]).toEqual({ x: 560 + 24, y: 570 })
    expect(route[2].x).toBe(560 + 24)
    expect(route[2].y).toBeLessThan(540)
    expect(route[3].x).toBeGreaterThan(700 + 172)
  })

  it("위아래로 비키는 거리가 같으면 목적지 쪽으로 비킨다", () => {
    // 꼭짓점 높이(570)를 정확히 가운데에 두는 기호: 위로 비켜도 아래로 비켜도 거리가 같습니다.
    const end: AlgorithmFlowNode = {
      id: "end",
      type: "terminal",
      position: { x: 700, y: 538 },
      data: { kind: "terminal", label: "끝", terminalRole: "end" },
    }
    const route = loopBackRoute([target, source, end], source.id, "no", target.id)!
    // 목적지(바깥 판단)가 위에 있으므로 위로 비킵니다.
    expect(route[2].y).toBe(538 - 20)
  })

  it("가로막는 기호가 없으면 꼭짓점 높이 그대로 통로로 간다", () => {
    const route = loopBackRoute([target, source], source.id, "no", target.id)!
    expect(route).toHaveLength(5)
    expect(route[1].y).toBe(sourcePoint(source, "no").y)
  })

  it("연결할 기호가 없으면 경로를 만들지 않는다", () => {
    expect(loopBackRoute([target], "missing", "no", target.id)).toBeUndefined()
    expect(loopBackRoute([source], source.id, "no", "missing")).toBeUndefined()
  })
})
