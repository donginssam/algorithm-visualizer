import { END_LABEL, INPUT_PREFIX, START_LABEL } from "../constants/pseudocode"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  BranchHandle,
  FlowGraph,
  PaletteItemKind,
} from "./flowTypes"
import { NODE_SIZES, RANK_GAP, sizeOf } from "./nodeGeometry"

export const junctionIdOf = (decisionId: string) => `${decisionId}-junction`

/**
 * 판단 기호와 짝이 되는 합류 기호.
 *
 * 만드는 자리가 셋(의사코드에서 그릴 때, 팔레트에서 놓을 때, 반복을 조건으로 바꿀 때)
 * 이라 id 규칙과 라벨을 여기 한곳에서 정합니다. `junctionIdOf` 규칙을 지키는 것이
 * 중요합니다. 판단을 지울 때 짝을 찾는 일(removeNodes.ts)이 이 규칙에 기대기 때문입니다.
 */
export function createJunctionNode(
  decisionId: string,
  position: { x: number; y: number } = { x: 0, y: 0 },
): AlgorithmFlowNode {
  return {
    id: junctionIdOf(decisionId),
    type: "junction",
    position,
    data: { kind: "junction", label: "합류" },
  }
}

/**
 * 팔레트에서 고른 기호를 캔버스에 놓을 때 생기는 기호들.
 *
 * - 단말은 '시작'이 없으면 시작, 있으면 '끝'으로 놓습니다(둘 다 있으면 시작. 편집 창에서
 *   바꿀 수 있고, 둘이 되면 검증이 알려 줍니다).
 * - 판단은 조건 분기로 놓고 짝 합류 기호를 함께 놓습니다. 함께 놓아 주지 않으면 학생이
 *   갈래를 잇는 순간 "연결이 끊겨 있어요"부터 보게 됩니다.
 *
 * id는 부르는 쪽이 정합니다. 여기서 시각으로 지으면 같은 입력이 매번 다른 결과를 냅니다.
 */
export function createSymbolNodes(
  kind: PaletteItemKind,
  id: string,
  position: { x: number; y: number },
  existing: AlgorithmFlowNode[],
): AlgorithmFlowNode[] {
  switch (kind) {
    case "terminal": {
      const hasStart = existing.some(node => node.data.terminalRole === "start")
      const hasEnd = existing.some(node => node.data.terminalRole === "end")
      const terminalRole = hasStart && !hasEnd ? "end" : "start"
      const label = terminalRole === "start" ? START_LABEL : END_LABEL
      return [{ id, type: "terminal", position, data: { kind: "terminal", label, terminalRole } }]
    }
    case "io":
      return [{ id, type: "io", position, data: { kind: "input", label: `${INPUT_PREFIX}변수` } }]
    case "process":
      return [{ id, type: "process", position, data: { kind: "process", label: "처리할 내용" } }]
    case "decision": {
      const decision: AlgorithmFlowNode = {
        id,
        type: "decision",
        position,
        data: { kind: "decision", label: "판단 조건", controlKind: "if" },
      }
      return [decision, createJunctionNode(id, junctionPosition(decision))]
    }
  }
}

/**
 * 합류 기호를 놓을 자리.
 *
 * 가로로는 판단 기호의 한가운데, 세로로는 갈래 본문을 모두 지난 아래입니다.
 * `bodyBottom`에 갈래에 속한 기호들의 아래 끝을 넘기면 그보다 아래로 놓습니다.
 */
export function junctionPosition(
  decision: AlgorithmFlowNode,
  bodyBottom: number[] = [],
): { x: number; y: number } {
  const { width, height } = sizeOf(decision)
  return {
    x: decision.position.x + width / 2 - NODE_SIZES.junction.width / 2,
    y: Math.max(decision.position.y + height, ...bodyBottom) + RANK_GAP,
  }
}

/** 나가는 화살표를 기호별로 모읍니다. 흐름을 따라갈 때마다 전체 화살표를 훑지 않기 위해서입니다. */
export function edgesBySource(edges: AlgorithmFlowEdge[]): Map<string, AlgorithmFlowEdge[]> {
  return groupEdges(edges, edge => edge.source)
}

