/**
 * 작업 내용 저장(localStorage).
 *
 * AST가 아니라 **순서도 그래프를 그대로** 담습니다. 만드는 도중에는 아직 연결하지
 * 않은 기호가 있어 AST로 바꿀 수 없는데(core/flowToAst.ts), 그 상태야말로 새로
 * 고쳤을 때 잃어버리면 안 되는 내용이기 때문입니다.
 *
 * localStorage에 손대는 부분과 직렬화를 나눠 둡니다. 직렬화는 순수 함수라
 * 브라우저 없이도 테스트할 수 있습니다.
 */

import type { Program, Statement } from "./ast"
import { branchSide, NODE_SIZES } from "./nodeGeometry"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, FlowGraph, FlowNodeKind } from "./flowTypes"
import { parsePseudocode } from "./parser"

/** 저장 형식이 바뀌면 올립니다. 예전 값은 읽지 않고 버립니다. */
const VERSION = 1
const STORAGE_KEY = "algorithm-visualizer/workspace/v1"

export type WorkspaceSource = "example" | "text" | "flow"

export interface Workspace {
  /** 편집기에 쓰다 만 글자 그대로(문법 오류가 있어도 그대로 담습니다). */
  code: string
  /** 마지막으로 의사코드로 바꿀 수 있었던 AST. */
  program: Program
  source: WorkspaceSource
  nodes: AlgorithmFlowNode[]
  edges: AlgorithmFlowEdge[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * 저장할 노드.
 *
 * React Flow가 실행 중에 붙이는 값(measured·selected·dragging)은 담지 않습니다.
 * 다음에 열 때 다시 측정되므로 저장해 봐야 어긋나기만 합니다.
 */
function nodeForStorage(node: AlgorithmFlowNode) {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  }
}

function edgeForStorage(edge: AlgorithmFlowEdge) {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    label: edge.label,
    className: edge.className,
    markerEnd: edge.markerEnd,
    data: edge.data,
  }
}

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({
    version: VERSION,
    code: workspace.code,
    program: workspace.program,
    source: workspace.source,
    nodes: workspace.nodes.map(nodeForStorage),
    edges: workspace.edges.map(edgeForStorage),
  })
}

