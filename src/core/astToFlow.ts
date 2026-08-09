import dagre from "@dagrejs/dagre"
import { MarkerType } from "@xyflow/react"
import type { Program, Statement } from "./ast"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  FlowEdgeData,
  FlowGraph,
  FlowNodeData,
} from "./flowTypes"

/** 도형 크기. src/index.css의 .flow-shape 계열 규칙과 반드시 같아야 합니다. */
export const NODE_SIZES: Record<FlowNodeData["kind"], { width: number; height: number }> = {
  terminal: { width: 172, height: 64 },
  input: { width: 190, height: 76 },
  output: { width: 190, height: 76 },
  process: { width: 190, height: 72 },
  decision: { width: 220, height: 124 },
  junction: { width: 18, height: 18 },
}

function flowNode(id: string, data: FlowNodeData, type: AlgorithmFlowNode["type"]): AlgorithmFlowNode {
  return { id, type, data, position: { x: 0, y: 0 } }
}

function statementData(statement: Exclude<Statement, { type: "loop" | "if" }>): FlowNodeData {
  switch (statement.type) {
    case "assign":
      return { kind: "process", label: `${statement.target} ← ${statement.expr}` }
    case "input":
      return { kind: "input", label: `입력: ${statement.variable}` }
    case "output":
      return { kind: "output", label: `출력: ${statement.expr}` }
  }
}

export function layoutFlowGraph(graph: FlowGraph): FlowGraph {
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
  dagre.layout(layoutGraph, { useDynamic: false })

  const nodes = graph.nodes.map(node => {
    const point = layoutGraph.node(node.id)
    const size = NODE_SIZES[node.data.kind]
    return {
      ...node,
      position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
    }
  })
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
      return { edge, source, target, sourceSize, targetSize, span: Math.abs(sourceBottom - targetTop) }
    })
    .sort((a, b) => a.span - b.span)
  const loopLaneById = new Map(
    loopEdges.map((entry, index) => [entry.edge.id, graphRight + 46 + index * 26]),
  )

  const edges = graph.edges.map(edge => {
    if (edge.data?.branch !== "loop-back") {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      if (!source || !target) return edge

      const sourceSize = NODE_SIZES[source.data.kind]
      const targetSize = NODE_SIZES[target.data.kind]
      const branch = edge.data?.branch
      const isLoopDecision = source.data.kind === "decision" && source.data.controlKind === "loop"
      const sourceRatio = branch === "yes"
        ? (isLoopDecision ? 0.66 : 0.34)
        : branch === "no"
          ? (isLoopDecision ? 0.34 : 0.66)
          : 0.5
      const sourcePoint = {
        x: source.position.x + sourceSize.width * sourceRatio,
        y: source.position.y + sourceSize.height,
      }
      const targetPoint = {
        x: target.position.x + targetSize.width / 2,
        y: target.position.y,
      }
      const isDirectMerge = source.data.kind === "decision"
        && target.data.kind === "junction"
        && (branch === "yes" || branch === "no")
      const middleY = sourcePoint.y + (targetPoint.y - sourcePoint.y) / 2
      const routePoints = isDirectMerge
        ? [
            sourcePoint,
            { x: sourcePoint.x, y: sourcePoint.y + 34 },
            { x: branch === "yes" ? graphLeft - 34 : graphRight + 34, y: sourcePoint.y + 34 },
            { x: branch === "yes" ? graphLeft - 34 : graphRight + 34, y: targetPoint.y - 34 },
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
  const nodes: AlgorithmFlowNode[] = [
    flowNode("terminal-start", { kind: "terminal", label: "시작", terminalRole: "start" }, "terminal"),
    flowNode("terminal-end", { kind: "terminal", label: "끝", terminalRole: "end" }, "terminal"),
  ]
  const edges: AlgorithmFlowEdge[] = []
  let edgeSequence = 0

  const addEdge = (
    source: string,
    target: string,
    branch: FlowEdgeData["branch"] = "next",
  ) => {
    const isBranch = branch === "yes" || branch === "no"
    edges.push({
      id: `edge-${edgeSequence++}`,
      source,
      target,
      sourceHandle: isBranch ? branch : "next",
      targetHandle: "target",
      type: branch === "loop-back" ? "loop-back" : "editable",
      label: branch === "yes" ? "예" : branch === "no" ? "아니오" : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
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
        const bodyExits = buildBlock(statement.body, [{ id, branch: "yes" }], `${path}-${index}-loop`)
        bodyExits.forEach(exit => addEdge(exit.id, id, "loop-back"))
        exits = [{ id, branch: "no" }]
        return
      }

      if (statement.type === "if") {
        const junctionId = `${id}-junction`
        nodes.push(
          flowNode(id, { kind: "decision", label: statement.condition, controlKind: "if" }, "decision"),
          flowNode(junctionId, { kind: "junction", label: "합류" }, "junction"),
        )
        exits.forEach(exit => addEdge(exit.id, id, exit.branch))

        const thenExits = buildBlock(statement.thenBody, [{ id, branch: "yes" }], `${path}-${index}-then`)
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
  exits.forEach(exit => addEdge(exit.id, "terminal-end", exit.branch))

  return layoutFlowGraph({ nodes, edges })
}
