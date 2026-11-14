import type { Edge, Node } from "@xyflow/react"

export type FlowNodeKind = "terminal" | "input" | "output" | "process" | "decision" | "junction"
export type TerminalRole = "start" | "end"
export type ControlKind = "if" | "loop"
/**
 * 판단 기호에서 갈래가 나가는 쪽.
 *
 * '예'는 항상 왼쪽, '아니오'는 항상 오른쪽입니다(core/nodeGeometry.ts의 YES_SIDE).
 * 기호마다 다르게 두지 않으므로 노드 데이터에는 저장하지 않습니다.
 */
export type DecisionSide = "left" | "right"

/** 판단 기호의 두 갈래 연결점. */
export type BranchHandle = "yes" | "no"

/** 연결점이 판단의 갈래(예/아니오)인지. 아니면 아래쪽 가운데의 '다음' 연결점입니다. */
export function isBranchHandle(handle: string | null | undefined): handle is BranchHandle {
  return handle === "yes" || handle === "no"
}

/** 팔레트에서 고르는 기호 종류. 입력과 출력은 한 기호(입출력)로 놓고 편집 창에서 가릅니다. */
export type PaletteItemKind = "terminal" | "io" | "process" | "decision"

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  kind: FlowNodeKind
  terminalRole?: TerminalRole
  controlKind?: ControlKind
}

export interface FlowEdgeData extends Record<string, unknown> {
  branch?: BranchHandle | "next" | "loop-back"
  /** 자동 배치기가 계산한 기호 회피 경로(순서도 좌표계). */
  routePoints?: Array<{ x: number; y: number }>
}

export type AlgorithmFlowNode = Node<FlowNodeData>
export type AlgorithmFlowEdge = Edge<FlowEdgeData>

export interface FlowGraph {
  nodes: AlgorithmFlowNode[]
  edges: AlgorithmFlowEdge[]
}
