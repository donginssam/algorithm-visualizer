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

const NODE_SIZES: Record<FlowNodeData["kind"], { width: number; height: number }> = {
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
  const layoutGraph = new dagre.graphlib.Graph()
  layoutGraph.setDefaultEdgeLabel(() => ({}))
  layoutGraph.setGraph({ rankdir: "TB", nodesep: 54, ranksep: 86, marginx: 36, marginy: 28 })

  graph.nodes.forEach(node => {
    const size = NODE_SIZES[node.data.kind]
    layoutGraph.setNode(node.id, size)
  })

  graph.edges.forEach(edge => {
    if (edge.data?.branch !== "loop-back") {
      layoutGraph.setEdge(edge.source, edge.target)
    }
  })

  dagre.layout(layoutGraph)

  return {
    nodes: graph.nodes.map(node => {
      const point = layoutGraph.node(node.id)
      const size = NODE_SIZES[node.data.kind]
      return {
        ...node,
        position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
      }
    }),
    edges: graph.edges,
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
      type: "smoothstep",
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
