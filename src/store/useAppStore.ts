import { create } from "zustand"
import type { Program } from "../core/ast"
import { astToText } from "../core/astToText"
import { parsePseudocode, PseudocodeParseError } from "../core/parser"

export type ProgramSource = "example" | "text" | "flow"

/**
 * 처음 화면에 올라오는 프로그램.
 *
 * 예제를 미리 띄우지 않고 비워 둔다. 본문이 비어 있어도 "시작"과 "끝"은 항상
 * 있으므로(문법 규칙) 학생은 그 사이에 기호를 넣기만 하면 된다.
 */
const EMPTY_PROGRAM: Program = { body: [] }

interface AppState {
  program: Program
  code: string
  parseError: PseudocodeParseError | null
  graphMessage: string | null
  revision: number
  source: ProgramSource
  updateCodeDraft: (code: string) => void
  commitCode: (code: string) => void
  beginFlowEdit: () => void
  setProgram: (program: Program, source: ProgramSource) => void
  setGraphMessage: (message: string | null) => void
}

export const useAppStore = create<AppState>(set => ({
  program: EMPTY_PROGRAM,
  code: astToText(EMPTY_PROGRAM),
  parseError: null,
  graphMessage: null,
  revision: 0,
  source: "example",

  updateCodeDraft: code => set({ code }),

  commitCode: code => {
    try {
      const program = parsePseudocode(code)
      set(state => ({
        code,
        program,
        parseError: null,
        graphMessage: null,
        revision: state.revision + 1,
        source: "text",
      }))
    } catch (error) {
      const parseError =
        error instanceof PseudocodeParseError
          ? error
          : new PseudocodeParseError(1, "의사코드를 읽는 중 문제가 생겼어요.")
      set({ code, parseError })
    }
  },

  beginFlowEdit: () =>
    set(state => ({
      code: astToText(state.program),
      parseError: null,
      source: "flow",
    })),

  setProgram: (program, source) =>
    set(state => ({
      program,
      code: astToText(program),
      parseError: null,
      graphMessage: null,
      revision: state.revision + 1,
      source,
    })),

  setGraphMessage: graphMessage => set({ graphMessage }),
}))
