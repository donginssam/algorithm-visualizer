import dagre from "@dagrejs/dagre"
import { MarkerType, type EdgeMarker } from "@xyflow/react"
import { EDGE_COLOR, LOOP_EDGE_COLOR } from "../constants/flowColors"
import { ASSIGN_GLYPH, INPUT_PREFIX, OUTPUT_PREFIX } from "../constants/pseudocode"
import type { Program, Statement } from "./ast"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  DecisionSide,
  FlowEdgeData,
  FlowGraph,
  FlowNodeData,
} from "./flowTypes"

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

function flowNode(
  id: string,
  data: FlowNodeData,
  type: AlgorithmFlowNode["type"],
): AlgorithmFlowNode {
  return { id, type, data, position: { x: 0, y: 0 } }
}

function statementData(statement: Exclude<Statement, { type: "loop" | "if" }>): FlowNodeData {
  switch (statement.type) {
    case "action":
      return { kind: "process", label: statement.text }
    case "assign":
      return { kind: "process", label: `${statement.target} ${ASSIGN_GLYPH} ${statement.expr}` }
    case "input":
      return { kind: "input", label: `${INPUT_PREFIX}${statement.variable}` }
    case "output":
      return { kind: "output", label: `${OUTPUT_PREFIX}${statement.expr}` }
  }
}

export function oppositeSide(side: DecisionSide): DecisionSide {
  return side === "left" ? "right" : "left"
}

/**
 * 판단 기호의 '예'가 나가는 쪽.
 *
 * 조건과 반복 모두 교과서에서 같은 방향으로 읽을 수 있도록 왼쪽으로 고정합니다.
 * 이전에 저장된 그래프에 방향이 명시되어 있으면 기존 경로와의 일관성을 유지합니다.
 */
export function yesSideOf(data: FlowNodeData): DecisionSide {
  return data.yesSide ?? "left"
}

/**
 * Dagre가 판단의 두 갈래를 같은 순위에 놓을 때 적용할 좌우 순서입니다.
 *
 * 연결점만 왼쪽으로 바꾸면 본문이 반대편에 배치되어 선이 교차할 수 있습니다.
 * `예`의 첫 기호를 왼쪽, `아니오`의 첫 기호를 오른쪽에 두도록 배치기에 함께
 * 알려 화면 연결점과 실제 본문 위치를 일치시킵니다.
 */
function decisionOrderConstraints(graph: FlowGraph): Array<{ left: string; right: string }> {
  return graph.nodes.flatMap(node => {
    if (node.data.kind !== "decision") return []

    const outgoing = graph.edges.filter(edge => edge.source === node.id)
    const yesTarget = outgoing.find(edge => edge.data?.branch === "yes")?.target
    const noTarget = outgoing.find(edge => edge.data?.branch === "no")?.target
    if (!yesTarget || !noTarget || yesTarget === noTarget) return []

    return [{ left: yesTarget, right: noTarget }]
  })
}

