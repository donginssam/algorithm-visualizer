# 의사코드와 AST

## 문법 개요

의사코드는 줄 단위로 읽으며 공백 2칸 들여쓰기로 블록을 표현합니다. 파서는 [`src/core/parser.ts`](../src/core/parser.ts), 표준 의사코드 생성기는 [`src/core/astToText.ts`](../src/core/astToText.ts)에 있습니다.

```text
시작
  합계 ← 0
  수 ← 1
  [수가 5보다 작거나 같을 때까지 반복]
    합계 ← 합계 + 수 × 수
    수 ← 수 + 1
  출력: 합계
끝
```

| 구문      | 입력 형식                     | AST                                             |
| --------- | ----------------------------- | ----------------------------------------------- |
| 일반 동작 | `물을 끓인다.` 같은 일반 문장 | `{ type: "action", text }`                      |
| 대입      | `변수 ← 식`                   | `{ type: "assign", target, expr }`              |
| 입력      | `입력: 변수` 또는 `변수 입력` | `{ type: "input", variable }`                   |
| 출력      | `출력: 식` 또는 `식 출력`     | `{ type: "output", expr }`                      |
| 반복      | `[조건 반복]` + 들여쓴 본문   | `{ type: "loop", condition, body }`             |
| 조건 분기 | `[만약 조건]` + 들여쓴 본문   | `{ type: "if", condition, thenBody, elseBody }` |
| 다른 경우 | `[아니면]` + 들여쓴 본문      | `if.elseBody`                                   |

`[만약 ...]` 안의 조건은 특정 조사나 어미를 강제하지 않습니다. 예를 들어 `[만약 수가 짝수이면]`을 읽으면 `condition`에는 `수가 짝수이면`이 그대로 저장됩니다. 생성기도 같은 문자열을 `[만약 ${condition}]` 형식으로 출력합니다.

## AST 노드 타입

AST의 실제 타입은 [`src/core/ast.ts`](../src/core/ast.ts)에 정의되어 있습니다. `Statement`는 `type` 필드로 구분하는 discriminated union이며, 반복과 조건 안에는 다시 `Statement[]`가 들어갈 수 있습니다.

```typescript
export interface AssignNode {
  type: "assign"
  target: string
  expr: string
}

export interface ActionNode {
  type: "action"
  text: string
}

export interface InputNode {
  type: "input"
  variable: string
}

export interface OutputNode {
  type: "output"
  expr: string
}

export interface LoopNode {
  type: "loop"
  condition: string
  body: Statement[]
}

export interface IfNode {
  type: "if"
  condition: string
  thenBody: Statement[]
  elseBody: Statement[]
}

export type Statement = ActionNode | AssignNode | InputNode | OutputNode | LoopNode | IfNode

export interface Program {
  body: Statement[]
}
```

### 필드 의미

| 타입         | 필드        | 의미                                                   |
| ------------ | ----------- | ------------------------------------------------------ |
| `ActionNode` | `text`      | 실행할 일반 동작 원문                                  |
| `AssignNode` | `target`    | 값을 저장할 변수 이름                                  |
| `AssignNode` | `expr`      | 저장할 값 또는 계산식                                  |
| `InputNode`  | `variable`  | 입력받을 변수 이름                                     |
| `OutputNode` | `expr`      | 출력할 값 또는 식                                      |
| `LoopNode`   | `condition` | `반복` 표기를 제외한 조건 문자열                       |
| `LoopNode`   | `body`      | 조건이 참일 때 실행하고 판단으로 돌아갈 문장 목록      |
| `IfNode`     | `condition` | `만약` 표기를 제외한 판단 조건 문자열                  |
| `IfNode`     | `thenBody`  | `예` 흐름의 문장 목록                                  |
| `IfNode`     | `elseBody`  | `아니오` 흐름의 문장 목록. `[아니면]`이 없으면 빈 배열 |
| `Program`    | `body`      | 시작과 끝 사이의 최상위 문장 목록                      |

