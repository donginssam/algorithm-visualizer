import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToFlow } from "./astToFlow"
import { astToText } from "./astToText"
import { routeEdges } from "./flowEdges"
import { flowToAst } from "./flowToAst"
import { flowToSvg, graphBounds } from "./flowToSvg"
import { parsePseudocode } from "./parser"
import type { AlgorithmFlowNode } from "./flowTypes"
import {
  parseWorkspace,
  restoredFlowGraph,
  serializeWorkspace,
  type Workspace,
} from "./workspaceStore"

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
    // 앱은 AST를 바꿀 때 글도 함께 맞추므로(useAppStore.setProgram) 둘은 짝이 맞습니다.
    const workspace: Workspace = {
      code: astToText(examples[0].program),
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

  describe("저장해 둔 AST", () => {
    const raw = (code: string, program: unknown) =>
      JSON.stringify({ version: 1, code, program, source: "text", nodes: [], edges: [] })

    it("글이 문법에 맞으면 글에서 다시 만든다", () => {
      // 글을 고친 직후 의사코드 반영을 기다리는 동안 창을 닫으면 AST가 한 걸음 뒤처집니다.
      const restored = parseWorkspace(raw("시작\n  입력: 수\n끝", { body: [] }))
      expect(restored?.program).toEqual({ body: [{ type: "input", variable: "수" }] })
    })

    it("글에 문법 오류가 있으면 마지막으로 올바랐던 AST를 쓴다", () => {
      const program = { body: [{ type: "output", expr: "합계" }] }
      expect(parseWorkspace(raw("시작\n  [만약", program))?.program).toEqual(program)
    })

    it("글도 틀리고 AST 모양도 어긋나면 되살리지 않는다", () => {
      expect(parseWorkspace(raw("시작\n  [만약", { body: [{ type: "모름" }] }))).toBeNull()
      expect(
        parseWorkspace(raw("시작\n  [만약", { body: [{ type: "loop", condition: "c" }] })),
      ).toBeNull()
    })

    it("AST 모양이 어긋나도 글이 맞으면 글에서 되살린다", () => {
      const restored = parseWorkspace(raw("시작\n  출력: 합계\n끝", { body: "손상" }))
      expect(restored?.program).toEqual({ body: [{ type: "output", expr: "합계" }] })
    })
  })

  /*
   * 글을 고친 직후 의사코드 반영(300ms)을 기다리는 동안 창을 닫으면, 최신 글과 한 걸음
   * 뒤처진 그래프가 함께 저장됩니다. 그대로 되살리면 편집기와 순서도가 서로 다른
   * 프로그램을 보여 주고, 이어서 순서도를 고치는 순간 낡은 그래프가 최신 글을 덮어씁니다.
   */
  describe("되살릴 순서도", () => {
    /** 앱(FlowCanvas)과 같은 규칙: 되살릴 그래프가 없으면 AST에서 다시 그립니다. */
    const shownGraph = (restored: Workspace) =>
      restoredFlowGraph(restored) ?? astToFlow(restored.program)
    const meaningOf = (graph: { nodes: Workspace["nodes"]; edges: Workspace["edges"] }) =>
      astToText(flowToAst(graph.nodes, graph.edges))

    it("글이 그래프보다 앞서 저장돼도 편집기와 순서도가 같은 프로그램을 보여 준다", () => {
      const previous = parsePseudocode("시작\n  출력: 1\n끝")
      const restored = parseWorkspace(
        serializeWorkspace({
          code: "시작\n  출력: 2\n끝",
          program: previous,
          source: "text",
          ...astToFlow(previous),
        }),
      )!

      expect(astToText(restored.program)).toBe("시작\n  출력: 2\n끝")
      expect(meaningOf(shownGraph(restored))).toBe(astToText(restored.program))
    })

    it("문법 오류가 있는 초안은 그대로 두고, 마지막으로 올바랐던 프로그램을 그린다", () => {
      const lastValid = parsePseudocode("시작\n  출력: 1\n끝")
      const restored = parseWorkspace(
        serializeWorkspace({
          code: "시작\n  [만약",
          program: lastValid,
          source: "text",
          ...astToFlow(lastValid),
        }),
      )!

      expect(restored.code).toBe("시작\n  [만약")
      expect(meaningOf(shownGraph(restored))).toBe("시작\n  출력: 1\n끝")
    })

    it("순서도에서 만들던 그래프는 미연결 기호와 옮긴 자리까지 그대로 되살린다", () => {
      const graph = astToFlow(parsePseudocode("시작\n  출력: 1\n끝"))
      const loose: AlgorithmFlowNode = {
        id: "user-node-1",
        type: "process",
        position: { x: 321, y: 654 },
        data: { kind: "process", label: "아직 잇지 않음" },
      }
      const restored = parseWorkspace(
        serializeWorkspace({
          code: "시작\n  출력: 1\n끝",
          program: { body: [{ type: "output", expr: "1" }] },
          source: "flow",
          nodes: [...graph.nodes, loose],
          edges: graph.edges,
        }),
      )!

      const kept = restoredFlowGraph(restored)?.nodes.find(node => node.id === loose.id)
      expect(kept?.position).toEqual({ x: 321, y: 654 })
    })
  })

  /*
   * 손상된 저장 데이터. 한때는 화살표 경로가 배열이 아닌 값을 그대로 받아, 화면을
   * 맞추는 단계에서 예외가 나며 앱 전체가 하얗게 사라졌습니다. 초기화 버튼까지 함께
   * 사라지고 저장 값은 그대로라, 새로 고칠 때마다 같은 일이 되풀이됐습니다.
   *
   * 정책: 경로(다시 계산되는 캐시)나 없는 기호를 가리키는 화살표처럼 떼어 내면 되는
   * 것은 고쳐서 살리고, 기호 자체가 어긋나면(종류·좌표·중복 id) 빈 화면에서 시작합니다.
   */
  describe("손상된 저장 데이터", () => {
    const base = astToFlow(parsePseudocode("시작\n  출력: 1\n끝"))
    /** 정상 저장값에서 한 부분만 바꾼 원시 JSON. 무한대는 1e999로 넣습니다. */
    const rawWith = (patch: (value: Record<string, unknown>) => void) => {
      const value = JSON.parse(
        serializeWorkspace({
          code: "시작\n  출력: 1\n끝",
          program: { body: [{ type: "output", expr: "1" }] },
          source: "flow",
          ...base,
        }),
      )
      patch(value)
      return JSON.stringify(value)
    }
    /** 되살린 그래프로 화면을 그리고 맞추고 PNG를 만드는 단계까지 돌려 봅니다. */
    const renderAll = (restored: Workspace) => {
      const edges = routeEdges(restored.nodes, restored.edges)
      graphBounds(restored.nodes, edges)
      flowToSvg(restored.nodes, edges)
    }

    it("없는 기호를 가리키는 화살표는 떼어 내고 나머지를 살린다", () => {
      const restored = parseWorkspace(
        rawWith(value => {
          ;(value.edges as unknown[]).push({
            id: "bad",
            source: "missing",
            target: "terminal-start",
            data: { routePoints: {} },
          })
        }),
      )!
      expect(restored.edges.map(edge => edge.id)).toEqual(base.edges.map(edge => edge.id))
      expect(restored.nodes).toHaveLength(base.nodes.length)
      expect(() => renderAll(restored)).not.toThrow()
    })

    it.each([
      ["배열이 아닌 값", {}],
      ["좌표가 빠진 점", [{ x: 1 }]],
      ["무한대 좌표", "INFINITY"],
    ])("경로가 %s이면 경로만 지우고 화살표는 살린다", (_, routePoints) => {
      const raw = rawWith(value => {
        ;(value.edges as Array<{ data: Record<string, unknown> }>)[0].data.routePoints =
          routePoints === "INFINITY" ? [{ x: 0, y: "INFINITY" }] : routePoints
      }).replace('"INFINITY"', "1e999")
      const restored = parseWorkspace(raw)!
      expect(restored.edges).toHaveLength(base.edges.length)
      expect(restored.edges[0].data?.routePoints).toBeUndefined()
      expect(() => renderAll(restored)).not.toThrow()
    })

    it.each([
      ["알 수 없는 종류", (n: Record<string, any>) => (n.data.kind = "모름")],
      ["렌더링 타입과 맞지 않는 종류", (n: Record<string, any>) => (n.type = "decision")],
      ["무한대 좌표", (n: Record<string, any>) => (n.position.x = "INFINITY")],
      ["잘못된 단말 역할", (n: Record<string, any>) => (n.data.terminalRole = "중간")],
    ])("기호에 %s가 있으면 되살리지 않는다", (_, breakNode) => {
      const raw = rawWith(value => breakNode((value.nodes as Record<string, any>[])[0])).replace(
        '"INFINITY"',
        "1e999",
      )
      expect(parseWorkspace(raw)).toBeNull()
    })

    it("같은 id가 둘이면 되살리지 않는다", () => {
      expect(
        parseWorkspace(
          rawWith(value => (value.nodes as unknown[]).push((value.nodes as unknown[])[0])),
        ),
      ).toBeNull()
      expect(
        parseWorkspace(
          rawWith(value => (value.edges as unknown[]).push((value.edges as unknown[])[0])),
        ),
      ).toBeNull()
    })

    it("아직 잇지 않은 기호가 있는 미완성 순서도는 손상으로 보지 않는다", () => {
      const restored = parseWorkspace(
        rawWith(value => {
          ;(value.nodes as unknown[]).push({
            id: "user-node-1",
            type: "process",
            position: { x: 10, y: 10 },
            data: { kind: "process", label: "처리할 내용" },
          })
        }),
      )!
      expect(restored.nodes).toHaveLength(base.nodes.length + 1)
      expect(() => renderAll(restored)).not.toThrow()
    })
  })
})
