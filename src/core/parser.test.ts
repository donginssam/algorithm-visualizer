import { describe, expect, it } from "vitest"
import { examples } from "../examples"
import { astToText } from "./astToText"
import { parsePseudocode, PseudocodeParseError } from "./parser"

describe("의사코드 파서와 생성기", () => {
  it.each(examples)("$title 예제를 손실 없이 왕복 변환한다", ({ program }) => {
    expect(parsePseudocode(astToText(program))).toEqual(program)
  })

  // 처음 화면에 올라오는 상태입니다. 순서도도 '시작' 기호 하나만 그립니다.
  it("본문이 비어 있는 프로그램은 시작 한 줄이 된다", () => {
    const empty = { body: [] }

    expect(astToText(empty)).toBe("시작")
    expect(parsePseudocode(astToText(empty))).toEqual(empty)
  })

  it("'시작'만 있어도, '시작/끝' 두 줄이어도 빈 프로그램으로 읽는다", () => {
    expect(parsePseudocode("시작")).toEqual({ body: [] })
    expect(parsePseudocode("시작\n끝")).toEqual({ body: [] })
  })

  it("문장을 적었는데 끝이 없으면 끝을 적으라고 안내한다", () => {
    expect(() => parsePseudocode("시작\n  입력: 수")).toThrow("'끝'을 적어 주세요")
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

  it("중첩된 조건과 반복도 손실 없이 왕복 변환한다", () => {
    const program = {
      body: [
        {
          type: "loop" as const,
          condition: "수가 10보다 작을 동안",
          body: [
            {
              type: "if" as const,
              condition: "수가 짝수이면",
              thenBody: [{ type: "output" as const, expr: "수" }],
              elseBody: [{ type: "assign" as const, target: "수", expr: "수 + 1" }],
            },
          ],
        },
      ],
    }

    expect(parsePseudocode(astToText(program))).toEqual(program)
  })

  it("공백 뒤에 섞인 탭도 정확한 줄에서 안내한다", () => {
    expect(() => parsePseudocode("시작\n  \t입력: 수\n끝")).toThrow("탭 대신 공백 2칸")
  })
})
