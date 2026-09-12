import {
  INPUT_PREFIX,
  OUTPUT_PREFIX,
  PSEUDOCODE_SYMBOLS,
  stripIoLabel,
} from "../constants/pseudocode"
import type { AlgorithmFlowNode, ControlKind, FlowNodeKind, TerminalRole } from "../core/flowTypes"
import { normalizeSymbols } from "../core/parser"
import { ModalDialog } from "./ModalDialog"

export interface EditingState {
  id: string
  value: string
  kind: FlowNodeKind
  controlKind?: ControlKind
  /** 대화상자를 열 때의 종류. 저장할 때 판단 기호의 종류가 바뀌었는지 봅니다. */
  originalControlKind?: ControlKind
  terminalRole?: TerminalRole
}

/** 기호 하나를 편집하기 시작할 때의 상태. */
export function editingStateOf(node: AlgorithmFlowNode): EditingState {
  const value =
    node.data.kind === "input" || node.data.kind === "output"
      ? stripIoLabel(node.data.label)
      : node.data.label

  return {
    id: node.id,
    value,
    kind: node.data.kind,
    controlKind: node.data.controlKind,
    originalControlKind: node.data.controlKind,
    terminalRole: node.data.terminalRole,
  }
}

/** 편집한 내용을 기호에 적을 라벨로 바꿉니다. */
export function editingLabel(editing: EditingState): string {
  const value = normalizeSymbols(editing.value).trim()

  switch (editing.kind) {
    case "terminal":
      return editing.terminalRole === "end" ? "끝" : "시작"
    case "input":
      return `${INPUT_PREFIX}${stripIoLabel(value)}`
    case "output":
      return `${OUTPUT_PREFIX}${stripIoLabel(value)}`
    case "decision":
      return value
        .replace(/^\[만약\s+/, "")
        .replace(/\]$/, "")
        .replace(/\s+반복$/, "")
        .trim()
    default:
      return value
  }
}

interface NodeEditorDialogProps {
  editing: EditingState
  onEditingChange: (next: EditingState) => void
  onSave: () => void
  onClose: () => void
}

/** 기호 하나의 종류와 안에 적힌 문장을 고치는 대화상자. */
export function NodeEditorDialog({
  editing,
  onEditingChange,
  onSave,
  onClose,
}: NodeEditorDialogProps) {
  const update = (patch: Partial<EditingState>) => onEditingChange({ ...editing, ...patch })

  return (
    <ModalDialog
      title="기호 내용 편집"
      onClose={onClose}
      actions={
        <>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="primary" onClick={onSave}>
            저장
          </button>
        </>
      }
    >
      {editing.kind === "terminal" && (
        <label>
          종류
          <select
            value={editing.terminalRole ?? "start"}
            onChange={event => update({ terminalRole: event.target.value as TerminalRole })}
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
            onChange={event => update({ kind: event.target.value as "input" | "output" })}
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
            onChange={event => update({ controlKind: event.target.value as ControlKind })}
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
            onChange={event => update({ value: event.target.value })}
            onKeyDown={event => {
              if (event.key === "Enter") onSave()
            }}
          />
        </label>
      )}
      <div className="dialog-symbols" aria-label="기호 입력">
        {PSEUDOCODE_SYMBOLS.map(symbol => (
          <button
            key={symbol}
            type="button"
            onClick={() => update({ value: editing.value + symbol })}
          >
            {symbol}
          </button>
        ))}
      </div>
    </ModalDialog>
  )
}
