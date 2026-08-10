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

import type { Program } from "./ast"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./flowTypes"

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

function isNode(value: unknown): value is AlgorithmFlowNode {
  if (!isObject(value)) return false
  const position = value.position
  return (
    typeof value.id === "string"
    && isObject(position)
    && typeof position.x === "number"
    && typeof position.y === "number"
    && isObject(value.data)
    && typeof value.data.kind === "string"
    && typeof value.data.label === "string"
  )
}

function isEdge(value: unknown): value is AlgorithmFlowEdge {
  return (
    isObject(value)
    && typeof value.id === "string"
    && typeof value.source === "string"
    && typeof value.target === "string"
  )
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
  if (!isObject(parsed.program) || !Array.isArray(parsed.program.body)) return null
  if (parsed.source !== "example" && parsed.source !== "text" && parsed.source !== "flow") return null
  if (!Array.isArray(parsed.nodes) || !parsed.nodes.every(isNode)) return null
  if (!Array.isArray(parsed.edges) || !parsed.edges.every(isEdge)) return null

  return {
    code: parsed.code,
    program: parsed.program as unknown as Program,
    source: parsed.source,
    nodes: parsed.nodes,
    edges: parsed.edges,
  }
}

/*
 * 아래 세 함수만 브라우저 저장소에 손을 댑니다.
 *
 * 사생활 보호 모드처럼 localStorage를 막아 둔 환경에서는 예외가 나므로, 저장에
 * 실패해도 화면은 그대로 쓸 수 있도록 조용히 넘어갑니다.
 */

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
