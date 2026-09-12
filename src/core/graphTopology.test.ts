import { describe, expect, it } from "vitest"
import { isLoopBackConnection } from "./graphTopology"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, FlowGraph } from "./flowTypes"

/**
 * 학생이 캔버스에서 반복을 만들어 가는 도중의 그래프.
 *
 * 기호를 놓는 순서는 정해져 있지 않으므로, 화살표를 어떤 차례로 이어도 들어오는
 * 선과 복귀선을 옳게 가려야 합니다.
 */
function node(id: string, kind: AlgorithmFlowNode["data"]["kind"], loop = false) {
  return {
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: { kind, label: id, ...(loop ? { controlKind: "loop" as const } : {}) },
  } satisfies AlgorithmFlowNode
}

function edge(id: string, source: string, target: string, sourceHandle = "next") {
  return { id, source, target, sourceHandle } satisfies AlgorithmFlowEdge
}

const nodes = [
  node("start", "terminal"),
  node("before", "process"),
  node("판단", "decision", true),
  node("본문", "process"),
]
const graphOf = (edges: AlgorithmFlowEdge[]): FlowGraph => ({ nodes, edges })

describe("복귀선 판정", () => {
  it("본문에서 판단으로 돌아오는 화살표는 복귀선이다", () => {
    const graph = graphOf([edge("entry", "before", "판단"), edge("yes", "판단", "본문", "yes")])
    expect(isLoopBackConnection(graph, "본문", "판단")).toBe(true)
  })

  it("바깥에서 판단으로 들어오는 첫 화살표는 복귀선이 아니다", () => {
    expect(isLoopBackConnection(graphOf([]), "before", "판단")).toBe(false)
  })

  /*
   * 예전에는 "판단에 이미 들어오는 화살표가 있으면 복귀선"으로만 보아서, 복귀선을
   * 먼저 그리면 들어오는 선과 복귀선이 통째로 뒤바뀌었습니다.
   */
  it("복귀선을 먼저 그려도 뒤에 잇는 바깥 화살표를 복귀선으로 보지 않는다", () => {
    const withBody = graphOf([edge("yes", "판단", "본문", "yes")])
    expect(isLoopBackConnection(withBody, "본문", "판단")).toBe(true)

    const withLoopBack = graphOf([edge("yes", "판단", "본문", "yes"), edge("back", "본문", "판단")])
    expect(isLoopBackConnection(withLoopBack, "before", "판단")).toBe(false)
  })

  it("본문이 아직 판단과 이어지지 않았으면 이미 들어온 화살표를 보고 가린다", () => {
    const onlyEntry = graphOf([edge("entry", "before", "판단")])
    expect(isLoopBackConnection(onlyEntry, "본문", "판단")).toBe(true)
  })

  it("반복이 아닌 판단으로 들어오는 화살표는 복귀선이 아니다", () => {
    const ifGraph: FlowGraph = {
      nodes: [node("판단", "decision"), node("본문", "process")],
      edges: [edge("yes", "판단", "본문", "yes")],
    }
    expect(isLoopBackConnection(ifGraph, "본문", "판단")).toBe(false)
  })
})
