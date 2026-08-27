import type { Program, Statement } from "./ast"

interface SourceLine {
  number: number
  indent: number
  text: string
}

/** 화면에서 바로 안내할 수 있도록 원본 줄 위치를 함께 담은 문법 오류입니다. */
export class PseudocodeParseError extends Error {
  readonly line: number
  readonly column: number

  constructor(line: number, message: string, column = 1) {
    super(message)
    this.name = "PseudocodeParseError"
    this.line = line
    this.column = column
  }
}

/** 태블릿 키보드에서 입력하기 어려운 교과서 기호로 바꿉니다. */
export function normalizeSymbols(text: string): string {
  return text.replace(/<-/g, "←").replace(/\*/g, "×")
}

function sourceLines(source: string): SourceLine[] {
  return normalizeSymbols(source)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw, index) => {
      if (/^\s*\t/.test(raw)) {
        throw new PseudocodeParseError(index + 1, "탭 대신 공백 2칸으로 들여써 주세요.")
      }

      const indent = raw.match(/^ */)?.[0].length ?? 0
      return { number: index + 1, indent, text: raw.trim() }
    })
    .filter(line => line.text.length > 0)
}

function parseSimpleStatement(line: SourceLine): Statement {
  const inputPrefix = line.text.match(/^입력\s*:\s*(.*)$/)
  if (inputPrefix) {
    const variable = inputPrefix[1].trim()
    if (!variable) {
      throw new PseudocodeParseError(line.number, "'입력:' 뒤에 변수 이름을 적어 주세요.")
    }
    return { type: "input", variable }
  }

  const outputPrefix = line.text.match(/^출력\s*:\s*(.*)$/)
  if (outputPrefix) {
    const expr = outputPrefix[1].trim()
    if (!expr) {
      throw new PseudocodeParseError(line.number, "'출력:' 뒤에 출력할 값을 적어 주세요.")
    }
    return { type: "output", expr }
  }

  const inputSuffix = line.text.match(/^(.+?)\s+입력$/)
  if (inputSuffix) {
    return { type: "input", variable: inputSuffix[1].trim() }
  }

  const outputSuffix = line.text.match(/^(.+?)\s+출력$/)
  if (outputSuffix) {
    return { type: "output", expr: outputSuffix[1].trim() }
  }

  if (line.text.includes("←")) {
    const arrowIndex = line.text.indexOf("←")
    const target = line.text.slice(0, arrowIndex).trim()
    const expr = line.text.slice(arrowIndex + 1).trim()
    if (!target) {
      throw new PseudocodeParseError(line.number, "← 앞에 값을 저장할 변수 이름이 필요해요.")
    }
    if (!expr) {
      throw new PseudocodeParseError(
        line.number,
        "← 뒤에 저장할 값이나 계산식이 필요해요.",
        arrowIndex + 2,
      )
    }
    return { type: "assign", target, expr }
  }

  if (line.text.startsWith("[")) {
    throw new PseudocodeParseError(
      line.number,
      "제어문은 '[조건 반복]' 또는 '[만약 조건이면]' 형식으로 적어 주세요.",
    )
  }

  return { type: "action", text: line.text }
}

/** 공백 2칸 들여쓰기를 사용하는 교육용 의사코드를 AST로 바꿉니다. */
export function parsePseudocode(source: string): Program {
  const lines = sourceLines(source)

  if (lines.length === 0) {
    throw new PseudocodeParseError(1, "첫 줄에 '시작'을 적어 주세요.")
  }
  if (lines[0].text !== "시작") {
    throw new PseudocodeParseError(lines[0].number, "첫 줄은 '시작'이어야 해요.")
  }
  if (lines[0].indent !== 0) {
    throw new PseudocodeParseError(lines[0].number, "'시작'은 들여쓰지 않고 적어 주세요.")
  }

  // 처음 화면입니다. 아직 문장이 없으면 '끝' 없이 '시작' 한 줄만으로도 올바른
  // 프로그램으로 봅니다. 문장을 하나라도 적으면 아래에서 '끝'을 요구합니다.
  if (lines.length === 1) return { body: [] }

  const lastLine = lines[lines.length - 1]
  if (lastLine.text !== "끝") {
    throw new PseudocodeParseError(lastLine.number, "마지막 줄에 '끝'을 적어 주세요.")
  }
  if (lastLine.indent !== 0) {
    throw new PseudocodeParseError(lastLine.number, "'끝'은 들여쓰지 않고 적어 주세요.")
  }

  let cursor = 1
  const bodyEnd = lines.length - 1

  const parseBlock = (expectedIndent: number): Statement[] => {
    const statements: Statement[] = []

    while (cursor < bodyEnd) {
      const line = lines[cursor]
      if (line.indent < expectedIndent) break
      if (line.indent > expectedIndent) {
        throw new PseudocodeParseError(
          line.number,
          `들여쓰기는 공백 ${expectedIndent}칸이어야 해요.`,
          expectedIndent + 1,
        )
      }
      if (line.text === "[아니면]") break

      const loopMatch = line.text.match(/^\[(.+?)\s+반복\]$/)
      if (loopMatch) {
        const condition = loopMatch[1].trim()
        cursor += 1
        const body = parseBlock(expectedIndent + 2)
        if (body.length === 0) {
          throw new PseudocodeParseError(
            line.number,
            "반복할 문장을 다음 줄에 공백 2칸 더 들여써 주세요.",
          )
        }
        statements.push({ type: "loop", condition, body })
        continue
      }

      const ifMatch = line.text.match(/^\[만약\s+(.+)\]$/)
      if (ifMatch) {
        const condition = ifMatch[1].trim()
        cursor += 1
        const thenBody = parseBlock(expectedIndent + 2)
        if (thenBody.length === 0) {
          throw new PseudocodeParseError(
            line.number,
            "조건이 참일 때 할 일을 다음 줄에 들여써 주세요.",
          )
        }

        let elseBody: Statement[] = []
        const maybeElse = lines[cursor]
        if (
          cursor < bodyEnd &&
          maybeElse.indent === expectedIndent &&
          maybeElse.text === "[아니면]"
        ) {
          cursor += 1
          elseBody = parseBlock(expectedIndent + 2)
          if (elseBody.length === 0) {
            throw new PseudocodeParseError(
              maybeElse.number,
              "'아니면'일 때 할 일을 다음 줄에 들여써 주세요.",
            )
          }
        }

        statements.push({ type: "if", condition, thenBody, elseBody })
        continue
      }

      statements.push(parseSimpleStatement(line))
      cursor += 1
    }

    return statements
  }

  const body = parseBlock(2)
  if (cursor < bodyEnd) {
    const line = lines[cursor]
    if (line.text === "[아니면]") {
      throw new PseudocodeParseError(
        line.number,
        "'[아니면]'은 '[만약 ...]' 바로 뒤에서만 사용할 수 있어요.",
      )
    }
    throw new PseudocodeParseError(line.number, "시작과 끝 사이의 문장은 공백 2칸 들여써 주세요.")
  }

  return { body }
}
