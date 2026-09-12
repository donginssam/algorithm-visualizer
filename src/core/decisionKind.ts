import { sizeOf } from "./nodeGeometry"
import { edgeAppearance, loopBackRoute } from "./flowEdges"
import {
  createJunctionNode,
  edgesBySource,
  findJunction,
  findIsolatedCompanion,
  junctionIdOf,
  junctionPosition,
  reachableFrom,
} from "./graphTopology"
import { removeNodes } from "./removeNodes"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, ControlKind, FlowGraph } from "./flowTypes"

/**
 * 판단 기호를 조건 분기 ↔ 반복으로 바꿉니다.
 *
 * 두 종류는 흐름의 짜임이 통째로 다릅니다.
 *
 * - 조건 분기: 예와 아니오가 갈라졌다가 합류점에서 다시 만나고, 합류점 뒤로 흐름이 이어집니다.
 * - 반복: 예 본문이 판단으로 되돌아오고, 아니오가 반복을 빠져나온 뒤의 흐름이 됩니다.
 *
 * 반복으로 바꾸면 합류점과 그 연결선을 삭제합니다. 본문은 보존하며 사용자가
 * 반복 흐름을 다시 연결합니다. 조건으로 바꿀 때는 기존 반복 연결을 합류점으로 옮깁니다.
 *
 * 아직 만드는 중이라 옮길 선이 없어도 조건 분기로 바꿀 때는 짝 합류점을 준비합니다.
 */
export function changeDecisionKind(
  graph: FlowGraph,
  decisionId: string,
  controlKind: ControlKind,
): FlowGraph {
  const decision = graph.nodes.find(node => node.id === decisionId)
  if (!decision || decision.data.kind !== "decision") return graph

  const nodes = graph.nodes.map(node =>
    node.id === decisionId ? { ...node, data: { ...node.data, controlKind } } : node,
  )
  const graphWithKind = { nodes, edges: graph.edges }

  return controlKind === "loop"
    ? toLoop(graphWithKind, decisionId)
    : toIf(graphWithKind, decisionId)
}

/**
 * 판단과 짝으로 놓였지만 아직 어디에도 이어지지 않은 합류 기호.
 *
 * 팔레트에서 판단 기호를 놓으면 조건 분기용 합류 기호가 함께 생깁니다. 학생이 그것을
 * 잇기 전에 판단을 반복으로 바꾸면 쓸모없는 기호가 남아 "연결이 끊겨 있어요"가 뜨고,
 * 다시 조건으로 바꾸면 같은 id의 합류 기호가 이미 있다고 보고 아무것도 하지 않게
 * 됩니다. 두 방향 모두 이 기호를 알아보고 처리합니다.
 */
function danglingJunction(graph: FlowGraph, decisionId: string): AlgorithmFlowNode | undefined {
  const id = findIsolatedCompanion(graph, decisionId)
  return id ? graph.nodes.find(node => node.id === id) : undefined
}

function asPlainEdge(edge: AlgorithmFlowEdge, target: string): AlgorithmFlowEdge {
  const exit =
    edge.sourceHandle === "yes" || edge.sourceHandle === "no" ? edge.sourceHandle : "next"
  return {
    ...edge,
    target,
    ...edgeAppearance(exit, edge.sourceHandle),
    data: { ...edge.data, branch: exit, routePoints: undefined },
  }
}

/** 조건 분기 → 반복: 짝 합류점과 닿아 있는 모든 선을 삭제하고 본문은 보존합니다. */
function toLoop(graph: FlowGraph, decisionId: string): FlowGraph {
  // 생성 시 짝 ID가 있으면 연결 상태와 무관하게 제거합니다.
  const companion = graph.nodes.find(
    node => node.id === junctionIdOf(decisionId) && node.data.kind === "junction",
  )
  const junctionId = companion?.id ?? findJunction(graph, decisionId)
  return junctionId ? removeNodes(graph, [junctionId]) : graph
}

/**
 * 반복 → 조건 분기.
 *
 * 판단으로 되돌아오던 복귀선을 합류점으로 보내고, 아니오도 합류점을 지나도록
 * 바꾼 뒤 합류점에서 원래의 다음 기호로 잇습니다.
 */
