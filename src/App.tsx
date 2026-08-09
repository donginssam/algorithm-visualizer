import { ReactFlowProvider } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CodeEditor } from "./components/CodeEditor"
import { ExamplesPage } from "./components/ExamplesPage"
import { FlowCanvas, type FlowCanvasHandle } from "./components/FlowCanvas"
import { Palette, type PaletteItemKind } from "./components/Palette"
import { SyntaxHelp } from "./components/SyntaxHelp"
import type { Example } from "./examples"
import { navigateTo, useHashRoute } from "./hooks/useHashRoute"
import { useAppStore } from "./store/useAppStore"

interface ExportState {
  kind: "idle" | "working" | "done" | "failed"
  message: string
}

const IDLE_EXPORT: ExportState = { kind: "idle", message: "" }

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
  } = useAppStore()
  const [pendingKind, setPendingKind] = useState<PaletteItemKind | null>(null)
  const [exportState, setExportState] = useState<ExportState>(IDLE_EXPORT)
  const debounceRef = useRef<number | null>(null)
  const exportTimerRef = useRef<number | null>(null)
  const flowCanvasRef = useRef<FlowCanvasHandle>(null)
  const route = useHashRoute()

  useEffect(() => () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    if (exportTimerRef.current !== null) window.clearTimeout(exportTimerRef.current)
  }, [])

  const handleCodeChange = useCallback((nextCode: string) => {
    updateCodeDraft(nextCode)
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      commitCode(nextCode)
    }, 300)
  }, [commitCode, updateCodeDraft])

  const handleProgramChange = useCallback(
    (nextProgram: typeof program) => setProgram(nextProgram, "flow"),
    [setProgram],
  )

  const handleFlowMutation = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    beginFlowEdit()
  }, [beginFlowEdit])

  const loadExample = (example: Example) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = null
    setPendingKind(null)
    setProgram(example.program, "example")
    navigateTo("editor")
  }

  const handlePaletteSelect = (kind: PaletteItemKind) => {
    setPendingKind(current => current === kind ? null : kind)
  }

  const handlePaletteDrop = (kind: PaletteItemKind, clientX: number, clientY: number) => {
    flowCanvasRef.current?.addNodeAtScreen(kind, clientX, clientY)
    setPendingKind(null)
  }

  const handleExportPng = async () => {
    if (exportTimerRef.current !== null) {
      window.clearTimeout(exportTimerRef.current)
      exportTimerRef.current = null
    }
    setExportState({ kind: "working", message: "저장 중…" })

    try {
      await flowCanvasRef.current?.exportPng()
      setExportState({ kind: "done", message: "저장했어요" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "저장하지 못했어요."
      setExportState({ kind: "failed", message })
    }

    exportTimerRef.current = window.setTimeout(() => {
      exportTimerRef.current = null
      setExportState(IDLE_EXPORT)
    }, 4000)
  }

  const showExamples = route === "examples"

  return (
    <ReactFlowProvider>
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
        {showExamples && <ExamplesPage onLoad={loadExample} />}

        <div className="editor-route" hidden={showExamples}>
          <section className="workspace" aria-label="의사코드와 순서도 편집 공간">
            <article className="editor-panel">
              <div className="panel-heading">
                <div>
                  <span className="step-chip">
                    <b>1</b>의사코드
                  </span>
                  <h2>글로 알고리즘 쓰기</h2>
                </div>
              </div>
              <p className="panel-help">공백 2칸으로 들여쓰면 순서도가 자동으로 바뀝니다.</p>
              <SyntaxHelp />
              {graphMessage ? (
                <div className="graph-code-message" role="status">
                  <strong>아직 의사코드로 바꿀 수 없어요.</strong>
                  <span>{graphMessage}</span>
                  <small>순서도의 연결이나 기호 내용을 고치면 의사코드가 다시 나타납니다.</small>
                </div>
              ) : (
                <CodeEditor value={code} error={parseError} onChange={handleCodeChange} />
              )}
            </article>

            <article className="flow-panel">
              <div className="panel-heading flow-heading">
                <div>
                  <span className="step-chip">
                    <b>2</b>순서도
                  </span>
                  <h2>기호로 알고리즘 그리기</h2>
                </div>
                <div className="gesture-help" aria-label="캔버스 조작법">
                  <span>한 손가락 이동</span>
                  <span>두 손가락 확대</span>
                </div>
              </div>
              <p className="panel-help">
                기호를 끌어다 놓고 점끼리 이으면 의사코드가 자동으로 만들어집니다.
              </p>
              <FlowCanvas
                ref={flowCanvasRef}
                program={program}
                revision={revision}
                source={source}
                pendingKind={pendingKind}
                graphMessage={graphMessage}
                onPendingConsumed={() => setPendingKind(null)}
                onGraphMutation={handleFlowMutation}
                onProgramChange={handleProgramChange}
                onGraphMessage={setGraphMessage}
              />
            </article>
          </section>

          <Palette
            pendingKind={pendingKind}
            onSelect={handlePaletteSelect}
            onDrop={handlePaletteDrop}
          />
        </div>
      </main>
    </ReactFlowProvider>
  )
}
