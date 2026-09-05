import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToFlow, NODE_SIZES } from "./astToFlow"
import { EXPORT_MARGIN, flowToSvg } from "./flowToSvg"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./flowTypes"

describe("순서도 → PNG 저장용 SVG", () => {
  it.each(examples)("$title 예제의 기호와 화살표를 모두 담는다", ({ program }) => {
    const graph = astToFlow(program)
    const { markup, width, height } = flowToSvg(graph.nodes, graph.edges)

    expect(width).toBeGreaterThan(EXPORT_MARGIN * 2)
    expect(height).toBeGreaterThan(EXPORT_MARGIN * 2)

    // 합류점을 뺀 모든 기호의 글자가 이미지에 들어 있어야 합니다.
    for (const node of graph.nodes) {
      if (node.data.kind === "junction") continue
      expect(markup).toContain(node.data.label.replace(/"/g, "&quot;"))
    }

    // 화살표는 하나도 빠지면 안 됩니다.
    const drawnEdges = markup.match(/marker-end="url\(#arrow-/g) ?? []
    expect(drawnEdges).toHaveLength(graph.edges.length)
  })

  it("반복 화살표가 지나는 왼쪽 바깥 통로까지 이미지에 넣는다", () => {
    const graph = astToFlow(examples[0].program)
    const nodeLeft = Math.min(...graph.nodes.map(node => node.position.x))
    const laneLeft = Math.min(
      ...graph.edges.flatMap(edge => (edge.data?.routePoints ?? []).map(point => point.x)),
    )
    expect(laneLeft).toBeLessThan(nodeLeft)

    const { width } = flowToSvg(graph.nodes, graph.edges)
    const nodeRight = Math.max(
      ...graph.nodes.map(node => node.position.x + NODE_SIZES[node.data.kind].width),
    )
    expect(width).toBeGreaterThanOrEqual(Math.ceil(nodeRight - laneLeft) + EXPORT_MARGIN * 2)
  })

  it("반복 화살표는 다른 색으로 그린다", () => {
    const graph = astToFlow(examples[0].program)
    const { markup } = flowToSvg(graph.nodes, graph.edges)
    expect(markup).toContain("#7c5cf0")
    expect(markup).toContain("예")
    expect(markup).toContain("아니오")
  })

  it("PNG도 기본적으로 예는 왼쪽, 아니오는 오른쪽에서 그린다", () => {
    const nodes: AlgorithmFlowNode[] = [
      {
        id: "decision",
        type: "decision",
        position: { x: 0, y: 0 },
        data: { kind: "decision", label: "조건", controlKind: "if" },
      },
      {
        id: "yes",
        type: "process",
        position: { x: -80, y: 240 },
        data: { kind: "process", label: "예 처리" },
      },
      {
        id: "no",
        type: "process",
        position: { x: 300, y: 240 },
        data: { kind: "process", label: "아니오 처리" },
      },
    ]
    const edges: AlgorithmFlowEdge[] = [
      {
        id: "yes-edge",
        source: "decision",
        target: "yes",
        sourceHandle: "yes",
        data: { branch: "yes" },
      },
      {
        id: "no-edge",
        source: "decision",
        target: "no",
        sourceHandle: "no",
        data: { branch: "no" },
      },
    ]

    const { markup } = flowToSvg(nodes, edges)
    expect(markup).toContain('d="M 0 62')
    expect(markup).toContain('d="M 220 62')
  })

  it("기호 글자의 XML 특수문자를 안전하게 바꾼다", () => {
    const nodes: AlgorithmFlowNode[] = [
      {
        id: "a",
        type: "process",
        position: { x: 0, y: 0 },
        data: { kind: "process", label: "값 <- 3 & 5" },
      },
    ]
    const { markup } = flowToSvg(nodes, [])
    expect(markup).toContain("값 &lt;- 3 &amp; 5")
    expect(markup).not.toContain("값 <- 3 & 5")
  })

  // 처음 화면에서도 바로 저장할 수 있어야 합니다. '끝'은 아직 놓이지 않습니다.
  it("시작 기호만 있는 처음 화면도 저장할 수 있다", () => {
    const graph = astToFlow({ body: [] })
    const { markup } = flowToSvg(graph.nodes, graph.edges)

    expect(markup).toContain("시작")
    expect(markup).not.toContain("끝")
    expect(markup.match(/marker-end="url\(#arrow-/g) ?? []).toHaveLength(0)
  })

  it("기호가 하나도 없으면 안내 메시지를 던진다", () => {
    expect(() => flowToSvg([], [] as AlgorithmFlowEdge[])).toThrow("저장할 기호가 없어요")
  })
})
