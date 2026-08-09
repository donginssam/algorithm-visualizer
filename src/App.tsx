import { ReactFlowProvider } from "@xyflow/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CodeEditor } from "./components/CodeEditor"
import { FlowCanvas, type FlowCanvasHandle } from "./components/FlowCanvas"
import { Palette, type PaletteItemKind } from "./components/Palette"
import { examples } from "./examples"
import { useAppStore } from "./store/useAppStore"

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
  const [selectedExampleId, setSelectedExampleId] = useState(examples[0].id)
  const [pendingKind, setPendingKind] = useState<PaletteItemKind | null>(null)
  const debounceRef = useRef<number | null>(null)
  const flowCanvasRef = useRef<FlowCanvasHandle>(null)

  useEffect(() => () => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
  }, [])

  const handleCodeChange = useCallback((nextCode: string) => {
    setSelectedExampleId("")
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
    setSelectedExampleId("")
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    beginFlowEdit()
  }, [beginFlowEdit])

  const loadExample = (id: string) => {
    const example = examples.find(candidate => candidate.id === id)
    if (!example) return
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = null
    setSelectedExampleId(id)
    setPendingKind(null)
    setProgram(example.program, "example")
  }

  const handlePaletteSelect = (kind: PaletteItemKind) => {
    setPendingKind(current => current === kind ? null : kind)
  }

  const handlePaletteDrop = (kind: PaletteItemKind, clientX: number, clientY: number) => {
    flowCanvasRef.current?.addNodeAtScreen(kind, clientX, clientY)
    setPendingKind(null)
  }

  return (
    <ReactFlowProvider>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">정보 교과 · 알고리즘</span>
            <h1>알고리즘 순서도 만들기</h1>
          </div>
          <div className="example-picker" aria-label="예제 불러오기">
            <span>예제</span>
            <div role="group" aria-label="알고리즘 예제">
              {examples.map(example => (
                <button
                  key={example.id}
                  type="button"
                  className={selectedExampleId === example.id ? "active" : ""}
                  onClick={() => loadExample(example.id)}
                >
                  {example.title}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="workspace" aria-label="의사코드와 순서도 편집 공간">
          <article className="editor-panel">
            <div className="panel-heading">
              <div>
                <span className="step-label">의사코드</span>
                <h2>글로 알고리즘 쓰기</h2>
              </div>
              <span className="live-badge">300ms 자동 변환</span>
            </div>
            <p className="panel-help">공백 2칸으로 들여쓰면 오른쪽 순서도가 자동으로 바뀝니다.</p>
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
                <span className="step-label">순서도</span>
                <h2>기호로 알고리즘 그리기</h2>
              </div>
              <div className="gesture-help" aria-label="캔버스 조작법">
                <span>한 손가락 이동</span>
                <span>두 손가락 확대</span>
              </div>
            </div>
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
      </main>
    </ReactFlowProvider>
  )
}
