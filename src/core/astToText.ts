import { ASSIGN_GLYPH, INPUT_PREFIX, OUTPUT_PREFIX } from "../constants/pseudocode"
import type { Program, Statement } from "./ast"

function statementLines(statement: Statement, depth: number): string[] {
  const indent = "  ".repeat(depth)

  switch (statement.type) {
    case "action":
      return [`${indent}${statement.text}`]
    case "assign":
      return [`${indent}${statement.target} ${ASSIGN_GLYPH} ${statement.expr}`]
    case "input":
      return [`${indent}${INPUT_PREFIX}${statement.variable}`]
    case "output":
      return [`${indent}${OUTPUT_PREFIX}${statement.expr}`]
    case "loop":
      return [
        `${indent}[${statement.condition} 반복]`,
        ...statement.body.flatMap(child => statementLines(child, depth + 1)),
      ]
    case "if":
      return [
        `${indent}[만약 ${statement.condition}]`,
        ...statement.thenBody.flatMap(child => statementLines(child, depth + 1)),
        ...(statement.elseBody.length > 0
          ? [
              `${indent}[아니면]`,
              ...statement.elseBody.flatMap(child => statementLines(child, depth + 1)),
            ]
          : []),
      ]
  }
}

/** AST를 다시 편집 가능한 표준 의사코드로 출력합니다. */
export function astToText(program: Program): string {
  // 본문이 없으면 '끝'을 붙이지 않습니다. 처음 화면은 '시작' 한 줄에서 시작하고,
  // 순서도도 같은 규칙으로 '시작' 기호만 그립니다(core/astToFlow.ts).
  if (program.body.length === 0) return "시작"

  return ["시작", ...program.body.flatMap(statement => statementLines(statement, 1)), "끝"].join(
    "\n",
  )
}