/** 기호 종류마다 그리는 React Flow 노드 타입(FlowCanvas의 nodeTypes). */
const NODE_TYPE_OF: Record<FlowNodeKind, string> = {
  terminal: "terminal",
  input: "io",
  output: "io",
  process: "process",
  decision: "decision",
  junction: "junction",
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

const isPoint = (value: unknown): value is { x: number; y: number } =>
  isObject(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)

/**
 * 기호 하나가 그대로 그릴 수 있는 모양인지.
 *
 * 종류와 타입이 어긋나면 다른 모양의 기호로 그려지고, 좌표가 무한대이면 화면 맞추기와
 * PNG 크기 계산이 무너집니다. 어느 쪽이 맞는 값인지 알 수 없으므로 고치지 않고 거부합니다.
 */
function isNode(value: unknown): value is AlgorithmFlowNode {
  if (!isObject(value) || typeof value.id !== "string") return false
  if (!isPoint(value.position) || !isObject(value.data)) return false
  const { kind, label, terminalRole, controlKind } = value.data
  if (typeof kind !== "string" || !(kind in NODE_TYPE_OF) || typeof label !== "string") return false
  if (value.type !== NODE_TYPE_OF[kind as FlowNodeKind]) return false
  if (terminalRole !== undefined && terminalRole !== "start" && terminalRole !== "end") return false
  return controlKind === undefined || controlKind === "if" || controlKind === "loop"
}

function isStatement(value: unknown): value is Statement {
  if (!isObject(value)) return false
  switch (value.type) {
    case "action":
      return typeof value.text === "string"
    case "assign":
      return typeof value.target === "string" && typeof value.expr === "string"
    case "input":
      return typeof value.variable === "string"
    case "output":
      return typeof value.expr === "string"
    case "loop":
      return typeof value.condition === "string" && isStatementList(value.body)
    case "if":
      return (
        typeof value.condition === "string" &&
        isStatementList(value.thenBody) &&
        isStatementList(value.elseBody)
      )
    default:
      return false
  }
}

function isStatementList(value: unknown): value is Statement[] {
  return Array.isArray(value) && value.every(isStatement)
}

/**
 * 되살릴 AST.
 *
 * 글이 문법에 맞으면 **글에서 다시 만듭니다.** 저장해 둔 AST를 그대로 믿으면 모양이
 * 어긋난 값이 순서도 변환까지 흘러가 화면이 깨질 수 있고, 글을 고친 직후(의사코드
 * 반영을 기다리는 동안) 창을 닫으면 저장된 AST가 편집기의 글보다 한 걸음 뒤처져
 * 있기도 합니다. 편집기에 보이는 글이 기준이어야 둘이 어긋나지 않습니다.
 *
 * 글에 문법 오류가 남아 있을 때만 저장해 둔 AST(마지막으로 올바랐던 것)를 쓰되,
 * 문장 하나하나의 모양을 확인합니다. 어긋나면 null입니다.
 */
function restoredProgram(code: string, stored: unknown): Program | null {
  try {
    return parsePseudocode(code)
  } catch {
    return isObject(stored) && isStatementList(stored.body) ? { body: stored.body } : null
  }
}

const EDGE_BRANCHES = new Set(["yes", "no", "next", "loop-back"])

function isEdge(value: unknown): value is AlgorithmFlowEdge {
  if (!isObject(value)) return false
  if (typeof value.id !== "string" || typeof value.source !== "string") return false
  if (typeof value.target !== "string") return false
  if (value.sourceHandle != null && typeof value.sourceHandle !== "string") return false
  if (value.type !== undefined && value.type !== "editable" && value.type !== "loop-back") {
    return false
  }
  if (value.data === undefined) return true
  if (!isObject(value.data)) return false
  return value.data.branch === undefined || EDGE_BRANCHES.has(value.data.branch as string)
}

const hasUniqueIds = (items: Array<{ id: string }>) =>
  new Set(items.map(item => item.id)).size === items.length

/**
 * 고쳐서 살릴 수 있는 화살표 손상을 고칩니다.
 *
 * - **없는 기호를 가리키는 화살표**는 그릴 수도 의사코드로 바꿀 수도 없으니 떼어 냅니다.
 * - **경로(`routePoints`)**는 기호 위치로 다시 계산하는 캐시라(FlowCanvas가 되살릴 때
 *   routeEdges로 새로 구합니다), 유한한 점의 배열이 아니면 지우기만 합니다. 그대로 두면
 *   화면 맞추기와 PNG 크기 계산이 경로를 훑다가 예외를 냅니다.
 */
function repairEdges(nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]): AlgorithmFlowEdge[] {
  const ids = new Set(nodes.map(node => node.id))
  return edges
    .filter(edge => ids.has(edge.source) && ids.has(edge.target))
    .map(edge => {
      const routePoints: unknown = edge.data?.routePoints
      if (routePoints === undefined) return edge
      if (Array.isArray(routePoints) && routePoints.every(isPoint)) return edge
      return { ...edge, data: { ...edge.data, routePoints: undefined } }
    })
}

/**
 * 저장된 글자를 작업 내용으로 되돌립니다.
 *
 * 형식이 조금이라도 어긋나면 `null`을 돌려줍니다. 예전 버전이나 손상된 값 때문에
 * 화면이 깨진 채로 열리는 것보다 빈 화면에서 시작하는 편이 낫습니다.
 */
