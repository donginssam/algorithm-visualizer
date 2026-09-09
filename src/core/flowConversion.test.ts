import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import type { Program } from "./ast"
import { astToFlow } from "./astToFlow"
import { branchSide, NODE_SIZES } from "./nodeGeometry"
import { flowToAst, FlowValidationError } from "./flowToAst"

describe("AST와 순서도 그래프 변환", () => {
  const branchBodies: Program["body"][] = [
    [{ type: "action", text: "처리" }],
    [{ type: "if", condition: "안쪽", thenBody: [{ type: "action", text: "참" }], elseBody: [] }],
    [
      {
        type: "if",
        condition: "안쪽",
        thenBody: [
          { type: "action", text: "첫째" },
          { type: "action", text: "둘째" },
        ],
        elseBody: [{ type: "action", text: "거짓" }],
      },
    ],
    [{ type: "loop", condition: "반복", body: [{ type: "action", text: "본문" }] }],
  ]

  it.each(
    branchBodies.flatMap((thenBody, i) =>
      branchBodies.map((elseBody, j) => ({ thenBody, elseBody, name: `${i}-${j}` })),
    ),
  )("중첩 분기 $name의 노드가 겹치지 않고 복원된다", ({ thenBody, elseBody }) => {
    const program: Program = { body: [{ type: "if", condition: "바깥", thenBody, elseBody }] }
    const graph = astToFlow(program)
    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
    for (const [index, node] of graph.nodes.entries()) {
      const size = NODE_SIZES[node.data.kind]
      for (const other of graph.nodes.slice(index + 1)) {
        const otherSize = NODE_SIZES[other.data.kind]
        const overlaps =
          node.position.x < other.position.x + otherSize.width &&
          other.position.x < node.position.x + size.width &&
          node.position.y < other.position.y + otherSize.height &&
          other.position.y < node.position.y + size.height
        expect(overlaps, `${node.id} / ${other.id}`).toBe(false)
      }
    }
  })

  const sizes = {
    terminal: { width: 172, height: 64 },
    input: { width: 190, height: 76 },
    output: { width: 190, height: 76 },
    process: { width: 190, height: 72 },
    decision: { width: 220, height: 124 },
    junction: { width: 18, height: 18 },
  } as const

  const pathsIntersect = (
    first: Array<{ x: number; y: number }>,
    second: Array<{ x: number; y: number }>,
  ) => {
    const between = (value: number, a: number, b: number) =>
      value >= Math.min(a, b) && value <= Math.max(a, b)
    const segments = (points: Array<{ x: number; y: number }>) =>
      points.slice(1).map((point, index) => ({ from: points[index], to: point }))

    return segments(first).some(a =>
      segments(second).some(b => {
        const aVertical = a.from.x === a.to.x
        const bVertical = b.from.x === b.to.x
        if (aVertical && bVertical) {
          return (
            a.from.x === b.from.x &&
            Math.max(Math.min(a.from.y, a.to.y), Math.min(b.from.y, b.to.y)) <=
              Math.min(Math.max(a.from.y, a.to.y), Math.max(b.from.y, b.to.y))
          )
        }
        if (!aVertical && !bVertical) {
          return (
            a.from.y === b.from.y &&
            Math.max(Math.min(a.from.x, a.to.x), Math.min(b.from.x, b.to.x)) <=
              Math.min(Math.max(a.from.x, a.to.x), Math.max(b.from.x, b.to.x))
          )
        }

        const vertical = aVertical ? a : b
        const horizontal = aVertical ? b : a
        return (
          between(vertical.from.x, horizontal.from.x, horizontal.to.x) &&
          between(horizontal.from.y, vertical.from.y, vertical.to.y)
        )
      }),
    )
  }

  it.each(examples)("$title 예제를 그래프로 바꾸고 다시 복원한다", ({ program }) => {
    const graph = astToFlow(program)
    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
  })

  it("일반 동작을 처리 직사각형으로 바꾸고 다시 복원한다", () => {
    const program = {
      body: [
        { type: "action" as const, text: "물을 끓인다." },
        { type: "action" as const, text: "3분 동안 기다린다." },
      ],
    }
    const graph = astToFlow(program)

    expect(
      graph.nodes.filter(node => node.data.kind === "process").map(node => node.data.label),
    ).toEqual(["물을 끓인다.", "3분 동안 기다린다."])
    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
  })

  it("처리 기호에 ←가 있으면 대입으로 읽고 불완전한 대입은 오류로 안내한다", () => {
    const graph = astToFlow({ body: [{ type: "action", text: "물을 끓인다." }] })
    const process = graph.nodes.find(node => node.data.kind === "process")
    if (!process) throw new Error("처리 기호가 있어야 합니다")

    const assignmentNodes = graph.nodes.map(node =>
      node.id === process.id ? { ...node, data: { ...node.data, label: "냄비 ← 물" } } : node,
    )
    expect(flowToAst(assignmentNodes, graph.edges)).toEqual({
      body: [{ type: "assign", target: "냄비", expr: "물" }],
    })

    const invalidNodes = graph.nodes.map(node =>
      node.id === process.id ? { ...node, data: { ...node.data, label: "냄비 ←" } } : node,
    )
    expect(() => flowToAst(invalidNodes, graph.edges)).toThrow("변수 ← 식")
  })

  it("연결이 끊긴 기호를 친절하게 안내한다", () => {
    const graph = astToFlow(examples[0].program)
    const brokenEdges = graph.edges.filter(edge => edge.target !== "terminal-end")
    expect(() => flowToAst(graph.nodes, brokenEdges)).toThrow(FlowValidationError)
    expect(() => flowToAst(graph.nodes, brokenEdges)).toThrow("연결이 끊겨")
  })

  it("중첩된 반복과 조건 분기도 그래프에서 복원한다", () => {
    const program = {
      body: [
        {
          type: "loop" as const,
          condition: "수가 10보다 작을 동안",
          body: [
            {
              type: "if" as const,
              condition: "수가 짝수이면",
              thenBody: [{ type: "output" as const, expr: "수" }],
              elseBody: [{ type: "assign" as const, target: "수", expr: "수 + 1" }],
            },
          ],
        },
      ],
    }
    const graph = astToFlow(program)

    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
    expect(graph.edges.some(edge => edge.type === "loop-back")).toBe(true)
  })

  // 처음 화면에 올라오는 상태입니다.
  it("본문이 비어 있으면 시작 기호만 놓는다", () => {
    const graph = astToFlow({ body: [] })

    expect(graph.nodes.map(node => node.data.label)).toEqual(["시작"])
    expect(graph.edges).toHaveLength(0)
    expect(flowToAst(graph.nodes, graph.edges)).toEqual({ body: [] })
  })

  it("끝 기호 없이 기호만 이어 놓으면 끝을 놓으라고 안내한다", () => {
    const graph = astToFlow({ body: [{ type: "output", expr: "수" }] })
    const withoutEnd = graph.nodes.filter(node => node.data.terminalRole !== "end")
    const keptEdges = graph.edges.filter(edge => edge.target !== "terminal-end")

    expect(() => flowToAst(withoutEnd, keptEdges)).toThrow(FlowValidationError)
    expect(() => flowToAst(withoutEnd, keptEdges)).toThrow("'끝' 기호를 놓고")
  })

  it("내용이 비어 있는 반복과 예 흐름을 허용하지 않는다", () => {
    const emptyLoop = astToFlow({ body: [{ type: "loop", condition: "계속", body: [] }] })
    const emptyThen = astToFlow({
      body: [{ type: "if", condition: "조건", thenBody: [], elseBody: [] }],
    })

    expect(() => flowToAst(emptyLoop.nodes, emptyLoop.edges)).toThrow(FlowValidationError)
    expect(() => flowToAst(emptyThen.nodes, emptyThen.edges)).toThrow("'예' 흐름")
  })

  it("중복된 기호 ID를 잘못된 그래프로 안내한다", () => {
    const graph = astToFlow({ body: [] })
    const duplicate = { ...graph.nodes[0] }

    expect(() => flowToAst([...graph.nodes, duplicate], graph.edges)).toThrow("같은 기호")
  })

  it.each(examples)("$title 판단 기호는 예가 왼쪽, 아니오가 오른쪽에서 나간다", ({ program }) => {
    const graph = astToFlow(program)
    const decisions = graph.nodes.filter(node => node.data.kind === "decision")
    expect(decisions.length).toBeGreaterThan(0)

    for (const decision of decisions) {
      const left = decision.position.x
      const right = left + sizes.decision.width
      const middle = decision.position.y + sizes.decision.height / 2
      const branches = graph.edges.filter(
        edge =>
          edge.source === decision.id &&
          (edge.data?.branch === "yes" || edge.data?.branch === "no"),
      )
      expect(branches).toHaveLength(2)

      for (const edge of branches) {
        const start = edge.data?.routePoints?.[0]
        const turn = edge.data?.routePoints?.[1]
        // 좌우 꼭짓점(높이의 한가운데)에서 나가야 합니다.
        expect(start?.y).toBe(middle)
        expect(start?.x).toBe(edge.data?.branch === "yes" ? left : right)
        // 나간 방향이 그대로 유지되어야 도형을 가로지르지 않습니다.
        expect(start!.x === left ? turn!.x <= left : turn!.x >= right).toBe(true)
      }
    }
  })

  it("조건과 반복 모두 예는 왼쪽, 아니오는 오른쪽에서 나간다", () => {
    expect(branchSide("yes")).toBe("left")
    expect(branchSide("no")).toBe("right")
  })

  it("아니오 본문이 없는 조건도 예는 왼쪽, 아니오는 오른쪽에서 출발한다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "if",
          condition: "물이 끓으면",
          thenBody: [{ type: "action", text: "불을 끈다." }],
          elseBody: [],
        },
      ],
    })
    const decision = graph.nodes.find(node => node.data.kind === "decision")
    if (!decision) throw new Error("판단 기호가 있어야 합니다")

    const left = decision.position.x
    const right = left + sizes.decision.width
    const branchStartX = (branch: "yes" | "no") =>
      graph.edges.find(edge => edge.source === decision.id && edge.data?.branch === branch)?.data
        ?.routePoints?.[0]?.x

    expect(branchStartX("yes")).toBe(left)
    expect(branchStartX("no")).toBe(right)
  })

  it.each([
    {
      title: "조건 분기",
      program: {
        body: [
          {
            type: "if" as const,
            condition: "물이 끓으면",
            thenBody: [{ type: "action" as const, text: "면을 넣는다." }],
            elseBody: [{ type: "action" as const, text: "더 끓인다." }],
          },
        ],
      },
      controlKind: "if",
    },
    {
      title: "반복 판단",
      program: {
        body: [
          {
            type: "loop" as const,
            condition: "물이 끓을 때까지",
            body: [{ type: "action" as const, text: "물을 가열한다." }],
          },
          { type: "action" as const, text: "불을 끈다." },
        ],
      },
      controlKind: "loop",
    },
    /*
     * 아래 세 모양은 dagre의 `constraints`가 조용히 무시되는 자리입니다.
     * 배치가 끝난 뒤 좌우를 바로잡지 않으면 '예' 본문이 오른쪽에 놓여,
     * 왼쪽으로 나간 '예' 화살표가 되돌아오며 '아니오'와 교차합니다.
     */
    {
      title: "예 본문이 더 긴 조건 분기",
      program: {
        body: [
          {
            type: "if" as const,
            condition: "물이 끓으면",
            thenBody: [
              { type: "action" as const, text: "면을 넣는다." },
              { type: "action" as const, text: "젓는다." },
              { type: "action" as const, text: "불을 줄인다." },
            ],
            elseBody: [{ type: "action" as const, text: "더 끓인다." }],
          },
        ],
      },
      controlKind: "if",
    },
    {
      title: "아니면 본문이 없는 조건 분기",
      program: {
        body: [
          {
            type: "if" as const,
            condition: "물이 끓으면",
            thenBody: [{ type: "action" as const, text: "불을 끈다." }],
            elseBody: [],
          },
          { type: "action" as const, text: "그릇에 담는다." },
        ],
      },
      controlKind: "if",
    },
    {
      title: "반복 안의 조건 분기",
      program: {
        body: [
          {
            type: "loop" as const,
            condition: "재료가 남아 있을 때까지",
            body: [
              {
                type: "if" as const,
                condition: "재료가 크면",
                thenBody: [{ type: "action" as const, text: "자른다." }],
                elseBody: [],
              },
            ],
          },
        ],
      },
      controlKind: "if",
    },
  ])("$title의 예 본문은 왼쪽, 아니오 본문은 오른쪽에 배치한다", ({ program, controlKind }) => {
    const graph = astToFlow(program)
    const decision = graph.nodes.find(
      node => node.data.kind === "decision" && node.data.controlKind === controlKind,
    )
    if (!decision) throw new Error("판단 기호가 있어야 합니다")

    const yesEdge = graph.edges.find(
      edge => edge.source === decision.id && edge.data?.branch === "yes",
    )
    const noEdge = graph.edges.find(
      edge => edge.source === decision.id && edge.data?.branch === "no",
    )
    const yesTarget = graph.nodes.find(node => node.id === yesEdge?.target)
    const noTarget = graph.nodes.find(node => node.id === noEdge?.target)
    if (!yesTarget || !noTarget) throw new Error("두 갈래의 첫 기호가 있어야 합니다")

    const centerX = (node: (typeof graph.nodes)[number]) =>
      node.position.x + sizes[node.data.kind].width / 2
    expect(centerX(yesTarget)).toBeLessThan(centerX(noTarget))
  })

  /*
   * 갈래 전체의 평균 위치로 뒤집힘을 판단하면 틀리는 두 모양입니다. 첫 기호는
   * 제자리인데 뒤쪽 기호가 반대편이라 뒤집어 버리거나(연달은 반복), 첫 기호가
   * 반대편인데 안쪽 반복 본문이 평균을 끌어당겨 지나칩니다(조건 안의 조건).
   */
  it.each([
    {
      title: "연달은 반복",
      program: {
        body: [
          {
            type: "loop" as const,
            condition: "첫째",
            body: ["a", "b", "c"].map(text => ({ type: "action" as const, text })),
          },
          {
            type: "loop" as const,
            condition: "둘째",
            body: ["d", "e", "f"].map(text => ({ type: "action" as const, text })),
          },
          {
            type: "loop" as const,
            condition: "셋째",
            body: [{ type: "action" as const, text: "g" }],
          },
          {
            type: "loop" as const,
            condition: "넷째",
            body: ["h", "i"].map(text => ({ type: "action" as const, text })),
          },
        ],
      },
    },
    {
      title: "조건의 예 갈래 안에 조건과 반복이 든 경우",
      program: {
        body: [
          { type: "action" as const, text: "준비한다." },
          {
            type: "if" as const,
            condition: "바깥 조건",
            thenBody: [
              {
                type: "if" as const,
                condition: "안쪽 조건",
                thenBody: [
                  { type: "input" as const, variable: "수" },
                  { type: "action" as const, text: "기록한다." },
                ],
                elseBody: [
                  {
                    type: "loop" as const,
                    condition: "첫 반복",
                    body: [
                      { type: "assign" as const, target: "합", expr: "1" },
                      { type: "action" as const, text: "더한다." },
                    ],
                  },
                  {
                    type: "loop" as const,
                    condition: "둘째 반복",
                    body: [{ type: "action" as const, text: "센다." }],
                  },
                ],
              },
            ],
            elseBody: [{ type: "action" as const, text: "건너뛴다." }],
          },
        ],
      },
    },
  ])(
    "$title에서도 모든 판단의 예 첫 기호는 마름모 왼쪽, 아니오 첫 기호는 그보다 오른쪽이다",
    ({ program }) => {
      const graph = astToFlow(program)
      const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
      const centerX = (id: string) => {
        const node = nodesById.get(id)
        if (!node) throw new Error(`${id} 기호가 있어야 합니다`)
        return node.position.x + NODE_SIZES[node.data.kind].width / 2
      }

      const decisions = graph.nodes.filter(node => node.data.kind === "decision")
      expect(decisions.length).toBeGreaterThan(3)
      for (const decision of decisions) {
        const yes = graph.edges.find(
          edge => edge.source === decision.id && edge.sourceHandle === "yes",
        )
        const no = graph.edges.find(
          edge => edge.source === decision.id && edge.sourceHandle === "no",
        )
        if (!yes || !no) throw new Error(`${decision.data.label}에 예/아니오가 있어야 합니다`)

        // 예 첫 기호가 마름모보다 오른쪽이면 왼쪽 꼭짓점에서 나간 선이 되돌아옵니다.
        expect(centerX(yes.target), decision.data.label).toBeLessThanOrEqual(centerX(decision.id))
        expect(centerX(yes.target), decision.data.label).toBeLessThan(centerX(no.target))
      }
    },
  )

  it("중첩 반복의 오른쪽 복귀선이 같은 높이의 끝 기호를 지나지 않는다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "loop",
          condition: "바깥 반복",
          body: [
            { type: "action", text: "바깥 처리" },
            {
              type: "loop",
              condition: "안쪽 반복",
              body: [{ type: "action", text: "안쪽 처리" }],
            },
          ],
        },
        { type: "output", expr: "결과" },
      ],
    })
    const inner = graph.nodes.find(node => node.data.label === "안쪽 반복")
    if (!inner) throw new Error("안쪽 반복 판단이 있어야 합니다")
    const back = graph.edges.find(edge => edge.source === inner.id && edge.sourceHandle === "no")
    const route = back?.data?.routePoints
    if (!route) throw new Error("아니오 복귀선에 경로가 있어야 합니다")

    // 경로의 어느 선분도 출발·도착이 아닌 기호 상자를 지나면 안 됩니다.
    for (const node of graph.nodes) {
      if (node.id === back?.source || node.id === back?.target) continue
      const size = NODE_SIZES[node.data.kind]
      const hit = route.slice(1).some((point, index) => {
        const previous = route[index]
        return (
          Math.max(previous.x, point.x) > node.position.x &&
          Math.min(previous.x, point.x) < node.position.x + size.width &&
          Math.max(previous.y, point.y) > node.position.y &&
          Math.min(previous.y, point.y) < node.position.y + size.height
        )
      })
      expect(hit, `${node.data.label} 기호를 지납니다`).toBe(false)
    }
  })

  it("반복 본문이 또 다른 반복으로 끝나도 안쪽 판단의 아니오가 남는다", () => {
    const program: Program = {
      body: [
        {
          type: "loop",
          condition: "바깥이 참일 때까지",
          body: [
            {
              type: "loop",
              condition: "안쪽이 참일 때까지",
              body: [{ type: "action", text: "한 걸음 간다." }],
            },
          ],
        },
      ],
    }
    const graph = astToFlow(program)
    const inner = graph.nodes.find(
      node => node.data.kind === "decision" && node.data.label === "안쪽이 참일 때까지",
    )
    if (!inner) throw new Error("안쪽 반복 판단이 있어야 합니다")

    // 안쪽 반복의 '아니오'는 바깥 반복으로 되돌아가는 복귀선이지만,
    // 아니오 꼭짓점에서 나가고 라벨도 그대로여야 합니다.
    const exit = graph.edges.find(edge => edge.source === inner.id && edge.sourceHandle === "no")
    expect(exit?.label).toBe("아니오")
    expect(exit?.data?.branch).toBe("loop-back")

    // 판단 기호에는 아래쪽 연결점이 없으므로 갈래 화살표만 나가야 합니다.
    const handles = graph.edges
      .filter(edge => edge.source === inner.id)
      .map(edge => edge.sourceHandle)
    expect(handles.sort()).toEqual(["no", "yes"])

    // 그래서 의사코드로도 그대로 되돌아옵니다.
    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
  })

  it("반복 복귀선은 왼쪽 통로를 사용해 오른쪽 아니오 진행선과 교차하지 않는다", () => {
    const graph = astToFlow({
      body: [
        {
          type: "loop",
          condition: "물이 끓을 때까지",
          body: [{ type: "action", text: "물을 가열한다." }],
        },
        { type: "action", text: "불을 끈다." },
      ],
    })
    const decision = graph.nodes.find(
      node => node.data.kind === "decision" && node.data.controlKind === "loop",
    )
    if (!decision) throw new Error("반복 판단 기호가 있어야 합니다")

    const noPath = graph.edges.find(
      edge => edge.source === decision.id && edge.data?.branch === "no",
    )?.data?.routePoints
    const loopPath = graph.edges.find(edge => edge.data?.branch === "loop-back")?.data?.routePoints
    if (!noPath || !loopPath) throw new Error("반복의 진행선과 복귀선이 있어야 합니다")

    const graphLeft = Math.min(...graph.nodes.map(node => node.position.x))
    expect(Math.min(...loopPath.map(point => point.x))).toBeLessThan(graphLeft)
    expect(pathsIntersect(loopPath, noPath)).toBe(false)
  })

  it("같은 종류의 기호도 서로 다른 위치에 자동 배치한다", () => {
    const graph = astToFlow(examples[0].program)
    const positions = graph.nodes.map(node => `${node.position.x}:${node.position.y}`)

    expect(new Set(positions).size).toBe(graph.nodes.length)
    expect(graph.edges.every(edge => (edge.data?.routePoints?.length ?? 0) >= 2)).toBe(true)
  })

  // 예제 두 개에 더해, 판단 기호가 겹쳐 나오는 중첩 구조까지 확인합니다.
  const routingCases = [
    ...examples.map(example => ({ title: example.title, program: example.program })),
    {
      title: "반복 안의 조건 분기",
      program: {
        body: [
          {
            type: "loop" as const,
            condition: "수가 10보다 작을 동안",
            body: [
              {
                type: "if" as const,
                condition: "수가 짝수이면",
                thenBody: [{ type: "output" as const, expr: "수" }],
                elseBody: [{ type: "assign" as const, target: "수", expr: "수 + 1" }],
              },
            ],
          },
        ],
      },
    },
  ]

  it.each(routingCases)("$title 화살표가 다른 기호의 내부를 지나지 않는다", ({ program }) => {
    const graph = astToFlow(program)
    const crossesInterior = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      node: (typeof graph.nodes)[number],
    ) => {
      const size = sizes[node.data.kind]
      const left = node.position.x
      const right = left + size.width
      const top = node.position.y
      const bottom = top + size.height

      if (Math.abs(start.x - end.x) < 0.01) {
        return (
          start.x > left &&
          start.x < right &&
          Math.max(start.y, end.y) > top &&
          Math.min(start.y, end.y) < bottom
        )
      }
      if (Math.abs(start.y - end.y) < 0.01) {
        return (
          start.y > top &&
          start.y < bottom &&
          Math.max(start.x, end.x) > left &&
          Math.min(start.x, end.x) < right
        )
      }
      return true
    }

    for (const edge of graph.edges) {
      const points = edge.data?.routePoints ?? []
      const otherNodes = graph.nodes.filter(
        node => node.id !== edge.source && node.id !== edge.target,
      )
      for (let index = 1; index < points.length; index += 1) {
        expect(
          otherNodes.some(node => crossesInterior(points[index - 1], points[index], node)),
        ).toBe(false)
      }
    }
  })
})
