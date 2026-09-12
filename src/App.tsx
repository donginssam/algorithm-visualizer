import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import type { FlowCanvasHandle } from "./components/FlowCanvas"
import { ModalDialog } from "./components/ModalDialog"
import type { PaletteItemKind } from "./components/Palette"
import { UpdatePrompt } from "./components/UpdatePrompt"
import type { AlgorithmFlowEdge, AlgorithmFlowNode } from "./core/flowTypes"
import { clearWorkspace, saveWorkspace } from "./core/workspaceStore"
import type { Example } from "./examples"
import { navigateTo, useHashRoute } from "./hooks/useHashRoute"
import { useTimeout } from "./hooks/useTimeout"
import { restoredWorkspace, useAppStore } from "./store/useAppStore"

/*
 * 편집 화면과 예제 화면을 지연 불러옵니다.
 *
 * 편집 화면은 @xyflow/react·@codemirror/*·@dagrejs/dagre 같은 무거운 라이브러리를
 * 씁니다. 상단바처럼 항상 필요한 부분과 분리해 두면 그 부분만 먼저 그려지고, 무거운
 * 코드는 그동안 따로 받아집니다.
 */
const EditorWorkspace = lazy(() => import("./components/EditorWorkspace"))
const ExamplesPage = lazy(() =>
  import("./components/ExamplesPage").then(module => ({ default: module.ExamplesPage })),
)

function WorkspaceLoading() {
  return (
    <div className="workspace-loading" role="status">
      불러오는 중…
    </div>
  )
}

interface ExportState {
  kind: "idle" | "working" | "done" | "failed"
  message: string
}

const IDLE_EXPORT: ExportState = { kind: "idle", message: "" }

/** 작업 내용을 저장하기까지 기다리는 시간. 글자·기호를 이어서 다룰 때 매번 쓰지 않습니다. */
const SAVE_DELAY = 400
const CODE_COMMIT_DELAY = 300
const EXPORT_STATUS_DURATION = 4000

/** 저장해 둔 순서도. 화면을 만들기 전에 정해지므로 다시 그려도 바뀌지 않습니다. */
const RESTORED_GRAPH = restoredWorkspace
  ? { nodes: restoredWorkspace.nodes, edges: restoredWorkspace.edges }
  : null

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <rect
          x="8"
          y="3"
          width="16"
          height="8"
          rx="4"
          fill="#ffe066"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
        <path d="M16 11v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M16 15l7 6-7 6-7-6z"
          fill="#b7e4c7"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />
      </svg>
    </span>
  )
}

