# 7단계 — 최적화와 배포

> 상태: 완료

## 목표

6단계에서 기능과 화면을 마무리한 뒤, 만든 도구를 실제로 올려 두고 쓰기 위해 남은 네 가지를 처리합니다.

- 새로 고치거나 탭을 닫아도 하던 작업이 남아 있을 것
- 여러 파일에 흩어진 같은 값과 반복 코드를 한곳으로 모을 것
- 손으로 올리지 않고 자동으로 배포될 것
- 첫 화면이 무거운 라이브러리를 다 받은 뒤에야 나타나지 않을 것

## 구현 내용

### 작업 내용 자동 저장

[`src/core/workspaceStore.ts`](../../src/core/workspaceStore.ts)가 `localStorage` 한 칸에 작업 내용을 담습니다.

- AST가 아니라 **순서도 그래프를 그대로** 저장합니다. 만드는 도중에는 아직 연결하지 않은 기호가 있어 AST로 바꿀 수 없는데, 그 상태야말로 잃어버리면 안 되기 때문입니다.
- 저장 형식에 `VERSION`을 두고, 값이 조금이라도 어긋나면 읽지 않고 버립니다.
- React Flow가 실행 중에 붙이는 값(`measured`·`selected`·`dragging`)은 담지 않습니다. 다음에 열 때 다시 측정됩니다.
- 직렬화는 순수 함수로 두고, `localStorage`에 손대는 함수는 세 개(`loadWorkspace`·`saveWorkspace`·`clearWorkspace`)로 좁혔습니다. 저장소가 막힌 환경에서는 저장만 조용히 건너뜁니다.
- 글자와 기호를 이어서 다룰 때 매번 쓰지 않도록 400ms 뒤에 저장하고, `pagehide`에서 예약해 둔 저장을 흘려보냅니다.
- 되살린 의사코드에 문법 오류가 남아 있었다면 밑줄과 안내도 함께 되살립니다(`restoredParseError`).
- 상단바에 `초기화` 버튼과 확인 대화상자를 두고, 지우기 전에 예약된 저장부터 껐습니다.