`시작`과 `끝`은 AST 노드가 아닙니다. 모든 알고리즘의 경계로 간주하여 `Program`에 암묵적으로 포함하고 의사코드나 순서도로 변환할 때 자동으로 표현합니다.

`condition`과 `expr`은 해석된 expression tree가 아니라 원문 문자열입니다. 예를 들어 `합계 + 수 × 수`나 `수가 5보다 작거나 같을 때까지`를 토큰으로 나누거나 실행하지 않습니다.

### AST 예시

```typescript
const program: Program = {
  body: [
    { type: "input", variable: "수" },
    { type: "action", text: "수를 확인한다." },
    {
      type: "if",
      condition: "수를 2로 나눈 나머지가 0이면",
      thenBody: [{ type: "output", expr: '"짝수"' }],
      elseBody: [{ type: "output", expr: '"홀수"' }],
    },
  ],
}
```

이 AST는 의사코드의 조건 블록과 순서도의 판단 기호·두 갈래·합류점을 모두 표현합니다. 그래프의 `junction`은 구조 복원을 위한 내부 노드이므로 AST에는 포함하지 않습니다.

### AST 구조를 이렇게 정한 이유

- `type`으로 구분하는 union은 각 변환기의 `switch`가 모든 문장 종류를 처리하는지 TypeScript로 확인하기 쉽습니다.
- `LoopNode.body`, `IfNode.thenBody`, `IfNode.elseBody`가 다시 `Statement[]`를 가지므로 의사코드 들여쓰기와 구조가 직접 대응합니다.
- `start`, `end`, `junction`은 알고리즘 문장이 아니라 표현을 위한 경계·연결 정보이므로 AST에서 제외했습니다.
- `condition`과 `expr`을 문자열로 보존해 자연스러운 한국어 표현을 허용하고 실행 언어 설계가 현재 변환 기능에 섞이지 않게 했습니다.
- 위치, 색, 선택 여부 같은 React Flow UI 상태를 AST에 넣지 않아 같은 알고리즘을 텍스트, 화면, PNG에서 재사용할 수 있게 했습니다.

그래프를 AST 자체로 사용하는 방안도 검토할 수 있지만, 임의 그래프에는 블록 범위가 모호한 cycle과 합류가 들어갈 수 있습니다. 중첩된 문장 구조를 AST로 명시하고 그래프를 검증해 되돌리는 편이 의사코드 생성 규칙을 안정적으로 유지합니다.

## 프로그램 경계 규칙

- 첫 번째 비어 있지 않은 줄은 들여쓰기 없는 `시작`이어야 합니다.
- 본문 문장은 `시작`보다 공백 2칸 더 들여씁니다.
- 본문이 하나라도 있으면 마지막 비어 있지 않은 줄은 들여쓰기 없는 `끝`이어야 합니다.
- `시작` 한 줄은 빈 프로그램으로 읽습니다.
- 호환을 위해 `시작`과 `끝` 두 줄도 빈 프로그램으로 읽지만, 표준 생성 결과는 `시작` 한 줄입니다.
- 빈 줄은 무시합니다.
- 탭 들여쓰기는 허용하지 않고 공백 2칸을 안내합니다.

빈 프로그램 규칙은 초기 UX와 연결되어 있습니다. 사용자는 시작 기호 하나에서 순서도를 만들기 시작하며 본문을 만든 뒤 마지막에 끝 기호를 놓습니다. 이 규칙을 바꿀 때는 파서, 생성기, AST→그래프, 그래프→AST, 초기 store, 테스트를 함께 수정해야 합니다.

## 기호 정규화

`normalizeSymbols`는 키보드로 입력하기 쉬운 문자를 교과서 표기로 바꿉니다.

| 입력 | 저장·표시 |
| ---- | --------- |
| `<-` | `←`       |
| `*`  | `×`       |

