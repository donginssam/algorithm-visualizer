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

/**
 * 입출력 기호 라벨에서 꾸밈을 떼고 알맹이만 남깁니다.
 *
 * 앞에 붙는 '입력: '과 뒤에 붙는 ' 입력' 두 표기를 모두 받습니다. 편집 대화상자는
 * 종류를 바꿔 가며 고치므로 두 낱말을 모두 떼어 내고(기본값), 의사코드로 되돌리는
 * core/flowToAst.ts는 해당 종류의 낱말만 넘겨 "꾸밈이 아예 없었다"를 가려냅니다
 * (돌려받은 값이 원래 라벨과 같으면 학생이 형식을 지키지 않은 것입니다).
 */
export function stripIoLabel(
  value: string,
  labels: readonly string[] = [INPUT_LABEL, OUTPUT_LABEL],
): string {
  const alternatives = labels.join("|")
  return value
    .replace(new RegExp(`^(?:${alternatives})\\s*:\\s*`), "")
    .replace(new RegExp(`\\s+(?:${alternatives})$`), "")
    .trim()
}