export default function App() {
  const {
    program,
    code,
    parseError,
    graphMessage,
    revision,
    source,
    updateCodeDraft,
    commitCode,
    beginFlowEdit,
    setProgram,
    setGraphMessage,
    reset,
  } = useAppStore()
  const [pendingKind, setPendingKind] = useState<PaletteItemKind | null>(null)
  const [exportState, setExportState] = useState<ExportState>(IDLE_EXPORT)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const { clear: clearCodeCommit, schedule: scheduleCodeCommit } = useTimeout()
  const { clear: clearExportStatus, schedule: scheduleExportStatus } = useTimeout()
  const { clear: clearSave, schedule: scheduleSave } = useTimeout()
  const graphRef = useRef<{ nodes: AlgorithmFlowNode[]; edges: AlgorithmFlowEdge[] }>(
    RESTORED_GRAPH ?? { nodes: [], edges: [] },
  )
  const flowCanvasRef = useRef<FlowCanvasHandle>(null)
  const route = useHashRoute()

  /*
   * 작업 내용 저장.
   *
   * 순서도 그래프를 그대로 담습니다. 만드는 도중에는 아직 연결하지 않은 기호가
   * 있어 AST로 바꿀 수 없는데, 그 상태야말로 잃어버리면 안 되기 때문입니다.
   */
  const saveNow = useCallback(() => {
    clearSave()
    const {
      code: latestCode,
      program: latestProgram,
      source: latestSource,
    } = useAppStore.getState()
    saveWorkspace({
      code: latestCode,
      program: latestProgram,
      source: latestSource,
      nodes: graphRef.current.nodes,
      edges: graphRef.current.edges,
    })
  }, [clearSave])

  const saveSoon = useCallback(() => {
    scheduleSave(saveNow, SAVE_DELAY)
  }, [saveNow, scheduleSave])

  const handleGraphChange = useCallback(
    (nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]) => {
      graphRef.current = { nodes, edges }
      saveSoon()
    },
    [saveSoon],
  )

  // 의사코드 쪽 변화(글자·AST·출처)도 같은 방식으로 저장합니다.
  useEffect(() => {
    saveSoon()
  }, [code, program, source, saveSoon])

  // 탭을 그냥 닫아도 마지막 변화가 남도록 예약해 둔 저장을 흘려보냅니다.
  useEffect(() => {
    window.addEventListener("pagehide", saveNow)
    return () => window.removeEventListener("pagehide", saveNow)
  }, [saveNow])

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      updateCodeDraft(nextCode)
      scheduleCodeCommit(() => commitCode(nextCode), CODE_COMMIT_DELAY)
    },
    [commitCode, scheduleCodeCommit, updateCodeDraft],
  )

  const handleProgramChange = useCallback(
    (nextProgram: typeof program) => setProgram(nextProgram, "flow"),
    [setProgram],
  )

  const handleFlowMutation = useCallback(() => {
    clearCodeCommit()
    beginFlowEdit()
  }, [beginFlowEdit, clearCodeCommit])

  const loadExample = (example: Example) => {
    clearCodeCommit()
    setPendingKind(null)
    setProgram(example.program, "example")
    navigateTo("editor")
  }

  const handlePaletteSelect = (kind: PaletteItemKind) => {
    setPendingKind(current => (current === kind ? null : kind))
  }

  const handlePaletteDrop = (kind: PaletteItemKind, clientX: number, clientY: number) => {
    flowCanvasRef.current?.addNodeAtScreen(kind, clientX, clientY)
    setPendingKind(null)
  }

  const handleReset = () => {
    clearCodeCommit()
    // 예약해 둔 저장이 방금 지운 내용을 되살리지 않도록 먼저 끕니다.
    clearSave()
    graphRef.current = { nodes: [], edges: [] }
    clearWorkspace()
    setPendingKind(null)
    setConfirmingReset(false)
    reset()
  }

  const handleExportPng = async () => {
    clearExportStatus()
    setExportState({ kind: "working", message: "저장 중…" })

    try {
      await flowCanvasRef.current?.exportPng()
      setExportState({ kind: "done", message: "저장했어요" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장하지 못했어요."
      setExportState({ kind: "failed", message })
    }

    scheduleExportStatus(() => setExportState(IDLE_EXPORT), EXPORT_STATUS_DURATION)
  }

  const showExamples = route === "examples"

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand-copy">
            <h1>알고리즘 표현하기</h1>
          </div>
        </div>

        <div className="topbar-actions">
          {showExamples ? (
            <a className="btn" href="#/">
              편집 화면으로
            </a>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setConfirmingReset(true)}>
                초기화
              </button>
              <a className="btn" href="#/examples">
                예제 보기
              </a>
              <div className="export-block">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExportPng}
                  disabled={exportState.kind === "working"}
                >
                  <span aria-hidden="true">⬇</span>
                  이미지로 저장
                </button>
                <span className={`export-status ${exportState.kind}`} role="status">
                  {exportState.message}
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {/*
          예제 화면에서도 편집 화면을 마운트해 둡니다. 그리던 순서도가 사라지면
          안 되기 때문입니다.
        */}
      {showExamples && (
        <Suspense fallback={<WorkspaceLoading />}>
          <ExamplesPage onLoad={loadExample} />
        </Suspense>
      )}

      <Suspense fallback={<WorkspaceLoading />}>
        <EditorWorkspace
          hidden={showExamples}
          program={program}
          revision={revision}
          source={source}
          code={code}
          parseError={parseError}
          graphMessage={graphMessage}
          pendingKind={pendingKind}
          restoredGraph={RESTORED_GRAPH}
          flowCanvasRef={flowCanvasRef}
          onCodeChange={handleCodeChange}
          onPendingConsumed={() => setPendingKind(null)}
          onGraphMutation={handleFlowMutation}
          onProgramChange={handleProgramChange}
          onGraphMessage={setGraphMessage}
          onGraphChange={handleGraphChange}
          onPaletteSelect={handlePaletteSelect}
          onPaletteDrop={handlePaletteDrop}
        />
      </Suspense>

      {confirmingReset && (
        <ModalDialog
          title="처음부터 다시 시작할까요?"
          onClose={() => setConfirmingReset(false)}
          actions={
            <>
              <button type="button" autoFocus onClick={() => setConfirmingReset(false)}>
                취소
              </button>
              <button type="button" className="danger" onClick={handleReset}>
                초기화
              </button>
            </>
          }
        >
          <p className="dialog-text">
            지금 만든 순서도와 의사코드가 모두 지워지고, 저장해 둔 내용도 함께 사라집니다. 되돌릴 수
            없어요.
          </p>
        </ModalDialog>
      )}

      <UpdatePrompt onBeforeRefresh={saveNow} />
    </main>
  )
}
