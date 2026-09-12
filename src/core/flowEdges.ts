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

/** y0~y1 구간에 걸쳐 있는 기호들. 수직 선이 지나갈 때의 장애물 후보입니다. */
function inVerticalStrip(rects: Rect[], y0: number, y1: number): Rect[] {
  const top = Math.min(y0, y1)
  const bottom = Math.max(y0, y1)
  return rects.filter(rect => rect.bottom > top && rect.top < bottom)
}

/**
 * y0~y1 사이를 내려가는 수직 선을 놓을 x. `clearHorizontalY`의 세로판입니다.
 * 원하는 열에 기호가 있으면 그 기호의 왼쪽이나 오른쪽으로 비킵니다.
 */
function clearVerticalX(
  rects: Rect[],
  y0: number,
  y1: number,
  preferredX: number,
  allow: (x: number) => boolean,
  prefer: -1 | 1,
): number {
  const strip = inVerticalStrip(rects, y0, y1)
  const isClear = (x: number) =>
    !strip.some(rect => rect.left - CLEARANCE < x && rect.right + CLEARANCE > x)
  if (isClear(preferredX)) return preferredX

  const candidates = strip
    .flatMap(rect => [rect.left - CLEARANCE, rect.right + CLEARANCE])
    .filter(x => allow(x) && isClear(x))
    .sort((a, b) => {
      const gap = Math.abs(a - preferredX) - Math.abs(b - preferredX)
      return gap !== 0 ? gap : (b - preferredX) * prefer - (a - preferredX) * prefer
    })
  return candidates[0] ?? preferredX
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

/** 엣지가 어느 꼭짓점에서 나가는지. 갈래가 아니면 아래쪽 가운데입니다. */
function exitBranchOf(edge: AlgorithmFlowEdge): "yes" | "no" | null {
  return edge.sourceHandle === "yes" || edge.sourceHandle === "no" ? edge.sourceHandle : null
}

/**
 * 일반 화살표(다음·예·아니오)의 직각 경로.
 *
 * - 아래쪽에서 나가는 화살표는 두 기호 사이 중간 높이에서 한 번 꺾습니다. 다음
 *   기호가 위나 옆에 있으면(학생이 그렇게 둔 경우) 두 기호 오른쪽 바깥 열로 돌아갑니다.
 * - 예/아니오는 마름모의 좌우 꼭짓점에서 각자의 방향으로 나가(교과서 표기) 목적지
 *   열까지 옆으로 간 뒤 내려갑니다. 목적지가 마름모 바로 아래면 도형을 뚫지 않도록
 *   최소한 옆으로 비켜 놓습니다.
 * - 빈 갈래(합류점으로 바로 가는 예/아니오)는 다음 기호들을 가로지르지 않도록
 *   순서도 바깥 통로로 우회합니다.
 *
 * 복귀선과 같은 규칙으로 다른 기호를 피합니다. 내려가는 세로 선은 기호가 있으면
 * 옆 열로, 가로 선은 위아래로 비킵니다. 학생이 기호를 옮겨 화살표 길목에 두어도
 * 선이 그 기호 뒤로 지나가지 않게 하기 위해서입니다.
 */
function plainRoute(
  nodes: AlgorithmFlowNode[],
  edge: AlgorithmFlowEdge,
  bounds: { left: number; right: number },
): RoutePoint[] | undefined {
  const source = nodes.find(node => node.id === edge.source)
  const target = nodes.find(node => node.id === edge.target)
  if (!source || !target) return undefined

  const exitBranch = source.data.kind === "decision" ? exitBranchOf(edge) : null
  const exitSide = exitBranch ? branchSide(exitBranch) : null
  const start = sourcePoint(source, edge.sourceHandle)
  const end = targetPoint(target)
  const obstacles = nodes
    .filter(node => node.id !== edge.source && node.id !== edge.target)
    .map(rectOf)

  if (!exitSide) {
    if (end.y - 34 < start.y + 34) {
      const outside =
        Math.max(
          source.position.x + sizeOf(source).width,
          target.position.x + sizeOf(target).width,
        ) + 34
      const bendX = clearVerticalX(
        obstacles,
        start.y + 34,
        end.y - 34,
        outside,
        x => x >= outside,
        1,
      )
      return [
        start,
        { x: start.x, y: start.y + 34 },
        { x: bendX, y: start.y + 34 },
        { x: bendX, y: end.y - 34 },
        { x: end.x, y: end.y - 34 },
        end,
      ]
    }
    const preferredY = start.y + (end.y - start.y) / 2
    const middleY = clearHorizontalY(
      obstacles,
      start.x,
      end.x,
      preferredY,
      y => y >= start.y + CLEARANCE && y <= end.y - CLEARANCE,
      1,
    )
    return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end]
  }

  const isDirectMerge = target.data.kind === "junction"
  const laneX = exitSide === "left" ? bounds.left - 34 : bounds.right + 34
  const turnX = exitSide === "left" ? Math.min(end.x, start.x - 12) : Math.max(end.x, start.x + 12)
  const bendX = isDirectMerge
    ? laneX
    : clearVerticalX(
        obstacles,
        start.y,
        end.y - 34,
        turnX,
        exitSide === "left" ? x => x <= start.x - 12 : x => x >= start.x + 12,
        exitSide === "left" ? -1 : 1,
      )
  const entryY = clearHorizontalY(obstacles, bendX, end.x, end.y - 34, y => y <= end.y - 34, -1)
  return [start, { x: bendX, y: start.y }, { x: bendX, y: entryY }, { x: end.x, y: entryY }, end]
}

