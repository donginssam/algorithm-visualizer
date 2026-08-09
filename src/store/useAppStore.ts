import { create } from "zustand"
import type { Program } from "../core/ast"
import { astToText } from "../core/astToText"
import { parsePseudocode, PseudocodeParseError } from "../core/parser"
import { sumOfSquares } from "../examples"

export type ProgramSource = "example" | "text" | "flow"

interface AppState {
  program: Program
  code: string
  parseError: PseudocodeParseError | null
  graphMessage: string | null
  revision: number
  source: ProgramSource
  updateCodeDraft: (code: string) => void
  commitCode: (code: string) => void
  setProgram: (program: Program, source: ProgramSource) => void
  setGraphMessage: (message: string | null) => void
}

export const useAppStore = create<AppState>(set => ({
  program: sumOfSquares.program,
  code: astToText(sumOfSquares.program),
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