정규화는 파서와 CodeMirror 입력 양쪽에서 적용합니다. [`src/components/CodeEditor.tsx`](../src/components/CodeEditor.tsx)는 변환 후에도 커서 위치가 자연스럽게 유지되도록 변환 전 문자열의 선택 영역을 다시 계산합니다. `←`, `×`, `÷`는 편집기와 노드 대화상자의 기호 버튼으로도 입력할 수 있습니다.

## 파싱 과정

[`parsePseudocode`](../src/core/parser.ts)는 다음 순서로 동작합니다.

1. 줄바꿈을 통일하고 기호를 정규화합니다.
2. 원본 줄 번호, 들여쓰기 칸 수, 앞뒤 공백을 제거한 본문을 수집합니다.
3. `시작`과 `끝` 규칙을 검사합니다.
4. 현재 들여쓰기 깊이를 인자로 받는 `parseBlock`이 문장을 재귀적으로 읽습니다.
5. 반복과 조건은 다음 단계의 들여쓰기 블록을 자식 문장으로 만듭니다.
6. 단순 문장은 입력·출력을 먼저 판별하고 `←`가 있으면 대입 형식을 검증합니다.
7. `[`로 시작했지만 제어문 형식이 아니면 오류로 안내하고, 나머지 문장은 일반 동작으로 읽습니다.

일반 동작, 조건식과 계산식의 내부 문법은 해석하지 않습니다. 예를 들어 `물을 끓인다.`, `합계 + 수 × 수`, `수가 5보다 작거나 같을 때까지`는 AST에서 문자열 그대로 보존됩니다.

## 오류 모델

`PseudocodeParseError`는 다음 정보를 가집니다.

- `line`: 원본 의사코드 줄 번호
- `column`: 오류를 표시할 열
- `message`: 학생이 다음 행동을 알 수 있는 한국어 안내

CodeMirror는 해당 줄에 diagnostic을 표시하고 편집기 아래에도 같은 메시지를 보여 줍니다. 새 오류를 추가할 때는 내부 구현 용어보다 고치는 방법을 설명합니다.

좋은 예:

```text
← 뒤에 저장할 값이나 계산식이 필요해요.
```

피해야 할 예:

```text
Unexpected token at expression node.
```

## AST에서 의사코드 생성

`astToText`는 AST를 항상 하나의 표준 형식으로 출력합니다.

- 들여쓰기는 깊이마다 공백 2칸입니다.
- 입력과 출력은 각각 `입력: ...`, `출력: ...` 형식입니다.
- 일반 동작은 `action.text`를 바꾸지 않고 그대로 출력합니다.
- 반복은 `[${condition} 반복]` 형식입니다.
- 조건 분기는 `[만약 ${condition}]` 형식이며 `elseBody`가 있을 때만 `[아니면]`을 출력합니다.

입력 파서는 접미형 입력·출력을 받아들이지만 생성기는 접두형만 사용합니다. 이처럼 파서는 편의를 위해 여러 입력을 허용하고 생성기는 일관된 한 가지 형식을 내보냅니다.

## 새 문장 종류를 추가할 때

다음 영역을 한 묶음으로 변경합니다.

1. `src/core/ast.ts`의 `Statement` 타입
2. `src/core/parser.ts`의 입력 문법과 오류 메시지
3. `src/core/astToText.ts`의 표준 출력
4. `src/core/astToFlow.ts`의 노드·엣지 생성
5. `src/core/flowToAst.ts`의 그래프 역변환과 검증
6. 노드 편집 UI와 팔레트가 필요하다면 관련 컴포넌트
7. `parse(generate(ast)) === ast` 왕복 테스트

한 방향 변환만 추가하면 의사코드와 순서도의 일관성이 깨지므로 반드시 양방향과 오류 상태를 함께 구현합니다.

순서도 기호와 AST 타입의 대응은 [순서도 기호 규칙](./flowchart-symbols.md)을 참고합니다.
