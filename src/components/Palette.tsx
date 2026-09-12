import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { SHAPE_OUTLINE_POINTS, type ShapePoint } from "../core/shapeGeometry"

export type PaletteItemKind = "terminal" | "io" | "process" | "decision"

interface PaletteProps {
  pendingKind: PaletteItemKind | null
  onSelect: (kind: PaletteItemKind) => void
  onDrop: (kind: PaletteItemKind, clientX: number, clientY: number) => void
}

const items: Array<{
  kind: PaletteItemKind
  label: string
  /** 버튼에 보이는 짧은 이름. 모양만으로는 무엇인지 알기 어려워 함께 적습니다. */
  short: string
}> = [
  { kind: "terminal", label: "단말 기호 (시작·끝)", short: "단말" },
  { kind: "io", label: "입출력 기호", short: "입출력" },
  { kind: "process", label: "처리 기호", short: "처리" },
  { kind: "decision", label: "판단 기호", short: "판단" },
]

/** 팔레트 그림의 사각 기준 상자. 비스듬한 변이 잘리지 않도록 테두리만큼 안쪽으로 둡니다. */
const FIGURE_BOX = { x: 1, y: 6, width: 74, height: 30 }
/** 마름모는 위아래 꼭짓점이 있어 상자를 세로로 더 씁니다. */
const DIAMOND_BOX = { x: 1, y: 1, width: 74, height: 40 }

/** 0~1로 정규화한 윤곽(core/shapeGeometry.ts)을 팔레트 그림 상자에 맞춰 늘립니다. */
function fitOutline(points: readonly ShapePoint[], box: typeof FIGURE_BOX): string {
  return points.map(([x, y]) => `${box.x + box.width * x},${box.y + box.height * y}`).join(" ")
}

/**
 * 팔레트에 보이는 기호 모양.
 *
 * 76×42 좌표계에 1:1로 그린다. `clip-path`가 아니라 SVG를 쓰는 이유는 비스듬한
 * 변에도 테두리를 남기기 위해서다.
 *
 * 평행사변형과 마름모의 꼭짓점은 캔버스·PNG와 같은 정의(`SHAPE_OUTLINE_POINTS`)에서
 * 끌어온다. 팔레트 그림만 다른 기울기로 남는 일을 막기 위해서다.
 *
 * 판단 기호는 **가로로 긴 마름모**다. 육각형은 순서도 표기에서 준비(preparation)
 * 기호이므로 판단에 쓰면 안 된다.
 */
function PaletteFigure({ kind }: { kind: PaletteItemKind }) {
  return (
    <svg className={`palette-figure ${kind}`} viewBox="0 0 76 42" aria-hidden="true">
      {kind === "terminal" && <rect {...FIGURE_BOX} rx="15" vectorEffect="non-scaling-stroke" />}
      {kind === "process" && <rect {...FIGURE_BOX} rx="3" vectorEffect="non-scaling-stroke" />}
      {kind === "io" && (
        <polygon
          points={fitOutline(SHAPE_OUTLINE_POINTS.io, FIGURE_BOX)}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {kind === "decision" && (
        <polygon
          points={fitOutline(SHAPE_OUTLINE_POINTS.decision, DIAMOND_BOX)}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

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

  const handlePointerDown = (
    kind: PaletteItemKind,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
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
    const moved =
      drag.moved || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7
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
            className={`palette-item ${pendingKind === item.kind ? "pending" : ""}`}
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
            <PaletteFigure kind={item.kind} />
            <span className="palette-item-label">{item.short}</span>
          </button>
        ))}
      </div>
      {preview && (
        <div
          className="drag-preview"
          style={{ left: preview.x, top: preview.y }}
          aria-hidden="true"
        >
          <PaletteFigure kind={preview.kind} />
        </div>
      )}
    </section>
  )
}
