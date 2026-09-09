import { MarkerType, type EdgeMarker } from "@xyflow/react"
import { EDGE_COLOR, LOOP_EDGE_COLOR } from "../constants/flowColors"
import { branchSide, sizeOf, sourcePoint, targetPoint } from "./nodeGeometry"
import type { AlgorithmFlowNode, AlgorithmFlowEdge, FlowEdgeData } from "./flowTypes"
import type { RoutePoint } from "./edgeGeometry"
/**
 * 화살촉 크기.
 *
 * React Flow 마커는 markerUnits="strokeWidth"라서 선 굵기(2.2 =
 * --xy-edge-stroke-width)와 곱해집니다. 마커 상자는 20 단위 viewBox 안에 5
 * 단위짜리 화살촉을 그리므로 실제 크기는 16 × 2.2 ÷ 4 ≈ 9px —
 * flowToSvg.ts가 PNG에 그리는 화살촉과 같은 크기입니다.
 */
const ARROW_MARKER_SIZE = 16

/**
 * 화살표 끝의 화살촉.
 *
 * 색을 반드시 지정합니다. 마커는 <defs> 안에 있어 엣지의 CSS 규칙이 닿지 않고,
 * 색을 비워 두면 React Flow가 기본색(#b1b1b7)을 인라인 스타일로 박아 넣어
 * 선만 진해지고 화살촉은 흐린 채로 남습니다.
 */
export function arrowMarker(branch: FlowEdgeData["branch"]): EdgeMarker {
  return {
    type: MarkerType.ArrowClosed,
    width: ARROW_MARKER_SIZE,
    height: ARROW_MARKER_SIZE,
    color: branch === "loop-back" ? LOOP_EDGE_COLOR : EDGE_COLOR,
  }
}

/** 복귀선이 기호를 스치지 않도록 두는 여백. */
const CLEARANCE = 20
/** 꼭짓점 옆으로 살짝 나간 뒤 위아래로 비켜 가는 거리. 마름모 상자 바깥이어야 합니다. */
const DODGE = 24

interface Rect {
  left: number
  right: number
  top: number
  bottom: number
}

function rectOf(node: AlgorithmFlowNode): Rect {
  const { width, height } = sizeOf(node)
  return {
    left: node.position.x,
    right: node.position.x + width,
    top: node.position.y,
    bottom: node.position.y + height,
  }
}

/** x0~x1 구간에 걸쳐 있는 기호들. 수평 선이 지나갈 때의 장애물 후보입니다. */
function inHorizontalStrip(rects: Rect[], x0: number, x1: number): Rect[] {
  const left = Math.min(x0, x1)
  const right = Math.max(x0, x1)
  return rects.filter(rect => rect.right > left && rect.left < right)
}

function blocksHorizontal(rect: Rect, y: number): boolean {
  return rect.top - CLEARANCE < y && rect.bottom + CLEARANCE > y
}

/**
 * x0~x1 사이를 가로지르는 수평 선을 놓을 y.
 *
 * 원하는 높이에 기호가 있으면 그 기호의 위나 아래로 비킵니다. 여러 후보 중
 * 원래 높이에 가장 가까운 것을 고르고, 거리가 같으면 `prefer` 방향(음수면 위)을
 * 택합니다. `allow`로 갈 수 없는 높이를 걸러 냅니다.
 */
function clearHorizontalY(
  rects: Rect[],
  x0: number,
  x1: number,
  preferredY: number,
  allow: (y: number) => boolean,
  prefer: -1 | 1,
): number {
  const strip = inHorizontalStrip(rects, x0, x1)
  const isClear = (y: number) => !strip.some(rect => blocksHorizontal(rect, y))
  if (isClear(preferredY)) return preferredY

  const candidates = strip
    .flatMap(rect => [rect.top - CLEARANCE, rect.bottom + CLEARANCE])
    .filter(y => allow(y) && isClear(y))
    .sort((a, b) => {
      const gap = Math.abs(a - preferredY) - Math.abs(b - preferredY)
      // 거리가 같으면 prefer 방향(음수면 위)에 있는 후보를 앞에 둡니다.
      return gap !== 0 ? gap : (b - preferredY) * prefer - (a - preferredY) * prefer
    })
  return candidates[0] ?? preferredY
}

