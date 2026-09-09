import { NODE_SIZES, sizeOf } from "./nodeGeometry"
import { edgeAppearance, loopBackRoute } from "./flowEdges"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, ControlKind, FlowGraph } from "./flowTypes"

/**
 * 판단 기호를 조건 분기 ↔ 반복으로 바꿉니다.
 *
 * 두 종류는 흐름의 짜임이 통째로 다릅니다.
 *
 * - 조건 분기: 예와 아니오가 갈라졌다가 합류점에서 다시 만나고, 합류점 뒤로 흐름이 이어집니다.
 * - 반복: 예 본문이 판단으로 되돌아오고, 아니오가 반복을 빠져나온 뒤의 흐름이 됩니다.
 *
 * 그래서 기호 종류만 바꾸고 화살표를 그대로 두면 순서도가 끊깁니다. 학생이 그려 둔
 * 기호는 하나도 지우지 않고 화살표만 옮겨, 바꾼 즉시 다시 올바른 순서도가 되게 합니다.
 *
 * 아직 만드는 중이라 합류점이나 복귀선이 없으면 옮길 것이 없으므로 종류만 바꿉니다.
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

const junctionIdOf = (decisionId: string) => `${decisionId}-junction`

/** 복귀선을 제외한 두 갈래의 첫 공통 합류점을 연결 구조로 찾습니다. */
function findJunction(graph: FlowGraph, decisionId: string): string | undefined {
  const forward = graph.edges.filter(edge => edge.data?.branch !== "loop-back")
  const distances = (handle: string) => {
    const start = forward.find(
      edge => edge.source === decisionId && edge.sourceHandle === handle,
    )?.target
    const result = new Map<string, number>()
    const queue: Array<[string, number]> = start ? [[start, 0]] : []
    for (let index = 0; index < queue.length; index++) {
      const [id, distance] = queue[index]
      if (id === decisionId || result.has(id)) continue
      result.set(id, distance)
      for (const edge of forward) if (edge.source === id) queue.push([edge.target, distance + 1])
    }
    return result
  }
  const yes = distances("yes")
  const no = distances("no")
  return graph.nodes
    .filter(node => node.data.kind === "junction" && yes.has(node.id) && no.has(node.id))
    .sort((a, b) => yes.get(a.id)! + no.get(a.id)! - (yes.get(b.id)! + no.get(b.id)!))[0]?.id
}

/**
 * 복귀선을 새로 놓습니다.
 *
 * 경로 없는 복귀선은 화면과 저장 이미지가 왼쪽으로 크게 도는 곡선으로 그리는데,
 * 판단의 '아니오' 꼭짓점처럼 오른쪽에서 출발하거나 목적지가 멀면 그 곡선이 사이에
 * 있는 기호를 가로지릅니다. 자동 배치(astToFlow)와 손으로 이은 복귀선(FlowCanvas)이
 * 쓰는 것과 같은 모양으로, 순서도 바깥 통로를 도는 직각 경로를 계산해 둡니다.
 */
