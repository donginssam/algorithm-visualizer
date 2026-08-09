import { createContext, useContext, type ReactNode } from "react"
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react"
import { oppositeSide, yesSideOf } from "../../core/astToFlow"
import type { AlgorithmFlowNode, DecisionSide } from "../../core/flowTypes"

export interface NodeActions {
  edit: (id: string) => void
  remove: (id: string) => void
}

export const NodeActionContext = createContext<NodeActions | null>(null)

function ActionToolbar({ id, selected, canEdit = true }: { id: string; selected: boolean; canEdit?: boolean }) {
  const actions = useContext(NodeActionContext)
  if (!actions) return null

  return (
    <NodeToolbar isVisible={selected} position={Position.Top} offset={14} className="node-toolbar">
      {canEdit && (
        <button type="button" className="nodrag nowheel" onClick={() => actions.edit(id)}>
          편집
        </button>
      )}
      <button type="button" className="nodrag nowheel danger" onClick={() => actions.remove(id)}>
        삭제
      </button>
    </NodeToolbar>
  )
}

function TargetHandle() {
  return <Handle id="target" type="target" position={Position.Top} className="large-handle target-handle" />
}

function NextHandle() {
  return <Handle id="next" type="source" position={Position.Bottom} className="large-handle source-handle" />
}

/**
 * 비스듬한 변이 있는 기호의 윤곽선.
 *
 * CSS `clip-path`로 자르면 테두리까지 함께 잘려서 평행사변형의 좌우 변, 마름모의
 * 네 변에 선이 남지 않는다. 도형을 SVG로 그리면 네 변 모두 테두리가 생기고,
 * PNG로 저장할 때 만드는 도형(core/flowToSvg.ts)과도 모양이 정확히 같아진다.
 */
const SHAPE_OUTLINES = {
  io: "14,0 100,0 86,100 0,100",
  decision: "50,0 100,50 50,100 0,50",
} as const

function Shape({
  className,
  outline,
  children,
}: {
  className: string
  outline?: string
  children: ReactNode
}) {
  return (
    <div className={`flow-shape ${className}`}>
      {outline && (
        <svg
          className="shape-outline"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points={outline} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {children}
    </div>
  )
}

export function TerminalNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  const isStart = data.terminalRole === "start"
  return (
    <div className="node-frame">
      <ActionToolbar id={id} selected={selected} />
      {!isStart && <TargetHandle />}
      <Shape className="terminal-shape"><span>{data.label}</span></Shape>
      {isStart && <NextHandle />}
    </div>
  )
}

export function IoNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  return (
    <div className="node-frame">
      <ActionToolbar id={id} selected={selected} />
      <TargetHandle />
      <Shape className="io-shape" outline={SHAPE_OUTLINES.io}><span>{data.label}</span></Shape>
      <NextHandle />
    </div>
  )
}

export function ProcessNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  return (
    <div className="node-frame">
      <ActionToolbar id={id} selected={selected} />
      <TargetHandle />
      <Shape className="process-shape"><span>{data.label}</span></Shape>
      <NextHandle />
    </div>
  )
}

/**
 * 판단 기호의 갈래 연결점.
 *
 * 마름모의 좌우 꼭짓점에서 나갑니다. 두 갈래가 바닥에서 나오면 다음 기호가
 * 반대편에 있을 때 선이 엇갈려 예/아니오를 구분할 수 없습니다. 어느 쪽으로
 * 내보낼지는 자동 배치기가 정합니다(core/astToFlow.ts).
 */
function BranchHandle({ id, side, caption }: { id: "yes" | "no"; side: DecisionSide; caption: string }) {
  return (
    <>
      <span className={`handle-caption handle-caption-${side}`}>{caption}</span>
      <Handle
        id={id}
        type="source"
        position={side === "left" ? Position.Left : Position.Right}
        className={`large-handle decision-handle decision-handle-${side}`}
      />
    </>
  )
}

export function DecisionNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  const yesSide = yesSideOf(data)

  return (
    <div className="node-frame decision-frame">
      <ActionToolbar id={id} selected={selected} />
      <TargetHandle />
      <Shape className="decision-shape" outline={SHAPE_OUTLINES.decision}>
        <span>{data.label}</span>
      </Shape>
      <BranchHandle id="yes" side={yesSide} caption="예" />
      <BranchHandle id="no" side={oppositeSide(yesSide)} caption="아니오" />
    </div>
  )
}

export function JunctionNode({ id, selected }: NodeProps<AlgorithmFlowNode>) {
  return (
    <div className="node-frame junction-frame" aria-label="분기 합류점">
      <ActionToolbar id={id} selected={selected} canEdit={false} />
      <TargetHandle />
      <div className="junction-dot" />
      <NextHandle />
    </div>
  )
}