function layoutFlowGraph(graph: FlowGraph): FlowGraph {
  const layoutGraph = new dagre.graphlib.Graph({ multigraph: true })
  layoutGraph.setDefaultEdgeLabel(() => ({}))
  layoutGraph.setGraph({ rankdir: "TB", nodesep: 54, ranksep: 86, marginx: 36, marginy: 28 })

  graph.nodes.forEach(node => {
    const size = NODE_SIZES[node.data.kind]
    // Dagre가 노드 라벨 객체에 x/y를 기록하므로 종류별 크기 객체를 공유하면
    // 같은 종류의 모든 노드가 마지막 좌표로 덮입니다.
    layoutGraph.setNode(node.id, { ...size })
  })

  graph.edges.forEach(edge => {
    if (edge.data?.branch !== "loop-back") {
      layoutGraph.setEdge(edge.source, edge.target, {}, edge.id)
    }
  })

  // Dagre 3의 동적 캐시는 서로 다른 예제/StrictMode 렌더 사이에서 좌표를 섞을 수 있습니다.
  // 매 변환을 독립 배치해 같은 입력은 항상 같은 위치를 얻도록 합니다.
  dagre.layout(layoutGraph, {
    useDynamic: false,
    constraints: decisionOrderConstraints(graph),
  })

  const positioned = graph.nodes.map(node => {
    const point = layoutGraph.node(node.id)
    const size = NODE_SIZES[node.data.kind]
    return {
      ...node,
      position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
    }
  })
  const nodes = positioned.map(node => {
    return node.data.kind === "decision"
      ? { ...node, data: { ...node.data, yesSide: "left" as const } }
      : node
  })
  // 아래 화살표 경로 계산은 반드시 yesSide가 적힌 노드를 봐야 합니다. 손잡이(화면)와
  // 경로(선)가 서로 다른 쪽을 고르면 선이 도형을 가로질러 버립니다.
  const nodesById = new Map(nodes.map(node => [node.id, node]))
  const graphLeft = Math.min(...nodes.map(node => node.position.x))
  const graphRight = Math.max(
    ...nodes.map(node => node.position.x + NODE_SIZES[node.data.kind].width),
  )

  const loopEdges = graph.edges
    .filter(edge => edge.data?.branch === "loop-back")
    .map(edge => {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      const sourceSize = source ? NODE_SIZES[source.data.kind] : NODE_SIZES.process
      const targetSize = target ? NODE_SIZES[target.data.kind] : NODE_SIZES.decision
      const sourceBottom = (source?.position.y ?? 0) + sourceSize.height
      const targetTop = target?.position.y ?? 0
      return {
        edge,
        source,
        target,
        sourceSize,
        targetSize,
        span: Math.abs(sourceBottom - targetTop),
      }
    })
    .sort((a, b) => a.span - b.span)
  const loopLaneById = new Map(
    loopEdges.map((entry, index) => [entry.edge.id, graphLeft - 46 - index * 26]),
  )

  const edges = graph.edges.map(edge => {
    if (edge.data?.branch !== "loop-back") {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      if (!source || !target) return edge

      const sourceSize = NODE_SIZES[source.data.kind]
      const targetSize = NODE_SIZES[target.data.kind]
      const branch = edge.data?.branch
      // 예/아니오는 마름모의 좌우 꼭짓점에서 각자의 방향으로 나갑니다(§2 교과서 표기).
      const exitSide =
        source.data.kind === "decision" && (branch === "yes" || branch === "no")
          ? branch === "yes"
            ? yesSideOf(source.data)
            : oppositeSide(yesSideOf(source.data))
          : null
      const sourcePoint = exitSide
        ? {
            x: exitSide === "left" ? source.position.x : source.position.x + sourceSize.width,
            y: source.position.y + sourceSize.height / 2,
          }
        : {
            x: source.position.x + sourceSize.width / 2,
            y: source.position.y + sourceSize.height,
          }
      const targetPoint = {
        x: target.position.x + targetSize.width / 2,
        y: target.position.y,
      }
      const isDirectMerge = exitSide !== null && target.data.kind === "junction"
      // 빈 갈래는 다음 기호들을 가로지르지 않도록 순서도 바깥 통로로 우회합니다.
      const laneX = exitSide === "left" ? graphLeft - 34 : graphRight + 34
      // 그 밖의 갈래는 목적지 열까지 옆으로 나간 뒤 내려갑니다. 목적지가 마름모
      // 바로 아래에 있으면 도형을 뚫지 않도록 최소한 옆으로 비켜 놓습니다.
      const turnX =
        exitSide === "left"
          ? Math.min(targetPoint.x, sourcePoint.x - 12)
          : Math.max(targetPoint.x, sourcePoint.x + 12)
      const middleY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2
      const routePoints = exitSide
        ? [
            sourcePoint,
            { x: isDirectMerge ? laneX : turnX, y: sourcePoint.y },
            { x: isDirectMerge ? laneX : turnX, y: targetPoint.y - 34 },
            { x: targetPoint.x, y: targetPoint.y - 34 },
            targetPoint,
          ]
        : [
            sourcePoint,
            { x: sourcePoint.x, y: middleY },
            { x: targetPoint.x, y: middleY },
            targetPoint,
          ]
      return {
        ...edge,
        data: { ...edge.data, routePoints },
      }
    }

    const entry = loopEdges.find(candidate => candidate.edge.id === edge.id)
    const laneX = loopLaneById.get(edge.id)
    if (!entry?.source || !entry.target || laneX === undefined) return edge

    const sourceX = entry.source.position.x + entry.sourceSize.width / 2
    const sourceY = entry.source.position.y + entry.sourceSize.height
    const targetX = entry.target.position.x + entry.targetSize.width / 2
    const targetY = entry.target.position.y
    return {
      ...edge,
      data: {
        ...edge.data,
        routePoints: [
          { x: sourceX, y: sourceY },
          { x: sourceX, y: sourceY + 34 },
          { x: laneX, y: sourceY + 34 },
          { x: laneX, y: targetY - 34 },
          { x: targetX, y: targetY - 34 },
          { x: targetX, y: targetY },
        ],
      },
    }
  })

  return {
    nodes,
    edges,
  }
}

