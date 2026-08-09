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
 * 두 수를 입력받아 더 큰 수를 찾는 알고리즘.
 *
 * 시작
 *   입력: 가
 *   입력: 나
 *   [만약 가가 나보다 크면]
 *     최댓값 ← 가
 *   [아니면]
 *     최댓값 ← 나
 *   출력: 최댓값
 * 끝
 */
export const findMax: Example = {
  id: "find-max",
  title: "최댓값 찾기",
  description: "두 수 중에서 더 큰 수를 찾아요",
  program: {
    body: [
      { type: "input", variable: "가" },
      { type: "input", variable: "나" },
      {
        type: "if",
        condition: "가가 나보다 크면",
        thenBody: [{ type: "assign", target: "최댓값", expr: "가" }],
        elseBody: [{ type: "assign", target: "최댓값", expr: "나" }],
      },
      { type: "output", expr: "최댓값" },
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

export const examples: Example[] = [sumOfSquares, findMax, evenOrOdd]
