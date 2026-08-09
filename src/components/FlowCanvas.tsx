import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
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
import type { Program } from "../core/ast"
import { astToFlow } from "../core/astToFlow"
import { flowToAst, FlowValidationError } from "../core/flowToAst"
import { flowToSvg, graphBounds } from "../core/flowToSvg"
import type {
  AlgorithmFlowEdge,
  AlgorithmFlowNode,
  ControlKind,
  FlowNodeKind,
  TerminalRole,
} from "../core/flowTypes"
import { normalizeSymbols } from "../core/parser"
import type { ProgramSource } from "../store/useAppStore"
import type { PaletteItemKind } from "./Palette"
import { EdgeActionContext, FlowEdge } from "./FlowEdges"
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
  onPendingConsumed: () => void
  onGraphMutation: () => void
  onProgramChange: (program: Program) => void
  onGraphMessage: (message: string | null) => void
}

interface EditingState {
  id: string
  value: string
  kind: FlowNodeKind
  controlKind?: ControlKind
  originalControlKind?: ControlKind
  terminalRole?: TerminalRole
}

let userNodeSequence = 0

/** PNG 파일명에 붙일 `YYYYMMDD-HHmm` 시각 문자열. */
function exportStamp(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  )
}

function userNode(
  kind: PaletteItemKind,
  position: { x: number; y: number },
  terminalRole: TerminalRole,
): AlgorithmFlowNode[] {
  const id = `user-node-${Date.now()}-${userNodeSequence++}`

  switch (kind) {
    case "terminal":
      return [{
        id,
        type: "terminal",
        position,
        data: {
          kind: "terminal",
          label: terminalRole === "start" ? "시작" : "끝",
          terminalRole,
        },
      }]
    case "io":
      return [{ id, type: "io", position, data: { kind: "input", label: "입력: 변수" } }]
    case "process":
      return [{ id, type: "process", position, data: { kind: "process", label: "변수 ← 값" } }]
    case "decision":
      return [
        { id, type: "decision", position, data: { kind: "decision", label: "판단 조건", controlKind: "if" } },
        {
          id: `${id}-junction`,
          type: "junction",
          position: { x: position.x + 101, y: position.y + 210 },
          data: { kind: "junction", label: "합류" },
        },
      ]
  }
}

