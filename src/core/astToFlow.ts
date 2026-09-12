import { RANK_GAP, sizeOf } from "./nodeGeometry"
import { edgeAppearance, routeEdges } from "./flowEdges"
import { createJunctionNode, junctionIdOf } from "./graphTopology"
import dagre from "@dagrejs/dagre"
import { ASSIGN_GLYPH, INPUT_PREFIX, OUTPUT_PREFIX } from "../constants/pseudocode"
import type { Program, Statement } from "./ast"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  FlowEdgeData,
  FlowGraph,
  FlowNodeData,
} from "./flowTypes"

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

/**
 * 판단 한 곳의 두 갈래에 속한 기호들.
 *
 * `astToFlow`가 그래프를 만들면서 그대로 적어 둡니다. 배치가 끝난 뒤 '예' 본문이
 * 오른쪽에 놓였는지 확인하려면 어느 기호가 어느 갈래인지 정확히 알아야 하는데,
 * 완성된 그래프를 되짚어 추측하는 것보다 만들 때 적어 두는 편이 정확합니다.
 */
export interface BranchGroup {
  decisionId: string
  yes: string[]
  no: string[]
}

/** Dagre에 '예'의 첫 기호를 왼쪽에 두라고 알려 줍니다(지켜지지 않을 수 있습니다). */
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

/** 바깥 갈래부터 좌우를 보정한 뒤, 겹친 행을 아래로 밀어 간격을 확보합니다. */
function normalizeBranchSides(
  nodes: AlgorithmFlowNode[],
  edges: AlgorithmFlowEdge[],
  branchGroups: BranchGroup[],
): AlgorithmFlowNode[] {
  const positions = new Map(nodes.map(node => [node.id, { ...node.position }]))
  const widths = new Map(nodes.map(node => [node.id, sizeOf(node).width]))
  const centerX = (id: string) => positions.get(id)!.x + widths.get(id)! / 2
  const mirror = (ids: string[], axis: number) => {
    for (const id of ids) positions.get(id)!.x = 2 * axis - positions.get(id)!.x - widths.get(id)!
  }
  const ordered = [...branchGroups].sort(
    (a, b) => positions.get(a.decisionId)!.y - positions.get(b.decisionId)!.y,
  )
  for (const group of ordered) {
    const yes = edges.find(
      edge => edge.source === group.decisionId && edge.sourceHandle === "yes",
    )?.target
    const no = edges.find(
      edge => edge.source === group.decisionId && edge.sourceHandle === "no",
    )?.target
    if (!yes || !no) continue
    const axis = centerX(group.decisionId)
    if (centerX(yes) > centerX(no)) {
      mirror(
        group.no.length ? [...group.yes, ...group.no] : group.yes,
        group.no.length ? (centerX(yes) + centerX(no)) / 2 : centerX(no),
      )
    }
    if (centerX(yes) > axis) mirror(group.yes, axis)
    else if (group.no.length && centerX(no) < axis) mirror(group.no, axis)
  }
  // 반전 후 겹침을 없앱니다. 후속 행도 같은 만큼 내려 화살표의 상하 순서를 보존합니다.
  const placed: AlgorithmFlowNode[] = []
  let offset = 0
  for (const node of [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id),
  )) {
    const position = positions.get(node.id)!
    const size = sizeOf(node)
    let y = node.position.y + offset
    for (const previous of placed) {
      const previousSize = sizeOf(previous)
      const horizontalOverlap =
        position.x < previous.position.x + previousSize.width &&
        position.x + size.width > previous.position.x
      if (horizontalOverlap && y < previous.position.y + previousSize.height + 54) {
        y = previous.position.y + previousSize.height + 54
      }
    }
    offset = y - node.position.y
    position.y = y
    placed.push({ ...node, position })
  }
  return nodes.map(node => ({ ...node, position: positions.get(node.id)! }))
}