/** x 위치의 수직 선이 y0~y1 사이에서 기호를 지나는지. */
function blocksVertical(rects: Rect[], x: number, y0: number, y1: number): boolean {
  const top = Math.min(y0, y1)
  const bottom = Math.max(y0, y1)
  return rects.some(
    rect =>
      rect.left - CLEARANCE < x &&
      rect.right + CLEARANCE > x &&
      rect.bottom > top &&
      rect.top < bottom,
  )
}

/**
 * 복귀선이 도는 통로.
 *
 * 아래쪽 가운데에서 나가면 왼쪽, '아니오' 꼭짓점에서 나가면 오른쪽 통로를 씁니다.
 * 통로까지 가는 수평 선과 통로에서 목적지로 들어오는 수평 선은 다른 기호를 뚫지
 * 않도록 높이를 고릅니다. 중첩 반복에서는 안쪽 판단과 같은 높이에 '끝'처럼 바깥
 * 흐름의 기호가 놓이는데, 꼭짓점 높이 그대로 오른쪽 통로로 가면 그 기호 뒤를
 * 지나갑니다. 그때는 꼭짓점 옆으로 살짝 나간 뒤 기호의 위나 아래로 비켜 갑니다.
 */
export function loopBackRoute(
  nodes: AlgorithmFlowNode[],
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string,
  laneOffset = 0,
): RoutePoint[] | undefined {
  const source = nodes.find(node => node.id === sourceId)
  const target = nodes.find(node => node.id === targetId)
  if (!source || !target) return undefined

  const graphLeft = Math.min(...nodes.map(node => node.position.x))
  const graphRight = Math.max(...nodes.map(node => node.position.x + sizeOf(node).width))
  const start = sourcePoint(source, sourceHandle)
  const end = targetPoint(target)
  const obstacles = nodes.filter(node => node.id !== sourceId && node.id !== targetId).map(rectOf)

  const fromVertex =
    source.data.kind === "decision" && (sourceHandle === "yes" || sourceHandle === "no")
  const side = fromVertex ? branchSide(sourceHandle) : "left"
  const laneX = side === "left" ? graphLeft - 46 - laneOffset : graphRight + 46 + laneOffset

  // 목적지 위에서 들어오는 수평 선. 목적지 자체를 뚫지 않도록 위로만 비킵니다.
  const entryY = clearHorizontalY(obstacles, laneX, end.x, end.y - 34, y => y <= end.y - 34, -1)
  const tail: RoutePoint[] = [{ x: laneX, y: entryY }, { x: end.x, y: entryY }, end]

  if (fromVertex) {
    const exitY = clearHorizontalY(
      obstacles,
      start.x,
      laneX,
      start.y,
      () => true,
      end.y < start.y ? -1 : 1,
    )
    const dodgeX = side === "left" ? start.x - DODGE : start.x + DODGE
    if (exitY !== start.y && !blocksVertical(obstacles, dodgeX, start.y, exitY)) {
      return [
        start,
        { x: dodgeX, y: start.y },
        { x: dodgeX, y: exitY },
        { x: laneX, y: exitY },
        ...tail,
      ]
    }
    return [start, { x: laneX, y: start.y }, ...tail]
  }

  const preferredExitY = start.y + 34
  const exitY = clearHorizontalY(
    obstacles,
    start.x,
    laneX,
    preferredExitY,
    y => y >= preferredExitY,
    1,
  )
  const dodgedExitY =
    exitY !== preferredExitY && blocksVertical(obstacles, start.x, start.y, exitY)
      ? preferredExitY
      : exitY
  return [start, { x: start.x, y: dodgedExitY }, { x: laneX, y: dodgedExitY }, ...tail]
}

export function edgeAppearance(
  branch: FlowEdgeData["branch"],
  handle: string | null | undefined,
): Partial<AlgorithmFlowEdge> {
  return {
    type: branch === "loop-back" ? "loop-back" : "editable",
    className: branch === "loop-back" ? "loop-back-edge" : undefined,
    markerEnd: arrowMarker(branch),
    label: handle === "yes" ? "예" : handle === "no" ? "아니오" : undefined,
  }
}
