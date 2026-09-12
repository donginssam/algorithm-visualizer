import { describe, expect, it } from "vitest"
import { edgeAppearance, loopBackRoute, routeEdges, routeLoopBacks } from "./flowEdges"
import { astToFlow } from "./astToFlow"
import type { AlgorithmFlowNode } from "./flowTypes"
import { NODE_SIZES, sourcePoint, targetPoint } from "./nodeGeometry"

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

  describe("routeLoopBacks: 그래프가 바뀔 때마다 다시 계산", () => {
    const nested = () =>
      astToFlow({
        body: [
          {
            type: "loop",
            condition: "바깥",
            body: [
              { type: "action", text: "준비" },
              { type: "loop", condition: "안쪽", body: [{ type: "action", text: "처리" }] },
            ],
          },
          { type: "output", expr: "결과" },
        ],
      })

    it("짧은 반복이 안쪽 통로, 바깥 반복이 26px 바깥 통로를 쓴다", () => {
      const graph = nested()
      const lanes = graph.edges
        .filter(edge => edge.data?.branch === "loop-back" && edge.sourceHandle !== "no")
        .map(edge => edge.data?.routePoints?.[2]?.x ?? 0)
        .sort((a, b) => b - a)
      expect(lanes).toHaveLength(1)
      const graphLeft = Math.min(...graph.nodes.map(node => node.position.x))
      expect(lanes[0]).toBe(graphLeft - 46)
      // 안쪽 반복의 아니오는 바깥 판단으로 돌아가는 오른쪽 통로 복귀선이며 한 칸 바깥입니다.
      const right = graph.edges.find(
        edge => edge.data?.branch === "loop-back" && edge.sourceHandle === "no",
      )
      const graphRight = Math.max(
        ...graph.nodes.map(node => node.position.x + NODE_SIZES[node.data.kind].width),
      )
      expect(right?.data?.routePoints?.some(point => point.x >= graphRight + 46)).toBe(true)
    })

    it("경로가 그대로면 같은 엣지 객체를 돌려준다", () => {
      const graph = nested()
      const again = routeLoopBacks(graph.nodes, graph.edges)
      again.forEach((edge, index) => expect(edge).toBe(graph.edges[index]))
    })

    it("기호를 옮기면 옮긴 기호 뒤로 지나가지 않도록 복귀선을 다시 계산한다", () => {
      const graph = nested()
      const back = graph.edges.find(
        edge => edge.data?.branch === "loop-back" && edge.sourceHandle !== "no",
      )
      const lane = back?.data?.routePoints?.[2]
      const output = graph.nodes.find(node => node.data.kind === "output")
      if (!back || !lane || !output) throw new Error("복귀선과 출력 기호가 있어야 합니다")

      // 출력 기호를 왼쪽 통로 위로 끌어다 놓습니다. 낡은 경로는 이 기호를 지납니다.
      const moved = graph.nodes.map(node =>
        node.id === output.id
          ? {
              ...node,
              position: { x: lane.x - 95, y: (lane.y + back.data!.routePoints![3].y) / 2 },
            }
          : node,
      )
      const rerouted = routeLoopBacks(moved, graph.edges)
      const next = rerouted.find(edge => edge.id === back.id)
      const route = next?.data?.routePoints ?? []
      expect(route).not.toEqual(back.data?.routePoints)

      const movedOutput = moved.find(node => node.id === output.id)!
      const left = movedOutput.position.x
      const right = left + 190
      const top = movedOutput.position.y
      const bottom = top + 76
      const passes = route.slice(1).some((point, index) => {
        const previous = route[index]
        return (
          Math.max(previous.x, point.x) > left &&
          Math.min(previous.x, point.x) < right &&
          Math.max(previous.y, point.y) > top &&
          Math.min(previous.y, point.y) < bottom
        )
      })
      expect(passes).toBe(false)
    })

    it("화면에서 측정한 크기가 있으면 그 크기로 비켜 간다", () => {
      const graph = nested()
      const back = graph.edges.find(
        edge => edge.data?.branch === "loop-back" && edge.sourceHandle !== "no",
      )
      const body = graph.nodes.find(node => node.data.label === "처리")
      if (!back || !body) throw new Error("복귀선과 본문 기호가 있어야 합니다")

      // 긴 글로 본문 기호가 두 배 높아진 경우. 복귀선은 더 낮은 곳에서 나가야 합니다.
      const taller = graph.nodes.map(node =>
        node.id === body.id ? { ...node, measured: { width: 190, height: 144 } } : node,
      )
      const next = routeLoopBacks(taller, graph.edges).find(edge => edge.id === back.id)
      expect(next?.data?.routePoints?.[0]?.y).toBe(body.position.y + 144)
    })
  })

  describe("routeEdges: 일반 화살표도 함께 다시 계산", () => {
    const simple = () =>
      astToFlow({
        body: [
          { type: "assign", target: "합", expr: "0" },
          {
            type: "if",
            condition: "짝수이면",
            thenBody: [{ type: "action", text: "센다." }],
            elseBody: [],
          },
          { type: "output", expr: "합" },
        ],
      })

    it("경로가 그대로면 같은 엣지 객체를 돌려준다", () => {
      const graph = simple()
      routeEdges(graph.nodes, graph.edges).forEach((edge, index) =>
        expect(edge).toBe(graph.edges[index]),
      )
    })

    it("기호를 옮기면 아래쪽에서 나가는 화살표가 새 위치 사이 중간에서 꺾인다", () => {
      const graph = simple()
      const output = graph.nodes.find(node => node.data.kind === "output")
      const into = graph.edges.find(edge => edge.target === output?.id)
      if (!output || !into) throw new Error("출력 기호와 들어오는 화살표가 있어야 합니다")

      const moved = graph.nodes.map(node =>
        node.id === output.id ? { ...node, position: { x: 900, y: 1200 } } : node,
      )
      const next = routeEdges(moved, graph.edges).find(edge => edge.id === into.id)
      const route = next?.data?.routePoints ?? []
      expect(route).toHaveLength(4)
      // 목적지 위쪽 가운데로 들어가고, 꺾는 높이는 출발과 도착 사이입니다(길목의
      // 기호를 피하느라 정확한 중간에서 조금 비켜날 수 있습니다).
      expect(route[3]).toEqual({ x: 900 + 95, y: 1200 })
      expect(route[1].y).toBe(route[2].y)
      expect(route[1].y).toBeGreaterThan(route[0].y)
      expect(route[1].y).toBeLessThan(1200)
      // 낡은 경로가 아니라 새 좌표 기준입니다.
      expect(route).not.toEqual(into.data?.routePoints)
    })

    it("판단 기호를 옮겨도 예/아니오는 마름모의 좌우 꼭짓점에서 나간다", () => {
      const graph = simple()
      const decision = graph.nodes.find(node => node.data.kind === "decision")
      if (!decision) throw new Error("판단 기호가 있어야 합니다")

      const moved = graph.nodes.map(node =>
        node.id === decision.id ? { ...node, position: { x: 700, y: 300 } } : node,
      )
      const edges = routeEdges(moved, graph.edges)
      const yes = edges.find(edge => edge.source === decision.id && edge.sourceHandle === "yes")
      const no = edges.find(edge => edge.source === decision.id && edge.sourceHandle === "no")
      expect(yes?.data?.routePoints?.[0]).toEqual({ x: 700, y: 300 + 62 })
      expect(no?.data?.routePoints?.[0]).toEqual({ x: 700 + 220, y: 300 + 62 })
      // 빈 아니오 갈래는 합류점으로 바로 가므로 순서도 오른쪽 바깥 통로로 돕니다.
      const right = Math.max(
        ...moved.map(node => node.position.x + NODE_SIZES[node.data.kind].width),
      )
      expect(no?.data?.routePoints?.[1]?.x).toBe(right + 34)
    })

    it("다음 기호를 위에 두면 두 기호 옆으로 돌아가 관통하지 않는다", () => {
      const graph = simple()
      const output = graph.nodes.find(node => node.data.kind === "output")
      const end = graph.nodes.find(node => node.data.terminalRole === "end")
      const into = graph.edges.find(edge => edge.source === output?.id && edge.target === end?.id)
      if (!output || !end || !into) throw new Error("출력 → 끝 화살표가 있어야 합니다")

      // 끝을 출력보다 위, 살짝 오른쪽에 둡니다.
      const moved = graph.nodes.map(node =>
        node.id === end.id
          ? { ...node, position: { x: output.position.x + 60, y: output.position.y - 150 } }
          : node,
      )
      const route =
        routeEdges(moved, graph.edges).find(edge => edge.id === into.id)?.data?.routePoints ?? []
      expect(route).toHaveLength(6)
      const rects = [output, moved.find(node => node.id === end.id)!].map(node => ({
        left: node.position.x,
        right: node.position.x + NODE_SIZES[node.data.kind].width,
        top: node.position.y,
        bottom: node.position.y + NODE_SIZES[node.data.kind].height,
      }))
      // 첫 선분(출발 기호 아래로 34px)과 마지막 선분(도착 기호 위 34px)을 뺀 가운데 경로는
      // 두 기호 상자 안을 지나지 않습니다.
      for (let index = 1; index + 2 < route.length; index++) {
        const a = route[index]
        const b = route[index + 1]
        for (const rect of rects) {
          const inside =
            Math.max(a.x, b.x) > rect.left &&
            Math.min(a.x, b.x) < rect.right &&
            Math.max(a.y, b.y) > rect.top &&
            Math.min(a.y, b.y) < rect.bottom
          expect(inside).toBe(false)
        }
      }
    })

    it("아니오 꼭짓점 아래에 기호를 두면 아니오 화살표가 그 기호 옆 열로 비켜 내려간다", () => {
      const graph = simple()
      const decision = graph.nodes.find(node => node.data.kind === "decision")
      const end = graph.nodes.find(node => node.data.terminalRole === "end")
      const no = graph.edges.find(
        edge => edge.source === decision?.id && edge.sourceHandle === "no",
      )
      if (!decision || !end || !no) throw new Error("판단·끝 기호와 아니오 화살표가 있어야 합니다")

      // 아니오 갈래가 합류점이 아닌 먼 기호로 가도록 합류점을 치우고 끝 기호를 이어 봅니다.
      // (학생이 끝을 아니오 꼭짓점 바로 아래에 둔 상황)
      const vertexX = decision.position.x + NODE_SIZES.decision.width
      const nodes = graph.nodes.map(node =>
        node.id === end.id
          ? { ...node, position: { x: vertexX - 40, y: decision.position.y + 200 } }
          : node,
      )
      const far = { ...no, target: "far" }
      const farNode = {
        id: "far",
        type: "process",
        position: { x: decision.position.x - 400, y: decision.position.y + 600 },
        data: { kind: "process" as const, label: "멀리" },
      }
      const route =
        routeEdges([...nodes, farNode], [far]).find(edge => edge.id === no.id)?.data?.routePoints ??
        []
      expect(route).toHaveLength(5)
      const endRect = {
        left: vertexX - 40,
        right: vertexX - 40 + NODE_SIZES.terminal.width,
        top: decision.position.y + 200,
        bottom: decision.position.y + 200 + NODE_SIZES.terminal.height,
      }
      // 세로 선(1→2)이 끝 기호를 지나지 않고 그 오른쪽으로 비킵니다.
      expect(route[1].x).toBeGreaterThanOrEqual(endRect.right + 20)
      expect(route[1].x).toBe(route[2].x)
    })

    it("화면에서 측정한 크기가 있으면 그 크기의 아래쪽에서 나간다", () => {
      const graph = simple()
      const first = graph.nodes.find(node => node.data.kind === "process")
      const out = graph.edges.find(edge => edge.source === first?.id)
      if (!first || !out) throw new Error("처리 기호와 나가는 화살표가 있어야 합니다")

      const taller = graph.nodes.map(node =>
        node.id === first.id ? { ...node, measured: { width: 190, height: 130 } } : node,
      )
      const next = routeEdges(taller, graph.edges).find(edge => edge.id === out.id)
      expect(next?.data?.routePoints?.[0]?.y).toBe(first.position.y + 130)
    })
  })

  it("연결할 기호가 없으면 경로를 만들지 않는다", () => {
    expect(loopBackRoute([target], "missing", "no", target.id)).toBeUndefined()
    expect(loopBackRoute([source], source.id, "no", "missing")).toBeUndefined()
  })
})
