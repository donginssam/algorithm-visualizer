import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { INPUT_PREFIX } from "../constants/pseudocode"
import type { Program } from "../core/ast"
import { astToFlow } from "../core/astToFlow"
import { autoLayoutGraph } from "../core/autoLayout"
import { edgeAppearance, loopBackRoute, routeEdges } from "../core/flowEdges"
import { changeDecisionKind } from "../core/decisionKind"
import { removeNodes } from "../core/removeNodes"
import { flowToAst, FlowValidationError } from "../core/flowToAst"
import { exportGraphAsPng } from "../core/exportPng"
import { graphBounds } from "../core/flowToSvg"
import { cloneFlowGraph, GraphHistory } from "../core/graphHistory"
import { createJunctionNode, isLoopBackConnection, junctionPosition } from "../core/graphTopology"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  FlowGraph,
  TerminalRole,
} from "../core/flowTypes"
import type { ProgramSource } from "../store/useAppStore"
import type { PaletteItemKind } from "./Palette"
import { EdgeActionContext, FlowEdge } from "./FlowEdges"
import {
  editingLabel,
  editingStateOf,
  NodeEditorDialog,
  type EditingState,
} from "./NodeEditorDialog"
import {
  DecisionNode,
  IoNode,
  JunctionNode,
  NodeActionContext,
  ProcessNode,
  TerminalNode,
} from "./nodes/FlowNodes"

const nodeTypes: NodeTypes = {
  terminal: TerminalNode,
  io: IoNode,
  process: ProcessNode,
  decision: DecisionNode,
  junction: JunctionNode,
}

const edgeTypes: EdgeTypes = {
  editable: FlowEdge,
  "loop-back": FlowEdge,
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 1.8
/**
 * 화면을 맞출 때는 원래 크기보다 크게 키우지 않습니다. 기호가 두어 개뿐일 때
 * 화면 가득 확대돼 버리는 것을 막습니다(손으로 하는 확대는 MAX_ZOOM까지 가능).
 */
const FIT_MAX_ZOOM = 1
/** 화면을 맞출 때 순서도 둘레에 남기는 여백 비율. */
const FIT_PADDING = 0.24

export interface FlowCanvasHandle {
  addNodeAtScreen: (kind: PaletteItemKind, clientX: number, clientY: number) => boolean
  exportPng: () => Promise<void>
}

interface FlowCanvasProps {
  program: Program
  revision: number
  source: ProgramSource
  pendingKind: PaletteItemKind | null
  graphMessage: string | null
  /** 저장해 둔 작업 내용. 있으면 AST로 다시 그리지 않고 이 그래프로 시작합니다. */
  restoredGraph?: FlowGraph | null
  onPendingConsumed: () => void
  onGraphMutation: () => void
  onProgramChange: (program: Program) => void
  onGraphMessage: (message: string | null) => void
  onGraphChange: (nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]) => void
}

let userNodeSequence = 0

function userNode(
  kind: PaletteItemKind,
  position: { x: number; y: number },
  terminalRole: TerminalRole,
): AlgorithmFlowNode[] {
  const id = `user-node-${Date.now()}-${userNodeSequence++}`

  switch (kind) {
    case "terminal":
      return [
        {
          id,
          type: "terminal",
          position,
          data: {
            kind: "terminal",
            label: terminalRole === "start" ? "시작" : "끝",
            terminalRole,
          },
        },
      ]
    case "io":
      return [{ id, type: "io", position, data: { kind: "input", label: `${INPUT_PREFIX}변수` } }]
    case "process":
      return [
        {
          id,
          type: "process",
          position,
          data: { kind: "process", label: "처리할 내용" },
        },
      ]
    case "decision": {
      // 조건 분기는 두 갈래가 다시 만나는 합류 기호와 짝입니다. 함께 놓아 주지 않으면
      // 학생이 갈래를 잇는 순간 "연결이 끊겨 있어요"부터 보게 됩니다.
      const decision: AlgorithmFlowNode = {
        id,
        type: "decision",
        position,
        data: { kind: "decision", label: "판단 조건", controlKind: "if" },
      }
      return [decision, createJunctionNode(id, junctionPosition(decision))]
    }
  }
}