/** 들어오는 화살표를 기호별로 모읍니다. */
export function edgesByTarget(edges: AlgorithmFlowEdge[]): Map<string, AlgorithmFlowEdge[]> {
  return groupEdges(edges, edge => edge.target)
}

function groupEdges(
  edges: AlgorithmFlowEdge[],
  keyOf: (edge: AlgorithmFlowEdge) => string,
): Map<string, AlgorithmFlowEdge[]> {
  const grouped = new Map<string, AlgorithmFlowEdge[]>()
  for (const edge of edges) {
    const key = keyOf(edge)
    const list = grouped.get(key) ?? []
    list.push(edge)
    grouped.set(key, list)
  }
  return grouped
}

/**
 * 판단 기호의 갈래(예/아니오) 화살표.
 *
 * 연결점(`sourceHandle`)으로 찾습니다. 반복 본문이 또 다른 반복으로 끝나면 안쪽
 * 판단의 '아니오'에서 나가는 선이 복귀선(`branch: "loop-back"`)이 되는데, 그래도
 * 나가는 자리는 여전히 '아니오'이기 때문입니다. 아직 잇지 않았으면 undefined입니다.
 */
export function branchEdge(
  edges: AlgorithmFlowEdge[],
  decisionId: string,
  handle: BranchHandle,
): AlgorithmFlowEdge | undefined {
  return edges.find(edge => edge.source === decisionId && edge.sourceHandle === handle)
}

/**
 * start에서 화살표를 따라 닿는 기호들.
 *
 * `stop`에 든 기호에서 멈추고 그 기호는 넣지 않습니다. 판단 기호를 stop으로 두면
 * 되돌아오는 반복 본문이 판단을 지나 그 뒤의 흐름까지 번지지 않습니다.
 */
export function reachableFrom(
  startId: string | undefined,
  outgoing: Map<string, AlgorithmFlowEdge[]>,
  stop: ReadonlySet<string> = new Set(),
): Set<string> {
  const seen = new Set<string>()
  const queue = startId ? [startId] : []

  while (queue.length > 0) {
    const id = queue.pop()!
    if (seen.has(id) || stop.has(id)) continue
    seen.add(id)
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target)
  }

  return seen
}

/**
 * 새로 잇는 화살표가 반복의 복귀선인지.
 *
 * 반복 판단으로 들어오는 화살표는 둘입니다. 반복을 시작하는 **들어오는 선**(바깥에서
 * 옴)과 본문을 한 바퀴 돈 **복귀선**(안에서 옴)입니다. 둘은 색도 경로도 다르고,
 * 자동 배치와 판단 종류 전환도 이 표시를 보고 움직입니다.
 *
 * 한때는 "판단에 이미 들어오는 화살표가 있으면 복귀선"으로만 보았는데, 학생이
 * 복귀선을 먼저 그리면 둘이 통째로 뒤바뀌었습니다. 그래서 **어디서 왔는지**를
 * 먼저 봅니다. 출발 기호가 판단에서 흘러나온 본문 안에 있으면 복귀선입니다.
 * 아직 본문이 판단과 이어지지 않아 안팎을 가릴 수 없을 때만, 바깥에서 들어온
 * 화살표가 이미 있는지로 판단합니다.
 */
export function isLoopBackConnection(
  graph: FlowGraph,
  sourceId: string,
  targetId: string,
): boolean {
  const target = graph.nodes.find(node => node.id === targetId)
  if (target?.data.controlKind !== "loop") return false

  const fromTarget = reachableFrom(targetId, edgesBySource(graph.edges))
  if (fromTarget.has(sourceId)) return true

  return graph.edges.some(edge => edge.target === targetId && !fromTarget.has(edge.source))
}

/** 학생이 캔버스에서 잇으려는 화살표. React Flow의 `Connection`과 `Edge`가 모두 들어맞습니다. */
export interface ConnectionRequest {
  source: string
  target: string
  sourceHandle?: string | null
}

