import type { Program } from "../core/ast"

export interface Example {
  id: string
  /** 예제 갤러리에 표시할 이름 */
  title: string
  /** 한 줄 설명 (중학생 눈높이) */
  description: string
  program: Program
}

/**
 * 1부터 5까지 각 수의 제곱을 더하는 알고리즘.
 *
 * 시작
 *   합계 ← 0
 *   수 ← 1
 *   [수가 5보다 작거나 같을 때까지 반복]
 *     합계 ← 합계 + 수 × 수
 *     수 ← 수 + 1
 *   출력: 합계
 * 끝
 */
export const sumOfSquares: Example = {
  id: "sum-of-squares",
  title: "제곱의 합 구하기",
  description: "1부터 5까지 각 수의 제곱을 모두 더해요",
  program: {
    body: [
      { type: "assign", target: "합계", expr: "0" },
      { type: "assign", target: "수", expr: "1" },
      {
        type: "loop",
        condition: "수가 5보다 작거나 같을 때까지",
        body: [
          { type: "assign", target: "합계", expr: "합계 + 수 × 수" },
          { type: "assign", target: "수", expr: "수 + 1" },
        ],
      },
      { type: "output", expr: "합계" },
    ],
  },
}

/**
 * 수를 입력받아 짝수인지 홀수인지 판별하는 알고리즘.
 *
 * 시작
 *   입력: 수
 *   [만약 수를 2로 나눈 나머지가 0이면]
 *     출력: "짝수"
 *   [아니면]
 *     출력: "홀수"
 * 끝
 */
export const evenOrOdd: Example = {
  id: "even-or-odd",
  title: "짝수 판별하기",
  description: "입력한 수가 짝수인지 홀수인지 알려줘요",
  program: {
    body: [
      { type: "input", variable: "수" },
      {
        type: "if",
        condition: "수를 2로 나눈 나머지가 0이면",
        thenBody: [{ type: "output", expr: '"짝수"' }],
        elseBody: [{ type: "output", expr: '"홀수"' }],
      },
    ],
  },
}

export const examples: Example[] = [sumOfSquares, evenOrOdd]
