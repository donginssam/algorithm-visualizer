import type { Edge, Node } from "@xyflow/react"

export type FlowNodeKind = "terminal" | "input" | "output" | "process" | "decision" | "junction"
export type TerminalRole = "start" | "end"
export type ControlKind = "if" | "loop"
/** 판단 기호에서 '예' 화살표가 나가는 쪽. '아니오'는 반대쪽으로 나갑니다. */
export type DecisionSide = "left" | "right"

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  kind: FlowNodeKind
  terminalRole?: TerminalRole
  controlKind?: ControlKind
  /**
   * 새 그래프는 항상 `left`를 저장합니다. 이전 작업 공간에 명시된 방향은 기존
   * 경로와 어긋나지 않도록 그대로 읽습니다.
   */
  yesSide?: DecisionSide
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