export function parseWorkspace(raw: string | null): Workspace | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isObject(parsed) || parsed.version !== VERSION) return null
  if (typeof parsed.code !== "string") return null
  const program = restoredProgram(parsed.code, parsed.program)
  if (!program) return null
  if (parsed.source !== "example" && parsed.source !== "text" && parsed.source !== "flow")
    return null
  if (!Array.isArray(parsed.nodes) || !parsed.nodes.every(isNode)) return null
  if (!Array.isArray(parsed.edges) || !parsed.edges.every(isEdge)) return null
  // 같은 id가 둘이면 화살표가 어느 기호를 가리키는지, 지울 때 무엇이 지워질지 정할 수 없습니다.
  if (!hasUniqueIds(parsed.nodes) || !hasUniqueIds(parsed.edges)) return null

  const edges = repairEdges(parsed.nodes, parsed.edges)
  return {
    code: parsed.code,
    program,
    source: parsed.source,
    nodes: parsed.nodes,
    edges: withCurrentBranchSides(parsed.nodes, edges),
  }
}

/**
 * 예전에 저장한 갈래 경로를 지금 규칙에 맞춥니다.
 *
 * 한때는 판단마다 '예'가 나가는 쪽을 따로 정해 노드에 적어 두었습니다. 지금은
 * 예가 늘 왼쪽이므로, 그 시절에 저장한 순서도를 열면 연결점은 왼쪽인데 경로는
 * 오른쪽 꼭짓점에서 시작해 선이 마름모를 가로지릅니다. 어긋난 경로만 지우면
 * 그 화살표는 연결점을 잇는 기본 모양으로 다시 그려집니다.
 */
function withCurrentBranchSides(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): AlgorithmFlowEdge[] {
  const decisions = new Map(
    nodes.filter(node => node.data.kind === "decision").map(node => [node.id, node]),
  )

  return edges.map(edge => {
    const start = edge.data?.routePoints?.[0]
    const decision = decisions.get(edge.source)
    if (!start || !decision) return edge
    if (edge.sourceHandle !== "yes" && edge.sourceHandle !== "no") return edge

    const width = decision.measured?.width ?? NODE_SIZES.decision.width
    const expected =
      branchSide(edge.sourceHandle) === "left" ? decision.position.x : decision.position.x + width
    if (Math.abs(start.x - expected) <= 1) return edge

    return { ...edge, data: { ...edge.data, routePoints: undefined } }
  })
}

/*
 * 아래 세 함수만 브라우저 저장소에 손을 댑니다.
 *
 * 사생활 보호 모드처럼 localStorage를 막아 둔 환경에서는 예외가 나므로, 저장에
 * 실패해도 화면은 그대로 쓸 수 있도록 조용히 넘어갑니다.
 */

/**
 * 되살릴 순서도 그래프. `null`이면 AST에서 다시 그립니다(FlowCanvas).
 *
 * 저장해 둔 그래프를 쓰는 것은 **순서도에서 만들던 때(`flow`)뿐**입니다. 그때의 그래프에는
 * AST가 담지 못하는 것(아직 잇지 않은 기호, 손으로 옮긴 자리)이 있기 때문입니다.
 *
 * 글(`text`)이나 예제(`example`)에서 온 그래프는 AST를 자동 배치한 결과일 뿐이라 다시
 * 그려도 잃는 것이 없습니다. 기호를 옮기거나 고치는 순간 출처가 `flow`로 바뀌기
 * 때문입니다. 게다가 그대로 쓰면 틀릴 수 있습니다. 글을 고친 직후 의사코드 반영(300ms)을
 * 기다리는 동안 창을 닫으면 최신 글과 한 걸음 뒤처진 그래프가 함께 저장되는데, 이를
 * 되살리면 편집기와 순서도가 다른 프로그램을 보여 주고, 이어서 순서도를 고치는 순간
 * 낡은 그래프가 최신 글을 덮어씁니다.
 */
export function restoredFlowGraph(workspace: Workspace): FlowGraph | null {
  return workspace.source === "flow" ? { nodes: workspace.nodes, edges: workspace.edges } : null
}

export function loadWorkspace(): Workspace | null {
  try {
    return parseWorkspace(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveWorkspace(workspace: Workspace): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeWorkspace(workspace))
  } catch {
    // 저장 공간이 없거나 막혀 있으면 저장만 건너뜁니다.
  }
}

export function clearWorkspace(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 위와 같습니다.
  }
}
