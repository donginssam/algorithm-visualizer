import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToFlow } from "./astToFlow"
import { flowToAst, FlowValidationError } from "./flowToAst"

describe("AST와 순서도 그래프 변환", () => {
  const sizes = {
    terminal: { width: 172, height: 64 },
    input: { width: 190, height: 76 },
    output: { width: 190, height: 76 },
    process: { width: 190, height: 72 },
    decision: { width: 220, height: 124 },
    junction: { width: 18, height: 18 },
  } as const

  it.each(examples)("$title 예제를 그래프로 바꾸고 다시 복원한다", ({ program }) => {
    const graph = astToFlow(program)
    expect(flowToAst(graph.nodes, graph.edges)).toEqual(program)
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
  it("본문이 비어 있어도 시작과 끝을 이어 놓는다", () => {
    const graph = astToFlow({ body: [] })

    expect(graph.nodes.map(node => node.data.label)).toEqual(["시작", "끝"])
    expect(graph.edges).toHaveLength(1)
    expect(flowToAst(graph.nodes, graph.edges)).toEqual({ body: [] })
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

  it("같은 종류의 기호도 서로 다른 위치에 자동 배치한다", () => {
    const graph = astToFlow(examples[0].program)
    const positions = graph.nodes.map(node => `${node.position.x}:${node.position.y}`)

    expect(new Set(positions).size).toBe(graph.nodes.length)
    expect(graph.edges.every(edge => (edge.data?.routePoints?.length ?? 0) >= 2)).toBe(true)
  })

  it.each(examples)("$title 화살표가 다른 기호의 내부를 지나지 않는다", ({ program }) => {
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
        return start.x > left && start.x < right
          && Math.max(start.y, end.y) > top
          && Math.min(start.y, end.y) < bottom
      }
      if (Math.abs(start.y - end.y) < 0.01) {
        return start.y > top && start.y < bottom
          && Math.max(start.x, end.x) > left
          && Math.min(start.x, end.x) < right
      }
      return true
    }

    for (const edge of graph.edges) {
      const points = edge.data?.routePoints ?? []
      const otherNodes = graph.nodes.filter(node => node.id !== edge.source && node.id !== edge.target)
      for (let index = 1; index < points.length; index += 1) {
        expect(otherNodes.some(node => crossesInterior(points[index - 1], points[index], node))).toBe(false)
      }
    }
  })
})
