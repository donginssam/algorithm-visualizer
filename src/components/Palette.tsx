import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

export type PaletteItemKind =
  | "terminal"
  | "io"
  | "process"
  | "decision"

interface PaletteProps {
  pendingKind: PaletteItemKind | null
  onSelect: (kind: PaletteItemKind) => void
  onDrop: (kind: PaletteItemKind, clientX: number, clientY: number) => void
}

const items: Array<{ kind: PaletteItemKind; label: string; className: string }> = [
  { kind: "terminal", label: "단말 기호", className: "terminal" },
  { kind: "io", label: "입출력 기호", className: "io" },
  { kind: "process", label: "처리", className: "process" },
  { kind: "decision", label: "판단 기호", className: "decision" },
]

interface DragState {
  kind: PaletteItemKind
  startX: number
  startY: number
  x: number
  y: number
  moved: boolean
}

export function Palette({ pendingKind, onSelect, onDrop }: PaletteProps) {
  const dragRef = useRef<DragState | null>(null)
  const [preview, setPreview] = useState<DragState | null>(null)

  const handlePointerDown = (kind: PaletteItemKind, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const moved = drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY, moved }
    if (moved) setPreview(dragRef.current)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setPreview(null)
    if (!drag) return
    if (drag.moved) onDrop(drag.kind, event.clientX, event.clientY)
    else onSelect(drag.kind)
  }

  return (
    <section className="palette" aria-label="순서도 기호 팔레트">
      <div className="palette-copy">
        <strong>기호 팔레트</strong>
        <span>기호를 끌어 놓거나 탭한 뒤 캔버스를 탭하세요.</span>
      </div>
      <div className="palette-items">
        {items.map(item => (
          <button
            key={item.kind}
            type="button"
            className={`palette-item ${item.className} ${pendingKind === item.kind ? "pending" : ""}`}
            aria-label={item.label}
            aria-pressed={pendingKind === item.kind}
            onPointerDown={event => handlePointerDown(item.kind, event)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragRef.current = null
              setPreview(null)
            }}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onSelect(item.kind)
              }
            }}
          >
            <span className="visually-hidden">{item.label}</span>
          </button>
        ))}
      </div>
      {preview && (
        <div
          className={`drag-preview ${items.find(item => item.kind === preview.kind)?.className ?? ""}`}
          style={{ left: preview.x, top: preview.y }}
          aria-hidden="true"
        />
      )}
    </section>
  )
}
