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

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  kind: FlowNodeKind
  terminalRole?: TerminalRole
  controlKind?: ControlKind
}

export interface FlowEdgeData extends Record<string, unknown> {
  branch?: "yes" | "no" | "next" | "loop-back"
  /** 자동 배치기가 계산한 기호 회피 경로(순서도 좌표계). */
  routePoints?: Array<{ x: number; y: number }>
}

export type AlgorithmFlowNode = Node<FlowNodeData>
export type AlgorithmFlowEdge = Edge<FlowEdgeData>

export interface FlowGraph {
  nodes: AlgorithmFlowNode[]
  edges: AlgorithmFlowEdge[]
}
