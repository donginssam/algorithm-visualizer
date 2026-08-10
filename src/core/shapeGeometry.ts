export type ShapePoint = readonly [number, number]

/**
 * 평행사변형(입출력)·마름모(판단) 윤곽의 꼭짓점 — 0~1로 정규화한 좌표.
 *
 * components/nodes/FlowNodes.tsx(화면의 SVG outline, 0~100 좌표계)와
 * core/flowToSvg.ts(PNG 내보내기, 실제 픽셀 좌표)가 같은 좌표에서 각자 필요한
 * 단위로 늘려 그립니다.
 */
export const SHAPE_OUTLINE_POINTS: {
  io: readonly ShapePoint[]
  decision: readonly ShapePoint[]
} = {
  io: [
    [0.14, 0],
    [1, 0],
    [0.86, 1],
    [0, 1],
  ],
  decision: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
}
