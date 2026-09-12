import { describe, expect, it } from "vitest"
import { astToFlow } from "./astToFlow"
import type { Program } from "./ast"
import type { AlgorithmFlowNode, FlowGraph } from "./flowTypes"
import { removeNodes } from "./removeNodes"
import { GraphHistory } from "./graphHistory"
import { findJunction } from "./graphTopology"

describe("기호 지우기", () => {
  const ifProgram: Program = {
    body: [
      { type: "assign", target: "수", expr: "1" },
      {
        type: "if",
        condition: "짝수이면",
        thenBody: [{ type: "action", text: "짝수를 센다." }],
        elseBody: [{ type: "action", text: "홀수를 센다." }],
      },
      { type: "output", expr: "결과" },
    ],
  }

  const decisionOf = (graph: FlowGraph) => {
    const decision = graph.nodes.find(node => node.data.kind === "decision")
    if (!decision) throw new Error("판단 기호가 있어야 합니다")
    return decision
  }
  const junctionIds = (graph: FlowGraph) =>
    graph.nodes.filter(node => node.data.kind === "junction").map(node => node.id)
  const dangling = (graph: FlowGraph) =>
    graph.edges.filter(
      edge =>
        !graph.nodes.some(node => node.id === edge.source) ||
        !graph.nodes.some(node => node.id === edge.target),
    )

  const renameJoins = (graph: FlowGraph): FlowGraph => {
    const joins = new Set(junctionIds(graph))
    const rename = (id: string) => (joins.has(id) ? `custom-${id}` : id)
    return {
      nodes: graph.nodes.map(node => ({ ...node, id: rename(node.id) })),
      edges: graph.edges.map(edge => ({
        ...edge,
        source: rename(edge.source),
        target: rename(edge.target),
      })),
    }
  }

  it("판단과 갈래 화살표를 동시에 지워도 원본 연결로 짝을 찾는다", () => {
    const graph = renameJoins(astToFlow(ifProgram))
    const decision = decisionOf(graph)
    const edge = graph.edges.find(
      edge => edge.source === decision.id && edge.sourceHandle === "yes",
    )!
    const before = structuredClone(graph)
    const next = removeNodes(graph, [decision.id], [edge.id])
    expect(junctionIds(next)).toEqual([])
    expect(dangling(next)).toEqual([])
    expect(graph).toEqual(before)
  })

  it("두 갈래가 다음 판단에서 만나면 그 판단의 합류점은 보존한다", () => {
    const graph = renameJoins(
      astToFlow({
        body: [
          {
            type: "if",
            condition: "첫째",
            thenBody: [{ type: "action", text: "a" }],
            elseBody: [],
          },
          {
            type: "if",
            condition: "둘째",
            thenBody: [{ type: "action", text: "b" }],
            elseBody: [],
          },
        ],
      }),
    )
    const decision = decisionOf(graph)
    const join = findJunction(graph, decision.id)!
    const after = graph.edges.find(edge => edge.source === join)!.target
    const bypassed = {
      nodes: graph.nodes.filter(node => node.id !== join),
      edges: graph.edges
        .filter(edge => edge.source !== join)
        .map(edge => (edge.target === join ? { ...edge, target: after } : edge)),
    }
    expect(findJunction(bypassed, decision.id)).toBeUndefined()
    expect(junctionIds(removeNodes(bypassed, [decision.id]))).toEqual(junctionIds(bypassed))
  })

  it("중첩 분기를 지워도 바깥 합류점은 남고 다중 삭제 순서에 영향받지 않는다", () => {
    const graph = renameJoins(
      astToFlow({
        body: [
          {
            type: "if",
            condition: "바깥",
            elseBody: [],
            thenBody: [
              {
                type: "if",
                condition: "안쪽",
                thenBody: [{ type: "action", text: "처리" }],
                elseBody: [],
              },
            ],
          },
        ],
      }),
    )
    const outer = graph.nodes.find(node => node.data.label === "바깥")!
    const inner = graph.nodes.find(node => node.data.label === "안쪽")!
    expect(junctionIds(removeNodes(graph, [inner.id]))).toEqual([findJunction(graph, outer.id)])
    const next = removeNodes(graph, [inner.id, outer.id])
    expect(junctionIds(next)).toEqual([])
    expect(next).toEqual(removeNodes(graph, [outer.id, inner.id]))
    expect(dangling(next)).toEqual([])
  })

  it("외부에서 연결된 공유 합류점은 소유 관계를 확신할 수 없어 보존한다", () => {
    const graph = astToFlow(ifProgram)
    const decision = decisionOf(graph)
    const [join] = junctionIds(graph)
    const external = graph.nodes.find(node => node.data.label === "수 ← 1")!
    const shared = {
      ...graph,
      edges: [...graph.edges, { id: "external", source: external.id, target: join }],
    }
    expect(findJunction(shared, decision.id)).toBeUndefined()
    expect(junctionIds(removeNodes(shared, [decision.id]))).toEqual([join])
  })

  it("삭제를 한 단계로 undo/redo하면 합류점과 선택 화살표까지 복원한다", () => {
    const graph = renameJoins(astToFlow(ifProgram))
    const history = new GraphHistory()
    history.record(graph)
    const next = removeNodes(graph, [decisionOf(graph).id], [graph.edges[0].id])
    const restored = history.undo(next)!
    expect(restored).toEqual(graph)
    expect(history.redo(restored)).toEqual(next)
  })

  it("화살표만 삭제하면 노드는 모두 보존한다", () => {
    const graph = astToFlow(ifProgram)
    const next = removeNodes(graph, [], [graph.edges[0].id])
    expect(next.nodes).toEqual(graph.nodes)
    expect(next.edges).toEqual(graph.edges.slice(1))
  })

  it("조건 분기 판단을 지우면 짝 합류 기호와 닿아 있던 화살표를 함께 지운다", () => {
    const graph = astToFlow(ifProgram)
    const decision = decisionOf(graph)
    expect(junctionIds(graph)).toHaveLength(1)

    const next = removeNodes(graph, [decision.id])

    expect(next.nodes.some(node => node.id === decision.id)).toBe(false)
    expect(junctionIds(next)).toEqual([])
    expect(dangling(next)).toEqual([])
    // 갈래 본문과 나머지 기호는 그대로 남습니다.
    expect(next.nodes.map(node => node.data.label).sort()).toEqual(
      ["끝", "수 ← 1", "시작", "짝수를 센다.", "출력: 결과", "홀수를 센다."].sort(),
    )
  })

  it("짝 id가 아닌 합류점이라도 두 갈래가 만나는 곳이면 함께 지운다", () => {
    const graph = astToFlow(ifProgram)
    const decision = decisionOf(graph)
    const [junctionId] = junctionIds(graph)
    // 학생이 팔레트에서 따로 놓은 합류 기호처럼 id를 바꿉니다.
    const renamed: FlowGraph = {
      nodes: graph.nodes.map(node =>
        node.id === junctionId ? { ...node, id: "user-junction" } : node,
      ),
      edges: graph.edges.map(edge => ({
        ...edge,
        source: edge.source === junctionId ? "user-junction" : edge.source,
        target: edge.target === junctionId ? "user-junction" : edge.target,
      })),
    }

    const next = removeNodes(renamed, [decision.id])
    expect(junctionIds(next)).toEqual([])
    expect(dangling(next)).toEqual([])
  })

  it("반복 판단을 지워도 아직 잇지 않은 짝 합류 기호는 함께 지운다", () => {
    const graph = astToFlow({
      body: [{ type: "loop", condition: "반복", body: [{ type: "action", text: "간다." }] }],
    })
    const decision = decisionOf(graph)
    const companion: AlgorithmFlowNode = {
      id: `${decision.id}-junction`,
      type: "junction",
      position: { x: 0, y: 0 },
      data: { kind: "junction", label: "합류" },
    }

    const next = removeNodes({ nodes: [...graph.nodes, companion], edges: graph.edges }, [
      decision.id,
    ])
    expect(junctionIds(next)).toEqual([])
    expect(dangling(next)).toEqual([])
  })

  it("다른 판단의 합류점은 건드리지 않는다", () => {
    const graph = astToFlow({
      body: [
        { type: "if", condition: "첫째", thenBody: [{ type: "action", text: "a" }], elseBody: [] },
        { type: "if", condition: "둘째", thenBody: [{ type: "action", text: "b" }], elseBody: [] },
      ],
    })
    const first = graph.nodes.find(node => node.data.label === "첫째")
    if (!first) throw new Error("첫째 판단이 있어야 합니다")

    const next = removeNodes(graph, [first.id])
    expect(junctionIds(next)).toEqual([
      `${graph.nodes.find(node => node.data.label === "둘째")?.id}-junction`,
    ])
  })

  it("판단이 아닌 기호나 합류 기호만 지우면 다른 기호는 그대로다", () => {
    const graph = astToFlow(ifProgram)
    const process = graph.nodes.find(node => node.data.label === "짝수를 센다.")
    const [junctionId] = junctionIds(graph)
    if (!process) throw new Error("처리 기호가 있어야 합니다")

    const withoutProcess = removeNodes(graph, [process.id])
    expect(withoutProcess.nodes).toHaveLength(graph.nodes.length - 1)
    expect(junctionIds(withoutProcess)).toEqual([junctionId])

    const withoutJunction = removeNodes(graph, [junctionId])
    expect(withoutJunction.nodes.some(node => node.data.kind === "decision")).toBe(true)
    expect(dangling(withoutJunction)).toEqual([])
  })

  it("없는 id를 지워도 그래프는 그대로다", () => {
    const graph = astToFlow(ifProgram)
    const next = removeNodes(graph, ["missing"])
    expect(next.nodes).toEqual(graph.nodes)
    expect(next.edges).toEqual(graph.edges)
  })
})
