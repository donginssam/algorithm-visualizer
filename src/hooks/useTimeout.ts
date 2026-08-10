import { useCallback, useEffect, useRef } from "react"

/**
 * 컴포넌트가 사라질 때 자동으로 정리되는 단일 타이머입니다.
 * 같은 용도의 작업을 다시 예약하면 이전 예약을 교체합니다.
 */
export function useTimeout() {
  const timerRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const schedule = useCallback(
    (callback: () => void, delay: number) => {
      clear()
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        callback()
      }, delay)
    },
    [clear],
  )

  useEffect(() => clear, [clear])

  return { clear, schedule }
}
