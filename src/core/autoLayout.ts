import { layoutFlowGraph, type BranchGroup } from "./astToFlow"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, FlowGraph } from "./flowTypes"
import { edgesBySource, reachableFrom } from "./graphTopology"

/**
 * 화면에서 직접 만든 순서도를 자동 배치합니다.
 *
 * 의사코드에서 그릴 때는 `astToFlow`가 그래프를 만들면서 어느 기호가 어느 갈래인지
 * 적어 두지만, 학생이 캔버스에서 직접 이어 붙인 그래프에는 그 기록이 없습니다.
 * 그래서 화살표를 따라가 갈래를 되짚은 뒤 같은 배치 규칙을 적용합니다.
 *
 * 기호 id를 그대로 두는 것이 중요합니다. 의사코드로 되돌렸다가 다시 그리면
 * 아직 잇지 않은 기호가 사라지는데, 만드는 도중에 자동 배치를 누르는 일이야말로
 * 가장 흔하기 때문입니다.
 */
export function autoLayoutGraph(graph: FlowGraph): FlowGraph {
  return layoutFlowGraph(graph, deriveBranchGroups(graph.nodes, graph.edges))
}

/**
 * 화살표를 따라가 판단마다 '예'와 '아니오' 갈래에 속한 기호를 모읍니다.
 *
 * 두 갈래가 다시 만나는 지점부터는 어느 쪽도 아니므로, 양쪽에서 모두 닿는 기호는
 * 빼고 갈래에만 속한 기호를 남깁니다. 그래야 '아니면'이 빈 조건에서 합류점
 * 아래의 나머지 순서도까지 통째로 뒤집히지 않습니다.
 *
 * 반복은 '아니오'가 반복을 빠져나가 그 뒤의 순서도로 이어지므로 `astToFlow`와
 * 같이 본문만 한쪽 갈래로 봅니다.
 */
export function deriveBranchGroups(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): BranchGroup[] {
  const outgoing = edgesBySource(edges)

  return nodes.flatMap(node => {
    if (node.data.kind !== "decision") return []

    // 갈래를 따라가다 판단 기호로 되돌아오면 멈춥니다(반복 본문).
    const stopAtDecision = new Set([node.id])
    const branches = outgoing.get(node.id) ?? []
    const yesTarget = branches.find(edge => edge.sourceHandle === "yes")?.target
    if (!yesTarget) return []

    const yes = reachableFrom(yesTarget, outgoing, stopAtDecision)
    if (node.data.controlKind === "loop") {
      return [{ decisionId: node.id, yes: [...yes], no: [] }]
    }

    const noTarget = branches.find(edge => edge.sourceHandle === "no")?.target
    if (!noTarget) return []
    const no = reachableFrom(noTarget, outgoing, stopAtDecision)

    return [
      {
        decisionId: node.id,
        yes: [...yes].filter(id => !no.has(id)),
        no: [...no].filter(id => !yes.has(id)),
      },
    ]
  })
}
