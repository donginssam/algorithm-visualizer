import type { Program, Statement } from "./ast"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./flowTypes"

export class FlowValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FlowValidationError"
  }
}

function branchOf(edge: AlgorithmFlowEdge): "yes" | "no" | "next" | "loop-back" {
  if (edge.sourceHandle === "yes" || edge.sourceHandle === "no") return edge.sourceHandle
  if (edge.data?.branch) return edge.data.branch
  if (edge.label === "예") return "yes"
  if (edge.label === "아니오") return "no"
  return "next"
}

function statementFromNode(node: AlgorithmFlowNode): Statement {
  const label = node.data.label.trim()

  if (node.data.kind === "process") {
    const arrowIndex = label.indexOf("←")
    const target = label.slice(0, arrowIndex).trim()
    const expr = label.slice(arrowIndex + 1).trim()
    if (arrowIndex < 1 || !target || !expr) {
      throw new FlowValidationError(`'${label || "처리"}' 기호는 '변수 ← 식' 형식으로 적어 주세요.`)
    }
    return { type: "assign", target, expr }
  }

  if (node.data.kind === "input") {
    const variable = label.replace(/^입력\s*:\s*/, "").replace(/\s+입력$/, "").trim()
    if (!variable || variable === label) {
      throw new FlowValidationError(`'${label || "입력"}' 기호는 '입력: 변수' 형식으로 적어 주세요.`)
    }
    return { type: "input", variable }
  }

  if (node.data.kind === "output") {
    const expr = label.replace(/^출력\s*:\s*/, "").replace(/\s+출력$/, "").trim()
    if (!expr || expr === label) {
      throw new FlowValidationError(`'${label || "출력"}' 기호는 '출력: 값' 형식으로 적어 주세요.`)
    }
    return { type: "output", expr }
  }

  throw new FlowValidationError("이 기호를 의사코드 문장으로 바꿀 수 없어요.")
}

/**
 * React Flow 그래프를 구조화된 AST로 되돌립니다.
 * 분기는 합류점에서 다시 만나야 하고, 반복의 '예' 경로만 판단 기호로 되돌아갈 수 있습니다.
 */
