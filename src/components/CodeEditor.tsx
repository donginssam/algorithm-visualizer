import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { setDiagnostics, type Diagnostic } from "@codemirror/lint"
import { EditorState } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view"
import { useEffect, useRef } from "react"
import { PSEUDOCODE_SYMBOLS } from "../constants/pseudocode"
import type { PseudocodeParseError } from "../core/parser"
import { normalizeSymbols } from "../core/parser"

interface CodeEditorProps {
  value: string
  error: PseudocodeParseError | null
  onChange: (value: string) => void
}

export function CodeEditor({ value, error, onChange }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const updatingRef = useRef(false)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": "의사코드 편집기",
          spellcheck: "false",
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        placeholder("시작\n  입력: 수\n  출력: 수\n끝"),
        EditorView.updateListener.of(update => {
          if (!update.docChanged || updatingRef.current) return
          const raw = update.state.doc.toString()
          const normalized = normalizeSymbols(raw)

          if (normalized !== raw) {
            const selection = update.state.selection.main
            updatingRef.current = true
            update.view.dispatch({
              changes: { from: 0, to: raw.length, insert: normalized },
              selection: {
                anchor: normalizeSymbols(raw.slice(0, selection.anchor)).length,
                head: normalizeSymbols(raw.slice(0, selection.head)).length,
              },
            })
            updatingRef.current = false
          }

          onChangeRef.current(normalized)
        }),
        EditorView.theme({
          "&": { height: "100%", fontSize: "16px" },
          ".cm-scroller": { fontFamily: '"Pretendard Variable", Pretendard, monospace' },
          ".cm-content": { padding: "14px 0", caretColor: "var(--accent)" },
          ".cm-line": { padding: "0 14px 0 8px", lineHeight: "1.75" },
          ".cm-gutters": {
            color: "var(--text-muted)",
            backgroundColor: "var(--surface-muted)",
            borderRight: "1px solid var(--border-soft)",
          },
          ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent-soft)" },
          ".cm-focused": { outline: "none" },
        }),
      ],
    })

    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 편집기는 한 번만 만들고 값과 콜백은 별도 effect/ref로 동기화합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return

    updatingRef.current = true
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    updatingRef.current = false
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    let diagnostics: Diagnostic[] = []

    if (error) {
      const lineNumber = Math.min(Math.max(error.line, 1), view.state.doc.lines)
      const line = view.state.doc.line(lineNumber)
      diagnostics = [
        {
          from: line.from,
          to: Math.max(line.from, line.to),
          severity: "error",
          message: `${error.line}번째 줄: ${error.message}`,
        },
      ]
    }
    view.dispatch(setDiagnostics(view.state, diagnostics))
  }, [error, value])

  const insertSymbol = (symbol: string) => {
    const view = viewRef.current
    if (!view) return
    const selection = view.state.selection.main
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: symbol },
      selection: { anchor: selection.from + symbol.length },
    })
    view.focus()
  }

  return (
    <div className="code-editor-shell">
      <div className="symbol-toolbar" aria-label="교과서 기호 입력">
        <span>기호 입력</span>
        {PSEUDOCODE_SYMBOLS.map(symbol => (
          <button
            key={symbol}
            type="button"
            onClick={() => insertSymbol(symbol)}
            aria-label={`${symbol} 기호 입력`}
          >
            {symbol}
          </button>
        ))}
      </div>
      <div ref={hostRef} className="code-editor" />
      <div className={error ? "editor-status error" : "editor-status valid"} role="status">
        {error ? `${error.line}번째 줄: ${error.message}` : "의사코드 문법이 올바릅니다."}
      </div>
    </div>
  )
}
