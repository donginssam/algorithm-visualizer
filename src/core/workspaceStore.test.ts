import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToFlow } from "./astToFlow"
import type { AlgorithmFlowNode } from "./flowTypes"
import { parseWorkspace, serializeWorkspace, type Workspace } from "./workspaceStore"

describe("작업 내용 저장", () => {
  const workspaceOf = (nodes: AlgorithmFlowNode[], edges: Workspace["edges"]): Workspace => ({
    code: "시작\n  입력: 수\n끝",
    program: { body: [{ type: "input", variable: "수" }] },
    source: "flow",
    nodes,
    edges,
  })

  it("순서도와 의사코드를 손실 없이 담았다가 되돌린다", () => {
    const graph = astToFlow(examples[0].program)
    const workspace: Workspace = {
      code: "시작\n끝",
      program: examples[0].program,
      source: "example",
      nodes: graph.nodes,
      edges: graph.edges,
    }

    const restored = parseWorkspace(serializeWorkspace(workspace))

    expect(restored?.code).toBe(workspace.code)
    expect(restored?.program).toEqual(workspace.program)
    expect(restored?.source).toBe("example")
    expect(restored?.nodes.map(node => node.data.label)).toEqual(
      graph.nodes.map(node => node.data.label),
    )
    expect(restored?.nodes.map(node => node.position)).toEqual(
      graph.nodes.map(node => node.position),
    )
    expect(restored?.edges.map(edge => edge.id)).toEqual(graph.edges.map(edge => edge.id))
    // 화살표 경로와 예/아니오 라벨도 그대로여야 화면이 어긋나지 않습니다.
    expect(restored?.edges[0].data?.routePoints).toEqual(graph.edges[0].data?.routePoints)
    expect(restored?.edges.map(edge => edge.label)).toEqual(graph.edges.map(edge => edge.label))
  })

  // 이 기능의 핵심입니다. 만드는 도중의 그래프는 AST로 바꿀 수 없으므로
  // 그래프 자체를 담지 않으면 새로 고칠 때 사라집니다.
  it("아직 연결하지 않은 기호도 그대로 되살린다", () => {
    const nodes: AlgorithmFlowNode[] = [
      {
        id: "terminal-start",
        type: "terminal",
        position: { x: 0, y: 0 },
        data: { kind: "terminal", label: "시작", terminalRole: "start" },
      },
      {
        id: "user-node-1",
        type: "process",
        position: { x: 40, y: 200 },
        data: { kind: "process", label: "변수 ← 값" },
      },
    ]

    const restored = parseWorkspace(serializeWorkspace(workspaceOf(nodes, [])))

    expect(restored?.nodes).toHaveLength(2)
    expect(restored?.nodes[1].position).toEqual({ x: 40, y: 200 })
    expect(restored?.edges).toHaveLength(0)
  })

  it("실행 중에만 쓰는 값은 저장하지 않는다", () => {
    const nodes: AlgorithmFlowNode[] = [
      {
        id: "terminal-start",
        type: "terminal",
        position: { x: 0, y: 0 },
        data: { kind: "terminal", label: "시작", terminalRole: "start" },
        measured: { width: 172, height: 64 },
        selected: true,
        dragging: true,
      },
    ]

    const raw = serializeWorkspace(workspaceOf(nodes, []))

    expect(raw).not.toContain("measured")
    expect(raw).not.toContain("selected")
    expect(raw).not.toContain("dragging")
    expect(parseWorkspace(raw)?.nodes[0].position).toEqual({ x: 0, y: 0 })
  })

  it.each([
    ["빈 값", null],
    ["글자가 아닌 JSON", "[]"],
    ["깨진 JSON", "{"],
    [
      "예전 버전",
      '{"version":0,"code":"시작","program":{"body":[]},"source":"flow","nodes":[],"edges":[]}',
    ],
    [
      "노드가 배열이 아님",
      '{"version":1,"code":"시작","program":{"body":[]},"source":"flow","nodes":{},"edges":[]}',
    ],
    [
      "노드에 위치가 없음",
      '{"version":1,"code":"시작","program":{"body":[]},"source":"flow","nodes":[{"id":"a","data":{"kind":"process","label":"값"}}],"edges":[]}',
    ],
    [
      "출처가 이상함",
      '{"version":1,"code":"시작","program":{"body":[]},"source":"???","nodes":[],"edges":[]}',
    ],
  ])("%s는 무시하고 빈 화면에서 시작한다", (_name, raw) => {
    expect(parseWorkspace(raw)).toBeNull()
  })

  it("예전에 저장한 갈래 경로가 지금 방향과 어긋나면 지운다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "if",
          condition: "짝수이면",
          thenBody: [{ type: "action", text: "센다." }],
          elseBody: [{ type: "action", text: "지나간다." }],
        },
      ],
    })
    const decision = graph.nodes.find(node => node.data.kind === "decision")
    if (!decision) throw new Error("판단 기호가 있어야 합니다")

    // '예'가 오른쪽에서 나가던 시절의 저장본을 흉내 냅니다.
    const stale = graph.edges.map(edge =>
      edge.source === decision.id && edge.sourceHandle === "yes"
        ? {
            ...edge,
            data: {
              ...edge.data,
              routePoints: [{ x: decision.position.x + 220, y: decision.position.y + 62 }],
            },
          }
        : edge,
    )
    const restored = parseWorkspace(
      serializeWorkspace({
        code: "시작\n끝",
        program: { body: [] },
        source: "flow",
        nodes: graph.nodes,
        edges: stale,
      }),
    )

    const yesEdge = restored?.edges.find(
      edge => edge.source === decision.id && edge.sourceHandle === "yes",
    )
    expect(yesEdge).toBeDefined()
    expect(yesEdge?.data?.routePoints).toBeUndefined()

    // 방향이 맞는 화살표의 경로는 건드리지 않습니다.
    const noEdge = restored?.edges.find(
      edge => edge.source === decision.id && edge.sourceHandle === "no",
    )
    expect(noEdge?.data?.routePoints?.length).toBeGreaterThan(1)
  })
})
