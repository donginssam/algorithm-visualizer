import { describe, expect, it } from "vitest"
import { astToFlow } from "./astToFlow"
import { NODE_SIZES } from "./nodeGeometry"
import { astToText } from "./astToText"
import { changeDecisionKind } from "./decisionKind"
import { flowToAst } from "./flowToAst"
import type { Program } from "./ast"
import type { FlowGraph } from "./flowTypes"

/** 판단 기호 하나가 든 순서도와 그 판단의 id. */
function graphOf(program: Program): { graph: FlowGraph; decisionId: string } {
  const graph = astToFlow(program)
  const decision = graph.nodes.find(node => node.data.kind === "decision")
  if (!decision) throw new Error("판단 기호가 있어야 합니다")
  return { graph, decisionId: decision.id }
}

const pseudocode = (graph: FlowGraph) => astToText(flowToAst(graph.nodes, graph.edges))

describe("판단 기호 종류 바꾸기", () => {
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

  const loopProgram: Program = {
    body: [
      { type: "assign", target: "수", expr: "1" },
      {
        type: "loop",
        condition: "수가 작을 때까지",
        body: [{ type: "action", text: "수를 늘린다." }],
      },
      { type: "output", expr: "결과" },
    ],
  }

  it("조건을 반복으로 바꾸면 합류점과 모든 연결선만 삭제한다", () => {
    const { graph, decisionId } = graphOf(ifProgram)
    const before = structuredClone(graph)
    const next = changeDecisionKind(graph, decisionId, "loop")
    const join = decisionId + "-junction"
    expect(next.nodes.map(node => node.id)).toEqual(
      graph.nodes.filter(node => node.id !== join).map(node => node.id),
    )
    expect(next.edges).toEqual(
      graph.edges.filter(edge => edge.source !== join && edge.target !== join),
    )
    expect(next.nodes.find(node => node.id === decisionId)?.data.controlKind).toBe("loop")
    expect(graph).toEqual(before)
  })

  it("합류점의 이름이 바뀌어도 연결 관계로 찾아 반복으로 변환한다", () => {
    const { graph, decisionId } = graphOf(ifProgram)
    const oldId = `${decisionId}-junction`
    const rename = (id: string) => (id === oldId ? "custom-join" : id)
    const renamed: FlowGraph = {
      nodes: graph.nodes.map(node => ({ ...node, id: rename(node.id) })),
      edges: graph.edges.map(edge => ({
        ...edge,
        source: rename(edge.source),
        target: rename(edge.target),
      })),
    }
    const before = structuredClone(renamed)
    expect(flowToAst(renamed.nodes, renamed.edges)).toEqual(ifProgram)
    const next = changeDecisionKind(renamed, decisionId, "loop")
    expect(next.edges).toEqual(
      renamed.edges.filter(edge => edge.source !== "custom-join" && edge.target !== "custom-join"),
    )
    expect(next.nodes.some(node => node.id === "custom-join")).toBe(false)
    expect(renamed).toEqual(before)
  })

  it("아니면 본문이 없는 조건 분기도 반복으로 바꿀 수 있다", () => {
    const { graph, decisionId } = graphOf({
      body: [
        {
          type: "if",
          condition: "짝수이면",
          thenBody: [{ type: "action", text: "짝수를 센다." }],
          elseBody: [],
        },
        { type: "output", expr: "결과" },
      ],
    })
    const next = changeDecisionKind(graph, decisionId, "loop")

    const join = `${decisionId}-junction`
    expect(next.edges).toEqual(
      graph.edges.filter(edge => edge.source !== join && edge.target !== join),
    )
  })

  it("반복을 조건 분기로 바꾸면 본문이 합류점에서 만난다", () => {
    const { graph, decisionId } = graphOf(loopProgram)
    const next = changeDecisionKind(graph, decisionId, "if")

    expect(pseudocode(next)).toBe(
      [
        "시작",
        "  수 ← 1",
        "  [만약 수가 작을 때까지]",
        "    수를 늘린다.",
        "  출력: 결과",
        "끝",
      ].join("\n"),
    )
  })

  it("종류를 바꿨다 되돌려도 기호를 잃지 않는다", () => {
    const { graph, decisionId } = graphOf(ifProgram)
    const roundTrip = changeDecisionKind(
      changeDecisionKind(graph, decisionId, "loop"),
      decisionId,
      "if",
    )

    const labels = (target: FlowGraph) => target.nodes.map(node => node.data.label).sort()
    expect(labels(roundTrip)).toEqual(labels(graph))
    // 삭제된 연결은 자동으로 복구하지 않으므로 사용자가 다시 이어야 합니다.
    expect(() => flowToAst(roundTrip.nodes, roundTrip.edges)).toThrow()
  })

  it("바꾼 뒤에도 없는 기호를 참조하는 화살표가 남지 않는다", () => {
    const { graph, decisionId } = graphOf(ifProgram)

    for (const next of [
      changeDecisionKind(graph, decisionId, "loop"),
      changeDecisionKind(changeDecisionKind(graph, decisionId, "loop"), decisionId, "if"),
    ]) {
      const dangling = next.edges.filter(
        edge =>
          !next.nodes.some(node => node.id === edge.source) ||
          !next.nodes.some(node => node.id === edge.target),
      )
      expect(dangling).toEqual([])
    }
  })

  it.each(["입력만", "출력만", "양방향"])(
    "짝 합류점에 %s 연결이 있어도 모두 제거한다",
    direction => {
      const { graph, decisionId } = graphOf(ifProgram)
      const join = decisionId + "-junction"
      const partial = {
        ...graph,
        edges: graph.edges.filter(edge =>
          direction === "입력만"
            ? edge.source !== join
            : direction === "출력만"
              ? edge.target !== join
              : true,
        ),
      }
      const next = changeDecisionKind(partial, decisionId, "loop")
      expect(next.nodes.some(node => node.id === join)).toBe(false)
      expect(next.edges).toEqual(
        partial.edges.filter(edge => edge.source !== join && edge.target !== join),
      )
    },
  )

  it("바깥 반복으로 돌아가는 합류점의 복귀선도 제거한다", () => {
    const { graph, decisionId } = graphOf({
      body: [
        {
          type: "loop",
          condition: "바깥",
          body: [
            {
              type: "if",
              condition: "안쪽",
              thenBody: [{ type: "action", text: "처리" }],
              elseBody: [],
            },
          ],
        },
      ],
    })
    const inner = graph.nodes.find(node => node.data.label === "안쪽")!
    const join = inner.id + "-junction"
    expect(graph.edges.some(edge => edge.source === join && edge.target === decisionId)).toBe(true)
    const next = changeDecisionKind(graph, inner.id, "loop")
    expect(next.edges).toEqual(
      graph.edges.filter(edge => edge.source !== join && edge.target !== join),
    )
    expect(next.nodes.some(node => node.id === join)).toBe(false)
  })

  it("바깥 반복 본문 끝의 반복을 조건으로 바꾸면 합류점이 복귀선으로 바깥 판단에 돌아간다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "loop",
          condition: "바깥",
          body: [
            { type: "action", text: "a" },
            { type: "loop", condition: "안쪽", body: [{ type: "action", text: "b" }] },
          ],
        },
        { type: "output", expr: "결과" },
      ],
    })
    const outer = graph.nodes.find(node => node.data.label === "바깥")
    const inner = graph.nodes.find(node => node.data.label === "안쪽")
    if (!outer || !inner) throw new Error("바깥과 안쪽 판단이 있어야 합니다")

    const next = changeDecisionKind(graph, inner.id, "if")
    const rejoin = next.edges.find(edge => edge.source === `${inner.id}-junction`)
    expect(rejoin?.target).toBe(outer.id)
    expect(rejoin?.data?.branch).toBe("loop-back")
    expect(rejoin?.type).toBe("loop-back")
    // 합류점 아래에서 나가므로 왼쪽 통로를 돕니다.
    const graphLeft = Math.min(...next.nodes.map(node => node.position.x))
    expect(rejoin?.data?.routePoints?.some(point => point.x < graphLeft)).toBe(true)
    // 안쪽 판단의 아니오는 이제 합류점으로 가는 보통 화살표입니다.
    const no = next.edges.find(edge => edge.source === inner.id && edge.sourceHandle === "no")
    expect(no?.target).toBe(`${inner.id}-junction`)
    expect(no?.data?.branch).toBe("no")
    expect(pseudocode(next)).toBe(
      ["시작", "  [바깥 반복]", "    a", "    [만약 안쪽]", "      b", "  출력: 결과", "끝"].join(
        "\n",
      ),
    )
  })

  /*
   * 팔레트에서 놓은 판단 기호에는 아직 잇지 않은 짝 합류 기호(`<판단 id>-junction`)가
   * 딸려 있습니다. 학생이 잇기 전에 종류를 바꾸는 경우입니다.
   */
  describe("아직 잇지 않은 짝 합류 기호", () => {
    /** 반복 모양으로 이어 둔 팔레트 판단과, 아직 잇지 않은 짝 합류 기호. */
    function loopWithDanglingJunction(controlKind: "if" | "loop") {
      const { graph, decisionId } = graphOf(loopProgram)
      const dangling: FlowGraph["nodes"][number] = {
        id: `${decisionId}-junction`,
        type: "junction",
        position: { x: 500, y: 500 },
        data: { kind: "junction", label: "합류" },
      }
      return {
        decisionId,
        graph: {
          nodes: graph.nodes.map(node =>
            node.id === decisionId ? { ...node, data: { ...node.data, controlKind } } : node,
          ),
          edges: graph.edges,
        } as FlowGraph,
        dangling,
      }
    }

    it("반복으로 바꾸면 잇지 않은 합류 기호를 지운다", () => {
      const { graph, decisionId, dangling } = loopWithDanglingJunction("if")
      const next = changeDecisionKind(
        { nodes: [...graph.nodes, dangling], edges: graph.edges },
        decisionId,
        "loop",
      )

      expect(next.nodes.some(node => node.id === dangling.id)).toBe(false)
      expect(pseudocode(next)).toBe(
        [
          "시작",
          "  수 ← 1",
          "  [수가 작을 때까지 반복]",
          "    수를 늘린다.",
          "  출력: 결과",
          "끝",
        ].join("\n"),
      )
    })

    it("조건 분기로 바꾸면 잇지 않은 합류 기호를 그대로 써서 잇는다", () => {
      const { graph, decisionId, dangling } = loopWithDanglingJunction("loop")
      const next = changeDecisionKind(
        { nodes: [...graph.nodes, dangling], edges: graph.edges },
        decisionId,
        "if",
      )

      // 새 합류 기호를 만들지 않고 있던 것을 제자리에서 씁니다.
      const junctions = next.nodes.filter(node => node.data.kind === "junction")
      expect(junctions).toHaveLength(1)
      expect(junctions[0].id).toBe(dangling.id)
      expect(junctions[0].position).toEqual(dangling.position)
      expect(next.edges.filter(edge => edge.target === dangling.id)).toHaveLength(2)
      expect(next.edges.filter(edge => edge.source === dangling.id)).toHaveLength(1)
      expect(pseudocode(next)).toBe(
        [
          "시작",
          "  수 ← 1",
          "  [만약 수가 작을 때까지]",
          "    수를 늘린다.",
          "  출력: 결과",
          "끝",
        ].join("\n"),
      )
    })

    it("이미 이어진 합류점이 있으면 조건 분기로 바꿔도 손대지 않는다", () => {
      const { graph, decisionId } = graphOf(ifProgram)
      const asIf = changeDecisionKind(graph, decisionId, "if")
      expect(asIf).toEqual(graph)
    })
  })

  it("아직 만드는 중이라 합류점이 없으면 종류만 바꾼다", () => {
    const graph: FlowGraph = {
      nodes: [
        {
          id: "d1",
          type: "decision",
          position: { x: 0, y: 0 },
          data: { kind: "decision", label: "조건", controlKind: "if" },
        },
      ],
      edges: [],
    }
    const next = changeDecisionKind(graph, "d1", "loop")

    expect(next.nodes).toHaveLength(1)
    expect(next.nodes[0].data.controlKind).toBe("loop")
    expect(next.edges).toEqual([])
  })

  it("연결 전 조건→반복→조건 전환에서 짝 합류점을 다시 생성한다", () => {
    const graph: FlowGraph = {
      nodes: [
        {
          id: "d1",
          type: "decision",
          position: { x: 100, y: 100 },
          data: { kind: "decision", label: "조건", controlKind: "if" },
        },
        {
          id: "d1-junction",
          type: "junction",
          position: { x: 201, y: 300 },
          data: { kind: "junction", label: "합류" },
        },
      ],
      edges: [],
    }
    const before = structuredClone(graph)
    const loop = changeDecisionKind(graph, "d1", "loop")
    expect(loop.nodes).toHaveLength(1)
    const restored = changeDecisionKind(loop, "d1", "if")
    const join = restored.nodes.find(node => node.id === "d1-junction")!
    expect(join.data.kind).toBe("junction")
    expect(join.position.y).toBeGreaterThan(100 + NODE_SIZES.decision.height)
    expect(restored.edges).toEqual([])
    expect(changeDecisionKind(restored, "d1", "if")).toEqual(restored)
    expect(graph).toEqual(before)
  })

  it("조건→반복→조건 왕복에서 아니면 본문을 합류점 뒤로 밀어내지 않는다", () => {
    // 조건→반복은 합류점 연결선만 지우므로 복귀선이 없는 '닫히지 않은 반복'이 됩니다.
    // 되돌릴 때 '아니오'가 가는 아니면 본문을 반복 뒤의 흐름으로 잘못 보면
    // 아니오 → 합류점 → 아니면 본문으로 배선되어 버립니다.
    const { graph, decisionId } = graphOf(ifProgram)
    const loop = changeDecisionKind(graph, decisionId, "loop")
    const restored = changeDecisionKind(loop, decisionId, "if")

    const yes = restored.edges.find(
      edge => edge.source === decisionId && edge.sourceHandle === "yes",
    )
    const no = restored.edges.find(edge => edge.source === decisionId && edge.sourceHandle === "no")
    const thenBody = graph.nodes.find(node => node.data.label === "짝수를 센다.")
    const elseBody = graph.nodes.find(node => node.data.label === "홀수를 센다.")
    expect(yes?.target).toBe(thenBody?.id)
    expect(no?.target).toBe(elseBody?.id)

    // 짝 합류점은 두 갈래 아래에 준비되고, 화살표는 학생이 잇습니다.
    const junctionId = `${decisionId}-junction`
    const junction = restored.nodes.find(node => node.id === junctionId)
    expect(junction?.data.kind).toBe("junction")
    expect(
      restored.edges.some(edge => edge.source === junctionId || edge.target === junctionId),
    ).toBe(false)
    const bodiesBottom = Math.max(
      ...[thenBody, elseBody].map(node => node!.position.y + NODE_SIZES[node!.data.kind].height),
    )
    expect(junction!.position.y).toBeGreaterThan(bodiesBottom)
    // 반복 뒤의 흐름(출력)은 그대로입니다.
    expect(restored.edges).toHaveLength(loop.edges.length)
  })

  it("예 본문만 연결된 반복도 조건으로 바꾸면 본문 아래에 합류점을 준비한다", () => {
    const graph: FlowGraph = {
      nodes: [
        {
          id: "d1",
          type: "decision",
          position: { x: 100, y: 100 },
          data: { kind: "decision", label: "조건", controlKind: "loop" },
        },
        {
          id: "body",
          type: "process",
          position: { x: 0, y: 400 },
          data: { kind: "process", label: "처리" },
        },
      ],
      edges: [
        { id: "yes", source: "d1", sourceHandle: "yes", target: "body", data: { branch: "yes" } },
      ],
    }
    const next = changeDecisionKind(graph, "d1", "if")
    expect(next.nodes.find(node => node.id === "d1-junction")!.position.y).toBeGreaterThan(
      400 + NODE_SIZES.process.height,
    )
    expect(next.edges).toEqual(graph.edges)
  })

  // 한때 합류점에서 나가는 화살표의 id를 시각으로 지어, 같은 입력이 매번 다른
  // 그래프를 냈습니다. 순수 함수이므로 결과를 통째로 비교할 수 있어야 합니다.
  it("같은 입력이면 언제나 같은 그래프를 낸다", () => {
    const { graph, decisionId } = graphOf(loopProgram)
    expect(changeDecisionKind(graph, decisionId, "if")).toEqual(
      changeDecisionKind(graph, decisionId, "if"),
    )
  })
})
