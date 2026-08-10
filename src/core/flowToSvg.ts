/**
 * 순서도 그래프 → 독립 실행 가능한 SVG 문자열.
 *
 * PNG로 저장할 때 씁니다. 화면의 DOM을 그대로 캡처하는 방식(html-to-image 등)은
 * React Flow가 화살표를 엣지마다 별도의 크기 없는 <svg>로 그리는 탓에 선이
 * 통째로 빠집니다. 그래서 이미 갖고 있는 좌표 정보(노드 위치 + routePoints)로
 * 직접 SVG를 만듭니다.
 *
 * 도형 색과 크기는 styles의 Sass 파일, 화살표 경로는 core/edgeGeometry.ts와 같은
 * 규칙을 씁니다.
 */

import {
  EDGE_COLOR as EDGE_STROKE,
  LOOP_EDGE_COLOR as LOOP_EDGE_STROKE,
  SHAPE_FILL,
} from "../constants/flowColors"
import { NODE_SIZES, oppositeSide, yesSideOf } from "./astToFlow"
import { loopBackPath, roundedRoutePath, type RoutePoint } from "./edgeGeometry"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./flowTypes"
import { SHAPE_OUTLINE_POINTS, type ShapePoint } from "./shapeGeometry"

const SHAPE_STROKE = "rgba(30, 41, 59, 0.42)"
/** 화살표 굵기 — styles/_tokens.scss의 --edge-width와 같은 값. */
const EDGE_WIDTH = 2.2
const LOOP_EDGE_WIDTH = 2.4
const TEXT_COLOR = "#111827"
const LABEL_COLOR = "#35415e"
const FONT_STACK = "-apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"

export const EXPORT_MARGIN = 48

