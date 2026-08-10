/** 의사코드 편집 화면에서 바로 입력할 수 있는 교과서 기호입니다. */
export const PSEUDOCODE_SYMBOLS = ["←", "×", "÷"] as const

/**
 * 의사코드 문장과 순서도 기호 라벨을 서로 바꿀 때 쓰는 토큰입니다.
 * core/astToFlow.ts, core/astToText.ts, core/flowToAst.ts, components/FlowCanvas.tsx가
 * 이 토큰으로 서로 맞물려 있으니, 바꿀 때는 네 곳을 모두 확인하세요.
 */
export const ASSIGN_GLYPH = "←"
export const INPUT_LABEL = "입력"
export const OUTPUT_LABEL = "출력"
export const INPUT_PREFIX = `${INPUT_LABEL}: `
export const OUTPUT_PREFIX = `${OUTPUT_LABEL}: `
