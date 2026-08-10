# 개발 문서

이 폴더는 `알고리즘 표현하기`의 요구사항, 기술 결정, 현재 구현과 유지보수 절차를 설명하는 개발 문서의 기준점입니다. 별도의 구현 계획 문서가 없어도 프로젝트를 이해하고 수정할 수 있도록 필요한 배경과 규칙을 함께 관리합니다.

## 문서 구성

| 문서                                               | 내용                                                          | 먼저 읽으면 좋은 경우              |
| -------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| [프로젝트 개요와 기술 결정](./project-overview.md) | 대상 사용자, 요구사항, 기술 선택 이유, 구현 현황과 후속 작업  | 프로젝트에 처음 참여할 때          |
| [아키텍처](./architecture.md)                      | AST 중심 데이터 흐름, 상태 관리, 화면 구성·분할, 모듈 책임    | 전체 구조를 처음 파악할 때         |
| [의사코드와 AST](./pseudocode.md)                  | 문법, 파싱·생성 규칙, 오류 처리, 확장 절차                    | 새 구문이나 문장 종류를 추가할 때  |
| [순서도 기호 규칙](./flowchart-symbols.md)         | 교육 표기, 기호 색·크기·텍스트, 화살표와 연결점 기준          | 기호 모양이나 스타일을 수정할 때   |
| [순서도 변환과 렌더링](./flowchart.md)             | AST↔그래프 변환, 자동 배치, 검증, 화살표, PNG 저장            | 순서도 기호·연결·배치를 수정할 때  |
| [UI와 터치 입력](./ui-touch.md)                    | 화면 구조, 마우스·터치 조작, 접근성, 크롬북 제약              | 컴포넌트나 CSS를 수정할 때         |
| [테스트와 유지보수](./testing.md)                  | 자동 테스트, 수동 점검표, 자동 배포, 결합된 상수, 알려진 제한 | 변경을 검증하거나 배포를 준비할 때 |
| [구현 단계 기록](./milestones/README.md)           | 1~8단계 목표, 구현 내용, 산출물과 완료 기준                   | 구현 순서와 변경 배경을 추적할 때  |

## 권장 읽기 순서

처음 참여하는 개발자는 다음 순서로 읽는 것이 좋습니다.

1. [프로젝트 개요와 기술 결정](./project-overview.md)에서 목표, 범위, 선택 배경과 현재 상태를 확인합니다.
2. [아키텍처](./architecture.md)에서 AST 중심 데이터 흐름을 확인합니다.
3. AST와 표기 기준은 [의사코드와 AST](./pseudocode.md), [순서도 기호 규칙](./flowchart-symbols.md)에서 확인합니다.
4. 그래프 작업은 [순서도 변환과 렌더링](./flowchart.md)을 읽습니다.
5. 화면을 건드린다면 [UI와 터치 입력](./ui-touch.md)의 터치 타깃과 화면 크기 규칙을 확인합니다.
6. 작업 전후에 [테스트와 유지보수](./testing.md)의 변경별 점검표를 사용합니다.

과거 구현 순서가 필요하면 [구현 단계 기록](./milestones/README.md)을 참고합니다. 현재 동작의 기준은 항상 주제별 문서와 코드입니다.

## 핵심 원칙

- 의사코드와 순서도는 반드시 같은 `Program` AST를 표현해야 합니다.
- 조건식과 계산식은 실행하지 않고 문자열 그대로 보존합니다.
- 빈 프로그램은 의사코드 `시작` 한 줄, 순서도 `시작` 기호 하나입니다.
- 판단 기호는 마름모이며, `예/아니오`는 서로 반대쪽 꼭짓점에서 출발합니다.
- 마우스와 터치를 동급 입력 수단으로 취급하고 조작 영역을 최소 44×44px로 유지합니다.
- 화면에 그린 순서도와 저장한 PNG가 같은 도형과 화살표 경로를 사용해야 합니다.
- 현재 동작이나 설계 결정이 바뀌면 같은 변경에서 관련 문서도 갱신합니다.

## 주요 진입점

- 애플리케이션 조립: [`src/App.tsx`](../src/App.tsx)
- 전역 상태: [`src/store/useAppStore.ts`](../src/store/useAppStore.ts)
- 중간 표현: [`src/core/ast.ts`](../src/core/ast.ts)
- 의사코드 파서: [`src/core/parser.ts`](../src/core/parser.ts)
- 순서도 캔버스: [`src/components/FlowCanvas.tsx`](../src/components/FlowCanvas.tsx)
- 디자인 토큰: [`src/styles/_tokens.scss`](../src/styles/_tokens.scss)
- 레이아웃과 컴포넌트 스타일: [`src/styles/index.scss`](../src/styles/index.scss)
- 편집 화면 조립과 지연 불러오기 경계: [`src/components/EditorWorkspace.tsx`](../src/components/EditorWorkspace.tsx)
- 빌드·chunk 분할·service worker 설정: [`vite.config.ts`](../vite.config.ts)
- 설치 manifest와 배포 경로: [`src/constants/pwa.ts`](../src/constants/pwa.ts)
- 배포 워크플로: [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
- 단계별 구현 기록: [`docs/milestones/`](./milestones/README.md)