export function layoutFlowGraph(graph: FlowGraph, branchGroups: BranchGroup[]): FlowGraph {
  const layoutGraph = new dagre.graphlib.Graph({ multigraph: true })
  layoutGraph.setDefaultEdgeLabel(() => ({}))
  layoutGraph.setGraph({ rankdir: "TB", nodesep: 54, ranksep: RANK_GAP, marginx: 36, marginy: 28 })

  graph.nodes.forEach(node => {
    // 화면에서 잰 크기가 있으면 그것을 씁니다. 기호 안에 긴 글을 넣으면 도형이
    // 늘어나는데(.flow-shape의 min-height), 표준 크기로 자리를 잡으면 늘어난 만큼
    // 아래 기호를 덮어 버립니다.
    const size = sizeOf(node)
    // Dagre가 노드 라벨 객체에 x/y를 기록하므로 종류별 크기 객체를 공유하면
    // 같은 종류의 모든 노드가 마지막 좌표로 덮입니다.
    layoutGraph.setNode(node.id, { ...size })
  })

  graph.edges.forEach(edge => {
    if (edge.data?.branch !== "loop-back") {
      layoutGraph.setEdge(edge.source, edge.target, {}, edge.id)
    }
  })

  /*
   * Dagre 3의 동적 캐시는 서로 다른 예제/StrictMode 렌더 사이에서 좌표를 섞을 수
   * 있습니다. 매 변환을 독립 배치해 같은 입력은 항상 같은 위치를 얻도록 합니다.
   *
   * `constraints`는 '예'의 첫 기호를 왼쪽에 두라고 알려 주지만 **항상 지켜지지는
   * 않습니다.** 두 갈래가 같은 순위의 이웃으로 놓이는 모양(반복 등)에서는 그대로
   * 따르고, 그렇지 않은 모양(본문 길이가 다른 조건, 아니면이 빈 조건, 중첩된
   * 조건)에서는 조용히 무시됩니다. 그래서 배치가 끝난 뒤 normalizeBranchSides가
   * 남은 경우를 바로잡습니다.
   */
  dagre.layout(layoutGraph, {
    useDynamic: false,
    constraints: decisionOrderConstraints(graph),
  })

  const positioned = graph.nodes.map(node => {
    const point = layoutGraph.node(node.id)
    const size = sizeOf(node)
    return {
      ...node,
      position: { x: point.x - size.width / 2, y: point.y - size.height / 2 },
    }
  })
  const nodes = normalizeBranchSides(positioned, graph.edges, branchGroups)
  // 화살표 경로는 정렬이 끝난 좌표로 계산합니다. 화면에서 기호를 옮길 때도 같은
  // 함수로 다시 계산하므로(FlowCanvas.replaceGraph) 경로 규칙은 flowEdges.ts 한 곳입니다.
  return { nodes, edges: routeEdges(nodes, graph.edges) }
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
  const branchGroups: BranchGroup[] = []
  let edgeSequence = 0

  /*
   * 화살표 하나를 놓습니다.
   *
   * `branch`는 선의 종류(보통 선인지 반복 복귀선인지)이고, `exit`은 그 선이
   * 기호의 어느 자리에서 나가는지입니다. 둘은 서로 다를 수 있습니다. 반복 본문이
   * 또 다른 반복으로 끝나면 안쪽 판단의 '아니오' 꼭짓점에서 바깥 판단으로
   * 되돌아가는 복귀선이 생기는데, 이때 '아니오' 표시를 잃으면 안쪽 판단에
   * 아니오 화살표가 없는 순서도가 됩니다(의사코드로 되돌릴 수도 없습니다).
   */
  const addEdge = (
    source: string,
    target: string,
    branch: FlowEdgeData["branch"] = "next",
    exit: FlowEdgeData["branch"] = branch,
  ) => {
    const isBranch = exit === "yes" || exit === "no"
    edges.push({
      id: `edge-${edgeSequence++}`,
      source,
      target,
      sourceHandle: isBranch ? exit : "next",
      targetHandle: "target",
      ...edgeAppearance(branch, isBranch ? exit : "next"),
      data: { branch },
    })
  }

  /** 블록을 만드는 동안 새로 생긴 기호들을 모읍니다. 갈래 좌우 정렬에 씁니다. */
  const collectIds = <T>(build: () => T): { result: T; ids: string[] } => {
    const from = nodes.length
    const result = build()
    return { result, ids: nodes.slice(from).map(node => node.id) }
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
        const body = collectIds(() =>
          buildBlock(statement.body, [{ id, branch: "yes" }], `${path}-${index}-loop`),
        )
        body.result.forEach(exit => addEdge(exit.id, id, "loop-back", exit.branch))
        branchGroups.push({ decisionId: id, yes: body.ids, no: [] })
        exits = [{ id, branch: "no" }]
        return
      }

      if (statement.type === "if") {
        const junctionId = junctionIdOf(id)
        nodes.push(
          flowNode(
            id,
            { kind: "decision", label: statement.condition, controlKind: "if" },
            "decision",
          ),
          // 자리는 아래 layoutFlowGraph가 정합니다.
          createJunctionNode(id),
        )
        exits.forEach(exit => addEdge(exit.id, id, exit.branch))

        const thenBlock = collectIds(() =>
          buildBlock(statement.thenBody, [{ id, branch: "yes" }], `${path}-${index}-then`),
        )
        const elseBlock = statement.elseBody.length
          ? collectIds(() =>
              buildBlock(statement.elseBody, [{ id, branch: "no" }], `${path}-${index}-else`),
            )
          : { result: [{ id, branch: "no" as const }], ids: [] }
        thenBlock.result.forEach(exit => addEdge(exit.id, junctionId, exit.branch))
        elseBlock.result.forEach(exit => addEdge(exit.id, junctionId, exit.branch))
        branchGroups.push({ decisionId: id, yes: thenBlock.ids, no: elseBlock.ids })
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

  return layoutFlowGraph({ nodes, edges }, branchGroups)
}
