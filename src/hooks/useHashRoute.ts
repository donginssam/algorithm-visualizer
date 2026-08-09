import { useEffect, useState } from "react"

export type Route = "editor" | "examples"

function readRoute(): Route {
  return window.location.hash === "#/examples" ? "examples" : "editor"
}

/** 주소를 바꿔 화면을 옮긴다. 브라우저 뒤로가기가 그대로 동작한다. */
export function navigateTo(route: Route) {
  window.location.hash = route === "examples" ? "#/examples" : "#/"
}

/**
 * 주소창의 해시로 화면을 나눈다.
 *
 * 화면이 둘뿐이라 라우팅 라이브러리 대신 해시만 본다. 그래도 주소가 바뀌므로
 * 뒤로가기와 링크 공유가 모두 동작한다.
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute)

  useEffect(() => {
    const update = () => setRoute(readRoute())
    update()
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])

  return route
}