export const FlowCanvas = forwardRef<FlowCanvasHandle, FlowCanvasProps>(function FlowCanvas(
  {
    program,
    revision,
    source,
    pendingKind,
    graphMessage,
    onPendingConsumed,
    onGraphMutation,
    onProgramChange,
    onGraphMessage,
  },
  ref,
) {
  const initialGraph = useRef(astToFlow(program)).current
  const [nodes, setNodesState] = useState<AlgorithmFlowNode[]>(initialGraph.nodes)
  const [edges, setEdgesState] = useState<AlgorithmFlowEdge[]>(initialGraph.edges)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const needsFitRef = useRef(true)
  const { screenToFlowPosition, getViewport, setViewport } =
    useReactFlow<AlgorithmFlowNode, AlgorithmFlowEdge>()
  // 캔버스의 실제 크기. 탭 전환으로 감춰져 있는 동안에는 0입니다.
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  const replaceNodes = (next: AlgorithmFlowNode[]) => {
    nodesRef.current = next
    setNodesState(next)
  }
  const replaceEdges = (next: AlgorithmFlowEdge[]) => {
    edgesRef.current = next
    setEdgesState(next)
  }

  const syncGraph = useCallback(
    (nextNodes: AlgorithmFlowNode[], nextEdges: AlgorithmFlowEdge[]) => {
      try {
        const nextProgram = flowToAst(nextNodes, nextEdges)
        onGraphMessage(null)
        onProgramChange(nextProgram)
      } catch (error) {
        const message =
          error instanceof FlowValidationError ? error.message : "순서도의 연결을 확인해 주세요."
        onGraphMessage(message)
      }
    },
    [onGraphMessage, onProgramChange],
  )

  useEffect(() => {
    if (source === "flow") return
    const graph = astToFlow(program)
    replaceNodes(graph.nodes)
    replaceEdges(graph.edges)
    // 새 기호의 크기가 측정된 뒤에 맞춰야 하므로 아래 효과에 넘깁니다.
    needsFitRef.current = true
    // revision이 바뀔 때 최신 AST를 다시 배치합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, source])

  const addAtScreen = useCallback(
    (kind: PaletteItemKind, clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
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
      const additions = userNode(
        kind,
        { x: point.x - 95, y: point.y - 36 },
        terminalRole,
      ).map((node, index) => ({ ...node, selected: index === 0 }))
      const nextNodes = [
        ...nodesRef.current.map(node => ({ ...node, selected: false })),
        ...additions,
      ]
      onGraphMutation()
      replaceNodes(nextNodes)
      syncGraph(nextNodes, edgesRef.current)
      return true
    },
    [onGraphMutation, screenToFlowPosition, syncGraph],
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
  }, [canvasSize, revision, getViewport, setViewport])

  const exportPng = useCallback(async () => {
    const { markup, width, height } = flowToSvg(nodesRef.current, edgesRef.current)

    // 화면 배율과 무관하게 항상 2배 해상도로 저장합니다(과제 제출용).
    const scale = 2
    const image = new Image()
    image.width = width
    image.height = height
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("순서도를 이미지로 바꾸지 못했어요."))
      image.src = svgUrl
    })

    const canvas = document.createElement("canvas")
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext("2d")
    if (!context) throw new Error("이미지를 만들 수 없는 브라우저예요.")
    context.scale(scale, scale)
    context.drawImage(image, 0, 0, width, height)

    const link = document.createElement("a")
    link.download = `순서도-${exportStamp()}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }, [])

  useImperativeHandle(
    ref,
    () => ({ addNodeAtScreen: addAtScreen, exportPng }),
    [addAtScreen, exportPng],
  )

  const handleNodesChange = (changes: NodeChange<AlgorithmFlowNode>[]) => {
    const next = applyNodeChanges(changes, nodesRef.current)
    if (changes.some(change => change.type === "remove")) onGraphMutation()
    replaceNodes(next)
    if (changes.some(change => change.type === "remove")) syncGraph(next, edgesRef.current)
  }

  const handleEdgesChange = (changes: EdgeChange<AlgorithmFlowEdge>[]) => {
    const next = applyEdgeChanges(changes, edgesRef.current)
    if (changes.some(change => change.type === "remove")) onGraphMutation()
    replaceEdges(next)
    if (changes.some(change => change.type === "remove")) syncGraph(nodesRef.current, next)
  }

  const handleConnect = (connection: Connection) => {
    const targetNode = nodesRef.current.find(node => node.id === connection.target)
    const isLoopBack = targetNode?.data.controlKind === "loop"
      && edgesRef.current.some(edge => edge.target === connection.target)
    const branch = isLoopBack
      ? "loop-back"
      : connection.sourceHandle === "yes" || connection.sourceHandle === "no"
        ? connection.sourceHandle
        : "next"
    const sourceNode = nodesRef.current.find(node => node.id === connection.source)
    const sourceWidth = sourceNode?.measured?.width ?? 190
    const sourceHeight = sourceNode?.measured?.height ?? 72
    const targetWidth = targetNode?.measured?.width ?? 220
    const graphRight = Math.max(
      ...nodesRef.current.map(node => node.position.x + (node.measured?.width ?? 220)),
    )
    const routePoints = branch === "loop-back" && sourceNode && targetNode
      ? [
          {
            x: sourceNode.position.x + sourceWidth / 2,
            y: sourceNode.position.y + sourceHeight,
          },
          {
            x: sourceNode.position.x + sourceWidth / 2,
            y: sourceNode.position.y + sourceHeight + 34,
          },
          { x: graphRight + 46, y: sourceNode.position.y + sourceHeight + 34 },
          { x: graphRight + 46, y: targetNode.position.y - 34 },
          { x: targetNode.position.x + targetWidth / 2, y: targetNode.position.y - 34 },
          { x: targetNode.position.x + targetWidth / 2, y: targetNode.position.y },
        ]
      : undefined
    const next = addEdge<AlgorithmFlowEdge>(
      {
        ...connection,
        id: `user-edge-${Date.now()}-${userNodeSequence++}`,
        type: branch === "loop-back" ? "loop-back" : "editable",
        label: branch === "yes" ? "예" : branch === "no" ? "아니오" : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        data: { branch, routePoints },
        className: branch === "loop-back" ? "loop-back-edge" : undefined,
      },
      edgesRef.current,
    )
    onGraphMutation()
    replaceEdges(next)
    syncGraph(nodesRef.current, next)
  }

  const removeNode = (id: string) => {
    const nextNodes = nodesRef.current.filter(node => node.id !== id)
    const nextEdges = edgesRef.current.filter(edge => edge.source !== id && edge.target !== id)
    onGraphMutation()
    replaceNodes(nextNodes)
    replaceEdges(nextEdges)
    syncGraph(nextNodes, nextEdges)
  }

  const removeEdge = (id: string) => {
    const nextEdges = edgesRef.current.filter(edge => edge.id !== id)
    onGraphMutation()
    replaceEdges(nextEdges)
    syncGraph(nodesRef.current, nextEdges)
  }

  const openEditor = (id: string) => {
    const node = nodesRef.current.find(candidate => candidate.id === id)
    if (!node) return
    setEditing({
      id,
      value: node.data.kind === "input"
        ? node.data.label.replace(/^입력\s*:\s*/, "").replace(/\s+입력$/, "")
        : node.data.kind === "output"
          ? node.data.label.replace(/^출력\s*:\s*/, "").replace(/\s+출력$/, "")
          : node.data.label,
      kind: node.data.kind,
      controlKind: node.data.controlKind,
      originalControlKind: node.data.controlKind,
      terminalRole: node.data.terminalRole,
    })
  }

  const saveEditing = () => {
    if (!editing) return
    let label = normalizeSymbols(editing.value).trim()
    const kind = editing.kind

    if (kind === "terminal") label = editing.terminalRole === "end" ? "끝" : "시작"
    if (kind === "input") label = `입력: ${label.replace(/^(?:입력|출력)\s*:\s*/, "").replace(/\s+(?:입력|출력)$/, "").trim()}`
    if (kind === "output") label = `출력: ${label.replace(/^(?:입력|출력)\s*:\s*/, "").replace(/\s+(?:입력|출력)$/, "").trim()}`
    if (kind === "decision") {
      label = label
        .replace(/^\[만약\s+/, "")
        .replace(/\]$/, "")
        .replace(/\s+반복$/, "")
        .trim()
    }

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

    if (kind === "decision" && editing.originalControlKind !== editing.controlKind) {
      const junctionId = `${editing.id}-junction`
      if (editing.controlKind === "loop") {
        nextNodes = nextNodes.filter(node => node.id !== junctionId)
        nextEdges = nextEdges.filter(edge => edge.source !== junctionId && edge.target !== junctionId)
      } else if (!nextNodes.some(node => node.id === junctionId)) {
        const decision = nextNodes.find(node => node.id === editing.id)
        if (decision) {
          nextNodes = [
            ...nextNodes,
            {
              id: junctionId,
              type: "junction",
              position: { x: decision.position.x + 101, y: decision.position.y + 210 },
              data: { kind: "junction", label: "합류" },
            },
          ]
        }
      }
    }

    onGraphMutation()
    replaceNodes(nextNodes)
    replaceEdges(nextEdges)
    setEditing(null)
    syncGraph(nextNodes, nextEdges)
  }

  const handlePaneClick = (event: ReactMouseEvent) => {
    if (!pendingKind) return
    addAtScreen(pendingKind, event.clientX, event.clientY)
    onPendingConsumed()
  }

  return (
    <div className="flow-canvas" ref={containerRef}>
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
              if (!sourceNode || !targetNode || connection.source === connection.target) return false
              if (sourceNode.data.terminalRole === "end" || targetNode.data.terminalRole === "start") return false

              const sourceHandle = connection.sourceHandle ?? "next"
              const sourceAlreadyConnected = edgesRef.current.some(
                edge => edge.source === connection.source && (edge.sourceHandle ?? "next") === sourceHandle,
              )
              if (sourceAlreadyConnected) return false

              const incomingCount = edgesRef.current.filter(edge => edge.target === connection.target).length
              const maximumIncoming = targetNode.data.kind === "junction" || targetNode.data.controlKind === "loop"
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
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
            aria-label="순서도 편집 캔버스"
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </EdgeActionContext.Provider>
      </NodeActionContext.Provider>

      {pendingKind && <div className="placement-hint">캔버스에서 기호를 놓을 위치를 탭하세요.</div>}
      {graphMessage && <div className="graph-message" role="status">{graphMessage}</div>}

      {editing && (
        <div className="modal-backdrop" role="presentation" onPointerDown={() => setEditing(null)}>
          <div className="node-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="node-editor-title" onPointerDown={event => event.stopPropagation()}>
            <h3 id="node-editor-title">기호 내용 편집</h3>
            {editing.kind === "terminal" && (
              <label>
                종류
                <select
                  value={editing.terminalRole ?? "start"}
                  onChange={event =>
                    setEditing(current => current
                      ? { ...current, terminalRole: event.target.value as TerminalRole }
                      : current)
                  }
                >
                  <option value="start">시작</option>
                  <option value="end">끝</option>
                </select>
              </label>
            )}
            {(editing.kind === "input" || editing.kind === "output") && (
              <label>
                종류
                <select
                  value={editing.kind}
                  onChange={event =>
                    setEditing(current => current ? { ...current, kind: event.target.value as "input" | "output" } : current)
                  }
                >
                  <option value="input">입력</option>
                  <option value="output">출력</option>
                </select>
              </label>
            )}
            {editing.kind === "decision" && (
              <label>
                종류
                <select
                  value={editing.controlKind ?? "if"}
                  onChange={event =>
                    setEditing(current => current
                      ? { ...current, controlKind: event.target.value as ControlKind }
                      : current)
                  }
                >
                  <option value="if">조건 분기</option>
                  <option value="loop">반복</option>
                </select>
              </label>
            )}
            {editing.kind !== "terminal" && (
              <label>
                {editing.kind === "decision" ? "조건식" : "기호 안의 문장"}
                <input
                  autoFocus
                  value={editing.value}
                  onChange={event => setEditing(current => current ? { ...current, value: event.target.value } : current)}
                  onKeyDown={event => {
                    if (event.key === "Enter") saveEditing()
                    if (event.key === "Escape") setEditing(null)
                  }}
                />
              </label>
            )}
            <div className="dialog-symbols" aria-label="기호 입력">
              {["←", "×", "÷"].map(symbol => (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => setEditing(current => current ? { ...current, value: current.value + symbol } : current)}
                >
                  {symbol}
                </button>
              ))}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setEditing(null)}>취소</button>
              <button type="button" className="primary" onClick={saveEditing}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
