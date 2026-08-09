import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToFlow } from "./astToFlow"
import { flowToAst, FlowValidationError } from "./flowToAst"

describe("AST와 순서도 그래프 변환", () => {
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
})
