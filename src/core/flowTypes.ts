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
   * 자동 배치기가 정합니다(core/astToFlow.ts). 다음 기호가 놓인 쪽으로 화살표를
   * 내보내야 예/아니오 선이 서로 교차하지 않습니다.
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
