/**
 * 화살표 경로 계산.
 *
 * 화면에 그리는 커스텀 엣지(components/FlowEdges.tsx)와 PNG로 내보낼 때
 * 만드는 SVG(core/flowToSvg.ts)가 같은 경로를 써야 하므로 여기에 모아 둡니다.
 */

export interface RoutePoint {
  x: number
  y: number
}

function distance(a: RoutePoint, b: RoutePoint): number {
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

/** 꺾인 경로의 길이 기준 중간 지점 — 예/아니오 라벨을 놓는 자리입니다. */
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

/** 직각으로 꺾이는 경로. 모서리는 반지름 12px까지 둥글립니다. */
export function roundedRoutePath(
  routePoints: RoutePoint[],
  source: RoutePoint,
  target: RoutePoint,
) {
  const points = [source, ...routePoints.slice(1, -1), target].filter(
    (point, index, all) => index === 0 || distance(all[index - 1], point) > 0.5,
  )

  if (points.length < 2) {
    return [`M ${source.x} ${source.y} L ${target.x} ${target.y}`, source.x, source.y] as const
  }

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

/** 경로 정보가 없는 반복 화살표는 왼쪽으로 크게 우회하는 곡선으로 그립니다. */
export function loopBackPath(sourceX: number, sourceY: number, targetX: number, targetY: number) {
  const sideX = Math.min(sourceX, targetX) - Math.max(130, Math.abs(sourceX - targetX) / 2 + 80)
  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${sideX} ${sourceY + 32}, ${sideX} ${targetY - 32}, ${targetX} ${targetY}`,
  ].join(" ")

  return [path, sideX, (sourceY + targetY) / 2] as const
}