/** AST를 React Flow에서 바로 사용할 수 있는 노드와 화살표로 바꿉니다. */
export function astToFlow(program: Program): FlowGraph {
  /*
   * 본문이 비어 있으면 '끝'을 두지 않습니다.
   *
   * 처음 화면에 '시작 → 끝'이 놓여 있으면 이미 완성된 프로그램처럼 보이고,
   * 사이에 기호를 끼우려면 화살표부터 지워야 합니다. '시작' 하나에서 출발해
   * 아래로 쌓아 가고 '끝' 단말은 학생이 직접 놓게 합니다.
   */
  const hasEnd = program.body.length > 0
  const nodes: AlgorithmFlowNode[] = [
    flowNode(
      "terminal-start",
      { kind: "terminal", label: "시작", terminalRole: "start" },
      "terminal",
    ),
    ...(hasEnd
      ? [
          flowNode(
            "terminal-end",
            { kind: "terminal", label: "끝", terminalRole: "end" },
            "terminal",
          ),
        ]
      : []),
  ]
  const edges: AlgorithmFlowEdge[] = []
  let edgeSequence = 0

  const addEdge = (source: string, target: string, branch: FlowEdgeData["branch"] = "next") => {
    const isBranch = branch === "yes" || branch === "no"
    edges.push({
      id: `edge-${edgeSequence++}`,
      source,
      target,
      sourceHandle: isBranch ? branch : "next",
      targetHandle: "target",
      type: branch === "loop-back" ? "loop-back" : "editable",
      label: branch === "yes" ? "예" : branch === "no" ? "아니오" : undefined,
      markerEnd: arrowMarker(branch),
      data: { branch },
      className: branch === "loop-back" ? "loop-back-edge" : undefined,
    })
  }

  const buildBlock = (
    statements: Statement[],
    incoming: Array<{ id: string; branch?: FlowEdgeData["branch"] }>,
    path: string,
  ): Array<{ id: string; branch?: FlowEdgeData["branch"] }> => {
    let exits = incoming

    statements.forEach((statement, index) => {
      const id = `statement-${path}-${index}`

      if (statement.type === "loop") {
        nodes.push(
          flowNode(
            id,
            { kind: "decision", label: statement.condition, controlKind: "loop" },
            "decision",
          ),
        )
        exits.forEach(exit => addEdge(exit.id, id, exit.branch))
        const bodyExits = buildBlock(
          statement.body,
          [{ id, branch: "yes" }],
          `${path}-${index}-loop`,
        )
        bodyExits.forEach(exit => addEdge(exit.id, id, "loop-back"))
        exits = [{ id, branch: "no" }]
        return
      }

      if (statement.type === "if") {
        const junctionId = `${id}-junction`
        nodes.push(
          flowNode(
            id,
            { kind: "decision", label: statement.condition, controlKind: "if" },
            "decision",
          ),
          flowNode(junctionId, { kind: "junction", label: "합류" }, "junction"),
        )
        exits.forEach(exit => addEdge(exit.id, id, exit.branch))

        const thenExits = buildBlock(
          statement.thenBody,
          [{ id, branch: "yes" }],
          `${path}-${index}-then`,
        )
        const elseExits = statement.elseBody.length
          ? buildBlock(statement.elseBody, [{ id, branch: "no" }], `${path}-${index}-else`)
          : [{ id, branch: "no" as const }]
        thenExits.forEach(exit => addEdge(exit.id, junctionId, exit.branch))
        elseExits.forEach(exit => addEdge(exit.id, junctionId, exit.branch))
        exits = [{ id: junctionId }]
        return
      }

      const data = statementData(statement)
      const type = data.kind === "process" ? "process" : "io"
      nodes.push(flowNode(id, data, type))
      exits.forEach(exit => addEdge(exit.id, id, exit.branch))
      exits = [{ id }]
    })

    return exits
  }

  const exits = buildBlock(program.body, [{ id: "terminal-start" }], "root")
  if (hasEnd) exits.forEach(exit => addEdge(exit.id, "terminal-end", exit.branch))

  return layoutFlowGraph({ nodes, edges })
}
