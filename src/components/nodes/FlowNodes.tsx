import { createContext, useContext, type ReactNode } from "react"
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react"
import type { AlgorithmFlowNode } from "../../core/flowTypes"

export interface NodeActions {
  edit: (id: string) => void
  remove: (id: string) => void
}

export const NodeActionContext = createContext<NodeActions | null>(null)

function ActionToolbar({ id, selected, canEdit = true }: { id: string; selected: boolean; canEdit?: boolean }) {
  const actions = useContext(NodeActionContext)
  if (!actions) return null

  return (
    <NodeToolbar isVisible={selected} position={Position.Right} offset={12} className="node-toolbar">
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

function Shape({ className, children }: { className: string; children: ReactNode }) {
  return <div className={`flow-shape ${className}`}>{children}</div>
}

export function TerminalNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  const isStart = data.terminalRole === "start"
  return (
    <div className="node-frame">
      <ActionToolbar id={id} selected={selected} canEdit={false} />
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
      <Shape className="io-shape"><span>{data.label}</span></Shape>
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

export function DecisionNode({ id, data, selected }: NodeProps<AlgorithmFlowNode>) {
  return (
    <div className="node-frame decision-frame">
      <ActionToolbar id={id} selected={selected} />
      <TargetHandle />
      <Shape className="decision-shape"><span>{data.label}</span></Shape>
      <span className="handle-caption yes">예</span>
      <Handle
        id="yes"
        type="source"
        position={Position.Bottom}
        className="large-handle decision-handle yes-handle"
        style={{ left: "34%" }}
      />
      <span className="handle-caption no">아니오</span>
      <Handle
        id="no"
        type="source"
        position={Position.Bottom}
        className="large-handle decision-handle no-handle"
        style={{ left: "66%" }}
      />
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
