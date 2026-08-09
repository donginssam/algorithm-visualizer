import type { Program, Statement } from "./ast"

function statementLines(statement: Statement, depth: number): string[] {
  const indent = "  ".repeat(depth)

  switch (statement.type) {
    case "assign":
      return [`${indent}${statement.target} ← ${statement.expr}`]
    case "input":
      return [`${indent}입력: ${statement.variable}`]
    case "output":
      return [`${indent}출력: ${statement.expr}`]
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
  return ["시작", ...program.body.flatMap(statement => statementLines(statement, 1)), "끝"].join("\n")
}
