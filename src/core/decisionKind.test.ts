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

  it("조건 분기를 반복으로 바꾸면 예 본문이 판단으로 되돌아온다", () => {
    const { graph, decisionId } = graphOf(ifProgram)
    const next = changeDecisionKind(graph, decisionId, "loop")

    expect(pseudocode(next)).toBe(
      [
        "시작",
        "  수 ← 1",
        "  [짝수이면 반복]",
        "    짝수를 센다.",
        "  홀수를 센다.",
        "  출력: 결과",
        "끝",
      ].join("\n"),
    )
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
    expect(pseudocode(next)).toEqual(pseudocode(changeDecisionKind(graph, decisionId, "loop")))
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

    expect(pseudocode(next)).toBe(
      ["시작", "  [짝수이면 반복]", "    짝수를 센다.", "  출력: 결과", "끝"].join("\n"),
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
    expect(() => flowToAst(roundTrip.nodes, roundTrip.edges)).not.toThrow()
  })

  it("바꾼 뒤에도 연결이 끊긴 기호가 남지 않는다", () => {
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

  it("옮긴 화살표는 낡은 경로를 버리고, 복귀선은 순서도 왼쪽 통로를 도는 새 경로를 받는다", () => {
    const { graph, decisionId } = graphOf(ifProgram)
    const next = changeDecisionKind(graph, decisionId, "loop")
    const decision = next.nodes.find(node => node.id === decisionId)
    if (!decision) throw new Error("판단 기호가 있어야 합니다")

    // 합류점 뒤를 이어받은 보통 화살표(아니면 본문 끝 → 출력)는 경로 없이 기본 모양으로 다시 그려집니다.
    const elseEnd = next.nodes.find(node => node.data.label === "홀수를 센다.")
    const output = next.nodes.find(node => node.data.kind === "output")
    if (!elseEnd || !output) throw new Error("아니면 본문과 출력 기호가 있어야 합니다")
    const rejoined = next.edges.find(edge => edge.source === elseEnd.id)
    expect(rejoined?.target).toBe(output.id)
    expect(rejoined?.data?.routePoints).toBeUndefined()

    // 복귀선은 경로가 없으면 곡선으로 그려져 기호를 가로지를 수 있으므로 통로를 돌게 합니다.
    const loopBacks = next.edges.filter(edge => edge.data?.branch === "loop-back")
    expect(loopBacks.length).toBeGreaterThan(0)
    const graphLeft = Math.min(...next.nodes.map(node => node.position.x))
    for (const edge of loopBacks) {
      const route = edge.data?.routePoints ?? []
      expect(route.length).toBeGreaterThan(2)
      expect(route.some(point => point.x < graphLeft)).toBe(true)
      expect(route[route.length - 1]).toEqual({
        x: decision.position.x + NODE_SIZES.decision.width / 2,
        y: decision.position.y,
      })
    }
  })

  /*
   * 바깥 반복 본문의 끝에 있는 판단을 바꾸면, 바깥 판단으로 되돌아가던 화살표
   * (합류점의 다음 화살표 또는 반복의 아니오)의 자리를 새 화살표가 이어받습니다.
   * 그 화살표도 복귀선이어야 왼쪽 lane으로 돌아갑니다. 보통 화살표로 두면 위로
   * 올라가는 선이 기호 사이를 가로지릅니다.
   */
  it("바깥 반복 본문 끝의 조건을 반복으로 바꾸면 아니오가 복귀선으로 바깥 판단에 돌아간다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "loop",
          condition: "바깥",
          body: [
            { type: "action", text: "a" },
            {
              type: "if",
              condition: "안쪽",
              thenBody: [{ type: "action", text: "b" }],
              elseBody: [],
            },
          ],
        },
        { type: "output", expr: "결과" },
      ],
    })
    const outer = graph.nodes.find(node => node.data.label === "바깥")
    const inner = graph.nodes.find(node => node.data.label === "안쪽")
    if (!outer || !inner) throw new Error("바깥과 안쪽 판단이 있어야 합니다")

    const next = changeDecisionKind(graph, inner.id, "loop")
    const exit = next.edges.find(edge => edge.source === inner.id && edge.sourceHandle === "no")
    expect(exit?.target).toBe(outer.id)
    expect(exit?.label).toBe("아니오")
    expect(exit?.data?.branch).toBe("loop-back")
    expect(exit?.type).toBe("loop-back")
    // 아니오 꼭짓점(오른쪽)에서 나가므로 오른쪽 통로를 돕니다.
    const graphRight = Math.max(
      ...next.nodes.map(node => node.position.x + NODE_SIZES[node.data.kind].width),
    )
    expect(exit?.data?.routePoints?.[0]?.x).toBe(inner.position.x + NODE_SIZES.decision.width)
    expect(exit?.data?.routePoints?.some(point => point.x > graphRight)).toBe(true)
    expect(pseudocode(next)).toBe(
      ["시작", "  [바깥 반복]", "    a", "    [안쪽 반복]", "      b", "  출력: 결과", "끝"].join(
        "\n",
      ),
    )
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
})
