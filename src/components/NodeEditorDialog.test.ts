import { describe, expect, it } from "vitest"
import type { AlgorithmFlowNode, ControlKind } from "../core/flowTypes"
import { editingLabel, editingStateOf, type EditingState } from "./NodeEditorDialog"

const decision = (value: string, controlKind: ControlKind): EditingState => ({
  id: "d",
  value,
  kind: "decision",
  controlKind,
})

describe("판단 기호 조건식 편집", () => {
  /*
   * 의사코드에서 복사해 붙여 넣은 바깥 표기만 벗기고, 조건식 안의 괄호나 낱말은 그대로
   * 둡니다. 한때는 끝의 `]`와 끝의 `반복`을 무조건 지워 `값[0]`이 `값[0`이 됐습니다.
   */
  it.each([
    ["수가 5보다 작으면", "if", "수가 5보다 작으면"],
    ["값[0]", "if", "값[0]"],
    ["값[목록[0]]", "loop", "값[목록[0]]"],
    ["[만약 수가 5보다 작으면]", "if", "수가 5보다 작으면"],
    ["[수가 5보다 작으면 반복]", "loop", "수가 5보다 작으면"],
    ["작업 반복", "loop", "작업 반복"],
  ] as const)("%j(%s) → %j", (value, controlKind, expected) => {
    expect(editingLabel(decision(value, controlKind))).toBe(expected)
  })

  it("바깥 표기 안의 중첩 괄호도 보존한다", () => {
    expect(editingLabel(decision("[만약 값[목록[0]]이 짝수이면]", "if"))).toBe(
      "값[목록[0]]이 짝수이면",
    )
  })

  it("기호 정규화(<-→←, *→×)는 그대로 적용한다", () => {
    expect(editingLabel(decision("값[i]*2가 0보다 크면", "if"))).toBe("값[i]×2가 0보다 크면")
  })

  it("저장·재편집·종류 전환을 반복해도 조건식이 변하지 않는다", () => {
    let label = "값[목록[0]]이 짝수이면"
    for (const controlKind of ["if", "loop", "if", "loop"] as const) {
      const node: AlgorithmFlowNode = {
        id: "d",
        type: "decision",
        position: { x: 0, y: 0 },
        data: { kind: "decision", label, controlKind },
      }
      label = editingLabel({ ...editingStateOf(node), controlKind })
    }
    expect(label).toBe("값[목록[0]]이 짝수이면")
  })
})
