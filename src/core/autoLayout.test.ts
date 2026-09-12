import { describe, expect, it } from "vitest"
import type { Program } from "./ast"
import { astToFlow } from "./astToFlow"
import { autoLayoutGraph, deriveBranchGroups } from "./autoLayout"
import { NODE_SIZES } from "./nodeGeometry"
import type { AlgorithmFlowNode, FlowGraph } from "./flowTypes"

const positionsOf = (graph: FlowGraph) =>
  Object.fromEntries(graph.nodes.map(node => [node.id, node.position]))

const centerX = (graph: FlowGraph, id: string) => {
  const node = graph.nodes.find(candidate => candidate.id === id)!
  return node.position.x + NODE_SIZES[node.data.kind].width / 2
}

/** 기호를 아무 데나 흩어 놓습니다. 자동 배치가 되돌려 놓아야 합니다. */
const scatter = (graph: FlowGraph): FlowGraph => ({
  ...graph,
  nodes: graph.nodes.map((node, index) => ({
    ...node,
    position: { x: (index % 3) * 500 - 400, y: index * 17 },
  })),
})

const programs: Array<[string, Program]> = [
  ["빈 프로그램", { body: [] }],
  [
    "곧은 흐름",
    {
      body: [
        { type: "input", variable: "수" },
        { type: "output", expr: "수" },
      ],
    },
  ],
  [
    "조건 분기",
    {
      body: [
        {
          type: "if",
          condition: "짝수이면",
          thenBody: [{ type: "output", expr: "'짝'" }],
          elseBody: [{ type: "output", expr: "'홀'" }],
        },
      ],
    },
  ],
  [
    "아니면이 빈 조건",
    {
      body: [
        {
          type: "if",
          condition: "짝수이면",
          thenBody: [{ type: "action", text: "가" }],
          elseBody: [],
        },
        { type: "action", text: "나" },
      ],
    },
  ],
  [
    "반복",
    {
      body: [
        { type: "loop", condition: "반복 조건", body: [{ type: "action", text: "가" }] },
        { type: "output", expr: "합계" },
      ],
    },
  ],
  [
    "반복 안의 조건",
    {
      body: [
        {
          type: "loop",
          condition: "반복 조건",
          body: [
            {
              type: "if",
              condition: "짝수이면",
              thenBody: [{ type: "action", text: "가" }],
              elseBody: [],
            },
          ],
        },
      ],
    },
  ],
]

describe("순서도 자동 배치", () => {
  it.each(programs)("%s은 이미 배치된 그래프를 그대로 둔다", (_name, program) => {
    const graph = astToFlow(program)

    expect(positionsOf(autoLayoutGraph(graph))).toEqual(positionsOf(graph))
  })

  it.each(programs)("%s은 흩어 놓아도 같은 자리로 되돌린다", (_name, program) => {
    const graph = astToFlow(program)

    expect(positionsOf(autoLayoutGraph(scatter(graph)))).toEqual(positionsOf(graph))
  })

  it("갈래를 되짚은 결과가 astToFlow가 적어 둔 것과 같다", () => {
    for (const [, program] of programs) {
      const graph = astToFlow(program)
      for (const group of deriveBranchGroups(graph.nodes, graph.edges)) {
        const decision = graph.nodes.find(node => node.id === group.decisionId)!
        // '예' 갈래는 판단 기호의 왼쪽에 놓입니다.
        for (const id of group.yes) {
          expect(centerX(graph, id)).toBeLessThanOrEqual(centerX(graph, decision.id))
        }
      }
    }
  })

  it("아직 잇지 않은 기호를 지우지 않는다", () => {
    const graph = astToFlow({ body: [{ type: "output", expr: "합계" }] })
    const loose: AlgorithmFlowNode = {
      id: "loose",
      type: "io",
      position: { x: 900, y: 900 },
      data: { kind: "input", label: "입력: 수" },
    }
    const withLoose = { nodes: [...graph.nodes, loose], edges: graph.edges }

    const laidOut = autoLayoutGraph(withLoose)

    expect(laidOut.nodes.map(node => node.id).sort()).toEqual(
      withLoose.nodes.map(node => node.id).sort(),
    )
    expect(laidOut.nodes.find(node => node.id === "loose")!.position).not.toEqual(loose.position)
  })

  it("연결이 끊긴 판단도 배치한다", () => {
    const decision: AlgorithmFlowNode = {
      id: "lonely",
      type: "decision",
      position: { x: 40, y: 40 },
      data: { kind: "decision", label: "판단 조건", controlKind: "if" },
    }

    expect(() => autoLayoutGraph({ nodes: [decision], edges: [] })).not.toThrow()
    expect(deriveBranchGroups([decision], [])).toEqual([])
  })

  /*
   * 기호 안에 긴 글을 넣으면 도형이 표준 크기보다 커집니다(.flow-shape의 min-height).
   * 한때 배치는 표준 크기로, 화면은 실제 크기로 그려서 늘어난 기호가 아래 기호를
   * 덮었습니다. 화면에서 잰 크기(measured)가 있으면 그것으로 자리를 잡아야 합니다.
   */
  it("글이 길어 커진 기호도 아래 기호와 겹치지 않는다", () => {
    const program: Program = {
      body: [
        { type: "assign", target: "합계", expr: "아주 긴 문장".repeat(12) },
        { type: "assign", target: "수", expr: "1" },
      ],
    }
    const graph = astToFlow(program)
    const tall = graph.nodes.find(node => node.id === "statement-root-0")!
    const measured = { ...tall, measured: { width: NODE_SIZES.process.width, height: 260 } }
    const arranged = autoLayoutGraph({
      nodes: graph.nodes.map(node => (node.id === tall.id ? measured : node)),
      edges: graph.edges,
    })

    const boxOf = (id: string) => {
      const node = arranged.nodes.find(candidate => candidate.id === id)!
      const height = node.measured?.height ?? NODE_SIZES[node.data.kind].height
      return { top: node.position.y, bottom: node.position.y + height }
    }
    expect(boxOf("statement-root-0").bottom).toBeLessThanOrEqual(boxOf("statement-root-1").top)
  })
})