function asLoopBack(
  nodes: AlgorithmFlowNode[],
  edge: AlgorithmFlowEdge,
  target: string,
): AlgorithmFlowEdge {
  return {
    ...edge,
    target,
    ...edgeAppearance("loop-back", edge.sourceHandle),
    data: {
      ...edge.data,
      branch: "loop-back",
      routePoints: loopBackRoute(nodes, edge.source, edge.sourceHandle, target),
    },
  }
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

/** start에서 화살표를 따라 닿는 기호들. stop에 든 기호에서 멈춥니다. */
function reachable(
  startId: string | undefined,
  edges: AlgorithmFlowEdge[],
  stop: Set<string>,
): Set<string> {
  const seen = new Set<string>()
  const queue = startId ? [startId] : []

  while (queue.length) {
    const id = queue.pop()
    if (!id || seen.has(id) || stop.has(id)) continue
    seen.add(id)
    for (const edge of edges) {
      if (edge.source === id) queue.push(edge.target)
    }
  }

  return seen
}

/**
 * 조건 분기 → 반복.
 *
 * 예 본문의 끝을 판단으로 되돌리고, 합류점 뒤에 있던 흐름을 아니오가 이어받습니다.
 * 아니면 본문이 있었다면 그대로 아니오 흐름 안에 남습니다.
 */
function toLoop(graph: FlowGraph, decisionId: string): FlowGraph {
  const junctionId = findJunction(graph, decisionId)
  if (!junctionId) return graph

  // 복귀선 통로는 합류점을 지운 뒤의 순서도 너비로 잡습니다.
  const nodes = graph.nodes.filter(node => node.id !== junctionId)

  // 합류점 뒤로 이어지던 화살표. 아니오 흐름이 이 자리를 이어받습니다.
  const afterEdge = graph.edges.find(edge => edge.source === junctionId)
  const after = afterEdge?.target
  // 합류점이 바깥 반복으로 되돌아가고 있었다면(이 조건이 반복 본문의 끝) 이어받는
  // 화살표도 복귀선이어야 합니다. 보통 화살표로 두면 위로 올라가는 선이 기호 사이를
  // 가로지릅니다.
  const rejoin = (edge: AlgorithmFlowEdge) =>
    afterEdge?.data?.branch === "loop-back" && after
      ? asLoopBack(nodes, edge, after)
      : after
        ? asPlainEdge(edge, after)
        : undefined
  const yesTarget = graph.edges.find(
    edge => edge.source === decisionId && edge.sourceHandle === "yes",
  )?.target
  const onYesPath = reachable(yesTarget, graph.edges, new Set([junctionId, decisionId]))

  const edges = graph.edges.flatMap(edge => {
    if (edge.source === junctionId) return []
    if (edge.target !== junctionId) return [edge]
    // 예 본문의 끝은 판단으로 되돌아옵니다.
    if (onYesPath.has(edge.source)) return [asLoopBack(nodes, edge, decisionId)]
    // 아니오 쪽(아니면 본문의 끝, 또는 판단의 아니오 화살표)은 합류점 뒤를 이어받습니다.
    const rejoined = rejoin(edge)
    return rejoined ? [rejoined] : []
  })

  return { nodes, edges }
}

/**
 * 반복 → 조건 분기.
 *
 * 판단으로 되돌아오던 복귀선을 합류점으로 보내고, 아니오도 합류점을 지나도록
 * 바꾼 뒤 합류점에서 원래의 다음 기호로 잇습니다.
 */
function toIf(graph: FlowGraph, decisionId: string): FlowGraph {
  const junctionId = junctionIdOf(decisionId)
  if (graph.nodes.some(node => node.id === junctionId)) return graph

  const loopBacks = graph.edges.filter(
    edge => edge.target === decisionId && edge.data?.branch === "loop-back",
  )
  const noEdge = graph.edges.find(edge => edge.source === decisionId && edge.sourceHandle === "no")
  // 되돌아오는 선도, 아니오가 가는 곳도 없으면 아직 합칠 흐름이 없습니다.
  if (loopBacks.length === 0 && !noEdge) return graph

  const decision = graph.nodes.find(node => node.id === decisionId)
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  const bodyIds = reachable(
    graph.edges.find(edge => edge.source === decisionId && edge.sourceHandle === "yes")?.target,
    graph.edges,
    new Set([decisionId]),
  )
  const bodyBottom = [...bodyIds]
    .map(id => nodesById.get(id))
    .filter((node): node is AlgorithmFlowNode => Boolean(node))
    .map(node => node.position.y + sizeOf(node).height)
  const decisionBottom = decision ? decision.position.y + sizeOf(decision).height : 0
  const junctionSize = NODE_SIZES.junction

  const junction: AlgorithmFlowNode = {
    id: junctionId,
    type: "junction",
    position: {
      x: (decision ? decision.position.x + sizeOf(decision).width / 2 : 0) - junctionSize.width / 2,
      y: Math.max(decisionBottom, ...bodyBottom) + 60,
    },
    data: { kind: "junction", label: "합류" },
  }

  const nodes = [...graph.nodes, junction]
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
      id: `junction-${decisionId}-${Date.now()}`,
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
