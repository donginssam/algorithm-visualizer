import { PanelActionButton } from "./PanelActionButton"

interface ExportImageButtonProps {
  /** 순서도를 PNG로 만들어 내려받습니다. 실패하면 이유를 담은 오류를 던집니다. */
  onExport: () => Promise<void>
}

const LABELS = {
  idle: "이미지로 저장",
  working: "저장 중…",
  done: "저장했어요",
  failed: "저장하지 못했어요",
}

/** 순서도 이미지 저장 동작과 문구를 공통 버튼에 연결합니다. */
export function ExportImageButton({ onExport }: ExportImageButtonProps) {
  return (
    <PanelActionButton
      onAction={onExport}
      labels={LABELS}
      className="export-image-button"
      icon="⬇"
      title="순서도를 PNG 이미지로 저장"
    />
  )
}
