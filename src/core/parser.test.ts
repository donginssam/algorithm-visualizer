import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToText } from "./astToText"
import { parsePseudocode, PseudocodeParseError } from "./parser"

describe("의사코드 파서와 생성기", () => {
  it.each(examples)("$title 예제를 손실 없이 왕복 변환한다", ({ program }) => {
    expect(parsePseudocode(astToText(program))).toEqual(program)
  })

  it("키보드용 연산 기호를 교과서 기호로 바꾼다", () => {
    expect(
      parsePseudocode(`시작
  합계 <- 수 * 수
끝`),
    ).toEqual({ body: [{ type: "assign", target: "합계", expr: "수 × 수" }] })
  })

  it("오류가 난 원본 줄과 쉬운 메시지를 알려 준다", () => {
    try {
      parsePseudocode(`시작
  합계 ←
끝`)
      throw new Error("오류가 발생해야 합니다")
    } catch (error) {
      expect(error).toBeInstanceOf(PseudocodeParseError)
      expect(error).toMatchObject({ line: 2 })
      expect((error as Error).message).toContain("← 뒤")
    }
  })
})