현재 기준은 [아키텍처 문서의 작업 내용 자동 저장](../architecture.md#작업-내용-자동-저장)에 정리되어 있습니다.

### 흩어진 값과 반복 코드 모으기

같은 의미의 값이 파일마다 literal로 적혀 있어, 한쪽만 고치면 화면·PNG·의사코드가 어긋나는 상태였습니다.

- [`src/constants/pseudocode.ts`](../../src/constants/pseudocode.ts) — `←`, `입력: `, `출력: ` 같은 토큰을 모았습니다. `astToFlow`·`astToText`·`flowToAst`·`FlowCanvas`가 이 토큰으로 서로 맞물립니다.
- [`src/constants/flowColors.ts`](../../src/constants/flowColors.ts) — 화살표 색과 기호 4색입니다. React Flow의 `<defs>` marker와 독립 실행 SVG 문자열은 CSS 변수에 닿을 수 없어 literal이 필요합니다.
- [`src/core/shapeGeometry.ts`](../../src/core/shapeGeometry.ts) — 평행사변형과 마름모 윤곽을 0에서 1 사이로 정규화한 좌표 하나로 두고, 화면 SVG(0에서 100까지의 좌표계)와 PNG(실제 픽셀)가 각자 필요한 단위로 늘려 그립니다.
- [`src/hooks/useTimeout.ts`](../../src/hooks/useTimeout.ts) — 컴포넌트가 사라질 때 자동으로 정리되는 단일 타이머입니다. 화면마다 반복되던 `clearTimeout` 정리 코드를 대체합니다.
- `FlowCanvas`에서 `stripIoDecoration`·`editableNodeValue`·`editingLabel`·`graphErrorMessage`를 함수로 빼고, `workspaceStore`의 타입 가드를 읽기 쉽게 다듬었습니다.

스타일은 CSS 한 파일에서 SCSS 세 파일로 옮겼습니다.

- [`_tokens.scss`](../../src/styles/_tokens.scss)는 디자인 token을 CSS custom properties로 그대로 두고, 기호 4색을 SCSS map으로도 노출합니다.
- [`_mixins.scss`](../../src/styles/_mixins.scss)에 버튼, 가로 정렬, 가운데 정렬처럼 반복되던 규칙을 모았습니다.
- 기호 4색과 노드 크기처럼 TypeScript 쪽과 짝을 이뤄야 하는 값에는 어느 파일과 맞춰야 하는지 주석으로 적었습니다.

검사 도구도 함께 정비했습니다.

- `tsconfig.app.json`·`tsconfig.node.json` project references를 `tsconfig.json` 하나로 합쳤습니다.
- Prettier를 도입하고 `printWidth`를 100으로 맞췄습니다.
- `pnpm build`가 `format:check` → `typecheck` → `vite build` 순으로 돌아갑니다.

### GitHub Pages 자동 배포

[`.github/workflows/deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)이 `main` push와 수동 실행에서 돌아갑니다.

- 의존성 설치는 `pnpm install --frozen-lockfile`로 lockfile을 그대로 씁니다.
- **`pnpm test`가 먼저 돌고, 통과해야 `pnpm build`로 넘어갑니다.**
- `dist`를 Pages artifact로 올리고 `actions/deploy-pages`로 배포합니다.
- `concurrency`를 `github-pages` 하나로 묶고 `cancel-in-progress`를 켜, 연달아 push해도 마지막 것만 남습니다.
- 권한은 `contents: read`, `pages: write`, `id-token: write`로 좁혔습니다.

`vite.config.ts`의 `base`는 build와 preview에서만 `/algorithm-visualizer/`가 되고, 개발 서버는 `/`를 그대로 씁니다. 기존 로컬 작업 방식은 바뀌지 않습니다. MIT LICENSE도 이때 추가했습니다.

### 번들 분할과 편집 화면 지연 불러오기

이전에는 JS가 파일 하나(741.94 kB, gzip 243.63 kB)로 나와, Vite가 500 kB 초과 경고를 냈습니다. 상단바 한 줄을 그리는 데에도 `@xyflow/react`·`@codemirror/*`·`@dagrejs/dagre`를 전부 받아야 했습니다.

- 편집 화면을 [`src/components/EditorWorkspace.tsx`](../../src/components/EditorWorkspace.tsx)로 떼어 내고 `App.tsx`가 `React.lazy`로 불러옵니다. `ReactFlowProvider`도 유일한 소비자인 이 컴포넌트 안으로 좁혔습니다.
- 예제 화면도 같은 방식으로 나눴습니다. 이쪽은 `#/examples`일 때만 그려지므로 실제로 그 화면에 들어가야 받아집니다.
- `vite.config.ts`의 `manualChunks`로 `vendor-reactflow`·`vendor-codemirror`·`vendor-dagre`를 따로 뽑았습니다.
- 기다리는 동안 `role="status"`인 `.workspace-loading`을 보여 줍니다.

| chunk               | 크기      | gzip      | 언제 받는가                       |
| ------------------- | --------- | --------- | --------------------------------- |
| `index` (CSS)       | 34.80 kB  | 6.91 kB   | 처음                              |
| `index` (JS)        | 14.64 kB  | 6.09 kB   | 처음 — 상단바와 대화상자          |
| `EditorWorkspace`   | 28.02 kB  | 9.92 kB   | 화면이 뜬 직후                    |
| `vendor-reactflow`  | 331.22 kB | 107.05 kB | 화면이 뜬 직후                    |
| `vendor-codemirror` | 309.97 kB | 100.79 kB | 화면이 뜬 직후                    |
| `vendor-dagre`      | 47.67 kB  | 16.63 kB  | 화면이 뜬 직후                    |
| `flowToSvg`         | 10.77 kB  | 4.51 kB   | 화면이 뜬 직후 — 예제 화면과 공유 |
| `ExamplesPage`      | 2.06 kB   | 1.12 kB   | `#/examples`에 들어갈 때          |

**전체 JS 총량은 줄지 않았습니다**(741.94 kB → 약 744 kB). 편집 화면은 예제 화면을 오갈 때 순서도가 사라지면 안 되므로 `hidden` 속성으로만 감추고 항상 마운트합니다. 즉 `EditorWorkspace`의 chunk 요청은 화면이 뜨자마자 함께 시작됩니다.

얻은 것은 세 가지입니다.

- 첫 화면이 gzip 6 kB짜리 chunk 하나로 그려지고, 무거운 코드는 그동안 나란히 받아집니다.
- vendor chunk가 앱 코드와 분리되어, 앱만 고쳐 배포하면 큰 라이브러리는 캐시가 그대로 남습니다.
- 500 kB 초과 경고가 사라졌습니다.

`flowToSvg`가 따로 떨어진 것은 지정한 결과가 아니라, 편집 화면과 예제 화면 양쪽이 함께 써서 Rollup이 공용 chunk로 끌어올린 것입니다.

## 선택 이유와 고려한 대안

### AST가 아니라 그래프를 저장한 이유

AST는 완성된 프로그램만 표현할 수 있습니다. 기호 세 개를 놓고 아직 잇지 않은 상태는 [`flowToAst`](../../src/core/flowToAst.ts)가 거부하므로 AST로는 담기지 않습니다. 그런데 학생이 새로 고침으로 잃어버리면 가장 아까운 것이 바로 그 만들다 만 상태입니다. 그래프를 그대로 담으면 완성 여부와 무관하게 화면을 되돌릴 수 있습니다.

### 형식이 어긋나면 되살리지 않고 버리는 이유

저장 형식을 바꿔 가며 예전 값을 조금씩 맞춰 읽으면, 되살리는 경로가 형식 수만큼 늘어납니다. 학습 도구에서 잃을 수 있는 것은 수업 한 시간 분량의 작업이고, 깨진 값 때문에 화면이 이상하게 열리는 편이 빈 화면보다 나쁩니다. `VERSION`을 올리면 예전 값은 그냥 버리고 빈 화면에서 시작합니다.

### 초기화에 확인 대화상자를 둔 이유

자동 저장을 붙이면서 `초기화`는 화면만 비우는 버튼이 아니라 저장해 둔 내용까지 지우는 버튼이 되었습니다. 되돌리기가 없으므로 한 번 더 묻습니다. 대화상자는 `Esc`와 바깥 누르기로 닫히고, 초점은 `취소`에 먼저 갑니다.

### 색을 CSS와 TypeScript 양쪽에 둔 이유

기호 4색은 CSS 변수 하나로 두는 편이 깔끔하지만, React Flow가 만드는 `<defs>` marker와 PNG용 독립 실행 SVG 문자열은 문서의 CSS 변수에 닿지 못합니다. 그래서 [`flowColors.ts`](../../src/constants/flowColors.ts)에 같은 값을 literal로 두되, 두 곳이 짝이라는 사실을 양쪽 주석에 적었습니다. 중복을 없애는 대신 어긋났을 때 찾을 수 있게 만드는 선택입니다.

### 토큰은 CSS 변수로 두고 SCSS로 옮긴 이유

SCSS 변수로 바꾸면 빌드 시점에 값이 박혀, 나중에 다크 모드처럼 실행 중에 theme을 바꾸는 길이 막힙니다. token은 CSS custom properties 그대로 두고, SCSS는 반복되는 규칙을 mixin으로 접는 용도로만 썼습니다.

### `pnpm build`에 검사를 넣은 이유

형식과 타입 검사가 따로 있는 명령이면 배포 직전에 빠뜨리기 쉽습니다. `build` 하나에 묶어 두면 로컬에서 빌드하든 CI에서 빌드하든 같은 검사를 지납니다. 대신 형식이 어긋나면 빌드가 멈추므로 문서를 고친 뒤에도 `pnpm format`을 돌려야 합니다.

### 배포 전에 테스트를 돌리는 이유

이 프로젝트의 테스트는 대부분 의사코드↔AST↔순서도 왕복 검증입니다. 여기가 깨지면 화면은 멀쩡히 뜨는데 변환 결과만 틀리는, 수업 중에 가장 알아채기 어려운 형태로 고장 납니다. `pnpm test`를 배포 앞에 두어 그 상태가 올라가지 않게 했습니다.

### 편집 화면을 조건부로 마운트하지 않은 이유

`React.lazy`의 효과를 최대로 하려면 편집 화면이 필요할 때만 마운트해야 합니다. 하지만 6단계에서 정한 대로, 예제 화면을 오갈 때 그리던 React Flow 상태가 사라지면 안 됩니다. 그래서 마운트는 유지하고 `hidden`으로만 감췄습니다. 이 단계의 목적은 "필요할 때만 받기"가 아니라 "먼저 그릴 수 있는 부분을 먼저 그리기"입니다.

### `manualChunks`를 손으로 지정한 이유

`React.lazy`만으로도 편집 화면 코드는 나뉘지만, vendor 라이브러리는 그 chunk 안에 함께 들어갑니다. 위 표의 값으로 따지면 그 chunk 하나가 약 717 kB(331.22 + 309.97 + 47.67 + 28.02)가 되고, 앱 코드를 한 줄만 고쳐도 해시가 바뀌어 캐시가 통째로 무효가 됩니다. 세 라이브러리를 따로 뽑아 두면 배포마다 다시 받는 양이 앱 코드로 한정됩니다.

## 주요 산출물

| 파일                                 | 역할                                   |
| ------------------------------------ | -------------------------------------- |
| `src/core/workspaceStore.ts`         | 작업 내용 직렬화와 `localStorage` 접근 |
| `src/core/workspaceStore.test.ts`    | 왕복 저장·복원과 깨진 값 처리 검증     |
| `src/constants/pseudocode.ts`        | 의사코드·기호 라벨 공용 토큰           |
| `src/constants/flowColors.ts`        | 화살표와 기호 색                       |
| `src/core/shapeGeometry.ts`          | 화면·PNG 공용 도형 윤곽 좌표           |
| `src/hooks/useTimeout.ts`            | 자동 정리되는 단일 타이머              |
| `src/styles/_tokens.scss`            | 디자인 token과 기호 색 map             |
| `src/styles/_mixins.scss`            | 버튼·정렬 등 반복 규칙                 |
| `src/components/EditorWorkspace.tsx` | 지연 불러오는 편집 화면                |
| `vite.config.ts`                     | Pages `base`와 vendor chunk 분리       |
| `.github/workflows/deploy-pages.yml` | 테스트 통과 후 Pages 배포              |

## 완료 기준

- 새로 고치거나 탭을 닫았다 열어도 의사코드와 순서도가 그대로 남습니다.
- 아직 연결하지 않은 기호가 있는 상태도 그대로 되살아납니다.
- 저장해 둔 값이 깨져 있으면 빈 화면에서 시작합니다.
- `초기화`는 확인을 받은 뒤에만 지웁니다.
- `pnpm build`가 형식·타입 검사까지 통과합니다.
- `main`에 push하면 테스트를 통과한 경우에만 배포됩니다.
- 첫 화면을 그리는 JS chunk가 gzip 기준 한 자릿수 kB입니다.
- Vite의 500 kB 초과 경고가 나오지 않습니다.

## 검증 결과와 남은 작업

로컬에서 확인한 내용입니다.

- `pnpm test` — 4개 파일 40개 통과
- `pnpm build` — 형식·타입 검사 통과, 위 chunk 표는 이 빌드의 실제 출력
- 비교 대상인 741.94 kB는 `4f51045`(배포 커밋, 구조 정리 이후) 시점에서 같은 방식으로 빌드해 측정했습니다. 6단계가 끝난 시점의 값이 아닙니다.

아직 확인하지 않은 항목입니다.

- 실제 GitHub Pages 배포 결과와 `/algorithm-visualizer/` 경로에서의 동작
- 브라우저에서 chunk가 실제로 받아지는 순서와 첫 화면 체감 속도
- 재방문 시 vendor chunk 캐시가 유지되는지
- 저장 공간이 가득 찬 브라우저에서의 동작

## 이번 단계에서 제외한 기능

- 여러 작업을 이름 붙여 저장하기 — 자동 저장은 브라우저마다 한 벌만 보관합니다.
- 서버 저장과 공유 링크
- 다크 모드 — token 구조는 그대로 두었으므로 theme을 붙일 위치는 정해져 있습니다.
- 조건식을 실제로 평가해야 하는 한 단계씩 실행하기
- 편집 화면을 실제로 필요한 시점까지 미루기 — 예제 화면을 오갈 때 작업이 유지되어야 하므로 하지 않았습니다.

현재 후속 작업은 [프로젝트 개요와 기술 결정](../project-overview.md#남은-확인과-개선-방향)과 [테스트와 유지보수](../testing.md#알려진-제한과-후속-작업)에서 관리합니다.
