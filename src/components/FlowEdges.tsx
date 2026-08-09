import {
  BaseEdge,
  EdgeToolbar,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react"
import { createContext, useContext } from "react"
import type { AlgorithmFlowEdge } from "../core/flowTypes"

interface EdgeActions {
  remove: (id: string) => void
}

export const EdgeActionContext = createContext<EdgeActions | null>(null)

interface RoutePoint {
  x: number
  y: number
}

function distance(a: RoutePoint, b: RoutePoint) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointToward(from: RoutePoint, to: RoutePoint, amount: number): RoutePoint {
  const length = distance(from, to)
  if (length === 0) return from
  const ratio = amount / length
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  }
}

function pathMidpoint(points: RoutePoint[]): RoutePoint {
  const lengths = points.slice(1).map((point, index) => distance(points[index], point))
  const targetDistance = lengths.reduce((sum, length) => sum + length, 0) / 2
  let travelled = 0

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index]
    if (travelled + segmentLength >= targetDistance) {
      return pointToward(points[index], points[index + 1], targetDistance - travelled)
    }
    travelled += segmentLength
  }

  return points[points.length - 1] ?? { x: 0, y: 0 }
}

function roundedRoutePath(routePoints: RoutePoint[], source: RoutePoint, target: RoutePoint) {
  const points = [source, ...routePoints.slice(1, -1), target].filter((point, index, all) =>
    index === 0 || distance(all[index - 1], point) > 0.5,
  )

  if (points.length < 2) return [`M ${source.x} ${source.y} L ${target.x} ${target.y}`, source.x, source.y] as const

  const commands = [`M ${points[0].x} ${points[0].y}`]
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const radius = Math.min(12, distance(previous, corner) / 2, distance(corner, next) / 2)
    const before = pointToward(corner, previous, radius)
    const after = pointToward(corner, next, radius)
    commands.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`)
  }
  const last = points[points.length - 1] ?? target
  commands.push(`L ${last.x} ${last.y}`)
  const midpoint = pathMidpoint(points)
  return [commands.join(" "), midpoint.x, midpoint.y] as const
}

function loopBackPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const sideX = Math.max(sourceX, targetX) + Math.max(130, Math.abs(sourceX - targetX) / 2 + 80)
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sideX} ${sourceY + 32}, ${sideX} ${targetY - 32}, ${targetX} ${targetY}`,
  ].join(" ")

  return [path, sideX, (sourceY + targetY) / 2] as const
}

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
