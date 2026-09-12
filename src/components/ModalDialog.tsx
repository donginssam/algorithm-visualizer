import { useEffect, useId, useRef, type ReactNode } from "react"

interface ModalDialogProps {
  title: string
  /** 닫아 달라는 요청(배경 탭·Escape·취소 버튼). 실제로 닫는 것은 부모가 정합니다. */
  onClose: () => void
  /** 제목과 버튼 사이에 들어가는 내용. */
  children?: ReactNode
  /** 오른쪽 아래 버튼들. */
  actions: ReactNode
}

/**
 * 화면 전체를 덮는 대화상자.
 *
 * 네이티브 `<dialog>`를 `showModal()`로 엽니다. 직접 만든 겹침 층과 달리 포커스가
 * 대화상자 안에 갇히고, 뒤쪽 화면이 스크린 리더와 탭 이동에서 빠지며, Escape가
 * 기본으로 동작합니다. 예전에는 이 셋을 세 대화상자가 각자 흉내 내다가 기호 편집
 * 대화상자에서만 Escape 처리가 `<input>`에 붙어 있어, 입력칸이 없는 단말 기호를
 * 편집할 때는 Escape가 듣지 않았습니다.
 *
 * 여백은 `<dialog>`가 아니라 안쪽 패널에 둡니다. 배경을 탭했는지는 이벤트 대상이
 * `<dialog>` 자신인지로 가리는데, 대화상자에 여백이 있으면 카드 가장자리를 눌러도
 * 배경으로 잘못 세기 때문입니다.
 */
export function ModalDialog({ title, onClose, children, actions }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      className="app-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => {
        // 닫는 것은 부모가 정합니다. 브라우저가 먼저 닫아 버리면 React가 여전히
        // 그리고 있는 대화상자가 화면에서만 사라져 서로 어긋납니다.
        event.preventDefault()
        onClose()
      }}
      onKeyDown={event => {
        /*
         * Escape를 직접도 받습니다.
         *
         * 모달 대화상자는 Escape에 브라우저가 알아서 `cancel`을 보내 주기로 되어
         * 있지만, 그 처리는 브라우저 바깥층에 있어 환경에 따라(웹뷰·자동화 등)
         * 오지 않는 것을 확인했습니다. 포커스가 대화상자 안에 갇혀 있으므로 어느
         * 칸에 있든 여기로 옵니다. 둘 다 와도 닫는 일은 여러 번 해도 같습니다.
         */
        if (event.key !== "Escape") return
        event.preventDefault()
        onClose()
      }}
      onPointerDown={event => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <div className="app-dialog-panel">
        <h3 id={titleId}>{title}</h3>
        {children}
        <div className="dialog-actions">{actions}</div>
      </div>
    </dialog>
  )
}
