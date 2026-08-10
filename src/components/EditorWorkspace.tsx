import { ReactFlowProvider } from "@xyflow/react"
import type { Ref } from "react"
import type { Program } from "../core/ast"
import type { AlgorithmFlowEdge, AlgorithmFlowNode, FlowGraph } from "../core/flowTypes"
import type { PseudocodeParseError } from "../core/parser"
import type { ProgramSource } from "../store/useAppStore"
import { CodeEditor } from "./CodeEditor"
import { FlowCanvas, type FlowCanvasHandle } from "./FlowCanvas"
import { Palette, type PaletteItemKind } from "./Palette"
import { SyntaxHelp } from "./SyntaxHelp"

interface EditorWorkspaceProps {
  program: Program
  revision: number
  source: ProgramSource
  code: string
  parseError: PseudocodeParseError | null
  graphMessage: string | null
  pendingKind: PaletteItemKind | null
  restoredGraph: FlowGraph | null
  flowCanvasRef: Ref<FlowCanvasHandle>
  hidden: boolean
  onCodeChange: (code: string) => void
  onPendingConsumed: () => void
  onGraphMutation: () => void
  onProgramChange: (program: Program) => void
  onGraphMessage: (message: string | null) => void
  onGraphChange: (nodes: AlgorithmFlowNode[], edges: AlgorithmFlowEdge[]) => void
  onPaletteSelect: (kind: PaletteItemKind) => void
  onPaletteDrop: (kind: PaletteItemKind, clientX: number, clientY: number) => void
}

/**
 * 의사코드·순서도 편집 화면.
 *
 * @xyflow/react·@codemirror/*·@dagrejs/dagre 같은 무거운 라이브러리가 이 화면에만
 * 필요해서 App.tsx가 이 컴포넌트를 React.lazy로 지연 불러옵니다. ReactFlowProvider도
 * FlowCanvas가 유일한 소비자라 여기로 좁혀 뒀습니다.
 */
export default function EditorWorkspace({
  program,
  revision,
  source,
  code,
  parseError,
  graphMessage,
  pendingKind,
  restoredGraph,
  flowCanvasRef,
  hidden,
  onCodeChange,
  onPendingConsumed,
  onGraphMutation,
  onProgramChange,
  onGraphMessage,
  onGraphChange,
  onPaletteSelect,
  onPaletteDrop,
}: EditorWorkspaceProps) {
  return (
    <ReactFlowProvider>
      <div className="editor-route" hidden={hidden}>
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
              <CodeEditor value={code} error={parseError} onChange={onCodeChange} />
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
              restoredGraph={restoredGraph}
              onPendingConsumed={onPendingConsumed}
              onGraphMutation={onGraphMutation}
              onProgramChange={onProgramChange}
              onGraphMessage={onGraphMessage}
              onGraphChange={onGraphChange}
            />
          </article>
        </section>

        <Palette pendingKind={pendingKind} onSelect={onPaletteSelect} onDrop={onPaletteDrop} />
      </div>
    </ReactFlowProvider>
  )
}