export interface FlowSvg {
  markup: string
  width: number
  height: number
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function sizeOf(node: AlgorithmFlowNode) {
  const fallback = NODE_SIZES[node.data.kind] ?? NODE_SIZES.process
  return {
    width: node.measured?.width ?? fallback.width,
    height: node.measured?.height ?? fallback.height,
  }
}

/** 판단 기호의 예/아니오는 마름모의 좌우 꼭짓점에서 나갑니다(FlowNodes.tsx와 동일). */
function sourcePoint(node: AlgorithmFlowNode, handle: string | null | undefined): RoutePoint {
  const { width, height } = sizeOf(node)
  if (node.data.kind === "decision" && (handle === "yes" || handle === "no")) {
    const yesSide = yesSideOf(node.data)
    const side = handle === "yes" ? yesSide : oppositeSide(yesSide)
    return {
      x: side === "left" ? node.position.x : node.position.x + width,
      y: node.position.y + height / 2,
    }
  }
  return { x: node.position.x + width / 2, y: node.position.y + height }
}

function targetPoint(node: AlgorithmFlowNode): RoutePoint {
  const { width } = sizeOf(node)
  return { x: node.position.x + width / 2, y: node.position.y }
}

/** SHAPE_OUTLINE_POINTS(0~1 정규화 좌표)를 도형의 실제 픽셀 위치·크기로 늘려 그립니다. */
function outlinePolygon(
  points: readonly ShapePoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
): string {
  const scaled = points.map(([px, py]) => `${round(x + width * px)},${round(y + height * py)}`)
  return `<polygon points="${scaled.join(" ")}" fill="${fill}" stroke="${SHAPE_STROKE}" stroke-width="2" />`
}

function shapeMarkup(node: AlgorithmFlowNode): string {
  const { width, height } = sizeOf(node)
  const x = round(node.position.x)
  const y = round(node.position.y)
  const fill = SHAPE_FILL[node.data.kind] ?? SHAPE_FILL.process

  switch (node.data.kind) {
    case "junction":
      return `<circle cx="${round(x + width / 2)}" cy="${round(y + height / 2)}" r="${round(width / 2 - 1.5)}" fill="#ffffff" stroke="${EDGE_STROKE}" stroke-width="3" />`
    case "terminal":
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="32" fill="${fill}" stroke="${SHAPE_STROKE}" stroke-width="2" />`
    case "process":
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="${fill}" stroke="${SHAPE_STROKE}" stroke-width="2" />`
    case "input":
    case "output":
      return outlinePolygon(SHAPE_OUTLINE_POINTS.io, x, y, width, height, fill)
    case "decision":
      return outlinePolygon(SHAPE_OUTLINE_POINTS.decision, x, y, width, height, fill)
  }
}

/**
 * 기호 안 글자.
 *
 * foreignObject로 감싸면 브라우저의 줄바꿈을 그대로 쓸 수 있어서, 화면에서
 * 보이는 모양과 어긋나지 않습니다.
 */
function labelMarkup(node: AlgorithmFlowNode): string {
  if (node.data.kind === "junction") return ""

  const { width, height } = sizeOf(node)
  const isDecision = node.data.kind === "decision"
  // 마름모·평행사변형은 안쪽 폭이 좁으므로 글상자를 줄입니다(.decision-shape span 등).
  const innerWidth = isDecision ? 135 : 165
  const fontSize = isDecision ? 15 : 16
  const x = round(node.position.x + (width - innerWidth) / 2)
  const y = round(node.position.y)

  return (
    `<foreignObject x="${x}" y="${y}" width="${innerWidth}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;` +
    `height:${height}px;margin:0;font-family:${FONT_STACK};font-size:${fontSize}px;font-weight:700;` +
    `line-height:1.35;color:${TEXT_COLOR};text-align:center;overflow-wrap:anywhere">` +
    `${escapeXml(node.data.label)}</div></foreignObject>`
  )
}

function edgeMarkup(
  edge: AlgorithmFlowEdge,
  nodeById: Map<string, AlgorithmFlowNode>,
): { path: string; label: string } | null {
  const source = nodeById.get(edge.source)
  const target = nodeById.get(edge.target)
  if (!source || !target) return null

  const from = sourcePoint(source, edge.sourceHandle)
  const to = targetPoint(target)
  const routePoints = edge.data?.routePoints
  const isLoopBack = edge.data?.branch === "loop-back"

  const [d, labelX, labelY] =
    routePoints && routePoints.length >= 2
      ? roundedRoutePath(routePoints, from, to)
      : isLoopBack
        ? loopBackPath(from.x, from.y, to.x, to.y)
        : roundedRoutePath(
            [from, { x: from.x, y: (from.y + to.y) / 2 }, { x: to.x, y: (from.y + to.y) / 2 }, to],
            from,
            to,
          )

  const stroke = isLoopBack ? LOOP_EDGE_STROKE : EDGE_STROKE
  const path =
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${isLoopBack ? LOOP_EDGE_WIDTH : EDGE_WIDTH}" ` +
    `marker-end="url(#arrow-${isLoopBack ? "loop" : "plain"})" />`

  const text = typeof edge.label === "string" ? edge.label : ""
  if (!text) return { path, label: "" }

  // 한글은 글자당 폭이 넓으므로 넉넉하게 잡습니다.
  const halfWidth = text.length * 8 + 6
  const label =
    `<rect x="${round(labelX - halfWidth)}" y="${round(labelY - 10)}" width="${round(halfWidth * 2)}" height="20" ` +
    `rx="4" fill="#ffffff" fill-opacity="0.88" />` +
    `<text x="${round(labelX)}" y="${round(labelY)}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="${FONT_STACK}" font-size="13" font-weight="800" fill="${LABEL_COLOR}">${escapeXml(text)}</text>`

  return { path, label }
}

/**
 * 노드와 화살표 경로를 모두 감싸는 사각형.
 *
 * 반복 화살표는 기호 바깥의 전용 통로로 우회하므로 노드만 보면 잘립니다.
 * PNG 크기 계산과 캔버스 화면 맞추기가 같은 기준을 쓰도록 여기서 한 번만 구합니다.
 */
export function graphBounds(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null
  const { left, top, right, bottom } = contentBounds(nodes, edges)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function contentBounds(nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  for (const node of nodes) {
    const { width, height } = sizeOf(node)
    left = Math.min(left, node.position.x)
    top = Math.min(top, node.position.y)
    right = Math.max(right, node.position.x + width)
    bottom = Math.max(bottom, node.position.y + height)
  }

  for (const edge of edges) {
    for (const point of edge.data?.routePoints ?? []) {
      left = Math.min(left, point.x)
      top = Math.min(top, point.y)
      right = Math.max(right, point.x)
      bottom = Math.max(bottom, point.y)
    }
  }

  return { left, top, right, bottom }
}

export function flowToSvg(nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]): FlowSvg {
  if (nodes.length === 0) throw new Error("저장할 기호가 없어요.")

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const drawn = edges
    .map(edge => edgeMarkup(edge, nodeById))
    .filter((entry): entry is { path: string; label: string } => entry !== null)

  const { left, top, right, bottom } = contentBounds(nodes, edges)
  const width = Math.ceil(right - left) + EXPORT_MARGIN * 2
  const height = Math.ceil(bottom - top) + EXPORT_MARGIN * 2
  const offsetX = round(EXPORT_MARGIN - left)
  const offsetY = round(EXPORT_MARGIN - top)

  // markerWidth/Height의 기본 단위는 선 굵기입니다. 화면(React Flow)과 같은
  // 크기(10px 남짓)가 되도록 굵기를 곱한 값이 20 언저리가 되게 잡습니다.
  const arrowMarker = (id: string, color: string) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`

  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs>${arrowMarker("arrow-plain", EDGE_STROKE)}${arrowMarker("arrow-loop", LOOP_EDGE_STROKE)}</defs>` +
    `<rect width="${width}" height="${height}" fill="#ffffff" />` +
    `<g transform="translate(${offsetX} ${offsetY})">` +
    drawn.map(entry => entry.path).join("") +
    nodes.map(node => shapeMarkup(node) + labelMarkup(node)).join("") +
    drawn.map(entry => entry.label).join("") +
    `</g></svg>`

  return { markup, width, height }
}
