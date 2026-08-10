/**
 * 의사코드 문법 요약.
 *
 * 접이식(<details>)으로 두되, 펼친 표는 편집기 위에 겹쳐 띄웁니다. 1366×768에서
 * 세로 스크롤이 생기면 안 되는데, 아래로 밀어내는 방식이면 표 높이만큼 화면이
 * 넘칩니다. 겹쳐 띄우면 화면 높이가 아예 변하지 않습니다.
 * 문법 규칙은 docs/pseudocode.md와 core/parser.ts를 따릅니다.
 */

import { useEffect, useRef, useState } from "react"

const RULES = [
  { what: "값 정하기", how: "합계 ← 0", symbol: "처리" },
  { what: "입력", how: "입력: 수", symbol: "입출력" },
  { what: "출력", how: "출력: 합계", symbol: "입출력" },
  { what: "반복", how: "[수가 5보다 작을 때까지 반복]", symbol: "판단" },
  { what: "조건", how: "[만약 수가 짝수이면] · [아니면]", symbol: "판단" },
] as const

export function SyntaxHelp() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDetailsElement>(null)

  // 겹쳐 띄우므로 바깥을 누르면(편집기를 쓰려는 순간) 닫히게 합니다.
  useEffect(() => {
    if (!open) return

    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [open])

  return (
    <details
      className="syntax-help"
      ref={rootRef}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="syntax-help-title">문법 도움말</span>
        <span className="syntax-help-peek">변수 ← 값 · 입력: · 출력: · [조건 반복] · [만약 …]</span>
      </summary>

      <div className="syntax-help-body">
        <table>
          <thead>
            <tr>
              <th scope="col">무엇을</th>
              <th scope="col">이렇게 씁니다</th>
              <th scope="col">순서도 기호</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map(rule => (
              <tr key={rule.what}>
                <th scope="row">{rule.what}</th>
                <td>
                  <code>{rule.how}</code>
                </td>
                <td>{rule.symbol}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul>
          <li>시작과 끝 사이의 문장은 공백 2칸 들여쓰고, 반복·조건 안은 2칸 더 들여씁니다.</li>
          <li>
            <code>&lt;-</code>는 <code>←</code>로, <code>*</code>는 <code>×</code>로 저절로 바뀝니다.
          </li>
        </ul>
      </div>
    </details>
  )
}
