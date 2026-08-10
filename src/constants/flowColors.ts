import type { FlowNodeKind } from "../core/flowTypes"

/**
 * 화살표·기호 색.
 *
 * styles/_tokens.scss의 --edge-stroke/--accent-alt/--symbol-*와 같은 값이어야 합니다.
 * React Flow 마커(core/astToFlow.ts)와 PNG 내보내기(core/flowToSvg.ts)는 CSS 변수에
 * 닿을 수 없는 곳(<defs> 마커, 독립 실행 SVG 문자열)에서 이 색을 그리므로 리터럴로 둡니다.
 */
export const EDGE_COLOR = "#475569"
export const LOOP_EDGE_COLOR = "#7c5cf0"

/** 순서도 기호 색 — 교육과정 표준. */
export const SHAPE_FILL: Record<FlowNodeKind, string> = {
  terminal: "#ffe066",
  input: "#ffb3c6",
  output: "#ffb3c6",
  process: "#a8d8ff",
  decision: "#b7e4c7",
  junction: "#ffffff",
}