function graphErrorMessage(error: unknown): string {
  return error instanceof FlowValidationError ? error.message : "순서도의 연결을 확인해 주세요."
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], .cm-editor"))
}

function nodePositionsChanged(before: FlowGraph, after: FlowGraph): boolean {
  if (before.nodes.length !== after.nodes.length) return true
  const beforePositions = new Map(before.nodes.map(node => [node.id, node.position]))
  return after.nodes.some(node => {
    const position = beforePositions.get(node.id)
    return !position || position.x !== node.position.x || position.y !== node.position.y
  })
}

export const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(
  {
    program,
    revision,
    source,
    pendingKind,
    graphMessage,
    restoredGraph,
    onPendingConsumed,
    onGraphMutation,
    onProgramChange,
    onGraphMessage,
    onGraphChange,
  },
  ref,
) {
  // 되살린 그래프의 화살표 경로도 저장 당시 좌표라 지금 규칙으로 다시 계산합니다.
  const initialGraph = useRef(
    restoredGraph
      ? { nodes: restoredGraph.nodes, edges: routeEdges(restoredGraph.nodes, restoredGraph.edges) }
      : astToFlow(program),
  ).current
  const [nodes, setNodesState] = useState<AlgorithmFlowNode[]>(initialGraph.nodes)
  const [edges, setEdgesState] = useState<AlgorithmFlowEdge[]>(initialGraph.edges)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const historyRef = useRef(new GraphHistory())
  const positionStartRef = useRef<FlowGraph | null>(null)
  const needsFitRef = useRef(true)
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow<
    AlgorithmFlowNode,
    AlgorithmFlowEdge
  >()
  // 캔버스의 실제 크기. 탭 전환으로 감춰져 있는 동안에는 0입니다.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  // 자동 배치처럼 revision이 바뀌지 않는 변경에서도 화면을 다시 맞추게 하는 방아쇠입니다.
  const [fitRequest, setFitRequest] = useState(0)

  // 모든 그래프 변경을 한 길목으로 모아 화면 상태와 저장할 상태가 어긋나지 않게 합니다.
  const replaceGraph = useCallback(
    (nextNodes: AlgorithmFlowNode[], edgesBeforeRouting: AlgorithmFlowEdge[]) => {
      // 기호를 끌어 옮기거나 크기가 바뀌면 저장해 둔 화살표 경로가 낡아 옮긴 기호
      // 뒤로 선이 지나가거나 긴 사선이 그려집니다. 모든 변경이 지나는 이 길목에서
      // 지금 좌표로 다시 계산합니다.
      const nextEdges = routeEdges(nextNodes, edgesBeforeRouting)
      nodesRef.current = nextNodes
      edgesRef.current = nextEdges
      setNodesState(nextNodes)
      setEdgesState(nextEdges)
      onGraphChange(nextNodes, nextEdges)
    },
    [onGraphChange],
  )

  const replaceNodes = useCallback(
    (nextNodes: AlgorithmFlowNode[]) => replaceGraph(nextNodes, edgesRef.current),
    [replaceGraph],
  )

  const replaceEdges = useCallback(
    (nextEdges: AlgorithmFlowEdge[]) => replaceGraph(nodesRef.current, nextEdges),
    [replaceGraph],
  )

  const syncGraph = useCallback(
    (nextNodes: AlgorithmFlowNode[], nextEdges: AlgorithmFlowEdge[]) => {
      try {
        const nextProgram = flowToAst(nextNodes, nextEdges)
        onGraphMessage(null)
        onProgramChange(nextProgram)
      } catch (error) {
        onGraphMessage(graphErrorMessage(error))
      }
    },
    [onGraphMessage, onProgramChange],
  )

  // 사용자가 그래프를 바꾼 모든 자리(추가·삭제·연결·편집)가 거치는 길목.
  // 저장 표시, 화면 상태, 의사코드 동기화를 한 번에 맞춥니다.
  const commitGraph = useCallback(
    (nextNodes: AlgorithmFlowNode[], nextEdges: AlgorithmFlowEdge[]) => {
      historyRef.current.record({ nodes: nodesRef.current, edges: edgesRef.current })
      positionStartRef.current = null
      onGraphMutation()
      replaceGraph(nextNodes, nextEdges)
      syncGraph(nextNodes, nextEdges)
    },
    [onGraphMutation, replaceGraph, syncGraph],
  )

  /*
   * 저장해 둔 그래프로 시작했으면 첫 배치를 건너뜁니다.
   *
   * AST에서 다시 그리면 아직 연결하지 않은 기호가 사라져 버립니다. 그것이 바로
   * 새로 고쳤을 때 잃어버리면 안 되는 내용입니다.
   */
  const skipFirstLayoutRef = useRef(Boolean(restoredGraph))

  useEffect(() => {
    const skip = skipFirstLayoutRef.current
    skipFirstLayoutRef.current = false
    if (skip) return
    if (source === "flow") return
    historyRef.current.clear()
    positionStartRef.current = null
    const graph = astToFlow(program)
    replaceGraph(graph.nodes, graph.edges)
    // 새 기호의 크기가 측정된 뒤에 맞춰야 하므로 아래 효과에 넘깁니다.
    needsFitRef.current = true
    // revision이 바뀔 때 최신 AST를 다시 배치합니다.
  }, [program, replaceGraph, revision, source])

  /*
   * 되살린 그래프가 아직 미완성이면 안내를 다시 띄웁니다.
   *
   * 검사만 하고 프로그램·의사코드는 건드리지 않습니다. 여기서 syncGraph를 부르면
   * 쓰다 만 의사코드가 AST에서 만든 글로 덮어써집니다.
   */
  useEffect(() => {
    if (!restoredGraph) return
    try {
      flowToAst(restoredGraph.nodes, restoredGraph.edges)
    } catch (error) {
      onGraphMessage(graphErrorMessage(error))
    }
  }, [onGraphMessage, restoredGraph])

  const addAtScreen = useCallback(
    (kind: PaletteItemKind, clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (
        !rect ||
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return false
      }

      const safeScreenPoint = {
        x: Math.min(Math.max(clientX, rect.left + 120), rect.right - 120),
        y: Math.min(Math.max(clientY, rect.top + 90), rect.bottom - 90),
      }
      const point = screenToFlowPosition(safeScreenPoint)
      const hasStart = nodesRef.current.some(node => node.data.terminalRole === "start")
      const hasEnd = nodesRef.current.some(node => node.data.terminalRole === "end")
      const terminalRole = !hasStart ? "start" : !hasEnd ? "end" : "start"
      const additions = userNode(kind, { x: point.x - 95, y: point.y - 36 }, terminalRole).map(
        (node, index) => ({ ...node, selected: index === 0 }),
      )
      const nextNodes = [
        ...nodesRef.current.map(node => ({ ...node, selected: false })),
        ...additions,
      ]
      commitGraph(nextNodes, edgesRef.current)
      return true
    },
    [commitGraph, screenToFlowPosition],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (!box) return
      const next = { width: Math.round(box.width), height: Math.round(box.height) }
      setCanvasSize(previous => {
        // 예제 화면에 가려져 있는 동안에는 크기가 0이 됩니다. 다시 보이게 되면
        // 그 상태로 굳지 않도록 화면을 맞추라고 표시해 둡니다.
        if (previous.width === 0 && next.width > 0) needsFitRef.current = true
        return next
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  /*
   * 화면 맞추기는 여기 한 곳에서만 합니다.
   *
   * fitView는 React Flow가 각 기호를 DOM에서 다시 잰 뒤라야 올바른 값을 내는데,
   * 예제를 빠르게 연달아 바꾸면 아직 옛 크기가 남아 있어 순서도가 지나치게
   * 확대된 채로 굳습니다. 우리는 배치 좌표를 이미 알고 있으므로 측정에 기대지
   * 않고 직접 계산해서 맞춥니다.
   */
  useEffect(() => {
    if (!needsFitRef.current) return
    if (canvasSize.width === 0 || canvasSize.height === 0) return
    const bounds = graphBounds(nodesRef.current, edgesRef.current)
    if (!bounds) return

    const view = getViewportForBounds(
      bounds,
      canvasSize.width,
      canvasSize.height,
      MIN_ZOOM,
      FIT_MAX_ZOOM,
      FIT_PADDING,
    )

    // 캔버스가 막 보이기 시작한 순간에는 React Flow의 확대·축소 장치가 아직
    // 준비되지 않아 화면 이동 요청이 조용히 무시됩니다. 반영될 때까지
    // 프레임마다 다시 시도합니다(최대 약 0.6초).
    let cancelled = false
    let frame = 0
    let attempts = 0
    const apply = () => {
      if (cancelled) return
      attempts += 1
      setViewport(view)
      if (Math.abs(getViewport().zoom - view.zoom) < 0.0001 || attempts >= 40) {
        needsFitRef.current = false
        return
      }
      frame = window.requestAnimationFrame(apply)
    }
    apply()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [canvasSize, revision, fitRequest, getViewport, setViewport])

  const exportPng = useCallback(() => exportGraphAsPng(nodesRef.current, edgesRef.current), [])

  useImperativeHandle(ref, () => ({ addNodeAtScreen: addAtScreen, exportPng }), [
    addAtScreen,
    exportPng,
  ])

  const handleNodesChange = (changes: NodeChange<AlgorithmFlowNode>[]) => {
    const positionChanges = changes.filter(change => change.type === "position")
    if (positionChanges.length > 0 && !positionStartRef.current) {
      positionStartRef.current = cloneFlowGraph({
        nodes: nodesRef.current,
        edges: edgesRef.current,
      })
      // 긴 드래그 중 예약된 의사코드 변환이 순서도를 덮지 않도록 즉시 취소합니다.
      onGraphMutation()
    }

    const removedIds = changes.flatMap(change => (change.type === "remove" ? [change.id] : []))
    if (removedIds.length > 0) {
      // 판단 기호를 지우면 짝 합류 기호도 함께 지웁니다(removeNodes). 지운 뒤 남은
      // 변경(선택 등)만 이어서 적용합니다.
      const removed = removeNodes({ nodes: nodesRef.current, edges: edgesRef.current }, removedIds)
      const next = applyNodeChanges(
        changes.filter(change => change.type !== "remove"),
        removed.nodes,
      )
      commitGraph(next, removed.edges)
      return
    }

    const next = applyNodeChanges(changes, nodesRef.current)
    replaceNodes(next)

    const positionFinished =
      positionChanges.length > 0 && positionChanges.every(change => change.dragging !== true)
    if (positionFinished && positionStartRef.current) {
      const before = positionStartRef.current
      const after = { nodes: next, edges: edgesRef.current }
      positionStartRef.current = null
      if (nodePositionsChanged(before, after)) historyRef.current.record(before)
    }
  }

  const handleEdgesChange = (changes: EdgeChange<AlgorithmFlowEdge>[]) => {
    const removedIds = changes.flatMap(change => (change.type === "remove" ? [change.id] : []))
    if (removedIds.length > 0) {
      const removed = removeNodes(
        { nodes: nodesRef.current, edges: edgesRef.current },
        [],
        removedIds,
      )
      const next = applyEdgeChanges(
        changes.filter(change => change.type !== "remove"),
        removed.edges,
      )
      commitGraph(removed.nodes, next)
      return
    }
    replaceEdges(applyEdgeChanges(changes, edgesRef.current))
  }

  const handleConnect = (connection: Connection) => {
    const isLoopBack = isLoopBackConnection(
      { nodes: nodesRef.current, edges: edgesRef.current },
      connection.source,
      connection.target,
    )
    const branch = isLoopBack
      ? "loop-back"
      : connection.sourceHandle === "yes" || connection.sourceHandle === "no"
        ? connection.sourceHandle
        : "next"
    const routePoints =
      branch === "loop-back"
        ? loopBackRoute(
            nodesRef.current,
            connection.source,
            connection.sourceHandle,
            connection.target,
          )
        : undefined
    const next = addEdge<AlgorithmFlowEdge>(
      {
        ...connection,
        id: `user-edge-${Date.now()}-${userNodeSequence++}`,
        ...edgeAppearance(branch, connection.sourceHandle),
        data: { branch, routePoints },
      },
      edgesRef.current,
    )
    commitGraph(nodesRef.current, next)
  }

  const removeNode = (id: string) => {
    const next = removeNodes({ nodes: nodesRef.current, edges: edgesRef.current }, [id])
    commitGraph(next.nodes, next.edges)
  }

  const removeEdge = (id: string) => {
    const next = removeNodes({ nodes: nodesRef.current, edges: edgesRef.current }, [], [id])
    commitGraph(next.nodes, next.edges)
  }

  const restoreFromHistory = useCallback(
    (direction: "undo" | "redo") => {
      const current = { nodes: nodesRef.current, edges: edgesRef.current }
      const restored =
        direction === "undo" ? historyRef.current.undo(current) : historyRef.current.redo(current)
      if (!restored) return false

      positionStartRef.current = null
      setEditing(null)
      onGraphMutation()
      replaceGraph(restored.nodes, restored.edges)
      syncGraph(restored.nodes, restored.edges)
      return true
    },
    [onGraphMutation, replaceGraph, syncGraph],
  )

  const removeSelected = useCallback(() => {
    const selectedNodeIds = new Set(
      nodesRef.current.filter(node => node.selected).map(node => node.id),
    )
    const selectedEdgeIds = new Set(
      edgesRef.current.filter(edge => edge.selected).map(edge => edge.id),
    )
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return false

    const next = removeNodes(
      { nodes: nodesRef.current, edges: edgesRef.current },
      selectedNodeIds,
      selectedEdgeIds,
    )
    commitGraph(next.nodes, next.edges)
    return true
  }, [commitGraph])

  /*
   * 흩어진 기호를 자동 배치하고 화면에 맞춥니다.
   *
   * 의사코드로 되돌렸다가 다시 그리지 않고 지금 있는 기호를 그대로 옮깁니다.
   * 아직 잇지 않은 기호가 있는 도중에 누르는 일이 가장 흔하기 때문입니다.
   * 되돌리기로 원래 자리를 되찾을 수 있도록 commitGraph를 지납니다.
   */
  const autoArrange = useCallback(() => {
    const arranged = autoLayoutGraph({ nodes: nodesRef.current, edges: edgesRef.current })
    commitGraph(arranged.nodes, arranged.edges)
    needsFitRef.current = true
    setFitRequest(request => request + 1)
  }, [commitGraph])

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (containerRef.current?.offsetParent === null || isTextEditingTarget(event.target)) return
      if (editing) return

      const commandKey = event.ctrlKey || event.metaKey
      if (commandKey && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault()
        restoreFromHistory(event.shiftKey ? "redo" : "undo")
        return
      }

      if (!commandKey && !event.altKey && (event.key === "Backspace" || event.key === "Delete")) {
        if (removeSelected()) event.preventDefault()
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut)
    return () => window.removeEventListener("keydown", handleKeyboardShortcut)
  }, [editing, removeSelected, restoreFromHistory])

  const openEditor = (id: string) => {
    const node = nodesRef.current.find(candidate => candidate.id === id)
    if (node) setEditing(editingStateOf(node))
  }

  const saveEditing = () => {
    if (!editing) return
    const kind = editing.kind
    const label = editingLabel(editing)

    let nextNodes = nodesRef.current.map(node =>
      node.id === editing.id
        ? {
            ...node,
            data: {
              ...node.data,
              label,
              kind,
              controlKind: editing.controlKind,
              terminalRole: editing.terminalRole,
            },
          }
        : node,
    )
    let nextEdges = edgesRef.current

    // 조건 분기와 반복은 흐름의 짜임이 다릅니다. 기호는 그대로 두고 화살표만 옮겨
    // 바꾼 즉시 다시 이어진 순서도가 되게 합니다.
    if (
      kind === "decision" &&
      editing.controlKind &&
      editing.originalControlKind !== editing.controlKind
    ) {
      const converted = changeDecisionKind(
        { nodes: nextNodes, edges: nextEdges },
        editing.id,
        editing.controlKind,
      )
      nextNodes = converted.nodes
      nextEdges = converted.edges
    }

    commitGraph(nextNodes, nextEdges)
    setEditing(null)
  }

  const handlePaneClick = (event: ReactMouseEvent) => {
    if (!pendingKind) return
    addAtScreen(pendingKind, event.clientX, event.clientY)
    onPendingConsumed()
  }

  return (
    <div
      className="flow-canvas"
      ref={containerRef}
      aria-keyshortcuts="Control+Z Meta+Z Control+Shift+Z Meta+Shift+Z"
    >
      <NodeActionContext.Provider value={{ edit: openEditor, remove: removeNode }}>
        <EdgeActionContext.Provider value={{ remove: removeEdge }}>
          <ReactFlow<AlgorithmFlowNode, AlgorithmFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onPaneClick={handlePaneClick}
            onNodeDoubleClick={(_, node) => openEditor(node.id)}
            isValidConnection={connection => {
              const sourceNode = nodesRef.current.find(node => node.id === connection.source)
              const targetNode = nodesRef.current.find(node => node.id === connection.target)
              if (!sourceNode || !targetNode || connection.source === connection.target)
                return false
              if (
                sourceNode.data.terminalRole === "end" ||
                targetNode.data.terminalRole === "start"
              )
                return false

              const sourceHandle = connection.sourceHandle ?? "next"
              const sourceAlreadyConnected = edgesRef.current.some(
                edge =>
                  edge.source === connection.source &&
                  (edge.sourceHandle ?? "next") === sourceHandle,
              )
              if (sourceAlreadyConnected) return false

              const incomingCount = edgesRef.current.filter(
                edge => edge.target === connection.target,
              ).length
              const maximumIncoming =
                targetNode.data.kind === "junction" || targetNode.data.controlKind === "loop"
                  ? 2
                  : 1
              return incomingCount < maximumIncoming
            }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            panOnDrag
            zoomOnPinch
            zoomOnDoubleClick={false}
            connectionRadius={28}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            aria-label="순서도 편집 캔버스"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
            <Controls showInteractive={false} showFitView={false}>
              {/* React Flow 기본 '화면 맞춤' 자리를 그대로 쓰되 자동 배치까지 함께 합니다. */}
              <ControlButton
                onClick={autoArrange}
                title="자동 배치하고 화면 맞추기"
                aria-label="자동 배치하고 화면 맞추기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30">
                  <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
                </svg>
              </ControlButton>
            </Controls>
          </ReactFlow>
        </EdgeActionContext.Provider>
      </NodeActionContext.Provider>

      {pendingKind && <div className="placement-hint">캔버스에서 기호를 놓을 위치를 탭하세요.</div>}
      {graphMessage && (
        <div className="graph-message" role="status">
          {graphMessage}
        </div>
      )}

      {editing && (
        <NodeEditorDialog
          editing={editing}
          onEditingChange={setEditing}
          onSave={saveEditing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
})
