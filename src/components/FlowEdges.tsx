import {
  BaseEdge,
  EdgeToolbar,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"
import { createContext, useContext } from "react"
import { loopBackPath, roundedRoutePath } from "../core/edgeGeometry"
import type { AlgorithmFlowEdge } from "../core/flowTypes"

interface EdgeActions {
  remove: (id: string) => void
}

export const EdgeActionContext = createContext<EdgeActions | null>(null)

/** 선택한 화살표를 터치로도 삭제할 수 있고, 반복선은 노드 오른쪽으로 우회시킵니다. */
export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  style,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  interactionWidth,
  data,
  selected,
}: EdgeProps<AlgorithmFlowEdge>) {
  const actions = useContext(EdgeActionContext)
  const [path, labelX, labelY] = data?.routePoints && data.routePoints.length >= 2
    ? roundedRoutePath(
        data.routePoints,
        { x: sourceX, y: sourceY },
        { x: targetX, y: targetY },
      )
    : data?.branch === "loop-back"
      ? loopBackPath(sourceX, sourceY, targetX, targetY)
      : getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
          borderRadius: 12,
        })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={label}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        markerStart={markerStart}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={Math.max(interactionWidth ?? 0, 28)}
      />
      {actions && (
        <EdgeToolbar
          edgeId={id}
          x={labelX}
          y={labelY}
          isVisible={selected}
          className="edge-toolbar"
        >
          <button
            type="button"
            className="nodrag nowheel"
            onClick={() => actions.remove(id)}
            aria-label="선택한 화살표 삭제"
          >
            연결 삭제
          </button>
        </EdgeToolbar>
      )}
    </>
  )
}