/**
 * 이 화살표를 이어도 되는지.
 *
 * 끌어서 놓는 동안 계속 불리므로, 여기서 막으면 연결점이 아예 반응하지 않습니다.
 * 의사코드로 되돌릴 수 없는 모양을 그리는 도중에 알려 주는 것보다, 처음부터 못
 * 잇게 하는 편이 학생에게 덜 헷갈립니다. 흐름이 완성됐는지까지는 보지 않습니다
 * (그것은 flowToAst.ts의 검증이 알려 줍니다).
 *
 * - 자기 자신으로는 잇지 않습니다.
 * - '끝'에서는 나갈 수 없고 '시작'으로는 들어올 수 없습니다.
 * - 한 연결점에서는 화살표가 하나만 나갑니다(판단은 예·아니오 각각 하나).
 * - 들어오는 화살표는 하나입니다. 두 갈래가 만나는 합류점과, 들어오는 선과 복귀선을
 *   함께 받는 반복 판단만 둘까지 받습니다.
 */
export function canConnect(graph: FlowGraph, connection: ConnectionRequest): boolean {
  const source = graph.nodes.find(node => node.id === connection.source)
  const target = graph.nodes.find(node => node.id === connection.target)
  if (!source || !target || connection.source === connection.target) return false
  if (source.data.terminalRole === "end" || target.data.terminalRole === "start") return false

  const sourceHandle = connection.sourceHandle ?? "next"
  const sourceAlreadyConnected = graph.edges.some(
    edge => edge.source === connection.source && (edge.sourceHandle ?? "next") === sourceHandle,
  )
  if (sourceAlreadyConnected) return false

  const incomingCount = graph.edges.filter(edge => edge.target === connection.target).length
  const maximumIncoming =
    target.data.kind === "junction" || target.data.controlKind === "loop" ? 2 : 1
  return incomingCount < maximumIncoming
}

/** 두 갈래가 처음 만나는 기호가 합류점일 때만 반환합니다. 후속 판단의 합류점은 소유하지 않습니다. */
export function findJunction(graph: FlowGraph, decisionId: string): string | undefined {
  const forward = graph.edges.filter(edge => edge.data?.branch !== "loop-back")
  const outgoing = edgesBySource(forward)
  const distances = (handle: BranchHandle) => {
    const start = branchEdge(forward, decisionId, handle)?.target
    const result = new Map<string, number>()
    const queue: Array<[string, number]> = start ? [[start, 0]] : []
    for (let index = 0; index < queue.length; index++) {
      const [id, distance] = queue[index]
      if (id === decisionId || result.has(id)) continue
      result.set(id, distance)
      for (const edge of outgoing.get(id) ?? []) queue.push([edge.target, distance + 1])
    }
    return result
  }
  const yes = distances("yes")
  const no = distances("no")
  const common = graph.nodes.filter(node => yes.has(node.id) && no.has(node.id))
  // 한 갈래에서만 가까운 후보를 고르지 않습니다. 처음 만나는 곳이 불명확하면 보존합니다.
  const first = common.filter(
    node =>
      !common.some(
        other =>
          other.id !== node.id &&
          yes.get(other.id)! <= yes.get(node.id)! &&
          no.get(other.id)! <= no.get(node.id)!,
      ),
  )
  if (first.length !== 1 || first[0].data.kind !== "junction") return undefined
  const junction = first[0]
  const foreignOwner = graph.nodes.some(
    node =>
      node.data.kind === "decision" &&
      node.id !== decisionId &&
      junctionIdOf(node.id) === junction.id,
  )
  const externalInput = forward.some(
    edge =>
      edge.target === junction.id &&
      edge.source !== decisionId &&
      !yes.has(edge.source) &&
      !no.has(edge.source),
  )
  return foreignOwner || externalInput ? undefined : junction.id
}

/** 연결되지 않은 짝만 생성 시의 ID 규칙으로 식별합니다. */
export function findIsolatedCompanion(graph: FlowGraph, decisionId: string): string | undefined {
  const id = junctionIdOf(decisionId)
  return graph.nodes.some(node => node.id === id && node.data.kind === "junction") &&
    !graph.edges.some(edge => edge.source === id || edge.target === id)
    ? id
    : undefined
}
