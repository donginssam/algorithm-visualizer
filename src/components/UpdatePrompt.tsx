import { useRegisterSW } from "virtual:pwa-register/react"
import { ModalDialog } from "./ModalDialog"

interface UpdatePromptProps {
  /** 새로 고치기 전에 예약해 둔 저장을 흘려보냅니다. */
  onBeforeRefresh: () => void
}

/*
 * 새 버전 알림.
 *
 * service worker 등록도 이 컴포넌트가 맡습니다(useRegisterSW). 항상 그려 두고 새
 * 버전을 받았을 때만 대화상자를 띄웁니다.
 *
 * 자동으로 새로 고치지 않는 이유는 수업 중이기 때문입니다. 기호를 끌거나 글자를
 * 치는 도중 화면이 갑자기 바뀌면 하던 동작이 끊깁니다. 초기화 버튼과 같은 방식으로
 * 한 번 묻습니다.
 */
export function UpdatePrompt({ onBeforeRefresh }: UpdatePromptProps) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  const dismiss = () => setNeedRefresh(false)

  const refresh = () => {
    onBeforeRefresh()
    void updateServiceWorker(true)
  }

  return (
    <ModalDialog
      title="새 버전이 나왔어요"
      onClose={dismiss}
      actions={
        <>
          <button type="button" autoFocus onClick={dismiss}>
            나중에
          </button>
          <button type="button" className="primary" onClick={refresh}>
            지금 새로 고침
          </button>
        </>
      }
    >
      <p className="dialog-text">
        지금 새로 고치면 최신 기능으로 바뀝니다. 만들던 내용은 그대로 남아요.
      </p>
    </ModalDialog>
  )
}
