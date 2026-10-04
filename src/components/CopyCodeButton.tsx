import { PanelActionButton } from "./PanelActionButton"

interface CopyCodeButtonProps {
  code: string
  /** 순서도가 미완성이라 의사코드를 보여 줄 수 없을 때는 옛 글이 복사되지 않게 막습니다. */
  disabled?: boolean
}

const LABELS = {
  idle: "복사",
  working: "복사 중…",
  done: "복사했어요",
  failed: "복사하지 못했어요",
}

/** 편집기에 보이는 의사코드를 그대로 클립보드에 넣습니다. */
export function CopyCodeButton({ code, disabled = false }: CopyCodeButtonProps) {
  const copy = async () => {
    if (!navigator.clipboard) {
      throw new Error("이 브라우저에서는 클립보드 복사를 사용할 수 없어요.")
    }
    await navigator.clipboard.writeText(code)
  }

  return (
    <PanelActionButton
      onAction={copy}
      labels={LABELS}
      className="copy-code-button"
      icon="⧉"
      disabled={disabled}
      title="의사코드 복사"
      disabledTitle="순서도를 완성하면 의사코드를 복사할 수 있어요."
    />
  )
}
