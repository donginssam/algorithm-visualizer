import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "@xyflow/react/dist/style.css"
import "./styles/index.scss"

/*
 * 본문 글꼴(Pretendard)은 화면을 막는 CSS와 따로 불러옵니다.
 *
 * 글꼴이 오기 전에는 tokens의 대체 글꼴(Apple SD Gothic Neo·맑은 고딕)로 보이고
 * 오면 바뀝니다(font-display: swap). 굵기 파일 3개는 PWA precache에 포함되어
 * 오프라인에서도 같은 글꼴로 표시합니다. 어떤 글꼴 파일을 쓰는지는 pretendard.css에.
 */
void import("./styles/pretendard.css")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
