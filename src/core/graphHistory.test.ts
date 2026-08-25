import { describe, expect, it } from "vitest"
import type { FlowGraph } from "./flowTypes"
import { GraphHistory } from "./graphHistory"

function graph(label: string): FlowGraph {
  return {
    nodes: [
      {
        id: label,
        type: "process",
        position: { x: 0, y: 0 },
        data: { kind: "process", label },
      },
    ],
    edges: [],
  }
}

describe("순서도 undo/redo 이력", () => {
  it("기록한 작업을 undo한 뒤 redo한다", () => {
    const history = new GraphHistory()
    history.record(graph("처음"))

    const previous = history.undo(graph("나중"))
    expect(previous?.nodes[0].data.label).toBe("처음")
    expect(history.redo(previous!)).toEqual(graph("나중"))
  })

  it("undo 뒤 새 작업을 기록하면 redo 이력을 버린다", () => {
    const history = new GraphHistory()
    history.record(graph("A"))
    const previous = history.undo(graph("B"))!

    history.record(previous)
    expect(history.redo(graph("C"))).toBeNull()
  })

  it("저장된 스냅샷을 현재 그래프의 변경으로부터 분리한다", () => {
    const history = new GraphHistory()
    const original = graph("원본")
    history.record(original)
    original.nodes[0].data.label = "변경"

    expect(history.undo(graph("현재"))?.nodes[0].data.label).toBe("원본")
  })
})
