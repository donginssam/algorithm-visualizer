import type { AlgorithmFlowNode, FlowNodeData, DecisionSide } from "./flowTypes"
import type { RoutePoint } from "./edgeGeometry"
/** 도형 크기. styles/index.scss의 .flow-shape 계열 규칙과 반드시 같아야 합니다. */
export const NODE_SIZES: Record<FlowNodeData["kind"], { width: number; height: number }> = {
  terminal: { width: 172, height: 64 },
  input: { width: 190, height: 76 },
  output: { width: 190, height: 76 },
  process: { width: 190, height: 72 },
  decision: { width: 220, height: 124 },
  junction: { width: 18, height: 18 },
}

/**
 * 위아래로 이웃한 기호 사이의 간격.
 *
 * 자동 배치(dagre의 `ranksep`)와 손으로 놓는 자리(판단 기호의 짝 합류점)가 같은
 * 값을 씁니다. 팔레트에서 막 놓은 합류 기호가 자동 배치한 순서도와 같은 간격으로
 * 놓여야, 자동 배치를 눌렀을 때 기호가 껑충 뛰지 않습니다.
 */
export const RANK_GAP = 86

function oppositeSide(side: DecisionSide): DecisionSide {
  return side === "left" ? "right" : "left"
}

/**
 * 판단 기호에서 '예'가 나가는 쪽.
 *
 * 조건과 반복 모두 교과서에서 같은 방향으로 읽을 수 있도록 왼쪽으로 고정합니다.
 * 화면 연결점(components/nodes/FlowNodes.tsx)과 저장 이미지(core/flowToSvg.ts)가
 * 이 값을 함께 씁니다.
 */
export const YES_SIDE: DecisionSide = "left"

/** 갈래가 마름모에서 나가는 쪽. */
export function branchSide(branch: "yes" | "no"): DecisionSide {
  return branch === "yes" ? YES_SIDE : oppositeSide(YES_SIDE)
}

export function sizeOf(node: AlgorithmFlowNode) {
  const fallback = NODE_SIZES[node.data.kind] ?? NODE_SIZES.process
  return {
    width: node.measured?.width ?? fallback.width,
    height: node.measured?.height ?? fallback.height,
  }
}

/** 판단 기호의 예/아니오는 마름모의 좌우 꼭짓점에서 나갑니다(FlowNodes.tsx와 동일). */
export function sourcePoint(
  node: AlgorithmFlowNode,
  handle: string | null | undefined,
): RoutePoint {
  const { width, height } = sizeOf(node)
  if (node.data.kind === "decision" && (handle === "yes" || handle === "no")) {
    const side = branchSide(handle)
    return {
      x: side === "left" ? node.position.x : node.position.x + width,
      y: node.position.y + height / 2,
    }
  }
  return { x: node.position.x + width / 2, y: node.position.y + height }
}

export function targetPoint(node: AlgorithmFlowNode): RoutePoint {
  const { width } = sizeOf(node)
  return { x: node.position.x + width / 2, y: node.position.y }
}
