/**
 * 알고리즘의 중간 표현(AST).
 *
 * 의사코드 텍스트와 순서도 그래프는 모두 이 구조를 거쳐 변환된다.
 *   의사코드 → parser → Program → astToFlow → 순서도
 *   순서도 → flowToAst → Program → astToText → 의사코드
 *
 * "시작"과 "끝"은 모든 프로그램에 항상 존재하므로 별도 노드로 두지 않고
 * Program 자체에 암묵적으로 포함된다. 순서도로 변환할 때 시작/끝 단말
 * 기호가 자동으로 붙는다.
 *
 * 조건식과 수식은 해석하지 않고 문자열 그대로 보존한다.
 * (예: "수가 5보다 작거나 같을 때까지", "합계 + 수 × 수")
 */

/** 대입/처리: `합계 ← 0` — 파란 직사각형 */
export interface AssignNode {
  type: "assign"
  /** 대입 대상 변수 이름 */
  target: string
  /** 대입할 식 (문자열 그대로 보존) */
  expr: string
}

/** 입력: `입력: 수` — 분홍 평행사변형 */
export interface InputNode {
  type: "input"
  /** 입력받을 변수 이름 */
  variable: string
}

/** 출력: `출력: 합계` — 분홍 평행사변형 */
export interface OutputNode {
  type: "output"
  /** 출력할 식 (문자열 그대로 보존) */
  expr: string
}

/** 반복: `[조건 반복]` + 들여쓰기 본문 — 초록 마름모 + 되돌아가는 화살표 */
export interface LoopNode {
  type: "loop"
  /** 반복 조건 (문자열 그대로 보존, "반복" 표시는 제외) */
  condition: string
  body: Statement[]
}

/** 조건 분기: `[만약 조건이면]` / `[아니면]` — 초록 마름모 + 예/아니오 분기 */
export interface IfNode {
  type: "if"
  /** 판단 조건 (문자열 그대로 보존, "만약"/"이면" 표시는 제외) */
  condition: string
  thenBody: Statement[]
  /** [아니면] 블록이 없으면 빈 배열 */
  elseBody: Statement[]
}

export type Statement = AssignNode | InputNode | OutputNode | LoopNode | IfNode

/** 알고리즘 하나 전체. 시작~끝 사이의 문장 목록을 담는다. */
export interface Program {
  body: Statement[]
}