function toIf(graph: FlowGraph, decisionId: string): FlowGraph {
  const junctionId = junctionIdOf(decisionId)
  // 이미 이어진 합류점이 있으면 조건 분기 모양이 갖춰진 것이므로 손대지 않습니다.
  // 아직 잇지 않은 짝 합류 기호는 새로 만드는 대신 그대로 써서 제자리에 잇습니다.
  const dangling = danglingJunction(graph, decisionId)
  if (!dangling && graph.nodes.some(node => node.id === junctionId)) return graph

  const loopBacks = graph.edges.filter(
    edge => edge.target === decisionId && edge.data?.branch === "loop-back",
  )
  /*
   * 반복이 닫혀 있는지(본문이 판단으로 되돌아오는지).
   *
   * 닫힌 반복에서는 '아니오'가 가는 기호가 반복 뒤의 흐름이므로, 아니오를 합류점으로
   * 보내고 합류점에서 그 기호로 잇습니다. 복귀선이 하나도 없으면 아직 닫히지 않은
   * 반복입니다. 조건 분기를 반복으로 바꾼 직후가 그렇습니다(합류점 연결선만 지우므로
   * '아니오'는 여전히 아니면 본문으로 갑니다). 이때 아니오가 가는 기호를 반복 뒤의
   * 흐름으로 잘못 보면 아니면 본문이 합류점 뒤로 밀려납니다. 그래서 닫히지 않은
   * 반복은 어느 화살표도 옮기지 않고 짝 합류점만 준비합니다. 없는 화살표는 임의로
   * 만들지 않습니다.
   */
  const closed = loopBacks.length > 0
  const noEdge = closed
    ? graph.edges.find(edge => edge.source === decisionId && edge.sourceHandle === "no")
    : undefined

  const decision = graph.nodes.find(node => node.id === decisionId)
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  const branchStart = (handle: "yes" | "no") =>
    graph.edges.find(edge => edge.source === decisionId && edge.sourceHandle === handle)?.target
  // 합류점은 갈래 본문 아래에 둡니다. 닫히지 않은 반복은 아니오 쪽도 갈래일 수 있습니다.
  const outgoing = edgesBySource(graph.edges)
  const stopAtDecision = new Set([decisionId])
  const bodyIds = new Set([
    ...reachableFrom(branchStart("yes"), outgoing, stopAtDecision),
    ...(closed ? [] : reachableFrom(branchStart("no"), outgoing, stopAtDecision)),
  ])
  const bodyBottom = [...bodyIds]
    .map(id => nodesById.get(id))
    .filter((node): node is AlgorithmFlowNode => Boolean(node))
    .map(node => node.position.y + sizeOf(node).height)

  const junction: AlgorithmFlowNode =
    dangling ??
    createJunctionNode(decisionId, decision ? junctionPosition(decision, bodyBottom) : undefined)

  const nodes = dangling ? graph.nodes : [...graph.nodes, junction]
  const after = noEdge?.target
  const edges = graph.edges.map(edge => {
    // 본문 끝은 이제 되돌아가지 않고 합류점에서 만납니다.
    if (loopBacks.some(candidate => candidate.id === edge.id)) return asPlainEdge(edge, junctionId)
    if (edge.id === noEdge?.id) return asPlainEdge(edge, junctionId)
    return edge
  })

  if (after) {
    // 아니오가 바깥 반복으로 되돌아가고 있었다면(이 반복이 바깥 반복 본문의 끝)
    // 합류점에서 나가는 화살표도 복귀선입니다.
    const branch = noEdge?.data?.branch === "loop-back" ? "loop-back" : "next"
    edges.push({
      /*
       * 합류점에서 나가는 화살표는 하나뿐이라 자리 이름으로 id를 짓습니다. 시각으로
       * 짓던 때에는 같은 입력이 매번 다른 그래프를 내어, 이 함수가 순수 함수인데도
       * 결과를 통째로 비교할 수 없었습니다. 다시 반복으로 바꾸면 합류점과 함께
       * 지워지므로(removeNodes) 같은 id가 두 번 남지 않습니다.
       */
      id: `${junctionId}-next`,
      source: junctionId,
      target: after,
      sourceHandle: "next",
      targetHandle: "target",
      ...edgeAppearance(branch, "next"),
      data: {
        branch,
        routePoints:
          branch === "loop-back" ? loopBackRoute(nodes, junctionId, "next", after) : undefined,
      },
    })
  }

  return { nodes, edges }
}
