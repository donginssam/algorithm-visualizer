import { Component, type ErrorInfo, type ReactNode } from "react"
import { clearWorkspace } from "../core/workspaceStore"

interface AppErrorBoundaryState {
  failed: boolean
}

/**
 * 앱이 그리다 멈췄을 때의 마지막 안전망.
 *
 * 이것이 없으면 예외 하나에 화면 전체가 하얗게 사라지고 상단의 `초기화` 버튼도 함께
 * 사라집니다. 원인이 저장해 둔 작업이면 새로 고쳐도 같은 데이터를 다시 읽어 똑같이
 * 멈추므로, 학생은 개발자 도구 없이는 빠져나올 수 없습니다(한때 손상된 화살표 경로
 * 하나로 이렇게 된 적이 있습니다. 지금은 workspaceStore가 그런 값을 미리 걸러 냅니다).
 *
 * 그래서 App 바깥에서 예외를 받아, 다시 불러오기와 저장한 작업을 지우고 새로 시작하기를
 * 고르게 합니다. App이 내려가면서 저장 예약과 `pagehide` 저장도 함께 풀리므로, 새로
 * 고치는 동안 멈춘 상태가 다시 저장되지 않습니다.
 *
 * 렌더링·효과(useEffect)에서 난 예외만 받습니다. 이벤트 처리기 안의 예외는 React가
 * 오류 경계로 보내지 않으며, 화면도 그대로 남습니다.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("앱이 멈췄습니다.", error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="crash-screen">
        <section className="crash-card" role="alert" aria-labelledby="crash-title">
          <h1 id="crash-title">화면을 그리다 문제가 생겼어요</h1>
          <p>
            먼저 다시 불러와 보세요. 그래도 같은 화면이 나오면 저장해 둔 작업이 손상된 것일 수
            있어요.
          </p>
          <div className="crash-actions">
            <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
              다시 불러오기
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                clearWorkspace()
                location.reload()
              }}
            >
              저장한 작업 지우고 새로 시작
            </button>
          </div>
          <p className="crash-note">지운 작업은 되돌릴 수 없어요.</p>
        </section>
      </main>
    )
  }
}
