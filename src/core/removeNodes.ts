import { findJunction, findIsolatedCompanion } from "./graphTopology"
import type { FlowGraph } from "./flowTypes"

/**
 * 기호를 지웁니다. 판단 기호를 지우면 짝인 합류 기호도 함께 지웁니다.
 *
 * 합류 기호는 조건 분기의 두 갈래가 다시 만나는 자리로, 판단 기호 없이는 뜻이
 * 없습니다. 판단만 지우면 합류 기호가 홀로 남아 "연결이 끊겨 있어요"가 뜨고 학생이
 * 따로 지워야 합니다. 연결되지 않은 짝은 `<판단 id>-junction` 규칙으로 찾고,
 * 연결된 조건 분기는 두 갈래가 처음 만나는 합류점을 찾습니다. 다른 판단의 짝이나
 * 외부 입력이 있는 공유 합류점은 보존합니다. 반복은 연결되지 않은 짝만 지웁니다.
 *
 * 원본 연결로 삭제 대상을 모두 결정한 뒤, 요청한 화살표와 삭제 노드에 닿은 선을
 * 한 번에 지웁니다. 노드·화살표 동시 선택이 합류점 탐색에 영향을 주지 않습니다.
 */
export function removeNodes(
  graph: FlowGraph,
  ids: Iterable<string>,
  edgeIds: Iterable<string> = [],
): FlowGraph {
  const removing = new Set(ids)
  const removingEdges = new Set(edgeIds)

  for (const id of [...removing]) {
    const node = graph.nodes.find(candidate => candidate.id === id)
    if (!node || node.data.kind !== "decision") continue

    const companion = findIsolatedCompanion(graph, id)
    if (companion) {
      removing.add(companion)
      continue
    }

    if (node.data.controlKind !== "loop") {
      const junctionId = findJunction(graph, id)
      if (junctionId) removing.add(junctionId)
    }
  }

  return {
    nodes: graph.nodes.filter(node => !removing.has(node.id)),
    edges: graph.edges.filter(
      edge =>
        !removingEdges.has(edge.id) && !removing.has(edge.source) && !removing.has(edge.target),
    ),
  }
}
