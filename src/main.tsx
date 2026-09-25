import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "@xyflow/react/dist/style.css"
import "pretendard/dist/web/variable/pretendardvariable.css"
import "./styles/index.scss"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
