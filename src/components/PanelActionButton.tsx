import { useEffect, useRef, useState } from "react"
import { useTimeout } from "../hooks/useTimeout"

type ActionState = { kind: "idle" | "working" | "done" } | { kind: "failed"; message: string }

interface PanelActionButtonProps {
  onAction: () => Promise<void>
  labels: Record<ActionState["kind"], string>
  className: string
  icon: string
  title: string
  disabled?: boolean
  disabledTitle?: string
}

const STATUS_DURATION = 2000

/** 패널 동작의 중복 실행을 막고 성공·실패를 잠깐 표시합니다. */
export function PanelActionButton({
  onAction,
  labels,
  className,
  icon,
  title,
  disabled = false,
  disabledTitle = title,
}: PanelActionButtonProps) {
  const [state, setState] = useState<ActionState>({ kind: "idle" })
  const workingRef = useRef(false)
  const mountedRef = useRef(false)
  const { clear, schedule } = useTimeout()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = async () => {
    // 같은 렌더에서 클릭이 연달아 들어와도 작업은 한 번만 실행합니다.
    if (disabled || workingRef.current) return
    workingRef.current = true
    clear()
    setState({ kind: "working" })

    let result: ActionState
    try {
      await onAction()
      result = { kind: "done" }
    } catch (error) {
      result = {
        kind: "failed",
        message: error instanceof Error && error.message ? error.message : labels.failed,
      }
    } finally {
      workingRef.current = false
    }

    // 작업이 끝나기 전에 화면을 떠났다면 새 타이머를 만들지 않습니다.
    if (!mountedRef.current) return
    setState(result)
    schedule(() => setState({ kind: "idle" }), STATUS_DURATION)
  }

  const buttonTitle = disabled ? disabledTitle : state.kind === "failed" ? state.message : title

  return (
    <button
      type="button"
      className={`btn panel-action-button ${className} ${state.kind}`}
      onClick={run}
      disabled={disabled || state.kind === "working"}
      title={buttonTitle}
      aria-live="polite"
    >
      <span aria-hidden="true">{icon}</span>
      {labels[state.kind]}
    </button>
  )
}