export function flowToAst(nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]): Program {
  const nodesById = new Map(nodes.map(node => [node.id, node]))
  const starts = nodes.filter(node => node.data.kind === "terminal" && node.data.terminalRole === "start")
  const ends = nodes.filter(node => node.data.kind === "terminal" && node.data.terminalRole === "end")

  if (starts.length !== 1 || ends.length !== 1) {
    throw new FlowValidationError("시작과 끝 기호가 각각 하나씩 있어야 해요.")
  }

  for (const edge of edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) {
      throw new FlowValidationError("존재하지 않는 기호에 연결된 화살표가 있어요.")
    }
  }

  const outgoing = new Map<string, AlgorithmFlowEdge[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? []
    list.push(edge)
    outgoing.set(edge.source, list)
  }

  const startEdges = outgoing.get(starts[0].id) ?? []
  if (startEdges.length !== 1) {
    throw new FlowValidationError("시작 기호에서는 화살표가 하나만 나가야 해요.")
  }
  if ((outgoing.get(ends[0].id) ?? []).length > 0) {
    throw new FlowValidationError("끝 기호에서는 화살표가 나갈 수 없어요.")
  }

  const reachable = new Set<string>()
  const visit = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    for (const edge of outgoing.get(id) ?? []) visit(edge.target)
  }
  visit(starts[0].id)
  const unreachable = nodes.find(node => !reachable.has(node.id))
  if (unreachable) {
    throw new FlowValidationError(`'${unreachable.data.label}' 기호의 연결이 끊겨 있어요.`)
  }

  const consumed = new Set<string>([starts[0].id])

  const requireSingleNext = (node: AlgorithmFlowNode): AlgorithmFlowEdge => {
    const nextEdges = outgoing.get(node.id) ?? []
    if (nextEdges.length !== 1) {
      throw new FlowValidationError(`'${node.data.label}' 기호에서는 화살표가 하나만 나가야 해요.`)
    }
    return nextEdges[0]
  }

  const decisionBranches = (node: AlgorithmFlowNode) => {
    const branchEdges = outgoing.get(node.id) ?? []
    const yes = branchEdges.filter(edge => branchOf(edge) === "yes")
    const no = branchEdges.filter(edge => branchOf(edge) === "no")
    if (branchEdges.length !== 2 || yes.length !== 1 || no.length !== 1) {
      throw new FlowValidationError(`'${node.data.label}' 판단에는 '예'와 '아니오' 화살표가 하나씩 필요해요.`)
    }
    return { yes: yes[0], no: no[0] }
  }

  interface ParsedPath {
    body: Statement[]
    stopId: string
  }

  const parsePath = (initialId: string, explicitStops = new Set<string>()): ParsedPath => {
    const body: Statement[] = []
    let currentId = initialId

    while (true) {
      if (explicitStops.has(currentId)) return { body, stopId: currentId }
      if (currentId === ends[0].id) return { body, stopId: currentId }

      const node = nodesById.get(currentId)
      if (!node) throw new FlowValidationError("화살표가 연결된 기호를 찾지 못했어요.")
      if (node.data.kind === "junction") return { body, stopId: node.id }
      if (node.data.kind === "terminal") {
        throw new FlowValidationError("흐름 중간에 시작 또는 끝 기호가 잘못 연결되어 있어요.")
      }
      if (consumed.has(node.id)) {
        throw new FlowValidationError(`'${node.data.label}' 기호로 흐름이 잘못 되돌아가요.`)
      }
      consumed.add(node.id)

      if (node.data.kind === "decision") {
        const condition = node.data.label.trim()
        if (!condition) throw new FlowValidationError("판단 기호 안에 조건을 적어 주세요.")
        const branches = decisionBranches(node)

        if (node.data.controlKind === "loop") {
          const loopPath = parsePath(branches.yes.target, new Set([node.id]))
          if (loopPath.stopId !== node.id) {
            throw new FlowValidationError(`'${condition}' 반복의 '예' 흐름이 판단 기호로 돌아오지 않아요.`)
          }
          body.push({ type: "loop", condition, body: loopPath.body })
          currentId = branches.no.target
          continue
        }

        const thenPath = parsePath(branches.yes.target)
        const elsePath = parsePath(branches.no.target)
        if (thenPath.stopId !== elsePath.stopId) {
          throw new FlowValidationError(`'${condition}'의 '예/아니오' 흐름이 같은 곳에서 만나야 해요.`)
        }
        const junction = nodesById.get(thenPath.stopId)
        if (!junction || junction.data.kind !== "junction") {
          throw new FlowValidationError(`'${condition}'의 두 흐름 뒤에 합류점이 필요해요.`)
        }
        if (consumed.has(junction.id)) {
          throw new FlowValidationError("한 합류점을 여러 판단에서 함께 사용할 수 없어요.")
        }
        consumed.add(junction.id)
        body.push({ type: "if", condition, thenBody: thenPath.body, elseBody: elsePath.body })
        currentId = requireSingleNext(junction).target
        continue
      }

      body.push(statementFromNode(node))
      currentId = requireSingleNext(node).target
    }
  }

  const parsed = parsePath(startEdges[0].target)
  if (parsed.stopId !== ends[0].id) {
    throw new FlowValidationError("흐름이 끝 기호까지 이어지지 않았어요.")
  }
  consumed.add(ends[0].id)

  const unused = nodes.find(node => !consumed.has(node.id))
  if (unused) {
    throw new FlowValidationError(`'${unused.data.label}' 기호가 올바른 흐름에 포함되지 않았어요.`)
  }

  return { body: parsed.body }
}
