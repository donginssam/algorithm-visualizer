import { create } from "zustand"
import type { Program } from "../core/ast"
import { astToText } from "../core/astToText"
import { parsePseudocode, PseudocodeParseError } from "../core/parser"
import { loadWorkspace, type Workspace } from "../core/workspaceStore"

export type ProgramSource = "example" | "text" | "flow"

/**
 * 처음 화면에 올라오는 프로그램.
 *
 * 예제를 미리 띄우지 않고 비워 둔다. 본문이 비어 있으면 "끝"도 두지 않으므로
 * 학생은 "시작" 하나에서 출발해 아래로 기호를 쌓아 간다.
 */
const EMPTY_PROGRAM: Program = { body: [] }

/**
 * 지난번에 하던 작업. 없으면 빈 프로그램에서 시작한다.
 *
 * 화면을 만들기 전에 한 번만 읽는다. 순서도 그래프는 FlowCanvas가 그대로 받아
 * 쓰므로(App.tsx) 여기서는 의사코드와 AST만 꺼낸다.
 */
export const restoredWorkspace: Workspace | null = loadWorkspace()

/**
 * 되살린 의사코드에 문법 오류가 남아 있었다면 밑줄과 안내도 함께 되살린다.
 * 그러지 않으면 오류가 있는 글을 두고 "문법이 올바릅니다"라고 알려 주게 된다.
 */
function restoredParseError(): PseudocodeParseError | null {
  if (!restoredWorkspace) return null
  try {
    parsePseudocode(restoredWorkspace.code)
    return null
  } catch (error) {
    return error instanceof PseudocodeParseError ? error : null
  }
}

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
  reset: () => void
}

export const useAppStore = create<AppState>(set => ({
  program: restoredWorkspace?.program ?? EMPTY_PROGRAM,
  code: restoredWorkspace?.code ?? astToText(EMPTY_PROGRAM),
  parseError: restoredParseError(),
  graphMessage: null,
  revision: 0,
  source: restoredWorkspace?.source ?? "example",

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

  /** 처음 화면으로 되돌립니다. 저장해 둔 작업 내용은 App에서 함께 지웁니다. */
  reset: () =>
    set(state => ({
      program: EMPTY_PROGRAM,
      code: astToText(EMPTY_PROGRAM),
      parseError: null,
      graphMessage: null,
      revision: state.revision + 1,
      source: "example",
    })),
}))
