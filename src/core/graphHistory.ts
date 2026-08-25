import type { FlowGraph } from "./flowTypes"

const DEFAULT_HISTORY_LIMIT = 100

/** React Flow 그래프는 일반 객체로만 구성되어 있어 structuredClone으로 안전하게 복사할 수 있습니다. */
export function cloneFlowGraph(graph: FlowGraph): FlowGraph {
  return structuredClone(graph)
}

/**
 * 순서도 편집 이력. 새 작업을 기록하면 redo 이력을 버리고, 오래된 항목부터 제한합니다.
 */
export class GraphHistory {
  private readonly past: FlowGraph[] = []
  private readonly future: FlowGraph[] = []

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  record(graph: FlowGraph): void {
    this.past.push(cloneFlowGraph(graph))
    if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit)
    this.future.length = 0
  }

  undo(current: FlowGraph): FlowGraph | null {
    const previous = this.past.pop()
    if (!previous) return null
    this.future.push(cloneFlowGraph(current))
    return cloneFlowGraph(previous)
  }

  redo(current: FlowGraph): FlowGraph | null {
    const next = this.future.pop()
    if (!next) return null
    this.past.push(cloneFlowGraph(current))
    return cloneFlowGraph(next)
  }

  clear(): void {
    this.past.length = 0
    this.future.length = 0
  }
}