/**
 * 모든 화살표의 경로를 지금 기호 위치와 크기로 다시 계산합니다.
 *
 * 경로는 좌표에 맞춰 계산해 둔 값이라, 학생이 기호를 끌어 옮기거나 긴 글을 넣어
 * 기호가 커지면 낡아서 옮긴 기호 뒤로 선이 지나가거나 긴 사선이 그려집니다. 그래서
 * 자동 배치 직후뿐 아니라 그래프가 바뀔 때마다(FlowCanvas의 replaceGraph) 이 함수로
 * 다시 계산합니다. 화면에서 측정한 크기(`measured`)가 있으면 그것을 씁니다.
 *
 * 경로가 그대로인 화살표는 같은 엣지 객체를 돌려주어 불필요한 다시 그리기를 피합니다.
 */
export function routeEdges(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): AlgorithmFlowEdge[] {
  const bounds = {
    left: Math.min(...nodes.map(node => node.position.x)),
    right: Math.max(...nodes.map(node => node.position.x + sizeOf(node).width)),
  }
  const plain = edges.map(edge => {
    if (edge.data?.branch === "loop-back") return edge
    const routePoints = plainRoute(nodes, edge, bounds)
    if (!routePoints || sameRoute(edge.data?.routePoints, routePoints)) return edge
    return { ...edge, data: { ...edge.data, routePoints } }
  })
  return routeLoopBacks(nodes, plain)
}

/** 중첩 반복의 복귀선 통로 간격. 짧은 반복이 안쪽, 바깥 반복일수록 바깥 통로를 씁니다. */
const LANE_GAP = 26

/**
 * 모든 복귀선의 경로를 지금 기호 위치와 크기로 다시 계산합니다.
 *
 * 복귀선 경로는 기호 사이를 비켜 가도록 좌표에 맞춰 계산해 두는데, 학생이 기호를
 * 끌어 옮기거나 긴 글을 넣어 기호가 커지면 그 경로는 낡아서 옮긴 기호 뒤로 선이
 * 지나갑니다. `routeEdges`가 일반 화살표와 함께 매번 다시 계산할 때 이 함수를 씁니다.
 *
 * 경로가 그대로인 복귀선은 같은 엣지 객체를 돌려주어 불필요한 다시 그리기를 피합니다.
 */
export function routeLoopBacks(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): AlgorithmFlowEdge[] {
  const nodesById = new Map(nodes.map(node => [node.id, node]))
  const spans = edges
    .filter(edge => edge.data?.branch === "loop-back")
    .map(edge => {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      const sourceBottom = source ? source.position.y + sizeOf(source).height : 0
      const targetTop = target?.position.y ?? 0
      return { id: edge.id, span: Math.abs(sourceBottom - targetTop) }
    })
    .sort((a, b) => a.span - b.span)
  const offsets = new Map(spans.map((entry, index) => [entry.id, index * LANE_GAP]))

  return edges.map(edge => {
    if (edge.data?.branch !== "loop-back") return edge
    const routePoints = loopBackRoute(
      nodes,
      edge.source,
      edge.sourceHandle,
      edge.target,
      offsets.get(edge.id),
    )
    if (sameRoute(edge.data.routePoints, routePoints)) return edge
    return { ...edge, data: { ...edge.data, routePoints } }
  })
}

function sameRoute(a: RoutePoint[] | undefined, b: RoutePoint[] | undefined): boolean {
  if (!a || !b) return a === b
  return a.length === b.length && a.every((point, i) => point.x === b[i].x && point.y === b[i].y)
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
